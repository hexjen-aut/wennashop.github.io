'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { bracketFor, formatKg } from '@/lib/shipping';
import styles from '@/app/quetes/quetes.module.css';

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

// Erreurs de start_quest_checkout (base de données)
const CHECKOUT_ERRORS = {
  shipping_not_quoted: "Le transport de cette offre n'est pas encore chiffré pour ce trajet. Contacte le support.",
  quest_not_open: "Cette quête n'est plus ouverte.",
  proposal_not_available: "Cette offre n'est plus disponible.",
};

const PROPOSAL_STATUS_LABEL = {
  pending: 'En attente',
  selected: 'Payée, en attente d\'envoi',
  in_delivery: 'En cours de livraison',
  delivered: 'Livrée, en attente de ta confirmation',
  reward_paid: 'Réceptionnée, récompense versée',
  rejected: 'Non retenue',
};

function Content() {
  const { quests_enabled: questsEnabled } = useFeatureFlags();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const [quest, setQuest] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuyer, setIsBuyer] = useState(false);
  const [userId, setUserId] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [paying, setPaying] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sb = getSupabase();
      const { data: q } = await sb.from('quests').select('*').eq('id', id).single();
      setQuest(q);

      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const { data: u } = await sb.from('users').select('id').eq('auth_id', session.user.id).single();
        setUserId(u?.id || null);
        setIsBuyer(u?.id === q?.buyer_id);
      }

      const { data: props } = await sb.from('quest_proposals').select('*').eq('quest_id', id).order('created_at', { ascending: false });
      setProposals(props || []);

      // Paiement commencé mais pas encore confirmé (virement en attente, etc.)
      if (session) {
        const { data: po } = await sb.from('orders').select('id, quest_proposal_id').eq('quest_id', id).eq('status', 'pending').maybeSingle();
        setPendingOrder(po || null);
      }
      setLoading(false);
    })();
  }, [id]);

  // Choisir une offre = la payer. La base crée la commande (produit + transport
  // + récompense) ; l'offre n'est retenue qu'une fois le paiement confirmé.
  async function selectProposal(propId) {
    setPaying(propId);
    const { data: orderId, error } = await getSupabase().rpc('start_quest_checkout', { p_proposal_id: propId });
    if (error || !orderId) {
      setPaying(null);
      alert(CHECKOUT_ERRORS[error?.message] || 'Impossible de lancer le paiement : ' + (error?.message || 'erreur inconnue'));
      return;
    }
    router.push(`/paiement?order_id=${orderId}`);
  }

  async function confirmReceipt(propId) {
    if (!confirm('Confirmer que tu as bien reçu le colis ? La récompense sera versée au chasseur.')) return;
    const sb = getSupabase();
    const { error } = await sb.from('quest_proposals').update({ status: 'reward_paid', reward_paid_at: new Date().toISOString() }).eq('id', propId);
    if (error) { alert('Erreur : ' + error.message); return; }
    location.reload();
  }

  if (!questsEnabled) {
    return (
      <>
        <Nav />
        <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Quêtes temporairement indisponibles</div>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', maxWidth: 360 }}>Cette fonctionnalité est désactivée pour le moment.</p>
        </div>
      </>
    );
  }
  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (!quest) return <><Nav /><div style={{ padding: 60, textAlign: 'center' }}>Quête introuvable.</div></>;

  return (
    <>
      <Nav />
      <section className={styles.hero}>
        {quest.image_url && (
          <img src={quest.image_url} alt="" style={{ width: 96, height: 96, borderRadius: 12, objectFit: 'cover', margin: '0 auto 14px' }} />
        )}
        <h1 className={styles.title}>{quest.title}</h1>
        <p className={styles.sub}>{quest.description}</p>
        {quest.size_bracket && (
          <p className={styles.meta} style={{ marginBottom: 10 }}>
            {quest.quantity || 1} × {bracketFor(quest.size_bracket)?.label.toLowerCase()}
            {quest.est_weight_kg ? ` · ${formatKg(quest.est_weight_kg)} max` : ''}
            {quest.destination_country ? ` · livraison ${quest.destination_country}` : ''}
            {' · Transport estimé '}{quest.shipping_estimate != null ? `${fmt(quest.shipping_estimate)} ${quest.currency} max` : 'à confirmer'}
          </p>
        )}
        <div className={styles.rewardBox} style={{ display: 'inline-block', textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Récompense</div>
          <div className={styles.rewardAmount}>{fmt(quest.reward_amount)} {quest.currency}</div>
        </div>
      </section>

      <div className={styles.list}>
        {isBuyer && pendingOrder && quest.status === 'open' && (
          <div data-testid="pending-payment" style={{ border: '1.5px solid var(--border-accent)', borderRadius: 12, padding: '12px 14px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Paiement en attente pour l'offre choisie. Le chasseur sera prévenu dès sa confirmation.</span>
            <a className={styles.btnPrimary} href={`/paiement?order_id=${pendingOrder.id}`}>Reprendre le paiement</a>
          </div>
        )}
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Propositions ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucune proposition pour l'instant.</div>
        ) : proposals.map((p) => (
          <div className={styles.card} key={p.id}>
            <div>
              <div className={styles.cardDesc}>{p.description}</div>
              <div className={styles.meta}>Prix proposé : {fmt(p.proposed_price)} {quest.currency} · {PROPOSAL_STATUS_LABEL[p.status] || p.status}</div>
              {p.weight_kg != null && (
                <div className={styles.meta} data-testid="proposal-total">
                  Poids réel {formatKg(p.weight_kg)} · Transport {p.shipping_cost != null ? `${fmt(p.shipping_cost)} ${quest.currency}` : 'à confirmer'}
                  {p.shipping_cost != null && <> · <strong>Produit + transport {fmt(Number(p.proposed_price) + Number(p.shipping_cost))} {quest.currency}</strong></>}
                  {p.shipping_cost != null && quest.shipping_estimate != null && Number(p.shipping_cost) !== Number(quest.shipping_estimate) && (
                    <> ({Number(p.shipping_cost) < Number(quest.shipping_estimate) ? '−' : '+'}{fmt(Math.abs(quest.shipping_estimate - p.shipping_cost))} {quest.currency} par rapport à l'estimation)</>
                  )}
                </div>
              )}
            </div>
            {isBuyer && quest.status === 'open' && p.status === 'pending' && (
              p.shipping_cost == null ? (
                <span className={styles.meta}>Transport à confirmer avant paiement</span>
              ) : (
                <button className={styles.btnPrimary} disabled={paying !== null} onClick={() => selectProposal(p.id)}>
                  {paying === p.id ? 'Préparation…' : `Choisir et payer ${fmt(Number(p.proposed_price) + Number(p.shipping_cost) + Number(quest.reward_amount || 0))} ${quest.currency}`}
                </button>
              )
            )}
            {isBuyer && p.status === 'delivered' && (
              <button className={styles.btnPrimary} onClick={() => confirmReceipt(p.id)}>Confirmer la réception</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function QuetePage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
