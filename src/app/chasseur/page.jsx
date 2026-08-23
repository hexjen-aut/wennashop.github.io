'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import styles from './chasseur.module.css';

const MAX_IMAGES = 5;
const BUCKET = 'products';
const STORAGE_PREFIX = 'quests';
const WENNA_EXPRESS_URL = 'https://express.wennashop.com';

const STATUS_MAP = {
  pending: { label: 'En attente', cls: '' },
  selected: { label: 'Acceptée', cls: '' },
  in_delivery: { label: 'En livraison', cls: '' },
  delivered: { label: 'Livrée', cls: '' },
  reward_paid: { label: 'Récompensé', cls: '' },
  rejected: { label: 'Non retenue', cls: '' },
};
const STATUS_COLOR = {
  pending: 'var(--gold)', selected: 'var(--success)', in_delivery: '#7c8cf8',
  delivered: 'var(--success)', reward_paid: 'var(--gold)', rejected: 'var(--error)',
};

const LEVELS = [
  { name: 'Chasseur Initié', min: 0 },
  { name: 'Chasseur Confirmé', min: 3 },
  { name: 'Chasseur Élite', min: 8 },
  { name: 'Chasseur Légendaire', min: 20 },
];

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  return fmtDate(d);
}
function daysUntil(d) { return Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000)); }

