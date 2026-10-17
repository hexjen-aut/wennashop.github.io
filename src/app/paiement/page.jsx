'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import Mascot from '@/components/Mascot';
import { convertPrice } from '@/lib/currency';
import { BUYER_COUNTRY_KEY, COUNTRY_SOURCE_KEY, IP_COUNTRY_KEY, getDevicePosition, readLocal } from '@/lib/buyerCurrency';
import styles from './paiement.module.css';

// Appel d'une fonction serveur ; renvoie { data, error } avec le message lisible
async function callFn(sb, name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (!error) return { data, error: null };
  let message = data?.error;
  try { message = message || (await error.context?.json())?.error; } catch {}
  return { data: null, error: message || error.message || 'Erreur' };
}

// Numéro Airtel Gabon saisi après le +241 : 07X XX XX XX ou 7X XX XX XX
const AIRTEL_GA = /^0?7\d{7}$/;

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

// Moyens vérifiés à la main par l'équipe (circuit manuel : référence WN-,
// déclaration du client, validation par un agent) — réglés dans l'admin.
const MANUAL_LABEL = { airtel_money: 'Airtel Money', moov_money: 'Moov Money', virement: 'Virement bancaire' };
const MANUAL_ERRORS = {
  method_not_available: "Ce moyen de paiement n'est pas disponible pour ce pays.",
  amount_unavailable: 'Le montant de la commande ne peut pas être calculé. Contacte le support.',
  payment_under_review: 'Un paiement est déjà en cours de vérification pour cette commande.',
  payment_in_progress: 'Un paiement Airtel Money est encore en cours pour cette commande. Réessaie dans quelques minutes.',
  already_paid: 'Cette commande est déjà payée.',
  order_not_payable: "Cette commande ne peut plus être payée.",
};

