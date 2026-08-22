'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import UrgencyTimer from '@/components/UrgencyTimer';
import { convertPrice, formatSmartPrice } from '@/lib/currency';
import styles from './boutique.module.css';

const PAGE_SIZE = 24;
const COUNTRIES = ['Gabon', 'Maroc', 'Bénin', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'Mali'];
const DISPLAY_CURRENCIES = [
  { value: 'MAD', label: 'MAD (Maroc)' },
  { value: 'XOF', label: 'FCFA — UEMOA' },
  { value: 'XAF', label: 'FCFA — CEMAC' },
];

export default function BoutiquePage() {
  const { add } = useCart();
  const [cartOpen, setCartOpen] = useState(false);

  // Config du site (maintenance, ticker, bandeau, offre limitée)
  const [siteConfig, setSiteConfig] = useState({});
  const [maintenance, setMaintenance] = useState(false);

  // Catalogue
  const [categories, setCategories] = useState([]);
  const [catId, setCatId] = useState('');
  const [sort, setSort] = useState('created_at:desc');
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Devise d'affichage choisie par le visiteur (les prix restent stockés
  // dans la devise du vendeur ; ceci ne change que l'affichage, avec la
  // marge de sécurité anti-perte toujours appliquée — voir src/lib/currency.js)
  const [displayCurrency, setDisplayCurrency] = useState('MAD');

  // Filtres barre latérale
  const [countries, setCountries] = useState([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(100000);
  const [stockOnly, setStockOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Affichage
  const [view, setView] = useState('grid4'); // grid3 | grid4 | list

  // Panneaux
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [catPanelFilter, setCatPanelFilter] = useState('');
  const [boostPanelOpen, setBoostPanelOpen] = useState(false);
  const [boostedShops, setBoostedShops] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [liveQuery, setLiveQuery] = useState('');
  const [liveResults, setLiveResults] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);

  // Panneaux flottants (apparition différée)
  const [showQuetesFloat, setShowQuetesFloat] = useState(false);
  const [showBoostFloat, setShowBoostFloat] = useState(false);
  const [floatQuests, setFloatQuests] = useState([]);

  // Compteur "en ligne"
  const [onlineCount, setOnlineCount] = useState(0);

  // ── Config du site ──
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('site_config').select('key,value');
      if (!data) return;
      const cfg = {};
      data.forEach((r) => { cfg[r.key] = r.value; });
      setSiteConfig(cfg);
      setMaintenance(cfg.maintenance_mode === 'true');
    })();
  }, []);

  // ── Catégories ──
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('categories').select('id,name').eq('is_active', true).order('sort_order', { ascending: true }).limit(30);
      setCategories(data || []);
    })();
  }, []);

  // ── Produits (filtres + tri + pagination + prix protégés) ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const [col, dir] = sort.split(':');
      const offset = (page - 1) * PAGE_SIZE;
      let q = sb.from('products')
        .select('id,name,price,currency,country,origin_city,stock,images,image_url,category_id,categories(name)', { count: 'exact' })
        .eq('status', 'active')
        .range(offset, offset + PAGE_SIZE - 1)
        .order(col, { ascending: dir === 'asc' });
      if (catId) q = q.eq('category_id', catId);
      if (countries.length) q = q.in('country', countries);
      if (stockOnly) q = q.gt('stock', 0);
      if (priceMin > 0) q = q.gte('price', priceMin);
      if (priceMax < 100000) q = q.lte('price', priceMax);
      if (searchTerm.trim()) q = q.ilike('name', `%${searchTerm.trim()}%`);

      const { data, count } = await q;
      const list = data || [];
      const withPrices = await Promise.all(list.map(async (p) => {
        const conv = await convertPrice(p.price, p.currency || 'MAD', displayCurrency, sb);
        return { ...p, displayPrice: formatSmartPrice(conv.amount, conv.currency) };
      }));
      setProducts(withPrices);
      setTotal(count || 0);
      setLoading(false);
    })();
  }, [catId, sort, page, countries, stockOnly, priceMin, priceMax, searchTerm, displayCurrency]);

  // ── Boutiques boostées ──
  // Une boutique est "boostée" si elle a un boost actif (table boosts,
  // type='shop', status='active', pas encore expiré) — il n'y a pas de
  // colonne is_boosted directement sur shops.
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('boosts')
        .select('shop_id, expires_at, shops(id,slug,name,banner_url,bio)')
        .eq('type', 'shop')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(8);
      const shops = (data || []).map((b) => b.shops).filter(Boolean);
      setBoostedShops(shops);
    })();
  }, []);

  // ── Quêtes ouvertes (panneau flottant) ──
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('quests').select('id,title,reward_amount,currency').eq('status', 'open').order('created_at', { ascending: false }).limit(3);
      setFloatQuests(data || []);
    })();
  }, []);

  // ── Panneaux flottants : apparition différée, une fois par session ──
  useEffect(() => {
    const dismissedQ = sessionStorage.getItem('wenna_float_quetes_dismissed');
    const dismissedB = sessionStorage.getItem('wenna_float_boost_dismissed');
    const t1 = setTimeout(() => { if (!dismissedQ) setShowQuetesFloat(true); }, 8000);
    const t2 = setTimeout(() => { if (!dismissedB) setShowBoostFloat(true); }, 16000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  function dismissFloat(which) {
    if (which === 'quetes') { setShowQuetesFloat(false); sessionStorage.setItem('wenna_float_quetes_dismissed', '1'); }
    else { setShowBoostFloat(false); sessionStorage.setItem('wenna_float_boost_dismissed', '1'); }
  }

  // ── Présence en ligne (Supabase Realtime) ──
  useEffect(() => {
    const sb = getSupabase();
    const visitorId = sessionStorage.getItem('wenna_vid') || (() => {
      const id = 'v_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('wenna_vid', id);
      return id;
    })();
    const channel = sb.channel('boutique-online', { config: { presence: { key: visitorId } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ page: 'boutique', at: Date.now() });
      });
    return () => { channel.untrack(); sb.removeChannel(channel); };
  }, []);

  // ── Recherche live (overlay plein écran) ──
  useEffect(() => {
    if (!liveQuery.trim()) { setLiveResults([]); return; }
    const t = setTimeout(async () => {
      setLiveLoading(true);
      const sb = getSupabase();
      const { data } = await sb.from('products').select('id,name,price,currency,image_url,images').eq('status', 'active').ilike('name', `%${liveQuery}%`).limit(8);
      setLiveResults(data || []);
      setLiveLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [liveQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleAdd(e, product) {
    e.preventDefault();
    e.stopPropagation();
    // On ajoute le produit avec son prix ET sa devise d'origine (celle du
    // vendeur) — pas le prix converti affiché — pour que la commande et le
    // paiement restent exacts.
    await add(product, 1);
    setCartOpen(true);
  }

  function toggleCountry(c) {
    setCountries((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setPage(1);
  }

  function resetFilters() {
    setCatId(''); setCountries([]); setPriceMin(0); setPriceMax(100000);
    setStockOnly(false); setSearchTerm(''); setPage(1);
  }

  const gridClass = view === 'list' ? styles.listView : view === 'grid3' ? styles.cols3 : styles.cols4;

  if (maintenance) {
    return (
      <div className={styles.maintenanceScreen}>
        <div className={styles.logo}><span style={{ color: 'var(--accent)' }}>Wenna</span>Shop</div>
        <div className={styles.maintTitle}>Site en maintenance</div>
        <p className={styles.maintSub}>Nous effectuons des mises à jour. La boutique sera de retour très bientôt.</p>
      </div>
    );
  }

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      {siteConfig.boutique_banner_enabled === 'true' && siteConfig.boutique_banner_url && (
        <div className={styles.promoBanner}>
          <a href={siteConfig.boutique_banner_link || '#'}>
            <img src={siteConfig.boutique_banner_url} alt="Promotion" style={{ maxHeight: 32, verticalAlign: 'middle' }} />
          </a>
        </div>
      )}

      {siteConfig.ticker_messages && (() => {
        try {
          const msgs = JSON.parse(siteConfig.ticker_messages);
          if (!msgs.length) return null;
          const items = [...msgs, ...msgs];
          return (
            <div className={styles.ticker}>
              <div className={styles.tickerT}>
                {items.map((m, i) => (
                  <span key={i}>{m}<span className={styles.tickerSep}>·</span></span>
                ))}
              </div>
            </div>
          );
        } catch { return null; }
      })()}

      <section className={styles.pageHero}>
        <div className={styles.pageEyebrow}>Marketplace inter-africaine</div>
        <h1 className={styles.pageTitle}>La <span>Boutique</span></h1>
        <p className={styles.pageSub}>
          Produits et vendeurs vérifiés, livraison gérée par le vendeur.{' '}
          {total > 0 && <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{total} produit{total > 1 ? 's' : ''}</span>}
        </p>
        {onlineCount > 0 && (
          <div className={styles.onlinePill}>
            <span className={styles.onlineDot} />
            {onlineCount === 1 ? '1 personne' : `${onlineCount} personnes`} en ligne maintenant
          </div>
        )}
        {siteConfig.flash_sale_ends_at && <UrgencyTimer endsAt={siteConfig.flash_sale_ends_at} />}
      </section>

      {(catId || countries.length > 0 || stockOnly || priceMin > 0 || priceMax < 100000) && (
        <div className={styles.activeFilters}>
          {catId && <button className={styles.filterPill} onClick={() => setCatId('')}>{categories.find((c) => String(c.id) === catId)?.name} ✕</button>}
          {countries.map((c) => <button key={c} className={styles.filterPill} onClick={() => toggleCountry(c)}>{c} ✕</button>)}
          {stockOnly && <button className={styles.filterPill} onClick={() => setStockOnly(false)}>En stock ✕</button>}
          {(priceMin > 0 || priceMax < 100000) && <button className={styles.filterPill} onClick={() => { setPriceMin(0); setPriceMax(100000); }}>Prix ✕</button>}
        </div>
      )}

      <div className={styles.toolbar}>
        <button className={styles.btnCatsPanel} onClick={() => setCatPanelOpen(true)}>
          <i className="ph ph-squares-four" /> Catégories
        </button>
        <div className={styles.catsScroll}>
          <button className={`${styles.catBtn} ${!catId ? styles.catBtnActive : ''}`} onClick={() => { setCatId(''); setPage(1); }}>Tout</button>
          {categories.map((c) => (
            <button key={c.id} className={`${styles.catBtn} ${catId === String(c.id) ? styles.catBtnActive : ''}`}
              onClick={() => { setCatId(String(c.id)); setPage(1); }}>{c.name}</button>
          ))}
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.hdBtn} onClick={() => setSearchOpen(true)} aria-label="Rechercher" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, display: 'flex' }}>
            <i className="ph ph-magnifying-glass" />
          </button>
          <button className={styles.btnBoostToolbar} onClick={() => setBoostPanelOpen(true)}>Boostées</button>
          <Link href="/quetes" className={styles.btnQueteToolbar}>Quêtes</Link>
          <span className={styles.resultsCount}>{total > 0 ? `${total} produit${total > 1 ? 's' : ''}` : ''}</span>
          <select className={styles.sortSelect} value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} title="Devise d'affichage">
            {DISPLAY_CURRENCIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select className={styles.sortSelect} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="created_at:desc">Plus récents</option>
            <option value="price:asc">Prix ↑</option>
            <option value="price:desc">Prix ↓</option>
            <option value="name:asc">A → Z</option>
          </select>
          <div className={styles.viewBtns}>
            <button className={`${styles.viewBtn} ${view === 'grid3' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid3')} title="Compact"><i className="ph ph-square" /></button>
            <button className={`${styles.viewBtn} ${view === 'grid4' ? styles.viewBtnActive : ''}`} onClick={() => setView('grid4')} title="Mini"><i className="ph ph-squares-four" /></button>
            <button className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`} onClick={() => setView('list')} title="Liste"><i className="ph ph-list" /></button>
          </div>
        </div>
      </div>

      <div className={styles.shopLayout}>
        <aside className={styles.sidebar}>
          <div className={styles.filterSection}>
            <div className={styles.filterTitle}>Recherche</div>
            <input className={styles.filterSearch} type="search" placeholder="Nom, produit…" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} />
          </div>
          <div className={styles.filterSection}>
            <div className={styles.filterTitle}>Origine</div>
            {COUNTRIES.map((c) => (
              <div className={styles.checkRow} key={c}>
                <input type="checkbox" id={`f-${c}`} checked={countries.includes(c)} onChange={() => toggleCountry(c)} />
                <label htmlFor={`f-${c}`}>{c}</label>
              </div>
            ))}
          </div>
          <div className={styles.filterSection}>
            <div className={styles.filterTitle}>Prix — <span className={styles.priceDisplay}>{priceMin.toLocaleString('fr-FR')} – {priceMax.toLocaleString('fr-FR')} MAD</span></div>
            <div className={styles.priceRange}>
              <input type="range" min="0" max="100000" step="500" value={priceMin} onChange={(e) => setPriceMin(Number(e.target.value))} onMouseUp={() => setPage(1)} onTouchEnd={() => setPage(1)} />
              <input type="range" min="0" max="100000" step="500" value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} onMouseUp={() => setPage(1)} onTouchEnd={() => setPage(1)} />
            </div>
          </div>
          <div className={styles.filterSection}>
            <div className={styles.checkRow}>
              <input type="checkbox" id="f-stock" checked={stockOnly} onChange={(e) => { setStockOnly(e.target.checked); setPage(1); }} />
              <label htmlFor="f-stock">En stock uniquement</label>
            </div>
          </div>
          <div className={styles.filterSection}>
            <div className={styles.filterTitle}>Livraison</div>
            <div className={styles.shippingInfo}>La livraison est gérée directement par le vendeur. Contactez-le pour les délais et tarifs.</div>
          </div>
          <div className={styles.filterSection}>
            <div className={styles.filterTitle}>Produit introuvable ?</div>
            <Link href="/quetes" className={styles.sidebarQueteLink}>Poster une quête</Link>
          </div>
          <button className={styles.btnReset} onClick={resetFilters}>Réinitialiser les filtres</button>
        </aside>

        <div className={styles.productsArea}>
          {loading ? (
            <div className={`${styles.prodGrid} ${gridClass}`}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div className={styles.prodCard} key={i}><div className={`${styles.prodImg} ${styles.skel}`} /></div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className={styles.noResults}>
              <div className={styles.noResultsTitle}>Aucun produit trouvé</div>
              <div className={styles.noResultsSub}>Essayez d'autres filtres — ou <Link href="/quetes">postez une quête</Link> pour le trouver.</div>
            </div>
          ) : (
            <div className={`${styles.prodGrid} ${gridClass}`}>
              {products.map((p) => {
                const img = Array.isArray(p.images) && p.images.length ? p.images[0] : (p.image_url || 'https://images.unsplash.com/photo-1608181831688-e6c2cd67f0a9?w=400&q=80');
                const paysLabel = (p.country || '').toLowerCase().includes('maroc') ? 'MA' : 'GA';
                return (
                  <Link href={`/produit?id=${p.id}`} className={styles.prodCard} key={p.id}>
                    <div className={styles.prodImg}>
                      <img src={img} alt={p.name} loading="lazy" />
                      <span className={styles.prodBadge}>{paysLabel}</span>
                      <button className={styles.prodAdd} onClick={(e) => handleAdd(e, p)} aria-label="Ajouter au panier">
                        <i className="ph ph-plus" style={{ fontSize: 14 }} />
                      </button>
                    </div>
                    <div className={styles.prodInfo}>
                      <div className={styles.prodCat}>{p.categories?.name || ''}{p.origin_city ? ` · ${p.origin_city}` : ''}</div>
                      <div className={styles.prodName}>{p.name}</div>
                      <div className={styles.prodFt}>
                        <div className={styles.prodPrice}>{p.displayPrice}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((i) => i === 1 || i === totalPages || Math.abs(i - page) <= 1)
                .map((i, idx, arr) => (
                  <span key={i} style={{ display: 'flex' }}>
                    {idx > 0 && arr[idx - 1] !== i - 1 && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-faint)', padding: '0 4px' }}>…</span>}
                    <button className={`${styles.pageBtn} ${i === page ? styles.pageBtnActive : ''}`} onClick={() => setPage(i)}>{i}</button>
                  </span>
                ))}
              <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* Panneau catégories */}
      <div className={`${styles.catPanelOverlay} ${catPanelOpen ? styles.catPanelOverlayOpen : ''}`} onClick={() => setCatPanelOpen(false)} />
      <div className={`${styles.catPanel} ${catPanelOpen ? styles.catPanelOpen : ''}`}>
        <div className={styles.cpHead}>
          <div><div className={styles.cpEyebrow}>Explorer</div><div className={styles.cpTitle}>Catégories</div></div>
          <button className={styles.cpClose} onClick={() => setCatPanelOpen(false)}><i className="ph ph-x" /></button>
        </div>
        <div className={styles.cpSearch}>
          <input type="search" placeholder="Filtrer les catégories…" value={catPanelFilter} onChange={(e) => setCatPanelFilter(e.target.value)} />
        </div>
        <div className={styles.cpStats}>
          <div className={styles.cpStat}>Total : <b>{categories.length}</b></div>
          <div className={styles.cpStat}>Sélection : <b style={{ color: 'var(--accent)' }}>{catId ? categories.find((c) => String(c.id) === catId)?.name : 'Toutes'}</b></div>
        </div>
        <div className={styles.cpBody}>
          {categories.filter((c) => c.name.toLowerCase().includes(catPanelFilter.toLowerCase())).map((c) => (
            <div className={styles.cpParent} key={c.id}>
              <div className={styles.cpParentLeft}>
                <div className={styles.cpParentIcon}>{c.name.charAt(0)}</div>
                <div className={styles.cpParentName}>{c.name}</div>
              </div>
              <button className={styles.cpApplyBtn} onClick={() => { setCatId(String(c.id)); setPage(1); setCatPanelOpen(false); }}>Appliquer</button>
            </div>
          ))}
        </div>
        <div className={styles.cpFooter}>
          <button className={styles.cpBtnAll} onClick={() => { setCatId(''); setPage(1); setCatPanelOpen(false); }}>Tout afficher</button>
          <button className={styles.cpBtnReset} onClick={() => setCatPanelOpen(false)}>Retour</button>
        </div>
      </div>

      {/* Panneau boutiques boostées */}
      <div className={`${styles.boostPanelOverlay} ${boostPanelOpen ? styles.boostPanelOverlayOpen : ''}`} onClick={() => setBoostPanelOpen(false)} />
      <div className={`${styles.boostPanel} ${boostPanelOpen ? styles.boostPanelOpen : ''}`}>
        <div className={styles.bpHead}>
          <div><div className={styles.bpEyebrow}>Visibilité premium</div><div className={styles.bpTitle}>Boutiques boostées</div></div>
          <button className={styles.bpClose} onClick={() => setBoostPanelOpen(false)}><i className="ph ph-x" /></button>
        </div>
        <div className={styles.bpBody}>
          {boostedShops.length === 0 ? (
            <div className={styles.bpEmpty}>Aucune boutique boostée pour le moment.</div>
          ) : boostedShops.map((s) => (
            <Link href={`/boutique-vendeur?slug=${s.slug}`} className={styles.boostCard} key={s.id}>
              {s.banner_url && <img src={s.banner_url} className={styles.boostCardBanner} alt={s.name} />}
              <div className={styles.boostCardBody}>
                <span className={styles.boostBadge}>En vedette</span>
                <div className={styles.boostCardName}>{s.name}</div>
                {s.bio && <div className={styles.boostCardDesc}>{s.bio}</div>}
                <span className={styles.boostCardCta}>Visiter la boutique</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recherche plein écran */}
      <div className={`${styles.srchOv} ${searchOpen ? styles.srchOvOpen : ''}`}>
        <div className={styles.srchContainer}>
          <div className={styles.srchHint}>Recherche produits</div>
          <div className={styles.srchBox}>
            <i className="ph ph-magnifying-glass" style={{ color: 'var(--text-faint)', fontSize: 22 }} />
            <input className={styles.srchInp} type="search" placeholder="Rechercher un produit…" value={liveQuery} onChange={(e) => setLiveQuery(e.target.value)} autoFocus={searchOpen} />
            <button className={styles.srchClose} onClick={() => { setSearchOpen(false); setLiveQuery(''); }}><i className="ph ph-x" style={{ fontSize: 18 }} /></button>
          </div>
          {liveLoading ? (
            <div className={styles.srchLoading}>Recherche…</div>
          ) : liveResults.length > 0 ? (
            <div className={styles.srchResults}>
              {liveResults.map((r) => {
                const img = Array.isArray(r.images) && r.images.length ? r.images[0] : r.image_url;
                return (
                  <Link href={`/produit?id=${r.id}`} className={styles.srchResultItem} key={r.id} onClick={() => setSearchOpen(false)}>
                    {img && <img className={styles.srchResultImg} src={img} alt={r.name} />}
                    <div style={{ flex: 1 }}><div className={styles.srchResultName}>{r.name}</div></div>
                    <div className={styles.srchResultPrice}>{formatSmartPrice(r.price, r.currency || 'MAD')}</div>
                  </Link>
                );
              })}
            </div>
          ) : liveQuery.trim() ? (
            <div className={styles.srchEmpty}>Aucun résultat.</div>
          ) : (
            <div className={styles.srchSuggestions}>
              <div className={styles.srchSugTitle}>Tendances</div>
              <div className={styles.srchSugTags}>
                {['bijoux', 'tissu', 'cosmétiques', 'épices', 'maroquinerie', 'artisanat'].map((t) => (
                  <button key={t} className={styles.srchSugTag} onClick={() => setLiveQuery(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Panneaux flottants */}
      {showQuetesFloat && floatQuests.length > 0 && (
        <div className={`${styles.floatPanel} ${styles.floatQuetes} ${styles.floatPanelShow}`}>
          <button className={styles.floatClose} onClick={() => dismissFloat('quetes')}><i className="ph ph-x" /></button>
          <div className={styles.floatHead}>
            <div className={`${styles.floatIcon} ${styles.floatQuetesIcon}`}><i className="ph ph-target" /></div>
            <div><div className={styles.floatTitle}>Quêtes ouvertes</div><div className={styles.floatSub}>Produits recherchés par la communauté</div></div>
          </div>
          <div className={styles.floatBody}>
            {floatQuests.map((q) => (
              <Link href={`/quete?id=${q.id}`} className={styles.floatItem} key={q.id}>
                <div className={styles.floatItemName}>{q.title}</div>
                <div className={styles.floatItemMeta}>{Number(q.reward_amount).toLocaleString('fr-FR')} {q.currency}</div>
              </Link>
            ))}
          </div>
          <Link href="/quetes" className={styles.floatCtaQuetes}>Voir toutes les quêtes</Link>
        </div>
      )}

      {showBoostFloat && boostedShops.length > 0 && (
        <div className={`${styles.floatPanel} ${styles.floatBoost} ${styles.floatPanelShow}`}>
          <button className={styles.floatClose} onClick={() => dismissFloat('boost')}><i className="ph ph-x" /></button>
          <div className={styles.floatHead}>
            <div className={`${styles.floatIcon} ${styles.floatBoostIcon}`}><i className="ph ph-star" /></div>
            <div><div className={styles.floatTitle}>Boutique en vedette</div><div className={styles.floatSub}>Sélectionnée pour vous</div></div>
          </div>
          <div className={styles.floatBody}>
            <div className={styles.floatItemName}>{boostedShops[0].name}</div>
          </div>
          <button className={styles.floatCtaBoost} onClick={() => setBoostPanelOpen(true)}>Voir les boutiques boostées</button>
        </div>
      )}

      {/* Barre mobile */}
      <nav className={styles.bnav}>
        <div className={styles.bnavInner}>
          <Link href="/boutique" className={`${styles.bnavItem} ${styles.bnavItemActive}`}>Shop</Link>
          <Link href="/chasseur" className={styles.bnavItem}>Chasse</Link>
          <Link href="/vendeur" className={styles.bnavItem}>Vendre</Link>
          <Link href="/quetes" className={`${styles.bnavItem} ${styles.bnavItemGold}`}>Quêtes</Link>
          <Link href="/compte" className={styles.bnavItem}>Profil</Link>
        </div>
      </nav>
    </>
  );
}
