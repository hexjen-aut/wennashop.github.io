'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './admin.module.css';

// Messages de l'équipe : une notification par destinataire (cloche du site,
// téléphone si les notifications sont activées), et par e-mail si coché.
// L'envoi passe par admin_broadcast (réservé aux admins, historisé).
const ROLES = [
  ['all', 'Tout le monde'],
  ['buyer', 'Acheteurs'],
  ['seller', 'Vendeurs'],
  ['hunter', 'Chasseurs vérifiés'],
  ['team', "L'équipe (admins et agents)"],
];
const COUNTRIES = [['all', 'Tous les pays'], ['Gabon', 'Gabon'], ['Maroc', 'Maroc']];
const ROLE_LABEL = Object.fromEntries(ROLES);

const ERRORS = {
  forbidden: 'Seuls les admins peuvent envoyer un message.',
  invalid_title: 'Le titre est obligatoire (80 caractères au plus).',
  body_too_long: 'Le message dépasse 400 caractères.',
  invalid_link: 'Le lien doit être une page du site, par exemple /boutique ou /compte.',
  no_recipient: 'Aucun destinataire ne correspond à ce choix.',
};

export default function BroadcastPanel() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [mode, setMode] = useState('group');
  const [role, setRole] = useState('all');
  const [country, setCountry] = useState('all');
  const [person, setPerson] = useState(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [sendEmail, setSendEmail] = useState(true);
  const [count, setCount] = useState(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);

  const audience = mode === 'person'
    ? { p_role: 'all', p_country: 'all', p_user_id: person?.id || null }
    : { p_role: role, p_country: country, p_user_id: null };

  const loadHistory = useCallback(async () => {
    const { data } = await getSupabase().from('admin_broadcasts')
      .select('id, title, body, link, audience_role, audience_country, audience_user_id, send_email, recipients, created_at')
      .order('created_at', { ascending: false }).limit(20);
    setHistory(data || []);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Aperçu du nombre de destinataires à chaque changement de ciblage.
  useEffect(() => {
    if (mode === 'person' && !person) { setCount(null); return undefined; }
    let stale = false;
    getSupabase().rpc('admin_broadcast', { p_title: '', p_body: '', ...audience, p_dry_run: true })
      .then(({ data }) => { if (!stale) setCount(typeof data === 'number' ? data : null); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, role, country, person]);

  useEffect(() => {
    const q = query.trim();
    if (mode !== 'person' || q.length < 2) { setMatches([]); return undefined; }
    const t = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data } = await getSupabase().from('users').select('id, full_name, email, country')
        .or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`).limit(8);
      setMatches(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  async function send() {
    setMessage(null);
    if (!title.trim()) { setMessage({ error: true, text: ERRORS.invalid_title }); return; }
    const who = mode === 'person' ? (person?.full_name || person?.email) : `${count ?? '?'} destinataire(s)`;
    if (!window.confirm(`Envoyer « ${title.trim()} » à ${who}${sendEmail ? ', aussi par e-mail' : ''} ?`)) return;
    setSending(true);
    const { data, error } = await getSupabase().rpc('admin_broadcast', {
      p_title: title, p_body: body, p_link: link || null, ...audience, p_send_email: sendEmail, p_dry_run: false,
    });
    setSending(false);
    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message?.includes(k));
      setMessage({ error: true, text: code ? ERRORS[code] : "L'envoi n'a pas abouti, réessaie." });
      return;
    }
    setMessage({ text: `Message envoyé à ${data} destinataire(s).${sendEmail ? ' Les e-mails partent par lots de 8 par minute.' : ''}` });
    setTitle(''); setBody(''); setLink('');
    loadHistory();
  }

  const chip = (active) => ({
    padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent-light)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)',
  });

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Messages</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
        Le message arrive dans la cloche du site, sur le téléphone de ceux qui ont activé les notifications, et par e-mail si tu le coches.
      </p>

      <div className={styles.card} style={{ padding: 18, marginBottom: 20 }}>
        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Destinataires</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={chip(mode === 'group')} onClick={() => setMode('group')}>Un groupe</button>
            <button type="button" style={chip(mode === 'person')} onClick={() => setMode('person')}>Une personne</button>
          </div>
        </div>

        {mode === 'group' ? (
          <div className={styles.formGrid} style={{ marginBottom: 12 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Rôle</label>
              <select className={styles.input} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pays</label>
              <select className={styles.input} value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className={styles.formGroup} style={{ marginBottom: 12 }}>
            <label className={styles.formLabel}>Nom ou e-mail</label>
            {person ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <strong>{person.full_name || person.email}</strong>
                <span style={{ color: 'var(--text-muted)' }}>{person.email}</span>
                <button type="button" className={`${styles.btnGhost} ${styles.btnSm}`} onClick={() => { setPerson(null); setQuery(''); }}>Changer</button>
              </div>
            ) : (
              <>
                <input className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex. awa@ ou Awa" />
                {matches.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                    {matches.map((u) => (
                      <button key={u.id} type="button" onClick={() => { setPerson(u); setMatches([]); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
                        {u.full_name || '—'} <span style={{ color: 'var(--text-muted)' }}>· {u.email}{u.country ? ` · ${u.country}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 14 }}>
          {count === null ? '' : `${count} destinataire(s)`}
        </div>

        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Titre ({title.length}/80)</label>
          <input className={styles.input} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Livraison gratuite ce week-end" />
        </div>
        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Message ({body.length}/400)</label>
          <textarea className={styles.input} rows={3} value={body} maxLength={400} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className={styles.formGroup} style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Lien ouvert au clic (facultatif)</label>
          <input className={styles.input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="/boutique, /compte, /vendre…" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Envoyer aussi par e-mail
        </label>

        {message && (
          <div style={{ fontSize: 13, marginBottom: 12, color: message.error ? 'var(--danger, #e5484d)' : 'var(--success)' }}>{message.text}</div>
        )}
        <button type="button" className={styles.btnPrimary} disabled={sending || (mode === 'person' && !person)} onClick={send}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Derniers envois</span></div>
        {history.length === 0 ? <div className={styles.empty}>Aucun message envoyé.</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Date</th><th>Message</th><th>Destinataires</th><th>E-mail</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td><strong>{h.title}</strong>{h.body && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.body}</div>}</td>
                    <td>
                      {h.audience_user_id ? 'Une personne' : `${ROLE_LABEL[h.audience_role] || h.audience_role}${h.audience_country !== 'all' ? ` · ${h.audience_country}` : ''}`}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.recipients} personne(s)</div>
                    </td>
                    <td>{h.send_email ? 'Oui' : 'Non'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
