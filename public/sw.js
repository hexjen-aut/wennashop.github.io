// Enregistré en /sw.js?v=<id de déploiement> : chaque déploiement installe un
// nouveau worker et renouvelle ce cache.
const CACHE_NAME = `wenna-shell-${new URL(self.location.href).searchParams.get('v') || 'v1'}`;
const OFFLINE_URL = '/offline';
const SHELL_ASSETS = [OFFLINE_URL, '/manifest.json', '/icon-192.png', '/icon-512.png', '/wenna_icon.png', '/wenna-mascotte.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Seules les navigations (changement de page) passent par un fallback hors
// ligne — tout le reste (appels Supabase, images, données produits) va
// toujours au réseau tel quel : un site marchand ne doit jamais servir un
// prix ou un stock mis en cache.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
