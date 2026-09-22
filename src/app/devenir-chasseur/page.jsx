'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { uploadFileWithProgress } from '@/lib/storageUpload';
import Nav from '@/components/Nav';
import styles from '@/app/connexion/connexion.module.css';

export default function DevenirChasseurPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', country: '', city: '', phone: '', payoutMethod: '', docType: '', address: '' });
  const [rectoFile, setRectoFile] = useState(null);
  const [versoFile, setVersoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function submit() {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert('Connecte-toi pour devenir chasseur.'); router.push('/connexion'); return; }
    if (!form.firstName || !form.lastName || !form.country || !form.city || !form.phone) return alert('Remplis tous les champs.');
    if (!form.docType) return alert("Sélectionne le type de document d'identité.");
    if (!rectoFile) return alert('Ajoute le recto de ton document.');
    if (form.docType === 'cni' && !versoFile) return alert('Ajoute le verso de ta CNI.');
    if (!form.address.trim()) return alert('Indique ton adresse exacte.');

    setLoading(true);
    setUploadProgress(0);
    try {
      const accessToken = session.access_token;
      const totalBytes = rectoFile.size + (versoFile ? versoFile.size : 0);
      let rectoLoaded = 0, versoLoaded = 0;
      const reportProgress = () => setUploadProgress(Math.round(((rectoLoaded + versoLoaded) / totalBytes) * 100));
      const uploadFile = (file, label, onLoaded) => {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const path = `${session.user.id}/${label}-${Date.now()}.${ext}`;
        return uploadFileWithProgress('kyc-documents', path, file, accessToken, onLoaded);
      };
      const idCardFrontUrl = await uploadFile(rectoFile, 'recto', (loaded) => { rectoLoaded = loaded; reportProgress(); });
      const idCardBackUrl = versoFile ? await uploadFile(versoFile, 'verso', (loaded) => { versoLoaded = loaded; reportProgress(); }) : null;

      const { data: u } = await sb.from('users').select('id').eq('auth_id', session.user.id).single();
      const { error } = await sb.from('users').update({
        first_name: form.firstName, last_name: form.lastName, full_name: `${form.firstName} ${form.lastName}`,
        country: form.country, city: form.city, phone: form.phone,
        document_type: form.docType, address: form.address.trim(),
        id_card_front_url: idCardFrontUrl, id_card_back_url: idCardBackUrl,
        hunter_status: 'pending_verification', hunter_payout_method: form.payoutMethod || null,
        hunter_applied_at: new Date().toISOString(),
      }).eq('id', u.id);
      if (error) throw error;
      alert('Dossier soumis ! Vérification sous 48h.');
      router.push('/chasseur');
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
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

        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, marginTop: 20 }}>Vérification d'identité</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>Obligatoire pour devenir chasseur — ton compte reste en attente tant que le dossier n'est pas validé (48h).</p>
        <div className={styles.field}>
          <select className={styles.select} value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
            <option value="">Type de document *</option>
            <option value="cni">Carte d'identité (CNI)</option>
            <option value="passeport">Passeport</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Recto du document *</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setRectoFile(e.target.files?.[0] || null)} style={{ width: '100%', color: 'var(--text-muted)', fontSize: 12 }} />
        </div>
        {form.docType === 'cni' && (
          <div className={styles.field}>
            <label className={styles.label}>Verso de la CNI *</label>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setVersoFile(e.target.files?.[0] || null)} style={{ width: '100%', color: 'var(--text-muted)', fontSize: 12 }} />
          </div>
        )}
        <div className={styles.field}><label className={styles.label}>Adresse exacte *</label><input className={styles.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>

        {loading && uploadProgress > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.2s ease' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>{uploadProgress}%</div>
          </div>
        )}

        <button className={styles.btnPrimary} onClick={submit} disabled={loading}>{loading ? '…' : 'Soumettre mon dossier'}</button>
      </div>
    </>
  );
}
