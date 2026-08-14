'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from '@/app/quetes/quetes.module.css';

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

export default function ChasseurPage() {
  const [role, setRole] = useState(null);
  const [userId, setUserId] = useState(null);
  const [quests, setQuests] = useState([]);
  const [myProposals, setMyProposals] = useState([]);
  const [tab, setTab] = useState('quests');
  const [modalQuest, setModalQuest] = useState(null);
  const [form, setForm] = useState({ price: '', desc: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const { data: u } = await sb.from('users').select('id, role').eq('auth_id', session.user.id).single();
        setRole(u?.role || null);
        setUserId(u?.id || null);
        if (u?.id) {
          const { data: props } = await sb.from('quest_proposals').select('*, quests(title, reward_amount, currency)').eq('hunter_id', u.id).order('created_at', { ascending: false });
          setMyProposals(props || []);
        }
      }
      const { data: q } = await sb.from('quests').select('id,title,description,reward_amount,currency,country_target,product_budget').eq('status', 'open').order('created_at', { ascending: false });
      setQuests(q || []);
      setLoading(false);
    })();
  }, []);

  async function submitProposal() {
    if (!userId) return alert('Connecte-toi pour proposer.');
    if (role !== 'artisan' && role !== 'admin') return alert('Seuls les chasseurs/vendeurs peuvent proposer.');
    if (!form.price || !form.desc) return alert('Remplis le prix et la description.');
    const sb = getSupabase();
    const { error } = await sb.from('quest_proposals').insert({
      quest_id: modalQuest.id, hunter_id: userId, proposed_price: parseFloat(form.price), description: form.desc, status: 'pending',
    });
    if (error) return alert('Erreur : ' + error.message);
    setModalQuest(null);
    setForm({ price: '', desc: '' });
    alert('Proposition envoyée !');
  }

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;

  return (
    <>
      <Nav />
      <section className={styles.hero}>
        <h1 className={styles.title}>Espace <span>Chasseur</span></h1>
        <p className={styles.sub}>Trouvez des produits recherchés par la communauté et gagnez des récompenses.</p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 0 0' }}>
        <button onClick={() => setTab('quests')} style={{ padding: '8px 18px', borderRadius: 999, border: '1.5px solid var(--border)', background: tab === 'quests' ? 'var(--accent)' : 'transparent', color: tab === 'quests' ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Quêtes</button>
        <button onClick={() => setTab('mine')} style={{ padding: '8px 18px', borderRadius: 999, border: '1.5px solid var(--border)', background: tab === 'mine' ? 'var(--accent)' : 'transparent', color: tab === 'mine' ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Mes propositions</button>
      </div>

      <div className={styles.list}>
        {tab === 'quests' ? quests.map((q) => (
          <div className={styles.card} key={q.id}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={styles.cardTitle}>{q.title}</div>
              {q.description && <div className={styles.cardDesc}>{q.description}</div>}
              <div className={styles.meta}>Budget {fmt(q.product_budget)} {q.currency} · {q.country_target}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.rewardBox}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Récompense</div>
                <div className={styles.rewardAmount}>{fmt(q.reward_amount)} {q.currency}</div>
              </div>
              <button className={styles.btnPrimary} onClick={() => setModalQuest(q)}>Je chasse</button>
            </div>
          </div>
        )) : myProposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Aucune proposition envoyée.</div>
        ) : myProposals.map((p) => (
          <div className={styles.card} key={p.id}>
            <div>
              <div className={styles.cardTitle}>{p.quests?.title}</div>
              <div className={styles.cardDesc}>{p.description}</div>
            </div>
            <div className={styles.rewardBox}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>{p.status}</div>
              <div className={styles.rewardAmount}>{fmt(p.quests?.reward_amount)} {p.quests?.currency}</div>
            </div>
          </div>
        ))}
      </div>

      {modalQuest && (
        <div className={styles.modalOv} onClick={() => setModalQuest(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>Proposer pour : {modalQuest.title}</div>
            <div className={styles.modalBody}>
              <input className={styles.input} type="number" placeholder="Prix proposé (FCFA) *" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <textarea className={styles.input} placeholder="Décrivez votre offre *" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
              <button className={styles.btnPrimary} onClick={submitProposal}>Envoyer ma proposition</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
