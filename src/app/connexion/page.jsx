'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './connexion.module.css';

const PAYS_GROUPS = [
  { label: 'Maghreb', options: [
    { v: 'maroc', l: 'Maroc' }, { v: 'algerie', l: 'Algérie' }, { v: 'tunisie', l: 'Tunisie' },
  ] },
  { label: 'Afrique Centrale', options: [
    { v: 'gabon', l: 'Gabon' }, { v: 'cameroun', l: 'Cameroun' }, { v: 'congo_brazza', l: 'Congo-Brazzaville' },
    { v: 'rdc', l: 'RD Congo' }, { v: 'centrafrique', l: 'Centrafrique' }, { v: 'tchad', l: 'Tchad' },
  ] },
  { label: "Afrique de l'Ouest", options: [
    { v: 'senegal', l: 'Sénégal' }, { v: 'cote_ivoire', l: "Côte d'Ivoire" }, { v: 'mali', l: 'Mali' },
    { v: 'burkina', l: 'Burkina Faso' }, { v: 'guinee', l: 'Guinée' }, { v: 'benin', l: 'Bénin' },
    { v: 'togo', l: 'Togo' }, { v: 'niger', l: 'Niger' }, { v: 'mauritanie', l: 'Mauritanie' },
  ] },
  { label: "Afrique de l'Est & Océan Indien", options: [
    { v: 'madagascar', l: 'Madagascar' }, { v: 'djibouti', l: 'Djibouti' }, { v: 'comores', l: 'Comores' },
  ] },
  { label: 'Autre', options: [{ v: 'autre', l: 'Autre pays' }] },
];

const GENRE_HINTS = {
  homme: 'Vous verrez en priorité : bijoux hommes, accessoires, djellabas, art traditionnel masculin.',
  femme: 'Vous verrez en priorité : tissu, bijoux, maroquinerie, cosmétiques, art textile féminin.',
  autre: "Recommandations variées sur l'ensemble des catégories.",
  non_precise: 'Suggestions générales sur toutes les catégories.',
};

function evalStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const levels = [
    { w: '0%', bg: 'transparent', msg: '' },
    { w: '25%', bg: '#ef4444', msg: 'Faible' },
    { w: '50%', bg: '#f59e0b', msg: 'Moyen' },
    { w: '75%', bg: 'var(--accent)', msg: 'Bon' },
    { w: '100%', bg: '#22c55e', msg: 'Excellent' },
  ];
  return levels[score] || levels[0];
}

