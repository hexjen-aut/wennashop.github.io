'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './SupportButton.module.css';

const WHATSAPP_NUMBER = '212766237011';

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('menu'); // menu | form | sent
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setMode('menu');
    setError('');
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
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Aide"
        className={styles.fab}
        style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--accent-btn)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, cursor: 'pointer',
          boxShadow: 'var(--shadow-orange)',
        }}
      >
        <i className="ph ph-question" />
      </button>

      {open && (
        <div
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 899, background: 'rgba(0,0,0,.4)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.panel}
            style={{
              width: 300, maxWidth: 'calc(100vw - 40px)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 18,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {mode === 'menu' && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Besoin d'aide ?</div>
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
                    onClick={() => setMode('menu')}
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
