'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './quetes.module.css';

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }
function daysLeft(d) { return Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000)); }

export default function QuetesPage() {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', budget: '', reward: '', country: 'Les deux' });

  useEffect(() => { load(); }, []);

  async function load() {
    const sb = getSupabase();
    const { data } = await sb.from('quests')
      .select('id,title,description,country_target,product_budget,reward_amount,currency,expires_at,created_at')
      .eq('status', 'open').order('created_at', { ascending: false });
    setQuests(data || []);
    setLoading(false);
  }

  async function submit() {
    if (!form.title) return alert('Le titre est obligatoire.');
    if (!form.budget || form.budget < 1000) return alert('Budget minimum : 1000 FCFA.');
    if (!form.reward || form.reward < 500) return alert('Récompense minimum : 500 FCFA.');
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { alert('Connecte-toi pour poster une quête.'); return; }
    const { data: row } = await sb.from('users').select('id').eq('auth_id', user.id).single();
    const { error } = await sb.from('quests').insert({
      buyer_id: row.id, title: form.title, description: form.description || null,
      country_target: form.country, product_budget: parseFloat(form.budget), reward_amount: parseFloat(form.reward),
      duration_days: 7, currency: 'FCFA',
    });
    if (error) return alert('Erreur : ' + error.message);
    setModalOpen(false);
    setForm({ title: '', description: '', budget: '', reward: '', country: 'Les deux' });
    await load();
  }

  return (
    <>
      <Nav />
      <section className={styles.hero}>
        <h1 className={styles.title}>Vous cherchez, <span>on trouve.</span></h1>
        <p className={styles.sub}>Publiez une quête pour un produit introuvable. Des chasseurs du Gabon et du Maroc le dénichent pour vous.</p>
        <button className={styles.btnPrimary} onClick={() => setModalOpen(true)}>Poster une quête</button>
      </section>

      <div className={styles.list}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Chargement…</div>
        ) : quests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Aucune quête ouverte pour le moment.</div>
        ) : quests.map((q) => (
          <div className={styles.card} key={q.id}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={styles.cardTitle}>{q.title}</div>
              {q.description && <div className={styles.cardDesc}>{q.description}</div>}
              <div className={styles.meta}>{daysLeft(q.expires_at)}j restants · Budget {fmt(q.product_budget)} {q.currency} · {q.country_target}</div>
            </div>
            <div className={styles.rewardBox}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Récompense</div>
              <div className={styles.rewardAmount}>{fmt(q.reward_amount)} {q.currency}</div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className={styles.modalOv} onClick={() => setModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>Poster une quête</div>
            <div className={styles.modalBody}>
              <input className={styles.input} placeholder="Titre de la quête *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className={styles.input} placeholder="Description (précisez couleur, taille…)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input className={styles.input} type="number" placeholder="Budget produit *" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
                <input className={styles.input} type="number" placeholder="Récompense chasseur *" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
              </div>
              <select className={styles.input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                <option value="Les deux">Les deux</option>
                <option value="Gabon">Gabon</option>
                <option value="Maroc">Maroc</option>
              </select>
              <button className={styles.btnPrimary} onClick={submit}>Publier la quête</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
