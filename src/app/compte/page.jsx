'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import styles from './compte.module.css';

function fmt(n, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n); }
  catch { return `${n} ${currency}`; }
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }

const STATUS_LABEL = { pending: 'En attente', processing: 'En préparation', shipped: 'En transit', delivered: 'Livré', cancelled: 'Annulée' };
const COUNTRIES = ['Maroc', 'Gabon', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'Congo', 'RD Congo', 'Bénin', 'Togo', 'Mali', 'Burkina Faso', 'Guinée', 'Algérie', 'Tunisie', 'Niger', 'Tchad', 'Autre'];

export default function ComptePage() {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('commandes');
  const [mode, setMode] = useState('client'); // client | vendeur

  // Profil éditable
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Adresses
  const [addresses, setAddresses] = useState([]);
  const [addrModalOpen, setAddrModalOpen] = useState(false);
  const [addrForm, setAddrForm] = useState({ id: null, label: '', first_name: '', last_name: '', line1: '', line2: '', city: '', postal_code: '', country: 'Maroc', phone: '' });
  const [savingAddr, setSavingAddr] = useState(false);

  // Sécurité
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Vendeur
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [wallet, setWallet] = useState(0);
  const [upgradeForm, setUpgradeForm] = useState({ shopName: '', specialty: '', country: '', bio: '' });
  const [upgrading, setUpgrading] = useState(false);
  const [vendeurTab, setVendeurTab] = useState('produits');

  // 2FA
  const [mfaFactors, setMfaFactors] = useState({ totp: null, phone: null });
  const [mfaModal, setMfaModal] = useState(null); // 'totp' | 'phone' | 'email' | null
  const [mfaStep, setMfaStep] = useState({});
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push('/connexion'); return; }

      const { data } = await sb.from('users').select('*').eq('auth_id', session.user.id).single();
      const p = data || { email: session.user.email };
      setProfile(p);
      setFirstName(p.first_name || '');
      setLastName(p.last_name || '');

      if (p?.id) {
        const { data: o } = await sb.from('orders')
          .select('id,status,total_amount,currency,created_at')
          .eq('user_id', p.id).order('created_at', { ascending: false }).limit(20);
        setOrders(o || []);

        const { data: addrs } = await sb.from('addresses').select('*').eq('user_id', p.id).order('created_at', { ascending: false });
        setAddresses(addrs || []);

        if (p.role === 'artisan' || p.role === 'admin') {
          await loadVendeurData(sb, p.id);
        }
        await loadMfaStatus(sb);
      }
      setLoading(false);
    })();
  }, [router]);

  async function loadMfaStatus(sb) {
    try {
      const { data } = await sb.auth.mfa.listFactors();
      setMfaFactors({
        totp: (data?.totp || []).find((f) => f.status === 'verified') || null,
        phone: (data?.phone || []).find((f) => f.status === 'verified') || null,
      });
    } catch { /* mfa may be unavailable */ }
  }

  async function loadVendeurData(sb, sellerId) {
    const { data: prods } = await sb.from('products').select('id,name,price,currency,status,image_url,created_at').eq('seller_id', sellerId).order('created_at', { ascending: false });
    setProducts(prods || []);
    const { data: sls } = await sb.from('order_items').select('id,quantity,unit_price,created_at,products!inner(name,seller_id),orders(status,currency)').eq('products.seller_id', sellerId).order('created_at', { ascending: false }).limit(20);
    setSales(sls || []);
    const { data: pays } = await sb.from('payments').select('*').eq('user_id', sellerId).order('created_at', { ascending: false }).limit(15);
    setPayments(pays || []);
    const { data: w } = await sb.from('wallets').select('balance,currency').eq('user_id', sellerId).maybeSingle();
    setWallet(w?.balance || 0);
    const { data: shopData } = await sb.from('shops').select('*').eq('user_id', sellerId).maybeSingle();
    setShop(shopData || null);
  }

  async function saveProfile() {
    if (!profile) return;
    setSavingProfile(true);
    const sb = getSupabase();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const { error } = await sb.from('users').update({ first_name: firstName, last_name: lastName, full_name: fullName, updated_at: new Date().toISOString() }).eq('id', profile.id);
    setSavingProfile(false);
    if (!error) setProfile({ ...profile, first_name: firstName, last_name: lastName, full_name: fullName });
    else alert('Erreur : ' + error.message);
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file || !profile) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image trop lourde — max 2 Mo'); return; }
    setUploadingAvatar(true);
    const sb = getSupabase();
    const ext = file.name.split('.').pop().toLowerCase();
    const filePath = `${profile.id}/avatar.${ext}`;
    try {
      const { error: upErr } = await sb.storage.from('avatars').upload(filePath, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = pub?.publicUrl;
      const { error: dbErr } = await sb.from('users').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', profile.id);
      if (dbErr) throw dbErr;
      setProfile({ ...profile, avatar_url: avatarUrl + '?t=' + Date.now() });
    } catch (err) {
      alert('Erreur upload : ' + (err.message || 'réessaie'));
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  }

  async function handleLogout() {
    const sb = getSupabase();
    await sb.auth.signOut();
    router.push('/connexion');
  }

  // ── Adresses ──
  function openAddAddr() {
    setAddrForm({ id: null, label: '', first_name: '', last_name: '', line1: '', line2: '', city: '', postal_code: '', country: 'Maroc', phone: '' });
    setAddrModalOpen(true);
  }
  function openEditAddr(a) {
    setAddrForm({ id: a.id, label: a.label || '', first_name: a.first_name || '', last_name: a.last_name || '', line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', postal_code: a.postal_code || '', country: a.country || 'Maroc', phone: a.phone || '' });
    setAddrModalOpen(true);
  }
  async function saveAddress() {
    if (!addrForm.label.trim() || !addrForm.line1.trim() || !addrForm.city.trim()) { alert('Libellé, adresse et ville sont obligatoires.'); return; }
    setSavingAddr(true);
    const sb = getSupabase();
    const payload = { user_id: profile.id, label: addrForm.label, first_name: addrForm.first_name || null, last_name: addrForm.last_name || null, line1: addrForm.line1, line2: addrForm.line2 || null, city: addrForm.city, postal_code: addrForm.postal_code || null, country: addrForm.country, phone: addrForm.phone || null, updated_at: new Date().toISOString() };
    const { error } = addrForm.id ? await sb.from('addresses').update(payload).eq('id', addrForm.id) : await sb.from('addresses').insert({ ...payload, created_at: new Date().toISOString() });
    setSavingAddr(false);
    if (error) { alert('Erreur : ' + error.message); return; }
    setAddrModalOpen(false);
    const { data } = await sb.from('addresses').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    setAddresses(data || []);
  }
  async function deleteAddress(id) {
    if (!confirm('Supprimer cette adresse ?')) return;
    const sb = getSupabase();
    await sb.from('addresses').delete().eq('id', id).eq('user_id', profile.id);
    setAddresses(addresses.filter((a) => a.id !== id));
  }

  // ── Sécurité ──
  async function resetPassword() {
    const sb = getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(profile.email, { redirectTo: window.location.origin + '/connexion' });
    if (error) alert('Erreur : ' + error.message);
    else alert('Email de réinitialisation envoyé ✓');
  }
  async function confirmDeleteAccount() {
    if (deleteConfirm.trim() !== 'SUPPRIMER') return;
    setDeletingAccount(true);
    const sb = getSupabase();
    try {
      if (profile.role === 'artisan') {
        await sb.from('products').update({ status: 'inactive' }).eq('seller_id', profile.id);
        await sb.from('shops').delete().eq('user_id', profile.id);
      }
      await sb.from('users').update({ status: 'deleted', email: `deleted_${Date.now()}_${profile.email}`, updated_at: new Date().toISOString() }).eq('id', profile.id);
      await sb.auth.signOut();
      router.push('/');
    } catch (err) {
      alert('Erreur : ' + err.message);
      setDeletingAccount(false);
    }
  }

  // ── Vendeur ──
  async function upgradeToVendeur() {
    if (!upgradeForm.shopName.trim() || !upgradeForm.specialty.trim() || !upgradeForm.country) { alert('Remplis tous les champs obligatoires (*)'); return; }
    setUpgrading(true);
    const sb = getSupabase();
    try {
      const slug = upgradeForm.shopName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
      const { data: { session } } = await sb.auth.getSession();
      const { error: userErr } = await sb.from('users').update({ role: 'artisan', country: upgradeForm.country, updated_at: new Date().toISOString() }).eq('auth_id', session.user.id);
      if (userErr) throw userErr;
      const { error: shopErr } = await sb.from('shops').upsert({ user_id: profile.id, name: upgradeForm.shopName, slug, bio: upgradeForm.bio || upgradeForm.specialty, country: upgradeForm.country, status: 'active', commission_rate: 8, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (shopErr) throw shopErr;
      setProfile({ ...profile, role: 'artisan', country: upgradeForm.country });
      setMode('vendeur');
      await loadVendeurData(sb, profile.id);
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally {
      setUpgrading(false);
    }
  }
  async function saveShop(name, bio, country) {
    const sb = getSupabase();
    const { error } = await sb.from('shops').update({ name, bio, country, updated_at: new Date().toISOString() }).eq('user_id', profile.id);
    if (error) alert('Erreur : ' + error.message);
    else { alert('Boutique mise à jour ✓'); setShop({ ...shop, name, bio, country }); }
  }

  // ── 2FA ──
  async function startTotp() {
    setMfaModal('totp'); setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setMfaStep({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) { alert('Erreur : ' + err.message); setMfaModal(null); }
    setMfaBusy(false);
  }
  async function verifyTotp() {
    setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: mfaStep.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await sb.auth.mfa.verify({ factorId: mfaStep.factorId, challengeId: ch.id, code: mfaCode });
      if (vErr) throw vErr;
      await loadMfaStatus(sb);
      setMfaModal(null); setMfaCode(''); setMfaStep({});
    } catch (err) { alert('Erreur : ' + err.message); }
    setMfaBusy(false);
  }
  async function startPhoneMfa() { setMfaModal('phone'); setMfaStep({ phone: '' }); }
  async function enrollPhone() {
    setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'phone', phone: mfaStep.phone });
      if (error) throw error;
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: data.id });
      if (chErr) throw chErr;
      setMfaStep({ ...mfaStep, factorId: data.id, challengeId: ch.id, sent: true });
    } catch (err) { alert('Erreur : ' + err.message); }
    setMfaBusy(false);
  }
  async function verifyPhone() {
    setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.mfa.verify({ factorId: mfaStep.factorId, challengeId: mfaStep.challengeId, code: mfaCode });
      if (error) throw error;
      await loadMfaStatus(sb);
      setMfaModal(null); setMfaCode(''); setMfaStep({});
    } catch (err) { alert('Erreur : ' + err.message); }
    setMfaBusy(false);
  }
  async function unenrollFactor(factorId) {
    if (!confirm('Désactiver cette méthode 2FA ?')) return;
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await loadMfaStatus(sb);
    } catch (err) { alert('Erreur : ' + err.message); }
  }
  async function startEmailMfa() { setMfaModal('email'); }
  async function enrollEmail() {
    setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { error } = await sb.auth.signInWithOtp({ email: profile.email, options: { shouldCreateUser: false } });
      if (error) throw error;
      setMfaStep({ sent: true });
    } catch (err) { alert('Erreur : ' + err.message); }
    setMfaBusy(false);
  }
  async function verifyEmail() {
    setMfaBusy(true);
    const sb = getSupabase();
    try {
      const { error: vErr } = await sb.auth.verifyOtp({ email: profile.email, token: mfaCode, type: 'email' });
      if (vErr) throw vErr;
      const { error: uErr } = await sb.from('users').update({ email_2fa_enabled: true }).eq('id', profile.id);
      if (uErr) throw uErr;
      setProfile({ ...profile, email_2fa_enabled: true });
      setMfaModal(null); setMfaCode(''); setMfaStep({});
    } catch (err) { alert('Erreur : ' + err.message); }
    setMfaBusy(false);
  }
  async function disableEmailMfa() {
    if (!confirm('Désactiver la vérification par email ?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('users').update({ email_2fa_enabled: false }).eq('id', profile.id);
    if (!error) setProfile({ ...profile, email_2fa_enabled: false });
  }


  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div>;

  const initials = ((profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '')).toUpperCase() || (profile?.email?.[0] || '?').toUpperCase();
  const fullName = profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.email;
  const isVendeur = profile?.role === 'artisan' || profile?.role === 'admin';
  const now = new Date();
  const revMonth = sales.filter((s) => new Date(s.created_at).getMonth() === now.getMonth()).reduce((sum, s) => sum + parseFloat(s.unit_price) * s.quantity, 0);

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <div className={styles.wrap} style={{ paddingTop: 'calc(var(--nav-height) + 32px)' }}>
        <div className={styles.header}>
          <div style={{ position: 'relative' }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className={styles.avatar} style={{ objectFit: 'cover' }} />
            ) : (
              <div className={styles.avatar}>{initials}</div>
            )}
            <label htmlFor="avatar-input" style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, color: '#fff' }}>{uploadingAvatar ? '…' : '📷'}</label>
            <input id="avatar-input" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>
          <div style={{ flex: 1 }}>
            <div className={styles.name}>{fullName}</div>
            <div className={styles.email}>{profile?.email}</div>
          </div>
          <button className={styles.btnLogout} onClick={handleLogout}>Déconnexion</button>
        </div>

        {/* ── Switch Client / Vendeur ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: 4, gap: 4 }}>
            <button onClick={() => setMode('client')} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 700, borderRadius: 999, border: 'none', cursor: 'pointer', background: mode === 'client' ? 'var(--accent)' : 'transparent', color: mode === 'client' ? '#fff' : 'var(--text-faint)' }}>Espace Client</button>
            <button onClick={() => setMode('vendeur')} style={{ padding: '8px 22px', fontSize: 12, fontWeight: 700, borderRadius: 999, border: 'none', cursor: 'pointer', background: mode === 'vendeur' ? 'var(--accent)' : 'transparent', color: mode === 'vendeur' ? '#fff' : 'var(--text-faint)' }}>Espace Vendeur</button>
          </div>
        </div>

        {mode === 'client' && (
          <>
            <div className={styles.tabs}>
              <button className={`${styles.tab} ${tab === 'commandes' ? styles.tabActive : ''}`} onClick={() => setTab('commandes')}>Commandes</button>
              <button className={`${styles.tab} ${tab === 'adresses' ? styles.tabActive : ''}`} onClick={() => setTab('adresses')}>Adresses</button>
              <button className={`${styles.tab} ${tab === 'parametres' ? styles.tabActive : ''}`} onClick={() => setTab('parametres')}>Paramètres</button>
            </div>

            {tab === 'commandes' && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Mes commandes</div>
                {orders.length === 0 ? (
                  <div className={styles.empty}>Aucune commande pour l'instant.<br /><Link href="/boutique" style={{ color: 'var(--accent)' }}>Découvrir la boutique</Link></div>
                ) : orders.map((o) => (
                  <div className={styles.row} key={o.id}>
                    <div className={styles.rowInfo}>
                      <div className={styles.rowName}>Commande #{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className={styles.rowMeta}>{fmtDate(o.created_at)} · {STATUS_LABEL[o.status] || o.status}</div>
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--accent)' }}>{fmt(o.total_amount, o.currency)}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'adresses' && (
              <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div className={styles.cardTitle} style={{ marginBottom: 0 }}>Mes adresses</div>
                  <button onClick={openAddAddr} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Ajouter</button>
                </div>
                {addresses.length === 0 ? (
                  <div className={styles.empty}>Aucune adresse enregistrée.</div>
                ) : addresses.map((a) => (
                  <div key={a.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{[a.first_name, a.last_name].filter(Boolean).join(' ')} · {a.line1}{a.line2 ? ', ' + a.line2 : ''}, {a.postal_code || ''} {a.city}, {a.country}{a.phone ? ' · ' + a.phone : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => openEditAddr(a)} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text-faint)', fontSize: 11, fontWeight: 700, padding: '5px 12px', cursor: 'pointer' }}>Modifier</button>
                      <button onClick={() => deleteAddress(a.id)} style={{ background: 'none', border: '1.5px solid var(--error)', borderRadius: 999, color: 'var(--error)', fontSize: 11, fontWeight: 700, padding: '5px 12px', cursor: 'pointer' }}>Suppr.</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'parametres' && (
              <>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Informations personnelles</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 13 }} />
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: 13 }} />
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Email : {profile?.email}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>Pays : {profile?.country || '—'}</p>
                  <button onClick={saveProfile} disabled={savingProfile} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{savingProfile ? 'Sauvegarde…' : 'Sauvegarder'}</button>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardTitle}>Sécurité</div>
                  <div className={styles.row} style={{ cursor: 'pointer' }} onClick={resetPassword}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>Changer le mot de passe</div></div>
                  </div>
                  <div className={styles.row} style={{ cursor: 'pointer' }} onClick={handleLogout}>
                    <div className={styles.rowInfo}><div className={styles.rowName} style={{ color: 'var(--error)' }}>Se déconnecter</div></div>
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardTitle}>Authentification à deux facteurs</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>Ajoute une étape de vérification à la connexion.</p>
                  <div className={styles.row} style={{ cursor: 'pointer' }} onClick={() => mfaFactors.totp ? unenrollFactor(mfaFactors.totp.id) : startTotp()}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>Application d'authentification (TOTP)</div></div>
                    <span className={styles.badge} style={{ background: mfaFactors.totp ? 'var(--success-dim, rgba(34,197,94,.12))' : 'var(--surface-2)', color: mfaFactors.totp ? 'var(--success)' : 'var(--text-faint)' }}>{mfaFactors.totp ? 'Actif' : 'Inactif'}</span>
                  </div>
                  <div className={styles.row} style={{ cursor: 'pointer' }} onClick={() => mfaFactors.phone ? unenrollFactor(mfaFactors.phone.id) : startPhoneMfa()}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>Code par SMS</div></div>
                    <span className={styles.badge} style={{ background: mfaFactors.phone ? 'var(--success-dim, rgba(34,197,94,.12))' : 'var(--surface-2)', color: mfaFactors.phone ? 'var(--success)' : 'var(--text-faint)' }}>{mfaFactors.phone ? 'Actif' : 'Inactif'}</span>
                  </div>
                  <div className={styles.row} style={{ cursor: 'pointer' }} onClick={() => profile?.email_2fa_enabled ? disableEmailMfa() : startEmailMfa()}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>Code par email</div></div>
                    <span className={styles.badge} style={{ background: profile?.email_2fa_enabled ? 'var(--success-dim, rgba(34,197,94,.12))' : 'var(--surface-2)', color: profile?.email_2fa_enabled ? 'var(--success)' : 'var(--text-faint)' }}>{profile?.email_2fa_enabled ? 'Actif' : 'Inactif'}</span>
                  </div>
                </div>

                <div className={styles.card} style={{ background: 'var(--error-dim, rgba(239,68,68,.08))', borderColor: 'var(--error)' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--error)', marginBottom: 6 }}>Zone de danger</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>La suppression de ton compte est <strong style={{ color: 'var(--error)' }}>irréversible</strong>.</p>
                  <button onClick={() => setDeleteModalOpen(true)} style={{ background: 'transparent', border: '1.5px solid var(--error)', color: 'var(--error)', borderRadius: 999, padding: '9px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Supprimer mon compte</button>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'vendeur' && !isVendeur && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Devenir vendeur</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 16, lineHeight: 1.7 }}>Inscription gratuite — WennaShop prend uniquement <strong style={{ color: 'var(--accent)' }}>8% de commission</strong> sur les ventes réalisées.</p>
            <input value={upgradeForm.shopName} onChange={(e) => setUpgradeForm({ ...upgradeForm, shopName: e.target.value })} placeholder="Nom de la boutique *" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 10 }} />
            <input value={upgradeForm.specialty} onChange={(e) => setUpgradeForm({ ...upgradeForm, specialty: e.target.value })} placeholder="Spécialité *" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 10 }} />
            <select value={upgradeForm.country} onChange={(e) => setUpgradeForm({ ...upgradeForm, country: e.target.value })} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 10 }}>
              <option value="">Pays d'origine *</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea value={upgradeForm.bio} onChange={(e) => setUpgradeForm({ ...upgradeForm, bio: e.target.value })} placeholder="Description courte" rows={3} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 14, resize: 'vertical' }} />
            <button onClick={upgradeToVendeur} disabled={upgrading} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 14, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{upgrading ? 'Création…' : 'Devenir vendeur — c\'est gratuit'}</button>
          </div>
        )}

        {mode === 'vendeur' && isVendeur && (
          <>
            <div className={styles.card} style={{ background: 'var(--accent-light)', borderColor: 'var(--border-accent)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>Espace vendeur actif</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Gère tes produits, commandes et revenus.</div>
              <Link href="/vendeur" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '10px 20px', borderRadius: 999, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Ouvrir le Dashboard</Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              <div className={styles.card} style={{ textAlign: 'center', margin: 0 }}><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{fmt(revMonth)}</div><div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Revenus ce mois</div></div>
              <div className={styles.card} style={{ textAlign: 'center', margin: 0 }}><div style={{ fontSize: 22, fontWeight: 900 }}>{products.length}</div><div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Produits</div></div>
              <div className={styles.card} style={{ textAlign: 'center', margin: 0 }}><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold, #f59e0b)' }}>8%</div><div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Commission</div></div>
            </div>

            <div className={styles.tabs}>
              <button className={`${styles.tab} ${vendeurTab === 'produits' ? styles.tabActive : ''}`} onClick={() => setVendeurTab('produits')}>Produits</button>
              <button className={`${styles.tab} ${vendeurTab === 'ventes' ? styles.tabActive : ''}`} onClick={() => setVendeurTab('ventes')}>Ventes</button>
              <button className={`${styles.tab} ${vendeurTab === 'paiements' ? styles.tabActive : ''}`} onClick={() => setVendeurTab('paiements')}>Paiements</button>
              <button className={`${styles.tab} ${vendeurTab === 'boutique' ? styles.tabActive : ''}`} onClick={() => setVendeurTab('boutique')}>Ma Boutique</button>
            </div>

            {vendeurTab === 'produits' && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Mes produits</div>
                {products.length === 0 ? <div className={styles.empty}>Aucun produit. <Link href="/vendeur" style={{ color: 'var(--accent)' }}>Ajouter un produit</Link></div> : products.map((p) => (
                  <div className={styles.row} key={p.id}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>{p.name}</div><div className={styles.rowMeta}>{p.status}</div></div>
                    <div style={{ fontWeight: 900, color: 'var(--accent)' }}>{fmt(p.price, p.currency)}</div>
                  </div>
                ))}
              </div>
            )}

            {vendeurTab === 'ventes' && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Historique des ventes</div>
                {sales.length === 0 ? <div className={styles.empty}>Aucune vente pour l'instant.</div> : sales.map((s) => (
                  <div className={styles.row} key={s.id}>
                    <div className={styles.rowInfo}><div className={styles.rowName}>{s.products?.name} × {s.quantity}</div><div className={styles.rowMeta}>{fmtDate(s.created_at)}</div></div>
                    <div style={{ fontWeight: 900, color: 'var(--accent)' }}>+{fmt(parseFloat(s.unit_price) * s.quantity)}</div>
                  </div>
                ))}
              </div>
            )}

            {vendeurTab === 'paiements' && (
              <>
                <div className={styles.card} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--success)', marginBottom: 8 }}>Solde disponible</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--success)' }}>{fmt(wallet)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Historique des paiements</div>
                  {payments.length === 0 ? <div className={styles.empty}>Aucun paiement.</div> : payments.map((p) => (
                    <div className={styles.row} key={p.id}>
                      <div className={styles.rowInfo}><div className={styles.rowName}>{p.type === 'vendor_payout' ? 'Retrait' : 'Commande'}</div><div className={styles.rowMeta}>{fmtDate(p.created_at)}</div></div>
                      <div style={{ fontWeight: 900, color: p.type === 'vendor_payout' ? 'var(--error)' : 'var(--success)' }}>{p.type === 'vendor_payout' ? '-' : '+'}{fmt(p.amount, p.currency)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {vendeurTab === 'boutique' && shop && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Ma Boutique</div>
                <input defaultValue={shop.name} id="shop-name-input" placeholder="Nom de la boutique" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 10 }} />
                <input defaultValue={shop.bio} id="shop-bio-input" placeholder="Description / Spécialité" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 10 }} />
                <select defaultValue={shop.country} id="shop-country-input" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => saveShop(document.getElementById('shop-name-input').value, document.getElementById('shop-bio-input').value, document.getElementById('shop-country-input').value)} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 14, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Mettre à jour</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL ADRESSE ── */}
      {addrModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setAddrModalOpen(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 15 }}>{addrForm.id ? "Modifier l'adresse" : 'Nouvelle adresse'}</div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })} placeholder="Libellé * (Domicile, Bureau…)" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input value={addrForm.first_name} onChange={(e) => setAddrForm({ ...addrForm, first_name: e.target.value })} placeholder="Prénom" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
                <input value={addrForm.last_name} onChange={(e) => setAddrForm({ ...addrForm, last_name: e.target.value })} placeholder="Nom" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
              </div>
              <input value={addrForm.line1} onChange={(e) => setAddrForm({ ...addrForm, line1: e.target.value })} placeholder="Adresse *" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
              <input value={addrForm.line2} onChange={(e) => setAddrForm({ ...addrForm, line2: e.target.value })} placeholder="Complément" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} placeholder="Ville *" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
                <input value={addrForm.postal_code} onChange={(e) => setAddrForm({ ...addrForm, postal_code: e.target.value })} placeholder="Code postal" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
              </div>
              <select value={addrForm.country} onChange={(e) => setAddrForm({ ...addrForm, country: e.target.value })} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={addrForm.phone} onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} placeholder="Téléphone" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13 }} />
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setAddrModalOpen(false)} style={{ flex: 1, background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)', padding: 11, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={saveAddress} disabled={savingAddr} style={{ flex: 2, background: 'var(--accent)', border: 'none', borderRadius: 999, color: '#fff', padding: 11, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{savingAddr ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SUPPRESSION COMPTE ── */}
      {deleteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDeleteModalOpen(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Supprimer mon compte ?</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>Action <strong style={{ color: 'var(--error)' }}>permanente et irréversible</strong>.</p>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6, display: 'block' }}>Tapez <strong style={{ color: 'var(--error)' }}>SUPPRIMER</strong></label>
              <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="SUPPRIMER" style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '9px 12px', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteModalOpen(false)} style={{ flex: 1, background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)', padding: 11, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={confirmDeleteAccount} disabled={deleteConfirm.trim() !== 'SUPPRIMER' || deletingAccount} style={{ flex: 2, background: 'var(--error)', border: 'none', borderRadius: 999, color: '#fff', padding: 11, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleteConfirm.trim() === 'SUPPRIMER' ? 1 : 0.4 }}>{deletingAccount ? '…' : 'Supprimer définitivement'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2FA ── */}
      {mfaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { setMfaModal(null); setMfaCode(''); setMfaStep({}); }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            {mfaModal === 'totp' && (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Application d'authentification</div>
                {mfaStep.qr ? (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Scanne ce QR code avec ton application (Google Authenticator, Authy…)</p>
                    <div style={{ textAlign: 'center', marginBottom: 14 }}>
                      <img src={mfaStep.qr} alt="QR" style={{ width: 160, height: 160, background: '#fff', padding: 8, borderRadius: 8 }} />
                      <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8, wordBreak: 'break-all' }}>{mfaStep.secret}</p>
                    </div>
                    <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Code à 6 chiffres" maxLength={6} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }} />
                    <button onClick={verifyTotp} disabled={mfaBusy} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmer et activer</button>
                  </>
                ) : <div style={{ textAlign: 'center', padding: 20 }}>…</div>}
              </>
            )}
            {mfaModal === 'phone' && (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Code par SMS</div>
                {!mfaStep.sent ? (
                  <>
                    <input value={mfaStep.phone || ''} onChange={(e) => setMfaStep({ ...mfaStep, phone: e.target.value })} placeholder="+212 6 12 34 56 78" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }} />
                    <button onClick={enrollPhone} disabled={mfaBusy} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Envoyer le code</button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Code envoyé au {mfaStep.phone}</p>
                    <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Code reçu" maxLength={6} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }} />
                    <button onClick={verifyPhone} disabled={mfaBusy} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmer et activer</button>
                  </>
                )}
              </>
            )}
            {mfaModal === 'email' && (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Code par email</div>
                {!mfaStep.sent ? (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Un code sera envoyé à <strong style={{ color: 'var(--text)' }}>{profile?.email}</strong></p>
                    <button onClick={enrollEmail} disabled={mfaBusy} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Envoyer le code</button>
                  </>
                ) : (
                  <>
                    <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Code reçu" maxLength={6} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', fontSize: 13, marginBottom: 12 }} />
                    <button onClick={verifyEmail} disabled={mfaBusy} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmer et activer</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