function downloadDoc(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function uploadKycFile(sb, userId, file, label) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${userId}/${label}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('kyc-documents').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

const CGU_TEXT = `Dernière mise à jour : juillet 2026

1. Objet
WennaShop est un écosystème numérique qui permet à tout commerçant africain de créer, développer et gérer son activité, sans avoir à chercher séparément ses clients, ses outils et ses partenaires.

2. Inscription et compte
L'inscription est gratuite. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants.

3. Rôles utilisateurs
Acheteur : peut parcourir les boutiques, passer commande et suivre ses livraisons.
Vendeur : peut créer une boutique, lister des produits et gérer ses commandes après validation par l'administration WennaShop.
La validation d'un compte vendeur est requise avant toute mise en ligne. Un document d'identité valide (CNI ou passeport) ainsi qu'une adresse exacte doivent être fournis à l'inscription.

4. Commissions et paiements
WennaShop prélève une commission de 8% sur chaque vente. Les paiements sont traités via CinetPay et PayDunia.

5. Responsabilités
WennaShop agit en qualité d'intermédiaire technique. Les vendeurs assument l'entière responsabilité de la conformité de leurs articles.

6. Propriété intellectuelle
Le nom, le logo et les éléments graphiques de WennaShop sont la propriété exclusive de Hexjen Conceptions.

7. Loi applicable
Les présentes CGU sont soumises au droit marocain. Tout litige sera soumis aux tribunaux de Casablanca, Maroc.`;

const PRIVACY_TEXT = `Dernière mise à jour : juillet 2026

1. Responsable du traitement
Hexjen Conceptions, société basée à Casablanca, Maroc.

2. Données collectées
Données d'identité : prénom, nom, email, genre (optionnel).
Données de localisation : pays de résidence, adresse exacte (vendeurs).
Données de vérification vendeur : document d'identité (CNI ou passeport) requis pour la validation du compte.
Données de transaction : historique de commandes, montants, statuts.

3. Partage des données
Vos données ne sont jamais vendues à des tiers. Elles peuvent être partagées avec nos prestataires de paiement et Supabase. Les documents d'identité vendeurs sont stockés dans un espace privé, accessible uniquement à l'administration WennaShop.

4. Vos droits
Accès, rectification, suppression : privacy@wennashop.com

5. Sécurité
Données chiffrées en transit (HTTPS) et au repos. Aucune donnée bancaire stockée sur nos serveurs.`;

export default function ConnexionPage() {
  const router = useRouter();
  const [mode, setMode] = useState('connexion');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Connexion
  const [cnxEmail, setCnxEmail] = useState('');
  const [cnxPwd, setCnxPwd] = useState('');
  const [showCnxPwd, setShowCnxPwd] = useState(false);

  // Inscription
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showInsPwd, setShowInsPwd] = useState(false);
  const [genre, setGenre] = useState(null);
  const [pays, setPays] = useState('');
  const [role, setRole] = useState(null);
  const [docType, setDocType] = useState(null);
  const [rectoFile, setRectoFile] = useState(null);
  const [versoFile, setVersoFile] = useState(null);
  const [kycAddress, setKycAddress] = useState('');
  const [cgu, setCgu] = useState(false);

  // Modales
  const [modalCgu, setModalCgu] = useState(false);
  const [modalPrivacy, setModalPrivacy] = useState(false);
  const [modalGoogleRole, setModalGoogleRole] = useState(false);
  const [googleRole, setGoogleRole] = useState(null);

  function showToast(text, type = 'ok') {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  }

  // Redirection si déjà connecté
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const role = session.user?.user_metadata?.role;
        router.push(role === 'artisan' ? '/vendeur' : '/boutique');
      }
    })();
  }, [router]);

  // ── CONNEXION ──
  async function handleConnexion() {
    if (!cnxEmail.trim() || !cnxPwd) return showToast('Remplis email et mot de passe', 'ko');
    setLoading(true);
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email: cnxEmail.trim(), password: cnxPwd });
    setLoading(false);
    if (error) {
      let msg = 'Erreur de connexion.';
      if (error.message === 'Invalid login credentials') msg = 'Email ou mot de passe incorrect.';
      else if (error.message === 'Email not confirmed') msg = 'Vérifiez votre email avant de vous connecter.';
      else if (error.message) msg = error.message;
      showToast(msg, 'ko');
      return;
    }
    showToast('Connexion réussie', 'ok');
    const userRole = data.user?.user_metadata?.role;
    setTimeout(() => router.push(userRole === 'artisan' ? '/vendeur' : '/boutique'), 700);
  }

  async function sendReset() {
    if (!cnxEmail.trim()) return showToast('Entrez votre email pour réinitialiser', 'ko');
    const sb = getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(cnxEmail.trim(), {
      redirectTo: window.location.origin + '/connexion',
    });
    showToast(error ? error.message : 'Email de réinitialisation envoyé', error ? 'ko' : 'ok');
  }

  // ── INSCRIPTION ──
  function selectRole(val) {
    setRole(val);
    if (val !== 'artisan') {
      setDocType(null); setRectoFile(null); setVersoFile(null); setKycAddress('');
    }
  }

  async function handleInscription() {
    if (!prenom.trim() || !nom.trim() || !email.trim()) return showToast('Remplis les champs obligatoires', 'ko');
    if (pwd.length < 8) return showToast('Mot de passe : 8 caractères minimum', 'ko');
    if (!pays) return showToast('Sélectionne ton pays', 'ko');
    if (!role) return showToast('Sélectionne ton rôle', 'ko');

    if (role === 'artisan') {
      if (!docType) return showToast('Sélectionne le type de document', 'ko');
      if (!rectoFile) return showToast('Ajoute le recto de ton document', 'ko');
      if (docType === 'cni' && !versoFile) return showToast('Ajoute le verso de ta CNI', 'ko');
      if (!kycAddress.trim()) return showToast('Indique ton adresse exacte', 'ko');
    }
    if (!cgu) return showToast('Accepte les CGU pour continuer', 'ko');

    setLoading(true);
    const sb = getSupabase();
    const finalGenre = genre || 'non_precise';

    const { data: authData, error: authErr } = await sb.auth.signUp({
      email: email.trim(),
      password: pwd,
      options: {
        data: { full_name: `${prenom} ${nom}`, first_name: prenom, last_name: nom, country: pays, role, gender: finalGenre },
        emailRedirectTo: window.location.origin + '/connexion',
      },
    });

    if (authErr) {
      setLoading(false);
      let msg = "Erreur lors de l'inscription.";
      if (authErr.message?.includes('already')) msg = 'Cet email est déjà utilisé.';
      else if (authErr.message?.includes('Password should be')) msg = 'Mot de passe trop faible.';
      else if (authErr.message) msg = authErr.message;
      showToast(msg, 'ko');
      return;
    }

    if (authData?.user?.id) {
      await new Promise((r) => setTimeout(r, 600));
      const userId = authData.user.id;
      const updatePayload = { gender: finalGenre };

      if (role === 'artisan') {
        updatePayload.status = 'pending';
        updatePayload.document_type = docType;
        updatePayload.address = kycAddress.trim();
        try {
          updatePayload.id_card_front_url = await uploadKycFile(sb, userId, rectoFile, 'recto');
          if (versoFile) updatePayload.id_card_back_url = await uploadKycFile(sb, userId, versoFile, 'verso');
        } catch {
          showToast("Compte créé, mais l'envoi du document a échoué. Réessaie depuis ton profil vendeur.", 'ko');
        }
      }
      await sb.from('users').update(updatePayload).eq('auth_id', userId);
    }

    setLoading(false);
    showToast(
      role === 'artisan'
        ? 'Compte créé ! Vérifiez votre email. Votre dossier vendeur est en cours de vérification — réponse sous 24 à 48h.'
        : 'Compte créé ! Vérifiez votre email.',
      'ok'
    );
    setTimeout(() => setMode('connexion'), 2500);
  }

  // ── GOOGLE ──
  function handleGoogle() {
    setGoogleRole(null);
    setModalGoogleRole(true);
  }
  async function confirmGoogleRole() {
    if (!googleRole) return;
    setModalGoogleRole(false);
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + (googleRole === 'artisan' ? '/vendeur' : '/boutique'),
        queryParams: { access_type: 'offline', prompt: 'select_account' },
        scopes: 'email profile',
      },
    });
    if (error) showToast(error.message, 'ko');
  }

  const pwdStrength = evalStrength(pwd);

  return (
    <div className={styles.layout}>
      {/* PANNEAU GAUCHE */}
      <div className={styles.leftPanel}>
        <div className={styles.leftBg} />
        <div className={styles.leftOverlay} />
        <div className={styles.leftContent}>
          <div className={styles.leftLogo}><span>Wenna</span>Shop</div>
          <p className={styles.leftTagline}>
            L'écosystème qui permet à tout commerçant africain de créer, développer et gérer
            son activité — sans chercher séparément ses clients, ses outils et ses partenaires.
          </p>
          <div className={styles.corridor}>
            <div className={styles.corridorDot} />
            <span className={styles.corridorLabel}>Afrique</span>
            <div className={styles.corridorSep} />
            <span className={styles.corridorCountries}>Francophone</span>
          </div>
        </div>
      </div>

      {/* PANNEAU DROIT */}
      <div className={styles.rightPanel}>
        <div className={styles.wrap}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${mode === 'connexion' ? styles.tabActive : ''}`} onClick={() => setMode('connexion')}>Connexion</button>
            <button className={`${styles.tab} ${mode === 'inscription' ? styles.tabActive : ''}`} onClick={() => setMode('inscription')}>Inscription</button>
          </div>

          {mode === 'connexion' ? (
            <>
              <div className={styles.eyebrow}>Accès sécurisé</div>
              <h1 className={styles.title}>Bon retour</h1>
              <p className={styles.sub}>Connectez-vous à votre espace WennaShop.</p>

              <div className={styles.field}>
                <div className={styles.labelRow}><label className={styles.label}>Email</label></div>
                <input className={styles.input} type="email" value={cnxEmail} onChange={(e) => setCnxEmail(e.target.value)} autoComplete="email" />
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>Mot de passe</label>
                  <button className={styles.forgot} onClick={sendReset}>Oublié ?</button>
                </div>
                <div className={styles.inputRow}>
                  <input className={styles.input} type={showCnxPwd ? 'text' : 'password'} value={cnxPwd} onChange={(e) => setCnxPwd(e.target.value)} autoComplete="current-password" />
                  <button className={styles.toggleVis} onClick={() => setShowCnxPwd((v) => !v)}>{showCnxPwd ? 'Masquer' : 'Afficher'}</button>
                </div>
              </div>

              <button className={styles.btnPrimary} onClick={handleConnexion} disabled={loading}>{loading ? '…' : 'Se connecter'}</button>

              <div className={styles.divider}><div className={styles.dividerLine} /><span className={styles.dividerLabel}>ou</span><div className={styles.dividerLine} /></div>

              <button className={styles.btnGoogle} onClick={handleGoogle}>Continuer avec Google</button>

              <div className={styles.switchLink}>Pas encore de compte ? <button onClick={() => setMode('inscription')}>S'inscrire gratuitement</button></div>
            </>
          ) : (
            <>
              <div className={styles.eyebrow}>Nouveau compte</div>
              <h1 className={styles.title}>Rejoignez-nous</h1>
              <p className={styles.sub}>Inscription gratuite — acheteur ou vendeur.</p>

              <div className={styles.grid2} style={{ marginBottom: 16 }}>
                <div><label className={styles.label}>Prénom</label><input className={styles.input} value={prenom} onChange={(e) => setPrenom(e.target.value)} autoComplete="given-name" /></div>
                <div><label className={styles.label}>Nom</label><input className={styles.input} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="family-name" /></div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Mot de passe</label>
                <div className={styles.inputRow}>
                  <input className={styles.input} type={showInsPwd ? 'text' : 'password'} placeholder="Min. 8 caractères" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
                  <button className={styles.toggleVis} onClick={() => setShowInsPwd((v) => !v)}>{showInsPwd ? 'Masquer' : 'Afficher'}</button>
                </div>
                <div className={styles.pwdBarWrap}><div className={styles.pwdBar} style={{ width: pwdStrength.w, background: pwdStrength.bg }} /></div>
                {pwd && <div className={styles.pwdHint} style={{ color: pwdStrength.bg === 'transparent' ? 'var(--text-faint)' : pwdStrength.bg }}>{pwdStrength.msg}</div>}
              </div>

              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label}>Genre</label>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Personnalise tes recommandations</span>
                </div>
                <div className={styles.genreGroup}>
                  {['homme', 'femme', 'autre', 'non_precise'].map((g) => (
                    <button key={g} className={`${styles.genreBtn} ${genre === g ? styles.genreBtnActive : ''}`} onClick={() => setGenre(g)}>
                      {g === 'homme' ? 'Homme' : g === 'femme' ? 'Femme' : g === 'autre' ? 'Autre' : 'Discret'}
                    </button>
                  ))}
                </div>
                {genre && <div className={styles.genreHint}>{GENRE_HINTS[genre]}</div>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Pays</label>
                <select className={styles.select} value={pays} onChange={(e) => setPays(e.target.value)}>
                  <option value="">Sélectionnez votre pays</option>
                  {PAYS_GROUPS.map((grp) => (
                    <optgroup key={grp.label} label={grp.label}>
                      {grp.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Vous êtes</label>
                <div className={styles.roleGroup}>
                  <button className={`${styles.roleBtn} ${role === 'buyer' ? styles.roleBtnActive : ''}`} onClick={() => selectRole('buyer')}>Acheteur</button>
                  <button className={`${styles.roleBtn} ${role === 'artisan' ? styles.roleBtnActive : ''}`} onClick={() => selectRole('artisan')}>Vendeur</button>
                </div>
              </div>

              {role === 'artisan' && (
                <div className={styles.kycBlock}>
                  <div className={styles.kycIntro}>
                    <strong>Vérification vendeur requise.</strong> Ton compte sera activé par l'administration WennaShop après validation de ton document et de ton adresse — cela sert aussi à sécuriser l'envoi et la réception de tes fonds. Délai habituel : 24 à 48h.
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Type de document</label>
                    <div className={styles.choiceGroup}>
                      <button className={`${styles.choiceBtn} ${docType === 'cni' ? styles.choiceBtnActive : ''}`} onClick={() => setDocType('cni')}>Carte d'identité (CNI)</button>
                      <button className={`${styles.choiceBtn} ${docType === 'passeport' ? styles.choiceBtnActive : ''}`} onClick={() => setDocType('passeport')}>Passeport</button>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Document — Recto</label>
                    <div className={styles.fileWrap}>
                      <input type="file" accept="image/*,.pdf" onChange={(e) => setRectoFile(e.target.files?.[0] || null)} />
                      <div className={`${styles.fileLabel} ${rectoFile ? styles.fileLabelActive : ''}`}>{rectoFile ? rectoFile.name : 'Choisir un fichier (image ou PDF)'}</div>
                    </div>
                  </div>

                  {docType === 'cni' && (
                    <div className={styles.field}>
                      <label className={styles.label}>Document — Verso</label>
                      <div className={styles.fileWrap}>
                        <input type="file" accept="image/*,.pdf" onChange={(e) => setVersoFile(e.target.files?.[0] || null)} />
                        <div className={`${styles.fileLabel} ${versoFile ? styles.fileLabelActive : ''}`}>{versoFile ? versoFile.name : 'Choisir un fichier (image ou PDF)'}</div>
                      </div>
                    </div>
                  )}

                  <div className={styles.field} style={{ marginBottom: 0 }}>
                    <label className={styles.label}>Adresse exacte</label>
                    <input className={styles.input} placeholder="Numéro, rue, quartier, ville" value={kycAddress} onChange={(e) => setKycAddress(e.target.value)} />
                  </div>
                </div>
              )}

              <div className={styles.cguRow}>
                <input type="checkbox" className={styles.cguCheck} checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
                <span className={styles.cguText}>
                  J'accepte les <button onClick={() => setModalCgu(true)}>CGU</button> et la <button onClick={() => setModalPrivacy(true)}>Politique de confidentialité</button>.
                </span>
              </div>

              <button className={styles.btnPrimary} onClick={handleInscription} disabled={loading}>{loading ? '…' : 'Créer mon compte gratuitement'}</button>

              <div className={styles.divider}><div className={styles.dividerLine} /><span className={styles.dividerLabel}>ou</span><div className={styles.dividerLine} /></div>

              <button className={styles.btnGoogle} onClick={handleGoogle}>S'inscrire avec Google</button>

              <div className={styles.switchLink}>Déjà un compte ? <button onClick={() => setMode('connexion')}>Se connecter</button></div>
            </>
          )}
        </div>
      </div>

      {/* MODAL CGU */}
      {modalCgu && (
        <div className={styles.modalOv} onClick={() => setModalCgu(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}><span className={styles.modalTitle}>Conditions Générales d'Utilisation</span><button className={styles.modalClose} onClick={() => setModalCgu(false)}>×</button></div>
            <div className={styles.modalBody}>{CGU_TEXT.split('\n\n').map((p, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{p}</p>)}</div>
            <div className={styles.modalFooter}>
              <button className={styles.btnDownload} onClick={() => downloadDoc(CGU_TEXT, 'WennaShop_CGU.txt')}>Télécharger</button>
              <button onClick={() => setModalCgu(false)}>Compris</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRIVACY */}
      {modalPrivacy && (
        <div className={styles.modalOv} onClick={() => setModalPrivacy(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}><span className={styles.modalTitle}>Politique de Confidentialité</span><button className={styles.modalClose} onClick={() => setModalPrivacy(false)}>×</button></div>
            <div className={styles.modalBody}>{PRIVACY_TEXT.split('\n\n').map((p, i) => <p key={i} style={{ whiteSpace: 'pre-line' }}>{p}</p>)}</div>
            <div className={styles.modalFooter}>
              <button className={styles.btnDownload} onClick={() => downloadDoc(PRIVACY_TEXT, 'WennaShop_Confidentialite.txt')}>Télécharger</button>
              <button onClick={() => setModalPrivacy(false)}>Compris</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RÔLE GOOGLE */}
      {modalGoogleRole && (
        <div className={styles.modalOv} onClick={() => setModalGoogleRole(false)}>
          <div className={styles.modalBox} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}><span className={styles.modalTitle}>Vous êtes...</span><button className={styles.modalClose} onClick={() => setModalGoogleRole(false)}>×</button></div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: 18 }}>Dernière étape avant d'accéder à WennaShop. Sélectionne ton profil pour continuer.</p>
              <div className={styles.roleModalBtns}>
                <button className={`${styles.roleModalBtn} ${googleRole === 'buyer' ? styles.roleModalBtnActive : ''}`} onClick={() => setGoogleRole('buyer')}>Acheteur</button>
                <button className={`${styles.roleModalBtn} ${googleRole === 'artisan' ? styles.roleModalBtnActive : ''}`} onClick={() => setGoogleRole('artisan')}>Vendeur</button>
              </div>
              <button className={styles.btnPrimary} style={{ marginBottom: 0 }} disabled={!googleRole} onClick={confirmGoogleRole}>Continuer</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`${styles.toast} ${toast.type === 'ko' ? styles.toastKo : ''}`}>{toast.text}</div>}
    </div>
  );
}
