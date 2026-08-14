'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from '@/app/quetes/quetes.module.css';

function fmt(n) { return Number(n).toLocaleString('fr-FR'); }

function Content() {
  const params = useSearchParams();
  const id = params.get('id');
  const [quest, setQuest] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuyer, setIsBuyer] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sb = getSupabase();
      const { data: q } = await sb.from('quests').select('*').eq('id', id).single();
      setQuest(q);

      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        const { data: u } = await sb.from('users').select('id').eq('auth_id', session.user.id).single();
        setUserId(u?.id || null);
        setIsBuyer(u?.id === q?.buyer_id);
      }

      const { data: props } = await sb.from('quest_proposals').select('*').eq('quest_id', id).order('created_at', { ascending: false });
      setProposals(props || []);
      setLoading(false);
    })();
  }, [id]);

  async function selectProposal(propId) {
    if (!confirm('Choisir cette proposition ?')) return;
    const sb = getSupabase();
    await sb.from('quests').update({ winning_proposal_id: propId, status: 'resolved' }).eq('id', id);
    await sb.from('quest_proposals').update({ status: 'selected' }).eq('id', propId);
    location.reload();
  }

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (!quest) return <><Nav /><div style={{ padding: 60, textAlign: 'center' }}>Quête introuvable.</div></>;

  return (
    <>
      <Nav />
      <section className={styles.hero}>
        <h1 className={styles.title}>{quest.title}</h1>
        <p className={styles.sub}>{quest.description}</p>
        <div className={styles.rewardBox} style={{ display: 'inline-block', textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Récompense</div>
          <div className={styles.rewardAmount}>{fmt(quest.reward_amount)} {quest.currency}</div>
        </div>
      </section>

      <div className={styles.list}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Propositions ({proposals.length})</h2>
        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucune proposition pour l'instant.</div>
        ) : proposals.map((p) => (
          <div className={styles.card} key={p.id}>
            <div>
              <div className={styles.cardDesc}>{p.description}</div>
              <div className={styles.meta}>Prix proposé : {fmt(p.proposed_price)} {quest.currency} · {p.status}</div>
            </div>
            {isBuyer && quest.status === 'open' && p.status === 'pending' && (
              <button className={styles.btnPrimary} onClick={() => selectProposal(p.id)}>Choisir cette offre</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function QuetePage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
