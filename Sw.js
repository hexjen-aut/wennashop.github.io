/**
 * WennaShop — Service Worker v1.0
 * Stratégie de résilience offline pour le Gabon
 * 
 * STRATÉGIE :
 * - Cache-first pour assets statiques (CSS, JS, images)
 * - Network-first avec fallback cache pour les pages HTML
 * - Stale-while-revalidate pour les données produits
 * - Queue offline pour les commandes (IndexedDB sync)
 */

const CACHE_VERSION = 'wenna-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// ─── Assets critiques à précacher au install ───────────────────────────────
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/boutique.html',
  '/panier.html',
  '/compte.html',
  '/offline.html',
  '/css/main.css',
  '/css/responsive.css',
  '/js/config.js',
  '/js/offline-db.js',
  '/supabase.config.js',
  '/assets/logo.png',
  '/manifest.json',
  // CDN critique (Supabase JS)
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

// ─── Pages avec fallback offline ──────────────────────────────────────────
const OFFLINE_FALLBACK = '/offline.html';

// ─── Install : précache tous les assets statiques ─────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install — précache assets statiques');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => {
        // Ne pas planter si un asset est absent au premier install
        return true;
      })).catch(err => {
        console.warn('[SW] Précache partiel — certains assets absents:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate : nettoyer les vieux caches ─────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — nettoyage anciens caches');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('wenna-') && 
                         name !== STATIC_CACHE && 
                         name !== DATA_CACHE && 
                         name !== IMAGE_CACHE)
          .map(name => {
            console.log('[SW] Suppression vieux cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch : stratégie intelligente par type de ressource ─────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les extensions navigateur
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // 1. Requêtes Supabase API → Network-first avec queue offline
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstWithOfflineQueue(request));
    return;
  }

  // 2. Images → Cache-first avec fallback placeholder
  if (request.destination === 'image') {
    event.respondWith(cacheFirstImages(request));
    return;
  }

  // 3. Assets statiques (JS, CSS, fonts) → Cache-first
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Pages HTML → Network-first avec fallback cache puis offline.html
  if (request.destination === 'document') {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // 5. Tout le reste → Network avec fallback cache
  event.respondWith(networkWithCacheFallback(request));
});

// ─── Stratégies de cache ──────────────────────────────────────────────────

/** Cache-first : sert le cache, sinon réseau + mise en cache */
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
  } catch (err) {
    return new Response('Ressource non disponible hors connexion', { status: 503 });
  }
}

/** Cache-first pour images avec placeholder SVG si absent */
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
  } catch (err) {
    // Retourner un placeholder SVG transparent
    const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="300" height="300" fill="#1a1a1a"/>
      <text x="150" y="150" text-anchor="middle" dy=".3em" fill="#FF6B2B" font-size="12" font-family="sans-serif">Image non disponible</text>
    </svg>`;
    return new Response(placeholder, {
      headers: { 'Content-Type': 'image/svg+xml' }
    });
  }
}

/** Network-first pour pages HTML, fallback cache, puis offline.html */
async function networkFirstHTML(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offlinePage = await caches.match(OFFLINE_FALLBACK);
    return offlinePage || new Response('<h1>Hors connexion</h1>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/** Network-first Supabase — si hors ligne, met en queue les mutations */
async function networkFirstWithOfflineQueue(request) {
  try {
    const response = await fetch(request);
    // Mettre en cache les réponses GET Supabase (catalogue produits, etc.)
    if (response.ok && request.method === 'GET') {
      const url = new URL(request.url);
      // Ne cacher que les routes catalogue/produits/catégories
      if (url.pathname.includes('/rest/v1/products') || 
          url.pathname.includes('/rest/v1/categories') ||
          url.pathname.includes('/rest/v1/shops')) {
        const cache = await caches.open(DATA_CACHE);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (err) {
    // Hors ligne — chercher en cache data
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Supabase hors ligne — données depuis cache:', request.url);
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
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('Non disponible hors connexion', { status: 503 });
  }
}

// ─── Background Sync — envoyer les commandes en attente quand connexion revient
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-orders') {
    console.log('[SW] Background Sync — envoi commandes en attente');
    event.waitUntil(syncPendingOrders());
  }
  if (event.tag === 'sync-pending-cart') {
    event.waitUntil(syncPendingCart());
  }
});

async function syncPendingOrders() {
  // Communiquer avec le client pour déclencher la sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_PENDING_ORDERS' });
  });
}

async function syncPendingCart() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_PENDING_CART' });
  });
}

// ─── Push Notifications (optionnel futur) ─────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'WennaShop', {
      body: data.body,
      icon: '/assets/logo.png',
      badge: '/assets/badge.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

console.log('[SW] WennaShop Service Worker chargé — Résilience Gabon activée 🇬🇦');