function PaiementContent() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get('order_id');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [itemDisplayAmounts, setItemDisplayAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  // Commande de quête : produit + transport + récompense, jamais payée à la livraison
  const [quest, setQuest] = useState(null);

  const COUNTRY_CODE = { Maroc: 'MA', Gabon: 'GA' };

  const [form, setForm] = useState({ first: '', last: '', phone: '', address: '', city: '', country: 'Maroc', notes: '' });

  // Pays de livraison par défaut : celui choisi par l'acheteur dans la
  // boutique (sinon un acheteur de Libreville se retrouvait livré « au Maroc »).
  useEffect(() => {
    try {
      const c = localStorage.getItem(BUYER_COUNTRY_KEY);
      if (c === 'Gabon' || c === 'Maroc') setForm((f) => ({ ...f, country: c }));
    } catch {}
  }, []);
  const [method, setMethod] = useState(params.get('error') === 'payment_failed' ? 'mobile_money' : 'cash_on_delivery');
  const [availableMethods, setAvailableMethods] = useState(null); // null = pas encore chargé
  const [manualMethods, setManualMethods] = useState([]); // [{ code, account_holder }]
  const [mobileProvider, setMobileProvider] = useState('airtel_money');
  const [mobilePhone, setMobilePhone] = useState('');
  const [awaitingMobileConfirm, setAwaitingMobileConfirm] = useState(false);
  // Virement : la commande attend que l'équipe voie l'argent arriver.
  // Airtel Money en direct (fournisseur « airtel » choisi dans l'admin)
  const [airtelDirect, setAirtelDirect] = useState(false);
  const [airtelHolder, setAirtelHolder] = useState(null); // nom masqué du titulaire
  const [airtelPayment, setAirtelPayment] = useState(null); // { id, status, message }
  const [airtelCanCheck, setAirtelCanCheck] = useState(false);
  const [mobileError, setMobileError] = useState(params.get('error') === 'payment_failed' ? 'Le paiement mobile money a échoué ou a été annulé. Réessaie ci-dessous.' : null);

  // ── Moyens de paiement réellement activés pour le pays choisi — pilotés
  // depuis l'admin (section Pays), pas codés en dur. Un moyen "PLANNED"
  // (aucune intégration en place, ex: carte bancaire) n'apparaît jamais
  // même s'il est coché dans la grille admin.
  useEffect(() => {
    (async () => {
      const countryCode = COUNTRY_CODE[form.country];
      if (!countryCode) { setAvailableMethods([]); return; }
      const sb = getSupabase();
      const [{ data: methods }, { data: cpm }] = await Promise.all([
        sb.from('payment_methods').select('code,status,provider_code'),
        sb.from('country_payment_methods').select('payment_method_code,is_enabled,account_number,account_holder').eq('country_code', countryCode).eq('is_enabled', true),
      ]);
      const active = (methods || []).filter((m) => m.status === 'ACTIVE');
      const manualCodes = new Set(active.filter((m) => m.provider_code === 'manual' && m.code !== 'cash_on_delivery').map((m) => m.code));
      setAirtelDirect(active.some((m) => m.code === 'airtel_money' && m.provider_code === 'airtel'));
      // Moyens automatiques (SingPay, pawaPay, Airtel direct) et paiement à la livraison
      const enabled = (cpm || []).map((r) => r.payment_method_code)
        .filter((code) => active.some((m) => m.code === code) && !manualCodes.has(code));
      setAvailableMethods(enabled);
      // Moyens vérifiés par l'équipe : seulement si un compte de réception est renseigné
      setManualMethods((cpm || [])
        .filter((r) => manualCodes.has(r.payment_method_code) && r.account_number)
        .map((r) => ({ code: r.payment_method_code, account_holder: r.account_holder })));
    })();
  }, [form.country]);

  const hasCod = !quest && availableMethods?.includes('cash_on_delivery');
  const mobileMoneyProviders = ['airtel_money', 'moov_money'].filter((p) => availableMethods?.includes(p));
  const manualCode = method.startsWith('manual:') ? method.slice(7) : null;
  const hasAnyMethod = hasCod || mobileMoneyProviders.length > 0 || manualMethods.length > 0;

  // Si le pays change et que la méthode choisie n'est plus proposée, on
  // retombe sur la première disponible plutôt que de laisser un mode
  // sélectionné mais invisible.
  useEffect(() => {
    if (!availableMethods) return;
    const stillValid = (method === 'cash_on_delivery' && hasCod)
      || (method === 'mobile_money' && mobileMoneyProviders.length > 0)
      || (manualCode && manualMethods.some((m) => m.code === manualCode));
    if (stillValid) return;
    if (hasCod) setMethod('cash_on_delivery');
    else if (manualMethods.length > 0) setMethod(`manual:${manualMethods[0].code}`);
    else if (mobileMoneyProviders.length > 0) { setMethod('mobile_money'); setMobileProvider(mobileMoneyProviders[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMethods, manualMethods, quest]);

  useEffect(() => {
    if (!orderId) { setError('Aucune commande spécifiée.'); setLoading(false); return; }
    (async () => {
      const sb = getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError('Session expirée.'); setLoading(false); return; }

      // Profil — auth_id d'abord, email en fallback (aligné sur panier/vendeur)
      let profile = null;
      const { data: byAuth } = await sb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
      if (byAuth) {
        profile = byAuth;
      } else {
        const { data: byEmail } = await sb.from('users').select('id').ilike('email', user.email).maybeSingle();
        if (byEmail) {
          profile = byEmail;
          await sb.from('users').update({ auth_id: user.id }).eq('id', byEmail.id);
        }
      }
      if (!profile) { setError('Profil introuvable. Contacte le support.'); setLoading(false); return; }

      const { data: o } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!o) { setError('Commande introuvable.'); setLoading(false); return; }
      if (o.user_id !== profile.id) { setError("Cette commande ne t'appartient pas."); setLoading(false); return; }
      if (['processing', 'shipped', 'delivered'].includes(o.status)) { setSuccess(true); setLoading(false); return; }
      if (['cancelled', 'returned'].includes(o.status)) {
        setError("Cette commande a été annulée (par exemple, paiement non reçu dans le délai). Tu peux repasser commande depuis la boutique.");
        setLoading(false);
        return;
      }
      setOrder(o);
      if (o.quest_id) {
        const [{ data: q }, { data: prop }] = await Promise.all([
          sb.from('quests').select('id,title,reward_amount,currency,destination_country').eq('id', o.quest_id).maybeSingle(),
          sb.from('quest_proposals').select('proposed_price,shipping_cost,weight_kg').eq('id', o.quest_proposal_id).maybeSingle(),
        ]);
        if (q) {
          setQuest({ ...q, proposal: prop || null });
          if (q.destination_country === 'Gabon' || q.destination_country === 'Maroc') setForm((f) => ({ ...f, country: q.destination_country }));
        }
      }
      const { data: pay } = await sb.from('payments').select('verification_status')
        .eq('order_id', orderId).eq('type', 'order_payment').maybeSingle();
      // Paiement manuel déjà lancé (en attente, déclaré, refusé à corriger) :
      // tout se passe sur la page de la commande.
      if (pay?.verification_status === 'awaiting_payment' || pay?.verification_status === 'declared') {
        router.replace(`/commande/${orderId}`);
        return;
      }
      const { data: it } = await sb.from('order_items').select('id,quantity,unit_price,products(name,image_url)').eq('order_id', orderId);
      setItems(it || []);

      // order_items.unit_price reste dans la devise du vendeur — converti
      // ici uniquement pour l'affichage, dans la devise réellement facturée
      // à l'acheteur (o.buyer_currency), pour rester cohérent avec le total.
      if (o.buyer_currency && o.buyer_currency !== o.currency) {
        const entries = await Promise.all((it || []).map(async (row) => {
          const conv = await convertPrice(row.unit_price * row.quantity, o.currency, o.buyer_currency, sb);
          return [row.id, conv.amount];
        }));
        setItemDisplayAmounts(Object.fromEntries(entries));
      }
      setLoading(false);
    })();
  }, [orderId]);

  const useAirtelDirect = method === 'mobile_money' && mobileProvider === 'airtel_money' && airtelDirect;
  const airtelNumber = mobilePhone.replace(/[\s.-]/g, '');

  // Étape 1 : le numéro est-il un compte Airtel Money ? (nom du titulaire masqué)
  async function checkAirtelNumber() {
    if (!AIRTEL_GA.test(airtelNumber)) { setMobileError('Numéro Airtel invalide : 07X XX XX XX.'); return; }
    setSending(true);
    setMobileError(null);
    const { data, error } = await callFn(getSupabase(), 'airtel-kyc', { msisdn: airtelNumber });
    setSending(false);
    if (error) { setMobileError(error); return; }
    if (data.is_barred) { setMobileError('Ce compte Airtel Money est bloqué. Utilise un autre numéro.'); return; }
    setAirtelHolder(data.name || 'titulaire non communiqué');
  }

  // Étape 2 : demande de paiement (push USSD), suivie en direct
  async function startAirtelPayment(sb) {
    const { data, error } = await callFn(sb, 'airtel-collect', { order_id: orderId, msisdn: airtelNumber });
    if (error) { setMobileError(error); setSending(false); return; }
    setSending(false);
    if (data.status === 'paid') { setSuccess(true); return; }
    setAirtelCanCheck(false);
    setAirtelPayment({ id: data.payment_id, status: 'pending', message: null });
  }

  async function checkAirtelStatus() {
    if (!airtelPayment) return;
    const { data, error } = await callFn(getSupabase(), 'airtel-status', { payment_id: airtelPayment.id });
    if (error) return;
    if (data.status === 'paid') setSuccess(true);
    else if (data.status === 'failed') setAirtelPayment((p) => ({ ...p, status: 'failed', message: data.message }));
  }

  // Suivi en direct de la ligne payments (Realtime) + relecture de secours
  useEffect(() => {
    if (!airtelPayment?.id || airtelPayment.status !== 'pending') return;
    const sb = getSupabase();
    const onStatus = (status) => {
      if (status === 'paid') setSuccess(true);
      else if (status === 'failed') checkAirtelStatus();
    };
    const channel = sb.channel(`payment-${airtelPayment.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${airtelPayment.id}` },
        (payload) => onStatus(payload.new?.status))
      .subscribe();
    const poll = setInterval(async () => {
      const { data } = await sb.from('payments').select('status').eq('id', airtelPayment.id).maybeSingle();
      onStatus(data?.status);
    }, 10000);
    const reveal = setTimeout(() => setAirtelCanCheck(true), 30000);
    return () => { sb.removeChannel(channel); clearInterval(poll); clearTimeout(reveal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airtelPayment?.id, airtelPayment?.status]);

  async function submit() {
    if (!form.first || !form.last || !form.phone.trim() || !form.address || !form.city) { alert('Complète tous les champs requis.'); return; }
    if (method === 'mobile_money' && !mobilePhone.trim()) { alert('Indique ton numéro de téléphone Mobile Money.'); return; }
    if (useAirtelDirect && !airtelHolder) { await checkAirtelNumber(); return; }
    setSending(true);
    setMobileError(null);
    const sb = getSupabase();

    // Contrôle anti-fraude : position de l'appareil (le navigateur demande
    // l'autorisation ; un refus ne bloque pas la commande).
    const device = await getDevicePosition();

    // Adresse + statut enregistrés côté serveur (submit_checkout) : un
    // acheteur ne peut pas modifier `orders` directement.
    const { data: res, error: rpcErr } = await sb.rpc('submit_checkout', {
      p_order_id: orderId,
      p_name: `${form.first} ${form.last}`,
      p_address: form.address,
      p_city: form.city,
      p_country: form.country,
      p_notes: form.notes || '',
      p_method: method === 'mobile_money' ? mobileProvider : (manualCode || method),
    });
    if (rpcErr) {
      alert("Impossible d'enregistrer ta commande : " + rpcErr.message);
      setSending(false);
      return;
    }
    await sb.rpc('set_order_phone', { p_order_id: orderId, p_phone: form.phone });

    // Verdict calculé et enregistré côté serveur, visible des seuls agents.
    // On n'attend pas plus de 5 s : la commande continue quoi qu'il arrive.
    await Promise.race([
      sb.functions.invoke('order-geo-check', {
        body: {
          order_id: orderId,
          display_country: readLocal(BUYER_COUNTRY_KEY),
          country_source: readLocal(COUNTRY_SOURCE_KEY),
          ip_country_hint: readLocal(IP_COUNTRY_KEY),
          device,
        },
      }).catch(() => null),
      new Promise((r) => setTimeout(r, 5000)),
    ]);

    if (useAirtelDirect) { await startAirtelPayment(sb); return; }

    if (manualCode) {
      // Montant recalculé et référence générés côté serveur
      const { error: payErr } = await sb.rpc('create_manual_payment', { p_order_id: orderId, p_method_code: manualCode });
      if (payErr) {
        setMobileError(MANUAL_ERRORS[payErr.message] || 'Impossible de préparer le paiement. Réessaie.');
        setSending(false);
        return;
      }
      await sb.from('cart_items').delete().eq('user_id', order.user_id);
      router.push(`/commande/${orderId}`);
      return;
    }

    if (method === 'mobile_money') {
      // process-payment crée le paiement lui-même chez le fournisseur choisi
      // dans l'admin (SingPay ou pawaPay), et c'est son callback qui confirme
      // la commande une fois le paiement réellement validé sur le téléphone.
      const { data, error: fnError } = await sb.functions.invoke('process-payment', {
        body: { order_id: orderId, amount: order.buyer_total_amount ?? order.total_amount, client_msisdn: mobilePhone.trim(), payment_method: mobileProvider },
      });
      if (fnError || data?.error) {
        setMobileError(data?.error || fnError?.message || 'Erreur lors du paiement mobile money.');
        setSending(false);
        return;
      }
      await sb.from('cart_items').delete().eq('user_id', order.user_id);
      setSending(false);
      setAwaitingMobileConfirm(true);
      return;
    }

    await sb.from('cart_items').delete().eq('user_id', order.user_id);
    setSending(false);
    setSuccess(true);
  }

  const followUrl = quest ? `/quete?id=${quest.id}` : `/suivi?order=${orderId}`;

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (error) return <><Nav /><div style={{ padding: 60, textAlign: 'center' }}><p>{error}</p><Link href="/panier" style={{ color: 'var(--accent)' }}>Retour au panier</Link></div></>;
  if (airtelPayment && !success) {
    const amount = fmt(order?.buyer_total_amount ?? order?.total_amount, order?.buyer_currency || order?.currency);
    return (
      <>
        <Nav />
        <div data-testid="airtel-waiting" style={{ padding: '70px 20px', textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
          {airtelPayment.status === 'failed' ? (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Paiement non abouti</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: 22 }}>{airtelPayment.message || "Le paiement Airtel Money n'a pas abouti."}</p>
              <button className={styles.btnSubmit} style={{ maxWidth: 260, margin: '0 auto' }} onClick={() => { setAirtelPayment(null); setAirtelHolder(null); }}>Réessayer</button>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Valide le paiement sur ton téléphone</h1>
              <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                Une demande de {amount} a été envoyée au +241 {airtelNumber}. Saisis ton code PIN Airtel Money pour confirmer.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 22 }}>Cette page se met à jour toute seule dès que le paiement est confirmé.</p>
              {airtelCanCheck && (
                <button type="button" onClick={checkAirtelStatus} style={{ background: 'transparent', border: '1.5px solid var(--border)', color: 'var(--text)', padding: '11px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>Vérifier le statut</button>
              )}
            </>
          )}
        </div>
      </>
    );
  }
  if (awaitingMobileConfirm) return (
    <>
      <Nav />
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📱</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Valide le paiement sur ton téléphone</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          Un code de confirmation {mobileProvider === 'airtel_money' ? 'Airtel Money' : 'Moov Money'} a été envoyé au {mobilePhone}. Valide-le pour finaliser ta commande — le statut se mettra à jour automatiquement.
        </p>
        <Link href={followUrl} style={{ background: 'var(--accent-btn)', color: '#fff', padding: '12px 28px', borderRadius: 999, fontWeight: 700, textDecoration: 'none' }}>{quest ? 'Voir ma quête' : 'Suivre ma commande'}</Link>
      </div>
    </>
  );
  if (success) return (
    <>
      <Nav />
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Mascot size={110} float /></div>
        <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 8 }}>Commande confirmée !</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>Merci pour ta commande ! Tu recevras une confirmation par email, et tu peux suivre chaque étape de ta livraison.</p>
        <Link href={followUrl} style={{ display: 'inline-block', border: '1.5px solid var(--border)', color: 'var(--text)', padding: '11px 24px', borderRadius: 999, fontWeight: 700, textDecoration: 'none', margin: '0 6px 10px' }}>{quest ? 'Voir ma quête' : 'Suivre ma commande'}</Link>
        <Link href="/boutique" style={{ display: 'inline-block', background: 'var(--accent-btn)', color: '#fff', padding: '12px 28px', borderRadius: 999, fontWeight: 700, textDecoration: 'none', margin: '0 6px 10px' }}>Continuer mes achats</Link>
      </div>
    </>
  );

  return (
    <>
      <Nav />
      <div className={styles.wrap}>
        <h1 className={styles.title}>Paiement</h1>
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Coordonnées de livraison</div>
              <div className={styles.grid2}>
                <input className={styles.input} placeholder="Prénom *" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
                <input className={styles.input} placeholder="Nom *" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
              </div>
              <input className={styles.input} style={{ marginTop: 12 }} type="tel" inputMode="tel" autoComplete="tel" placeholder="Téléphone (pour la livraison) *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={styles.input} style={{ marginTop: 12 }} placeholder="Adresse (quartier, rue, repère) *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className={styles.grid2} style={{ marginTop: 12 }}>
                <input className={styles.input} placeholder="Ville *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <select className={styles.input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                  <option value="Maroc">🇲🇦 Maroc</option>
                  <option value="Gabon">🇬🇦 Gabon</option>
                </select>
              </div>
              <textarea className={styles.input} style={{ marginTop: 12, minHeight: 70 }} placeholder="Notes (optionnel)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Méthode de paiement</div>
              <div className={styles.methods}>
                {hasCod && (
                  <button className={`${styles.methodCard} ${method === 'cash_on_delivery' ? styles.methodActive : ''}`} onClick={() => setMethod('cash_on_delivery')}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Paiement à la livraison</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Espèces à la réception</div>
                  </button>
                )}
                {manualMethods.map((m) => (
                  <button key={m.code} className={`${styles.methodCard} ${method === `manual:${m.code}` ? styles.methodActive : ''}`} onClick={() => setMethod(`manual:${m.code}`)}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{MANUAL_LABEL[m.code] || m.code}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.code === 'virement' ? 'Virement, vérifié par l\'équipe' : 'Envoi au numéro WennaShop, vérifié par l\'équipe'}</div>
                  </button>
                ))}
                {mobileMoneyProviders.length > 0 && (
                  <button className={`${styles.methodCard} ${method === 'mobile_money' ? styles.methodActive : ''}`} onClick={() => setMethod('mobile_money')}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Mobile Money</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mobileMoneyProviders.map((p) => (p === 'airtel_money' ? 'Airtel Money' : 'Moov Money')).join(' · ')}</div>
                  </button>
                )}
              </div>
              {availableMethods && !hasAnyMethod && (
                <p style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }}>
                  Aucun moyen de paiement disponible pour {form.country} pour l'instant — contacte le support.
                </p>
              )}
              {manualCode && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginTop: 14, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <p>Après validation, tu verras le {manualCode === 'virement' ? 'RIB' : 'numéro'} WennaShop, le montant exact et une référence WN-… à indiquer. Une fois le paiement fait, tu le déclares avec l'ID de transaction : l'équipe vérifie et ta commande part en préparation.</p>
                  {mobileError && <p style={{ fontSize: 12, color: 'var(--error)', marginTop: 8 }}>{mobileError}</p>}
                </div>
              )}
              {method === 'mobile_money' && (
                <div style={{ marginTop: 14 }}>
                  <div className={styles.grid2}>
                    <select className={styles.input} value={mobileProvider} onChange={(e) => setMobileProvider(e.target.value)}>
                      {mobileMoneyProviders.includes('airtel_money') && <option value="airtel_money">Airtel Money</option>}
                      {mobileMoneyProviders.includes('moov_money') && <option value="moov_money">Moov Money</option>}
                    </select>
                    {useAirtelDirect ? (
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', border: '1.5px solid var(--border)', borderRight: 'none', borderRadius: '10px 0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>+241</span>
                        <input className={styles.input} style={{ borderRadius: '0 10px 10px 0' }} inputMode="tel" aria-label="Numéro Airtel Money" placeholder="07X XX XX XX" value={mobilePhone} onChange={(e) => { setMobilePhone(e.target.value); setAirtelHolder(null); }} />
                      </div>
                    ) : (
                      <input className={styles.input} placeholder="Numéro (ex: 074123456)" value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} />
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Tu recevras une demande de confirmation directement sur ce numéro.</p>
                  {useAirtelDirect && airtelHolder && (
                    <p data-testid="airtel-holder" style={{ fontSize: 13, marginTop: 8 }}>Paiement au nom de <strong>{airtelHolder}</strong></p>
                  )}
                  {mobileError && <p style={{ fontSize: 12, color: 'var(--error)', marginTop: 8 }}>{mobileError}</p>}
                </div>
              )}
            </div>
          </div>

          <div className={styles.aside}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Récapitulatif</div>
              {quest && (
                <div data-testid="quest-summary">
                  <div style={{ fontSize: 13, fontWeight: 700, paddingBottom: 6 }}>Quête : {quest.title}</div>
                  {[
                    ['Produit', quest.proposal?.proposed_price],
                    [`Transport${quest.proposal?.weight_kg ? ` (${Number(quest.proposal.weight_kg).toLocaleString('fr-FR')} kg)` : ''}`, quest.proposal?.shipping_cost],
                    ['Récompense du chasseur', quest.reward_amount],
                  ].map(([label, amount]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{label}</span>
                      <span style={{ fontWeight: 700 }}>{fmt(amount ?? 0, order?.currency)}</span>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
                    L'argent reste bloqué par WennaShop et n'est versé au chasseur qu'après ta confirmation de réception.
                  </p>
                </div>
              )}
              {items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{it.products?.name} × {it.quantity}</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(itemDisplayAmounts[it.id] ?? (it.unit_price * it.quantity), order?.buyer_currency || order?.currency)}</span>
                </div>
              ))}
              {order?.discount_pct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', color: 'var(--success)' }}>
                  <span>Remise ({order.promo_code})</span>
                  <span>−{fmt((order.buyer_total_amount ?? order.subtotal ?? order.total_amount) * (order.discount_pct / 100), order.buyer_currency || order.currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, marginTop: 14 }}>
                <span>Total</span><span style={{ color: 'var(--accent)' }}>{fmt(order?.buyer_total_amount ?? order?.total_amount, order?.buyer_currency || order?.currency)}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5, margin: '14px 0 0' }}>
                Sécurité : en confirmant, ton navigateur te demandera ta position. Elle sert seulement à vérifier que la commande
                part bien du pays de livraison, puis elle est effacée après 12 mois. Tu peux refuser : la commande passe quand même.
              </p>
              <button className={styles.btnSubmit} onClick={submit} disabled={sending || !hasAnyMethod}>
                {sending ? 'Traitement…'
                  : useAirtelDirect ? (airtelHolder ? `Confirmer le paiement de ${fmt(order?.buyer_total_amount ?? order?.total_amount, order?.buyer_currency || order?.currency)}` : 'Vérifier mon numéro Airtel')
                  : method === 'mobile_money' ? 'Envoyer la demande de paiement'
                  : manualCode ? 'Voir les instructions de paiement' : 'Confirmer la commande'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PaiementPage() {
  return <Suspense fallback={null}><PaiementContent /></Suspense>;
}