export default function ChasseurPage() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [internalUser, setInternalUser] = useState(null);

  const [categories, setCategories] = useState([]);
  const [quests, setQuests] = useState([]);
  const [proposalsCount, setProposalsCount] = useState({});
  const [myProposals, setMyProposals] = useState([]);

  const [tab, setTab] = useState('quests');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeCountry, setActiveCountry] = useState('all');
  const [rewardMin, setRewardMin] = useState('');
  const [sort, setSort] = useState('created_at_desc');

  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const [modalQuest, setModalQuest] = useState(null);
  const [propMessage, setPropMessage] = useState('');
  const [propPrice, setPropPrice] = useState('');
  const [propLink, setPropLink] = useState('');
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(text, type = 'ok') {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── INIT ──
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      setCurrentUser(session?.user || null);

      let internal = null;
      if (session) {
        const { data } = await sb.from('users').select('id, role, full_name, first_name, last_name, country, avatar_url').eq('auth_id', session.user.id).single();
        internal = data;
        setInternalUser(data);
      }

      const { data: cats } = await sb.from('categories').select('id,name').order('name');
      setCategories(cats || []);

      const { data: q } = await sb
        .from('quests')
        .select('id,title,description,country_target,product_budget,reward_amount,currency,duration_days,expires_at,status,created_at,category_id,categories(name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      const questsList = (q || []).map((x) => ({ ...x, category_id: String(x.category_id ?? '') }));
      setQuests(questsList);

      if (questsList.length) {
        const { data: pd } = await sb.from('quest_proposals').select('quest_id').in('quest_id', questsList.map((x) => x.id));
        const map = {};
        (pd || []).forEach((p) => { map[p.quest_id] = (map[p.quest_id] || 0) + 1; });
        setProposalsCount(map);
      }

      if (internal?.id) await loadMyProposals(sb, internal.id);
      if (internal?.id) await loadNotifications(sb, internal.id);

      setLoading(false);
    })();
  }, []);

  // Polling notifications toutes les 30s
  useEffect(() => {
    if (!internalUser?.id) return;
    const iv = setInterval(() => { loadNotifications(getSupabase(), internalUser.id); }, 30000);
    return () => clearInterval(iv);
  }, [internalUser]);

  async function loadMyProposals(sb, hunterId) {
    const { data } = await sb
      .from('quest_proposals')
      .select('id,quest_id,description,proposed_price,product_url,product_images,status,created_at,selected_at,reward_paid_at,quests(title,reward_amount,currency,country_target)')
      .eq('hunter_id', hunterId)
      .order('created_at', { ascending: false });
    setMyProposals(data || []);
  }

  async function loadNotifications(sb, userId) {
    const { data } = await sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    setNotifications(data || []);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const canHunt = internalUser?.role === 'artisan' || internalUser?.role === 'admin';
  const myQuestIds = useMemo(() => new Set(myProposals.map((p) => p.quest_id)), [myProposals]);

  const filteredQuests = useMemo(() => {
    let list = quests.filter((q) => {
      if (activeCategory !== 'all' && q.category_id !== activeCategory) return false;
      if (activeCountry !== 'all' && q.country_target !== activeCountry) return false;
      if (rewardMin && q.reward_amount < parseFloat(rewardMin)) return false;
      if (search && !q.title.toLowerCase().includes(search.toLowerCase()) && !(q.description || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sort === 'reward_desc') list.sort((a, b) => b.reward_amount - a.reward_amount);
    else if (sort === 'expires_asc') list.sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [quests, activeCategory, activeCountry, rewardMin, search, sort]);

  function resetFilters() {
    setSearch(''); setActiveCategory('all'); setActiveCountry('all'); setRewardMin(''); setSort('created_at_desc');
  }

  // ── KPI / GAINS ──
  const kpis = useMemo(() => {
    const total = myProposals.length;
    const accepted = myProposals.filter((p) => ['selected', 'in_delivery', 'delivered', 'reward_paid'].includes(p.status)).length;
    const paid = myProposals.filter((p) => p.status === 'reward_paid');
    const gains = paid.reduce((s, p) => s + Number(p.quests?.reward_amount || 0), 0);
    const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    const completedCount = paid.length;
    const level = [...LEVELS].reverse().find((l) => completedCount >= l.min) || LEVELS[0];
    const nextLevel = LEVELS.find((l) => l.min > completedCount);
    return { total, accepted, gains, rate, paid, completedCount, level, nextLevel };
  }, [myProposals]);

  // ── MODAL PROPOSITION ──
  function openModal(quest) {
    if (!canHunt) { showToast('Seuls les chasseurs et vendeurs peuvent proposer.', 'error'); return; }
    setModalQuest(quest);
    setPropMessage(''); setPropPrice(''); setPropLink(''); setFiles([]);
  }
  function closeModal() { setModalQuest(null); }

  function handleFiles(fileList) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const remaining = MAX_IMAGES - files.length;
    const valid = Array.from(fileList).filter((f) => allowed.includes(f.type) && f.size <= 5 * 1024 * 1024);
    if (valid.length < fileList.length) showToast('Fichiers ignorés (type ou taille > 5 Mo).', 'error');
    const toAdd = valid.slice(0, remaining);
    if (valid.length > remaining) showToast(`Maximum ${MAX_IMAGES} photos.`, 'error');
    setFiles((prev) => [...prev, ...toAdd.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
  }
  function removeFile(idx) { setFiles((prev) => prev.filter((_, i) => i !== idx)); }

  async function submitProposal() {
    if (!modalQuest || !internalUser) return;
    if (!propMessage.trim()) return showToast('Décris ta proposition.', 'error');
    const price = parseFloat(propPrice);
    if (!price || price < 100) return showToast('Indique un prix estimé valide.', 'error');

    setSubmitting(true);
    const sb = getSupabase();
    let imageUrls = [];
    for (const { file } of files) {
      const ext = file.name.split('.').pop();
      const path = `${STORAGE_PREFIX}/${internalUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (!error) {
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) imageUrls.push(data.publicUrl);
      }
    }

    const { error } = await sb.from('quest_proposals').insert({
      quest_id: modalQuest.id,
      hunter_id: internalUser.id,
      description: propMessage.trim(),
      proposed_price: price,
      product_url: propLink.trim() || null,
      product_images: imageUrls.length ? imageUrls : null,
      status: 'pending',
    });

    setSubmitting(false);
    if (error) return showToast('Erreur : ' + error.message, 'error');
    showToast('Proposition envoyée !', 'ok');
    closeModal();
    await loadMyProposals(sb, internalUser.id);
  }

  async function deleteProposal(id) {
    if (!confirm('Retirer cette proposition ?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('quest_proposals').delete().eq('id', id).eq('hunter_id', internalUser.id);
    if (error) return showToast('Erreur : ' + error.message, 'error');
    showToast('Proposition retirée.', 'ok');
    await loadMyProposals(sb, internalUser.id);
  }

  async function markAllRead() {
    if (!internalUser) return;
    const sb = getSupabase();
    await sb.from('notifications').update({ is_read: true }).eq('user_id', internalUser.id).eq('is_read', false);
    await loadNotifications(sb, internalUser.id);
  }
  async function readNotif(n) {
    const sb = getSupabase();
    await sb.from('notifications').update({ is_read: true }).eq('id', n.id);
    setNotifOpen(false);
    if (n.link) window.location.href = n.link;
    else await loadNotifications(sb, internalUser.id);
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div>;

  if (!currentUser) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Connecte-toi pour accéder à ton espace chasseur.</p>
        <Link href="/connexion" style={{ color: 'var(--accent)', fontWeight: 700 }}>Se connecter</Link>
      </div>
    );
  }

  const hunterName = internalUser?.full_name || (internalUser?.first_name ? `${internalUser.first_name} ${internalUser.last_name || ''}`.trim() : null) || currentUser.email?.split('@')[0] || 'Chasseur';

  return (
    <>
      {/* NAV */}
      <nav className={styles.topnav}>
        <Link href="/boutique" className={styles.logo}><span>Wenna</span>Shop</Link>
        <div className={styles.navLinks}>
          <Link href="/boutique">Boutique</Link>
          <Link href="/quetes">Quêtes</Link>
          <span className={styles.navLinkActive}>Espace Chasseur</span>
          <div className={styles.notifWrap}>
            <button className={styles.notifBell} onClick={() => setNotifOpen((v) => !v)}>
              Notifications
              {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notifOpen && (
              <div className={styles.notifPanel}>
                <div className={styles.notifHead}><span>Notifications</span><button onClick={markAllRead}>Tout lire</button></div>
                {notifications.length === 0 ? <div className={styles.notifEmpty}>Aucune notification</div> : notifications.map((n) => (
                  <div key={n.id} className={`${styles.notifItem} ${!n.is_read ? styles.notifItemUnread : ''}`} onClick={() => readNotif(n)}>
                    <div className={styles.notifItemTitle}>{n.title}</div>
                    {n.body && <div className={styles.notifItemBody}>{n.body}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link href="/compte" className={styles.btnNav}>Mon compte</Link>
        </div>
      </nav>

      {/* HERO */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.identity}>
            <div className={styles.avatar}>{hunterName.charAt(0).toUpperCase()}</div>
            <div>
              <div className={styles.eyebrow}>Espace chasseur</div>
              <div className={styles.name}>{hunterName}</div>
              <div className={styles.level}>{kpis.level.name}</div>
            </div>
          </div>
          <div className={styles.tabsRow}>
            <button className={`${styles.htab} ${tab === 'quests' ? styles.htabActive : ''}`} onClick={() => setTab('quests')}>Quêtes</button>
            <button className={`${styles.htab} ${tab === 'proposals' ? styles.htabActive : ''}`} onClick={() => setTab('proposals')}>
              Mes propositions <span className={styles.htabBadge}>{myProposals.filter((p) => p.status === 'pending').length}</span>
            </button>
            <button className={`${styles.htab} ${tab === 'gains' ? styles.htabActive : ''}`} onClick={() => setTab('gains')}>Gains</button>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {/* KPI */}
        <div className={styles.kpiStrip}>
          <div className={styles.kpi}><div className={styles.kpiLabel}>Propositions</div><div className={styles.kpiVal} style={{ color: 'var(--accent)' }}>{kpis.total}</div></div>
          <div className={styles.kpi}><div className={styles.kpiLabel}>Acceptées</div><div className={styles.kpiVal} style={{ color: 'var(--success)' }}>{kpis.accepted}</div></div>
          <div className={styles.kpi}><div className={styles.kpiLabel}>Gains totaux (FCFA)</div><div className={styles.kpiVal} style={{ color: 'var(--gold)' }}>{fmt(kpis.gains)}</div></div>
          <div className={styles.kpi}><div className={styles.kpiLabel}>Taux de succès</div><div className={styles.kpiVal}>{kpis.rate}%</div></div>
        </div>

        {/* QUÊTES */}
        {tab === 'quests' && (
          <div className={styles.layout2}>
            <aside className={styles.filterPanel}>
              <div className={styles.filterTitle}>Filtres</div>
              <div className={styles.filterGroup}>
                <span className={styles.filterLbl}>Recherche</span>
                <input className={styles.filterInput} placeholder="tissu, bijoux…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className={styles.filterGroup}>
                <span className={styles.filterLbl}>Catégorie</span>
                <div className={styles.chipGroup}>
                  <span className={`${styles.chip} ${activeCategory === 'all' ? styles.chipActive : ''}`} onClick={() => setActiveCategory('all')}>Toutes</span>
                  {categories.map((c) => (
                    <span key={c.id} className={`${styles.chip} ${activeCategory === String(c.id) ? styles.chipActive : ''}`} onClick={() => setActiveCategory(String(c.id))}>{c.name}</span>
                  ))}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <span className={styles.filterLbl}>Pays cible</span>
                <div className={styles.chipGroup}>
                  {['all', 'Gabon', 'Maroc', 'Les deux'].map((c) => (
                    <span key={c} className={`${styles.chip} ${activeCountry === c ? styles.chipActive : ''}`} onClick={() => setActiveCountry(c)}>{c === 'all' ? 'Tous' : c}</span>
                  ))}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <span className={styles.filterLbl}>Récompense min (FCFA)</span>
                <input className={styles.filterInput} type="number" placeholder="0" value={rewardMin} onChange={(e) => setRewardMin(e.target.value)} />
              </div>
              <button className={styles.btnReset} onClick={resetFilters}>Réinitialiser</button>
            </aside>

            <div>
              <div className={styles.contentBar}>
                <div className={styles.contentCount}>{filteredQuests.length} quête{filteredQuests.length > 1 ? 's' : ''} ouverte{filteredQuests.length > 1 ? 's' : ''}</div>
                <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="created_at_desc">Plus récentes</option>
                  <option value="reward_desc">Récompense ↑</option>
                  <option value="expires_asc">Expire bientôt</option>
                </select>
              </div>

              {filteredQuests.length === 0 ? (
                <div className={styles.emptyState}><div className={styles.emptyTitle}>Aucune quête disponible</div><div className={styles.emptySub}>Reviens plus tard ou modifie tes filtres.</div></div>
              ) : (
                <div className={styles.questsList}>
                  {filteredQuests.map((q) => {
                    const props = proposalsCount[q.id] || 0;
                    const exp = daysUntil(q.expires_at);
                    const hot = props >= 3;
                    const done = myQuestIds.has(q.id);
                    const fresh = Date.now() - new Date(q.created_at).getTime() < 86400000 * 2;
                    return (
                      <div key={q.id} className={styles.questCard} style={done ? { opacity: .6 } : {}}>
                        <div className={styles.questHead}>
                          <div className={styles.questTitle}>{q.title}</div>
                          <div className={styles.badges}>
                            {done && <span className={styles.badge} style={{ background: 'rgba(34,197,94,.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,.22)' }}>Proposé</span>}
                            {fresh && !done && <span className={`${styles.badge} ${styles.badgeNew}`}>Nouveau</span>}
                            {hot && <span className={`${styles.badge} ${styles.badgeHot}`}>Populaire</span>}
                            {q.categories?.name && <span className={`${styles.badge} ${styles.badgeCat}`}>{q.categories.name}</span>}
                            {q.country_target && <span className={`${styles.badge} ${styles.badgeCountry}`}>{q.country_target}</span>}
                          </div>
                        </div>
                        {q.description && <p className={styles.questDesc}>{q.description}</p>}
                        <div className={styles.questFooter}>
                          <div className={styles.questMeta}>
                            <span className={styles.metaItem}>{props} proposition{props !== 1 ? 's' : ''}</span>
                            <span className={`${styles.metaItem} ${exp <= 1 ? styles.metaUrgent : ''}`}>{exp <= 1 ? 'Expire demain' : `${exp}j restants`}</span>
                            <span className={styles.metaItem}>Budget {fmt(q.product_budget)} {q.currency}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {!done && canHunt && <button className={styles.btnHunt} onClick={() => openModal(q)}>Je chasse</button>}
                            {!done && !canHunt && <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>Rôle chasseur requis</span>}
                            <div className={styles.rewardBox}>
                              <div className={styles.rewardLabel}>Récompense</div>
                              <div className={styles.rewardAmount}>{fmt(q.reward_amount)} <span style={{ fontSize: '.65em' }}>{q.currency || 'FCFA'}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MES PROPOSITIONS */}
        {tab === 'proposals' && (
          <>
            <h2 className={styles.sectionTitle}>Mes propositions</h2>
            {myProposals.length === 0 ? (
              <div className={styles.emptyState}><div className={styles.emptyTitle}>Aucune proposition</div><div className={styles.emptySub}>Parcours les quêtes et clique sur "Je chasse" pour commencer.</div></div>
            ) : (
              <div className={styles.proposalsList}>
                {myProposals.map((p) => {
                  const s = STATUS_MAP[p.status] || STATUS_MAP.pending;
                  const reward = p.quests?.reward_amount || 0;
                  const currency = p.quests?.currency || 'FCFA';
                  const images = Array.isArray(p.product_images) ? p.product_images : [];
                  const questCountry = (p.quests?.country_target || '').toLowerCase();
                  const isIntl = (questCountry.includes('gabon') || questCountry.includes('maroc')) && internalUser?.country && !questCountry.includes(internalUser.country.toLowerCase());
                  const showExpress = ['selected', 'in_delivery', 'delivered', 'reward_paid'].includes(p.status);
                  return (
                    <div key={p.id} className={styles.proposalCard} style={{ borderLeftColor: STATUS_COLOR[p.status] }}>
                      <div className={styles.proposalHead}>
                        <div className={styles.proposalTitle}>{p.quests?.title || 'Quête supprimée'}</div>
                        <span className={styles.statusPill} style={{ background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status] }}>{s.label}</span>
                      </div>
                      {p.description && <div className={styles.proposalBody}>{p.description}</div>}
                      {images.length > 0 && (
                        <div className={styles.propImages}>
                          {images.map((url, i) => <img key={i} className={styles.propImgThumb} src={url} alt="" onClick={() => setLightbox(url)} />)}
                        </div>
                      )}
                      {showExpress && (
                        <div className={`${styles.acceptedBanner} ${p.status !== 'selected' && p.status !== 'in_delivery' ? styles.acceptedBannerGold : ''}`}>
                          {p.status === 'reward_paid' ? (
                            <>
                              <div className={`${styles.acceptedTitle} ${styles.acceptedTitleGold}`}>Récompense versée — {fmt(reward)} {currency}</div>
                              <div className={styles.acceptedText}>Félicitations ! Ta récompense a été versée suite à la réception du colis par l'acheteur.</div>
                            </>
                          ) : p.status === 'delivered' ? (
                            <>
                              <div className={`${styles.acceptedTitle} ${styles.acceptedTitleGold}`}>Colis livré — en attente de confirmation acheteur</div>
                              <div className={styles.acceptedText}>L'acheteur doit confirmer la réception. Ta récompense de <strong style={{ color: 'var(--gold)' }}>{fmt(reward)} {currency}</strong> sera versée dès confirmation.</div>
                              <div className={styles.pendingNote}>Récompense en attente de confirmation</div>
                            </>
                          ) : (
                            <>
                              <div className={styles.acceptedTitle}>Proposition acceptée — passe à l'étape suivante</div>
                              <div className={styles.acceptedText}>
                                Ta proposition a été retenue par l'acheteur. Procède maintenant à l'envoi via <strong style={{ color: 'var(--accent)' }}>{isIntl ? 'Wenna Express International (Gabon ↔ Maroc)' : 'Wenna Express Local'}</strong>.
                                <br /><span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Aucun paiement en liquide. La récompense de {fmt(reward)} {currency} sera versée automatiquement à la réception du colis.</span>
                              </div>
                              <a className={styles.expressBtn} href={`${WENNA_EXPRESS_URL}?proposal=${p.id}&type=${isIntl ? 'international' : 'local'}`} target="_blank" rel="noreferrer">Utiliser Wenna Express</a>
                            </>
                          )}
                        </div>
                      )}
                      <div className={styles.proposalFooter}>
                        <div className={styles.proposalMeta}>
                          <span className={styles.metaItem}>Prix estimé : {p.proposed_price ? fmt(p.proposed_price) + ' FCFA' : 'N/A'}</span>
                          {p.product_url && <a href={p.product_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Référence</a>}
                          <span className={styles.metaItem}>{fmtDate(p.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className={styles.rewardBox}>
                            <div className={styles.rewardLabel}>Récompense</div>
                            <div className={styles.rewardAmount}>{fmt(reward)} <span style={{ fontSize: '.65em' }}>{currency}</span></div>
                          </div>
                          {p.status === 'pending' && <button className={styles.btnDelete} onClick={() => deleteProposal(p.id)}>Retirer</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* GAINS */}
        {tab === 'gains' && (
          <div className={styles.gainsLayout}>
            <div>
              <div className={styles.gainsTotal}>
                <div className={styles.gainsTotalLbl}>Total encaissé</div>
                <div className={styles.gainsTotalVal}>{fmt(kpis.gains)} FCFA</div>
              </div>
              <div className={styles.gainsCard}>
                <div className={styles.gainsCardTitle}>Performance</div>
                <div className={styles.progressSection}>
                  <div className={styles.progressLabel}><span>Propositions acceptées</span><span>{kpis.rate}%</span></div>
                  <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${Math.min(kpis.rate, 100)}%` }} /></div>
                </div>
                <div className={styles.progressSection}>
                  <div className={styles.progressLabel}><span>Récompenses perçues</span><span>{kpis.total ? Math.round((kpis.paid.length / kpis.total) * 100) : 0}%</span></div>
                  <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${kpis.total ? Math.min(Math.round((kpis.paid.length / kpis.total) * 100), 100) : 0}%` }} /></div>
                </div>
                {kpis.nextLevel && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Niveau suivant</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      Complète <strong style={{ color: 'var(--accent)' }}>{kpis.nextLevel.min - kpis.completedCount} quête{kpis.nextLevel.min - kpis.completedCount > 1 ? 's' : ''} de plus</strong> pour atteindre le rang <strong style={{ color: 'var(--gold)' }}>{kpis.nextLevel.name}</strong>.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.gainsCard}>
              <div className={styles.gainsCardTitle}>Historique des transactions</div>
              {kpis.paid.length === 0 && myProposals.filter((p) => p.status === 'selected').length === 0 ? (
                <div className={styles.emptyState} style={{ padding: 28 }}><div className={styles.emptyTitle}>Aucune transaction</div><div className={styles.emptySub}>Tes récompenses apparaîtront ici.</div></div>
              ) : (
                <>
                  {kpis.paid.map((p) => (
                    <div key={p.id} className={styles.txItem}>
                      <div><div className={styles.txTitle}>{p.quests?.title || 'Quête'}</div><div className={styles.txDate}>Versée le {fmtDate(p.reward_paid_at || p.created_at)}</div></div>
                      <div className={styles.txAmount} style={{ color: 'var(--success)' }}>+{fmt(p.quests?.reward_amount)} FCFA</div>
                    </div>
                  ))}
                  {myProposals.filter((p) => p.status === 'selected').slice(0, 3).map((p) => (
                    <div key={p.id} className={styles.txItem}>
                      <div><div className={styles.txTitle}>{p.quests?.title || 'Quête'} — en livraison</div><div className={styles.txDate}>Sélectionnée le {fmtDate(p.selected_at || p.created_at)}</div></div>
                      <div className={styles.txAmount} style={{ color: '#7c8cf8' }}>{fmt(p.quests?.reward_amount)} FCFA</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL PROPOSITION */}
      {modalQuest && (
        <div className={styles.modalOv} onClick={closeModal}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div><div className={styles.modalTitle}>Soumettre une proposition</div><div className={styles.modalRef}>Quête : {modalQuest.title}</div></div>
              <button className={styles.modalClose} onClick={closeModal}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.summaryBox}>
                <div className={styles.summaryTitle}>Résumé de la quête</div>
                <div className={styles.summaryText}>{modalQuest.description || 'Aucune description.'}</div>
              </div>
              <div className={styles.rewardHighlight}>
                <span className={styles.rewardHlLbl}>Récompense si accepté</span>
                <span className={styles.rewardHlVal}>{fmt(modalQuest.reward_amount)} {modalQuest.currency || 'FCFA'}</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ta proposition *</label>
                <textarea className={styles.input} placeholder="Comment tu vas trouver ce produit, où, délai estimé…" value={propMessage} onChange={(e) => setPropMessage(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Prix estimé (FCFA) *</label>
                <input className={styles.input} type="number" placeholder="ex : 28000" value={propPrice} onChange={(e) => setPropPrice(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Lien ou référence (facultatif)</label>
                <input className={styles.input} placeholder="URL, référence boutique…" value={propLink} onChange={(e) => setPropLink(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Photos du produit (max 5)</label>
                <div
                  className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDragover : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                >
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => handleFiles(e.target.files)} />
                  <div className={styles.uploadText}>Glisse tes photos ici ou clique pour parcourir</div>
                </div>
                {files.length > 0 && (
                  <div className={styles.uploadPreviews}>
                    {files.map((f, i) => (
                      <div key={i} className={styles.previewThumb}>
                        <img src={f.preview} alt="" />
                        <button className={styles.removeImg} onClick={() => removeFile(i)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.uploadCounter}>{files.length} / {MAX_IMAGES} photos</div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSubmit} disabled={submitting} onClick={submitProposal}>{submitting ? 'Envoi…' : 'Envoyer ma proposition'}</button>
              <p className={styles.modalHint}>Aucun paiement en liquide. La récompense est versée à la réception du colis.</p>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>×</button>
          <img src={lightbox} alt="" />
        </div>
      )}

      {/* NAV MOBILE */}
      <nav className={styles.bnav}>
        <div className={styles.bnavInner}>
          <Link href="/boutique" className={styles.bnavItem}>Boutique</Link>
          <Link href="/chasseur" className={`${styles.bnavItem} ${styles.bnavItemActive}`}>Chasse</Link>
          <Link href="/vendeur" className={styles.bnavItem}>Vendre</Link>
          <Link href="/quetes" className={styles.bnavItem}>Quêtes</Link>
          <Link href="/compte" className={styles.bnavItem}>Profil</Link>
        </div>
      </nav>

      {toast && <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}>{toast.text}</div>}
    </>
  );
}
