'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from '@/app/connexion/connexion.module.css';

export default function DevenirChasseurPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', country: '', city: '', phone: '', payoutMethod: '' });
  const [loading, setLoading] = useState(false);

  async function submit() {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert('Connecte-toi pour devenir chasseur.'); router.push('/connexion'); return; }
    if (!form.firstName || !form.lastName || !form.country || !form.city || !form.phone) return alert('Remplis tous les champs.');
    setLoading(true);
    const { data: u } = await sb.from('users').select('id').eq('auth_id', session.user.id).single();
    await sb.from('users').update({
      first_name: form.firstName, last_name: form.lastName, full_name: `${form.firstName} ${form.lastName}`,
      country: form.country, city: form.city, phone: form.phone,
      hunter_status: 'pending_verification', hunter_payout_method: form.payoutMethod || null,
      hunter_applied_at: new Date().toISOString(),
    }).eq('id', u.id);
    setLoading(false);
    alert('Dossier soumis ! Vérification sous 48h.');
    router.push('/chasseur');
  }

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 'calc(var(--nav-height) + 32px) 24px 60px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>Devenir Chasseur</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Trouvez des produits pour la communauté et gagnez des récompenses. Vérification sous 48h.</p>

        <div className={styles.grid2} style={{ marginBottom: 16 }}>
          <div><label className={styles.label}>Prénom *</label><input className={styles.input} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div><label className={styles.label}>Nom *</label><input className={styles.input} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
        </div>
        <div className={styles.field}><label className={styles.label}>Pays *</label>
          <select className={styles.select} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            <option value="">Sélectionner…</option>
            <option value="Gabon">Gabon</option>
            <option value="Maroc">Maroc</option>
          </select>
        </div>
        <div className={styles.field}><label className={styles.label}>Ville *</label><input className={styles.input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div className={styles.field}><label className={styles.label}>Téléphone *</label><input className={styles.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className={styles.field}><label className={styles.label}>Moyen de paiement des récompenses</label>
          <select className={styles.select} value={form.payoutMethod} onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })}>
            <option value="">Sélectionner…</option>
            <option value="mobile_money_gabon">Mobile Money Gabon</option>
            <option value="mobile_money_maroc">Mobile Money Maroc</option>
            <option value="virement">Virement bancaire</option>
          </select>
        </div>
        <button className={styles.btnPrimary} onClick={submit} disabled={loading}>{loading ? '…' : 'Soumettre mon dossier'}</button>
      </div>
    </>
  );
}
