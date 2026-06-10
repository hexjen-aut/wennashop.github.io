/**
 * WennaShop — Service Worker v2.0
 * Mise à jour : toutes les pages cachées (dashboard vendeur + admin inclus)
 *
 * STRATÉGIE PAR TYPE :
 * - Cache-first     → assets statiques (CSS, JS, fonts, images)
 * - Network-first   → pages HTML (dashboard, admin, boutique…)
 * - Network-first   → API Supabase avec fallback cache data
 * - Stale-while-rev → données catalogue produits
 */

const CACHE_VERSION = 'wenna-v2';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

// ─── Pages HTML à précacher ────────────────────────────────────────────────
const HTML_PAGES = [
  '/',
  '/index.html',
  '/boutique.html',
  '/panier.html',
  '/compte.html',
  '/offline.html',
  '/dashboard-vendeur.html',
  '/admin_panel.html',
  '/detail_produit.html',
  '/recherche.html',
  '/tracking.html',
  '/quetes.html',
  '/boutique-vendeur.html',
  '/paiement.html',
];

// ─── Assets statiques critiques ────────────────────────────────────────────
const STATIC_ASSETS = [
  '/supabase.config.js',
  '/wenna-seo.js',
  '/manifest.json',
  '/assets/logo.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  // CDN externe critique
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap',
];

const ALL_PRECACHE = [...HTML_PAGES, ...STATIC_ASSETS];

const OFFLINE_FALLBACK = '/offline.html';

// ─── INSTALL : précacher tout ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW v2] Install — précache assets + pages');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // addAll avec gestion d'erreur par item (évite de bloquer si un asset manque)
        return Promise.allSettled(
          ALL_PRECACHE.map(url =>
            cache.add(url).catch(err =>
              console.warn(`[SW v2] Précache ignoré : ${url} — ${err.message}`)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW v2] Précache terminé — skipWaiting');
        return self.skipWaiting();
      })
  );
});

// ─── ACTIVATE : supprimer anciens caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW v2] Activate — nettoyage anciens caches');
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter(n => n.startsWith('wenna-') && ![STATIC_CACHE, DATA_CACHE, IMAGE_CACHE].includes(n))
          .map(n => { console.log('[SW v2] Suppression :', n); return caches.delete(n); })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH : stratégie par type ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer non-GET et extensions navigateur
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'moz-extension:') return;

  // 1. API Supabase → network-first + cache data GET
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstSupabase(request));
    return;
  }

  // 2. Images (Supabase Storage inclus) → cache-first
  if (
    request.destination === 'image' ||
    url.hostname.includes('storage.googleapis.com') ||
    url.pathname.includes('/storage/v1/object/public/')
  ) {
    event.respondWith(cacheFirstImages(request));
    return;
  }

  // 3. Fonts Google → cache-first permanent
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Assets statiques JS/CSS → cache-first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'unpkg.com'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 5. Pages HTML → network-first + mise en cache + fallback offline
  if (request.destination === 'document') {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // 6. Tout le reste → network + fallback cache
  event.respondWith(networkWithCacheFallback(request));
});

// ══════════════════════════════════════════════
//  STRATÉGIES
// ══════════════════════════════════════════════

/** Cache-first générique */
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Ressource non disponible hors connexion', { status: 503 });
  }
}

/** Cache-first images avec placeholder SVG si absent */
async function cacheFirstImages(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="300" height="300" fill="#141414"/>
      <text x="150" y="155" text-anchor="middle" fill="#ff751f" font-size="11" font-family="sans-serif">Image non disponible</text>
    </svg>`;
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
  }
}

/** Network-first HTML → cache → offline.html */
async function networkFirstHTML(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_FALLBACK);
    return offline || new Response('<h1 style="font-family:sans-serif;text-align:center;padding:40px;color:#ff751f;">WennaShop — Hors connexion</h1>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/** Network-first Supabase — cache les GET catalogue */
async function networkFirstSupabase(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const url = new URL(request.url);
      const cacheable = [
        '/rest/v1/products',
        '/rest/v1/categories',
        '/rest/v1/shops',
        '/rest/v1/quests',
      ].some(p => url.pathname.includes(p));
      if (cacheable) {
        const cache = await caches.open(DATA_CACHE);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW v2] Supabase hors ligne — données depuis cache');
      return cached;
    }
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'Données non disponibles hors connexion'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/** Network avec fallback cache générique */
async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Non disponible hors connexion', { status: 503 });
  }
}

// ─── Background Sync ───────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-orders') {
    event.waitUntil(broadcastSync('SYNC_PENDING_ORDERS'));
  }
  if (event.tag === 'sync-pending-cart') {
    event.waitUntil(broadcastSync('SYNC_PENDING_CART'));
  }
});

async function broadcastSync(type) {
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type }));
}

// ─── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'WennaShop', {
      body: data.body,
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});

console.log('[SW v2] WennaShop — Service Worker actif 🇬🇦🇲🇦');
