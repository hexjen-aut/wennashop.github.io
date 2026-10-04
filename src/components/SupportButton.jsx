'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { WENNA_FAQ, searchFaq } from '@/lib/wennaFaq';
import Mascot from './Mascot';
import styles from './SupportButton.module.css';

const GREETING_SEEN_KEY = 'wenna_mascot_greeted';
// Pages où Wenna se présente déjà dans le contenu : pas de seconde bulle.
const NO_GREETING_PATHS = ['/connexion', '/bienvenue'];
// Sur le formulaire de connexion/inscription, le bouton flottant masquait les
// champs : il est placé en haut de page et défile avec elle.
const TOP_PATHS = ['/connexion'];

const WHATSAPP_NUMBER = '212766237011';
const POPULAR_FAQ = WENNA_FAQ.filter((f) => f.popular);

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  // menu : questions fréquentes | answer : une réponse | contact : équipe
  const [mode, setMode] = useState('menu'); // menu | answer | contact | form | sent
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [greeting, setGreeting] = useState(false);
  const pathname = usePathname();
  const atTop = TOP_PATHS.includes(pathname);

  // Une bulle de bienvenue par session, puis Wenna se fait discrète.
  useEffect(() => {
    if (NO_GREETING_PATHS.includes(pathname)) { setGreeting(false); return undefined; }
    let seen = null;
    try { seen = sessionStorage.getItem(GREETING_SEEN_KEY); } catch {}
    if (seen) return undefined;
    const show = setTimeout(() => {
      try { sessionStorage.setItem(GREETING_SEEN_KEY, '1'); } catch {}
      setGreeting(true);
    }, 4000);
    return () => clearTimeout(show);
  }, [pathname]);

  useEffect(() => {
    if (!greeting) return undefined;
    const hide = setTimeout(() => setGreeting(false), 7000);
    return () => clearTimeout(hide);
  }, [greeting]);

  function close() {
    setOpen(false);
    setMode('menu');
    setError('');
    setQuery('');
    setShowAll(false);
    setAnswer(null);
  }

  function openAnswer(faq) {
    setAnswer(faq);
    setMode('answer');
  }

  function openWhatsapp() {
    const msg = encodeURIComponent(`Bonjour WennaShop, j'ai besoin d'aide (page: ${typeof window !== 'undefined' ? window.location.href : ''})`);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank', 'noopener,noreferrer');
    close();
  }

  async function submitTicket() {
    if (!form.message.trim()) { setError('Merci de décrire ta réclamation.'); return; }
    setSending(true);
    setError('');
    try {
      const sb = getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      let userId = null;
      if (user) {
        const { data: row } = await sb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
        userId = row?.id || null;
      }
      const { error: err } = await sb.from('support_tickets').insert({
        user_id: userId,
        name: form.name || null,
        email: form.email || null,
        message: form.message,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
      });
      if (err) throw err;
      setMode('sent');
    } catch (e) {
      setError("Erreur : " + e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {greeting && !open && (
        <button className={styles.bubble} onClick={() => { setGreeting(false); setOpen(true); }}>
          Salut, moi c'est Wenna ! Besoin d'aide ?
        </button>
      )}
      <button
        onClick={() => { setGreeting(false); setOpen((v) => !v); }}
        aria-label="Aide — Wenna"
        className={`${styles.fab} ${atTop ? styles.fabTop : ''}`}
      >
        <Mascot size={54} float />
      </button>

      {open && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 899, background: 'rgba(0,0,0,.4)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`${styles.panel} ${atTop ? styles.panelTop : ''}`}
            style={{
              width: 330, maxWidth: 'calc(100vw - 32px)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 18,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {mode === 'menu' && (() => {
              const results = query.trim() ? searchFaq(query) : null;
              const list = results || (showAll ? WENNA_FAQ : POPULAR_FAQ);
              return (
                <>
                  <div className={styles.head}>
                    <Mascot size={40} />
                    <div>
                      <div className={styles.headTitle}>Besoin d'aide ?</div>
                      <div className={styles.headSub}>Pose ta question, Wenna te répond.</div>
                    </div>
                  </div>
                  <input
                    className={styles.search}
                    placeholder="Ex. : paiement, livraison, retour…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Rechercher dans l'aide"
                  />
                  {results && results.length === 0 ? (
                    <div className={styles.noResult}>
                      Wenna n'a pas encore la réponse à cette question. L'équipe va t'aider.
                    </div>
                  ) : (
                    <div className={styles.faqList}>
                      {list.map((f) => (
                        <button key={f.id} className={styles.faqItem} onClick={() => openAnswer(f)}>{f.q}</button>
                      ))}
                      {!results && !showAll && (
                        <button className={styles.moreBtn} onClick={() => setShowAll(true)}>Toutes les questions</button>
                      )}
                    </div>
                  )}
                  <button className={styles.contactLink} onClick={() => setMode('contact')}>
                    Pas trouvé ? Contacter l'équipe
                  </button>
                </>
              );
            })()}

            {mode === 'answer' && answer && (
              <>
                <button className={styles.backBtn} onClick={() => setMode('menu')}>‹ Questions</button>
                <div className={styles.answerHead}>
                  <Mascot size={36} />
                  <div className={styles.answerTitle}>{answer.q}</div>
                </div>
                <p className={styles.answerText}>{answer.a}</p>
                {answer.link && (
                  <Link href={answer.link.href} className={styles.answerLink} onClick={close}>{answer.link.label}</Link>
                )}
                {answer.contact ? (
                  <>
                    <div className={styles.helpful}>Contacter l'équipe :</div>
                    <button
                      onClick={openWhatsapp}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <i className="ph ph-whatsapp-logo" style={{ fontSize: 18, color: '#25D366' }} />
                      Nous écrire sur WhatsApp
                    </button>
                    <button
                      onClick={() => setMode('form')}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', borderRadius: 10,
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <i className="ph ph-flag" style={{ fontSize: 18, color: 'var(--accent)' }} />
                      Envoyer une réclamation
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.helpful}>Ça répond à ta question ?</div>
                    <div className={styles.helpfulRow}>
                      <button className={styles.helpfulYes} onClick={close}>Oui, merci</button>
                      <button className={styles.helpfulNo} onClick={() => setMode('contact')}>Non, contacter l'équipe</button>
                    </div>
                  </>
                )}
              </>
            )}

            {mode === 'contact' && (
              <>
                <button className={styles.backBtn} onClick={() => setMode('menu')}>‹ Questions</button>
                <div className={styles.head}>
                  <Mascot size={40} />
                  <div>
                    <div className={styles.headTitle}>Contacter l'équipe</div>
                    <div className={styles.headSub}>Une vraie personne te répond.</div>
                  </div>
                </div>
                <button
                  onClick={openWhatsapp}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <i className="ph ph-whatsapp-logo" style={{ fontSize: 18, color: '#25D366' }} />
                  Nous écrire sur WhatsApp
                </button>
                <button
                  onClick={() => setMode('form')}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <i className="ph ph-flag" style={{ fontSize: 18, color: 'var(--accent)' }} />
                  Envoyer une réclamation
                </button>
              </>
            )}

            {mode === 'form' && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Envoyer une réclamation</div>
                {error && <div style={{ color: 'var(--error)', fontSize: 11, marginBottom: 10 }}>{error}</div>}
                <input
                  placeholder="Nom (optionnel)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                />
                <input
                  placeholder="Email (optionnel)"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle}
                />
                <textarea
                  placeholder="Décris ton problème *"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => setMode('contact')}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Retour
                  </button>
                  <button
                    onClick={submitTicket}
                    disabled={sending}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-btn)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}
                  >
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </>
            )}

            {mode === 'sent' && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Réclamation envoyée</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  Merci, notre équipe va l'examiner rapidement.
                </div>
                <button
                  onClick={close}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--accent-btn)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', marginBottom: 10,
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
};
