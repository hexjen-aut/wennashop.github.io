'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './connexion.module.css';

const PAYS = [
  { v: 'maroc', l: '🇲🇦 Maroc' }, { v: 'gabon', l: '🇬🇦 Gabon' },
  { v: 'senegal', l: '🇸🇳 Sénégal' }, { v: 'cote_ivoire', l: "🇨🇮 Côte d'Ivoire" },
  { v: 'cameroun', l: '🇨🇲 Cameroun' }, { v: 'benin', l: '🇧🇯 Bénin' },
  { v: 'togo', l: '🇹🇬 Togo' }, { v: 'mali', l: '🇲🇱 Mali' },
];

export default function ConnexionPage() {
  const router = useRouter();
  const [mode, setMode] = useState('connexion');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Connexion
  const [cnxEmail, setCnxEmail] = useState('');
  const [cnxPwd, setCnxPwd] = useState('');

  // Inscription
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pays, setPays] = useState('');
  const [role, setRole] = useState('buyer');
  const [cgu, setCgu] = useState(false);

  function showMsg(text, type) { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); }

  async function handleConnexion() {
    if (!cnxEmail || !cnxPwd) return showMsg('Remplis email et mot de passe', 'ko');
    setLoading(true);
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email: cnxEmail, password: cnxPwd });
    setLoading(false);
    if (error) return showMsg(error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message, 'ko');
    showMsg('Connexion réussie', 'ok');
    const role = data.user?.user_metadata?.role;
    setTimeout(() => router.push(role === 'artisan' ? '/vendeur' : '/boutique'), 700);
  }

  async function handleInscription() {
    if (!prenom || !nom || !email) return showMsg('Remplis les champs obligatoires', 'ko');
    if (pwd.length < 8) return showMsg('Mot de passe : 8 caractères minimum', 'ko');
    if (!pays) return showMsg('Sélectionne ton pays', 'ko');
    if (!cgu) return showMsg('Accepte les CGU pour continuer', 'ko');
    setLoading(true);
    const sb = getSupabase();
    const { error } = await sb.auth.signUp({
      email, password: pwd,
      options: { data: { full_name: `${prenom} ${nom}`, first_name: prenom, last_name: nom, country: pays, role } },
    });
    setLoading(false);
    if (error) return showMsg(error.message.includes('already') ? 'Cet email est déjà utilisé.' : error.message, 'ko');
    showMsg('Compte créé ! Vérifie ton email.', 'ok');
    setTimeout(() => setMode('connexion'), 2000);
  }

  async function handleGoogle() {
    const sb = getSupabase();
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/boutique' },
    });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.wrap}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${mode === 'connexion' ? styles.tabActive : ''}`} onClick={() => setMode('connexion')}>Connexion</button>
          <button className={`${styles.tab} ${mode === 'inscription' ? styles.tabActive : ''}`} onClick={() => setMode('inscription')}>Inscription</button>
        </div>

        {msg && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.type === 'ok' ? '#061210' : '#130606', color: msg.type === 'ok' ? 'var(--success)' : 'var(--error)' }}>{msg.text}</div>}

        {mode === 'connexion' ? (
          <>
            <h1 className={styles.title}>Bon retour</h1>
            <p className={styles.sub}>Connecte-toi à ton espace WennaShop.</p>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input className={styles.input} type="email" value={cnxEmail} onChange={(e) => setCnxEmail(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Mot de passe</label>
              <input className={styles.input} type="password" value={cnxPwd} onChange={(e) => setCnxPwd(e.target.value)} />
            </div>
            <button className={styles.btnPrimary} onClick={handleConnexion} disabled={loading}>{loading ? '...' : 'Se connecter'}</button>
            <button className={styles.btnGoogle} onClick={handleGoogle}>Continuer avec Google</button>
            <div className={styles.switchLink}>Pas de compte ? <button onClick={() => setMode('inscription')}>S'inscrire</button></div>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Rejoins-nous</h1>
            <p className={styles.sub}>Inscription gratuite — acheteur ou vendeur.</p>
            <div className={styles.grid2} style={{ marginBottom: 16 }}>
              <div><label className={styles.label}>Prénom</label><input className={styles.input} value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
              <div><label className={styles.label}>Nom</label><input className={styles.input} value={nom} onChange={(e) => setNom(e.target.value)} /></div>
            </div>
            <div className={styles.field}><label className={styles.label}>Email</label><input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className={styles.field}><label className={styles.label}>Mot de passe</label><input className={styles.input} type="password" placeholder="Min. 8 caractères" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
            <div className={styles.field}>
              <label className={styles.label}>Pays</label>
              <select className={styles.select} value={pays} onChange={(e) => setPays(e.target.value)}>
                <option value="">Sélectionner…</option>
                {PAYS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Vous êtes</label>
              <div className={styles.roleGroup}>
                <button className={`${styles.roleBtn} ${role === 'buyer' ? styles.roleBtnActive : ''}`} onClick={() => setRole('buyer')}>Acheteur</button>
                <button className={`${styles.roleBtn} ${role === 'artisan' ? styles.roleBtnActive : ''}`} onClick={() => setRole('artisan')}>Vendeur</button>
              </div>
              {role === 'artisan' && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Compte vendeur : validation par l'équipe WennaShop sous 24-48h (document d'identité à fournir depuis ton profil après inscription).</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} style={{ marginTop: 2 }} />
              <span>J'accepte les CGU et la Politique de confidentialité.</span>
            </div>
            <button className={styles.btnPrimary} onClick={handleInscription} disabled={loading}>{loading ? '...' : 'Créer mon compte gratuitement'}</button>
            <button className={styles.btnGoogle} onClick={handleGoogle}>S'inscrire avec Google</button>
            <div className={styles.switchLink}>Déjà un compte ? <button onClick={() => setMode('connexion')}>Se connecter</button></div>
          </>
        )}
      </div>
    </div>
  );
}
