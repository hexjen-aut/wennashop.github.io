'use client';

// Commandes en gros : discussions acheteur ↔ boutique. Le vendeur envoie un
// devis ; l'acheteur l'accepte et paie sur WennaShop (commission comprise).
// Les coordonnées sont masquées par la base : tout se passe ici.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import { hasContactInfo, formatMoney, QUOTE_STATUS } from '@/lib/wholesale';
import styles from './gros.module.css';

const RPC_ERRORS = {
  thread_closed: 'Cette discussion est clôturée.',
  quote_expired: 'Ce devis a expiré : demande-en un nouveau à la boutique.',
  quote_not_available: "Ce devis n'est plus disponible.",
  variant_required: 'Choisis la version du produit.',
  variant_invalid: "Cette version n'est plus disponible.",
  invalid_quote: 'Indique une quantité et un prix unitaire valides.',
  invalid_message: 'Message vide ou trop long (2 000 caractères au plus).',
  not_allowed: "Tu n'as pas accès à cette discussion.",
};
function rpcError(err) {
  const code = Object.keys(RPC_ERRORS).find((k) => err?.message?.includes(k));
  return code ? RPC_ERRORS[code] : 'Une erreur est survenue. Réessaie.';
}
function timeLabel(d) {
  const date = new Date(d);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('t');
  const [me, setMe] = useState(null); // { id, role }
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [shopProducts, setShopProducts] = useState([]);
  const [draft, setDraft] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ product_id: '', variant_id: '', quantity: '', unit_price: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const selected = threads.find((t) => t.id === selectedId) || null;
  const role = useMemo(() => {
    if (!selected || !me) return null;
    if (selected.buyer_id === me.id) return 'buyer';
    if (me.role === 'admin' && selected.flagged_at && selected.shops?.user_id !== me.id) return 'admin';
    return 'seller';
  }, [selected, me]);

  const loadThreads = useCallback(async () => {
    const sb = getSupabase();
    const { data } = await sb.from('wholesale_threads')
      .select('*, shops(id,name,slug,logo_url,user_id), products(name,image_url)')
      .order('last_message_at', { ascending: false });
    setThreads(data || []);
  }, []);

  const loadThread = useCallback(async (id) => {
    const sb = getSupabase();
    const [{ data: msgs }, { data: qs }] = await Promise.all([
      sb.from('wholesale_messages').select('*').eq('thread_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }),
      sb.from('wholesale_quotes').select('*, products(name)').eq('thread_id', id),
    ]);
    setMessages(msgs || []);
    setQuotes(Object.fromEntries((qs || []).map((q) => [q.id, q])));
  }, []);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.replace(`/connexion?next=${encodeURIComponent('/gros' + (selectedId ? `?t=${selectedId}` : ''))}`); return; }
      const { data: u } = await sb.from('users').select('id,role').eq('auth_id', session.user.id).maybeSingle();
      setMe(u);
      await loadThreads();
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Discussion ouverte : messages, lu, et rafraîchissement toutes les 6 s.
  useEffect(() => {
    if (!selectedId || !me) return;
    loadThread(selectedId);
    getSupabase().rpc('mark_wholesale_read', { p_thread_id: selectedId }).then(() => loadThreads());
    const timer = setInterval(() => { loadThread(selectedId); }, 6000);
    const listTimer = setInterval(loadThreads, 20000);
    return () => { clearInterval(timer); clearInterval(listTimer); };
  }, [selectedId, me, loadThread, loadThreads]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  // Vendeur : produits de la boutique pour le devis (avec leurs variantes).
  useEffect(() => {
    if (role !== 'seller' || !selected) return;
    getSupabase().from('products')
      .select('id,name,price,currency,option1_name,option2_name,wholesale_min_qty,product_variants(id,color,size,price,is_active)')
      .eq('shop_id', selected.shop_id).in('status', ['active', 'pending']).order('name')
      .then(({ data }) => setShopProducts(data || []));
  }, [role, selected?.shop_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function openQuoteForm() {
    const pid = selected?.product_id || shopProducts[0]?.id || '';
    const p = shopProducts.find((x) => x.id === pid);
    setQuoteForm({ product_id: pid, variant_id: '', quantity: String(p?.wholesale_min_qty || ''), unit_price: '', note: '' });
    setQuoteOpen(true);
  }

  async function send() {
    if (!draft.trim()) return;
    setBusy(true); setError('');
    const { error: err } = await getSupabase().rpc('send_wholesale_message', { p_thread_id: selectedId, p_body: draft.trim() });
    setBusy(false);
    if (err) { setError(rpcError(err)); return; }
    setDraft('');
    await Promise.all([loadThread(selectedId), loadThreads()]);
  }

  async function sendQuote() {
    setBusy(true); setError('');
    const { error: err } = await getSupabase().rpc('propose_wholesale_quote', {
      p_thread_id: selectedId, p_product_id: quoteForm.product_id, p_variant_id: quoteForm.variant_id || null,
      p_quantity: parseInt(quoteForm.quantity, 10) || 0, p_unit_price: parseFloat(quoteForm.unit_price) || 0, p_note: quoteForm.note,
    });
    setBusy(false);
    if (err) { setError(rpcError(err)); return; }
    setQuoteOpen(false);
    await Promise.all([loadThread(selectedId), loadThreads()]);
  }

  async function respond(quoteId, accept) {
    if (!accept && !confirm('Refuser ce devis ?')) return;
    setBusy(true); setError('');
    const { data, error: err } = await getSupabase().rpc('respond_wholesale_quote', { p_quote_id: quoteId, p_accept: accept });
    setBusy(false);
    if (err) { setError(rpcError(err)); return; }
    if (accept && data) { router.push(`/paiement?order_id=${data}`); return; }
    await Promise.all([loadThread(selectedId), loadThreads()]);
  }

  async function flag() {
    const reason = prompt("Pourquoi signales-tu cette discussion ? L'équipe WennaShop pourra la lire.");
    if (reason === null) return;
    const { error: err } = await getSupabase().rpc('flag_wholesale_thread', { p_thread_id: selectedId, p_reason: reason });
    if (err) { setError(rpcError(err)); return; }
    await Promise.all([loadThread(selectedId), loadThreads()]);
  }

  async function closeThread() {
    if (!confirm('Clôturer cette discussion ? Le devis en attente sera annulé.')) return;
    const { error: err } = await getSupabase().rpc('close_wholesale_thread', { p_thread_id: selectedId });
    if (err) { setError(rpcError(err)); return; }
    await Promise.all([loadThread(selectedId), loadThreads()]);
  }

  const unread = (t) => {
    const mine = t.buyer_id === me?.id ? t.buyer_read_at : t.shop_read_at;
    return !mine || new Date(t.last_message_at) > new Date(mine);
  };
  const counterpart = (t) => (t.buyer_id === me?.id ? t.shops?.name : `Client · ${t.products?.name || 'demande générale'}`);
  const quoteProduct = shopProducts.find((p) => p.id === quoteForm.product_id);
  const quoteVariants = (quoteProduct?.product_variants || []).filter((v) => v.is_active);

  if (loading) return <div className={styles.center}>Chargement…</div>;

  return (
    <div className={`${styles.layout} ${selected ? styles.layoutOpen : ''}`}>
      <aside className={styles.list}>
        <div className={styles.listHead}>
          <h1 className={styles.h1}>Commandes en gros</h1>
          <p className={styles.listSub}>Demandes de prix et devis entre acheteurs et boutiques.</p>
        </div>
        {threads.length === 0 && (
          <div className={styles.empty}>Aucune discussion pour l'instant. Sur la fiche d'un produit qui accepte le gros, touche « Commander en gros ».</div>
        )}
        {threads.map((t) => (
          <Link key={t.id} href={`/gros?t=${t.id}`} className={`${styles.item} ${t.id === selectedId ? styles.itemActive : ''}`}>
            <div className={styles.itemTop}>
              <span className={styles.itemName}>{counterpart(t)}</span>
              <span className={styles.itemTime}>{timeLabel(t.last_message_at)}</span>
            </div>
            <div className={styles.itemSub}>
              {t.buyer_id === me?.id && t.products?.name ? t.products.name : t.status === 'closed' ? 'Clôturée' : 'En cours'}
              {t.flagged_at && <span className={styles.flagTag}>Signalée</span>}
              {unread(t) && t.id !== selectedId && <span className={styles.dot} aria-label="Non lu" />}
            </div>
          </Link>
        ))}
      </aside>

      <section className={styles.chat}>
        {!selected ? (
          <div className={styles.center}>Choisis une discussion.</div>
        ) : (
          <>
            <div className={styles.chatHead}>
              <Link href="/gros" className={styles.back}>Retour</Link>
              <div className={styles.chatTitle}>
                <div className={styles.chatName}>{counterpart(selected)}</div>
                {selected.products?.name && <div className={styles.chatSub}>{selected.products.name}</div>}
              </div>
              {role !== 'admin' && selected.status === 'open' && (
                <div className={styles.chatActions}>
                  {!selected.flagged_at && <button className={styles.linkBtn} onClick={flag}>Signaler</button>}
                  <button className={styles.linkBtn} onClick={closeThread}>Clôturer</button>
                </div>
              )}
            </div>
            <div className={styles.notice}>Toute la transaction se fait ici : numéros, emails et liens sont masqués automatiquement, et le paiement passe uniquement par WennaShop.</div>

            <div className={styles.messages}>
              {messages.map((m) => {
                const mineMsg = m.sender_id === me?.id;
                const q = m.quote_id ? quotes[m.quote_id] : null;
                const isQuoteCard = q && m.body.startsWith('Devis :');
                return (
                  <div key={m.id} className={`${styles.msg} ${mineMsg ? styles.msgMine : ''}`}>
                    {isQuoteCard ? (
                      <div className={styles.quote}>
                        <div className={styles.quoteTitle}>Devis</div>
                        <div className={styles.quoteLine}>{q.quantity} × {q.products?.name}{q.variant_label ? ` (${q.variant_label})` : ''}</div>
                        <div className={styles.quoteLine}>Prix unitaire : {formatMoney(q.unit_price, q.currency)}</div>
                        <div className={styles.quoteTotal}>Total : {formatMoney(q.unit_price * q.quantity, q.currency)}</div>
                        {q.note && <div className={styles.quoteNote}>{q.note}</div>}
                        <div className={styles.quoteStatus}>{QUOTE_STATUS[q.status]}{q.status === 'proposed' ? ` · valable jusqu'au ${new Date(q.expires_at).toLocaleDateString('fr-FR')}` : ''}</div>
                        {role === 'buyer' && q.status === 'proposed' && (
                          <div className={styles.quoteActions}>
                            <button className={styles.btnPrimary} disabled={busy} onClick={() => respond(q.id, true)}>Accepter et payer</button>
                            <button className={styles.btnGhost} disabled={busy} onClick={() => respond(q.id, false)}>Refuser</button>
                          </div>
                        )}
                        {role === 'buyer' && q.status === 'ordered' && q.order_id && (
                          <Link className={styles.btnPrimary} href={`/paiement?order_id=${q.order_id}`}>Voir et payer la commande</Link>
                        )}
                      </div>
                    ) : (
                      <div className={styles.bubble}>{m.body}</div>
                    )}
                    <div className={styles.msgTime}>{timeLabel(m.created_at)}</div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {role === 'seller' && selected.status === 'open' && quoteOpen && (
              <div className={styles.quoteForm}>
                <div className={styles.quoteTitle}>Nouveau devis</div>
                <select className={styles.input} value={quoteForm.product_id} onChange={(e) => setQuoteForm({ ...quoteForm, product_id: e.target.value, variant_id: '' })}>
                  {shopProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {quoteVariants.length > 0 && (
                  <select className={styles.input} value={quoteForm.variant_id} onChange={(e) => setQuoteForm({ ...quoteForm, variant_id: e.target.value })}>
                    <option value="">Choisir la version…</option>
                    {quoteVariants.map((v) => <option key={v.id} value={v.id}>{[v.color, v.size].filter(Boolean).join(' · ')}</option>)}
                  </select>
                )}
                <div className={styles.row2}>
                  <input className={styles.input} type="number" min="1" placeholder="Quantité" value={quoteForm.quantity} onChange={(e) => setQuoteForm({ ...quoteForm, quantity: e.target.value })} />
                  <input className={styles.input} type="number" min="0" step="0.01" placeholder={`Prix unitaire (${quoteProduct?.currency === 'XAF' ? 'FCFA' : quoteProduct?.currency || 'MAD'})`} value={quoteForm.unit_price} onChange={(e) => setQuoteForm({ ...quoteForm, unit_price: e.target.value })} />
                </div>
                {parseFloat(quoteForm.unit_price) > 0 && parseInt(quoteForm.quantity, 10) > 0 && (
                  <div className={styles.quoteTotal}>Total : {formatMoney(parseFloat(quoteForm.unit_price) * parseInt(quoteForm.quantity, 10), quoteProduct?.currency)} · la commission WennaShop habituelle s'applique sur ce montant.</div>
                )}
                <input className={styles.input} placeholder="Note (délai, conditionnement…) — facultatif" maxLength={1000} value={quoteForm.note} onChange={(e) => setQuoteForm({ ...quoteForm, note: e.target.value })} />
                <div className={styles.quoteActions}>
                  <button className={styles.btnPrimary} disabled={busy} onClick={sendQuote}>Envoyer le devis</button>
                  <button className={styles.btnGhost} onClick={() => setQuoteOpen(false)}>Annuler</button>
                </div>
              </div>
            )}

            {role !== 'admin' && selected.status === 'open' ? (
              <div className={styles.composer}>
                {role === 'seller' && !quoteOpen && <button className={styles.btnGhost} onClick={openQuoteForm}>Faire un devis</button>}
                <div className={styles.composeRow}>
                  <textarea className={styles.input} rows={2} maxLength={2000} placeholder="Écris ton message…" value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className={styles.btnPrimary} disabled={busy || !draft.trim()} onClick={send}>Envoyer</button>
                </div>
                {hasContactInfo(draft) && <div className={styles.warn}>Les numéros, emails et liens seront masqués.</div>}
              </div>
            ) : (
              <div className={styles.closedNote}>{role === 'admin' ? 'Lecture seule : discussion signalée.' : 'Discussion clôturée.'}</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function GrosPage() {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <Suspense fallback={<div className={styles.center}>Chargement…</div>}>
          <Content />
        </Suspense>
      </main>
    </>
  );
}
