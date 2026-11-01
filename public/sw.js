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

// Notifications push : envoyées par la fonction Supabase send-push, affichées
// même quand WennaShop est fermé.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'WennaShop', body: event.data?.text() || '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'WennaShop', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { link: data.link || '/' },
    })
  );
});

// Un appui ouvre la page liée (commande, chat, quête…), dans un onglet déjà
// ouvert de WennaShop si possible.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    })
  );
});
