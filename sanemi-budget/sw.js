const CACHE="budget-v2";
const FILES=["./","index.html","styles.css","app.js","sb.js","config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  const fonts=u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com";
  if(u.origin!==location.origin&&!fonts)return; // Supabase : toujours le réseau
  e.respondWith(caches.match(e.request,{ignoreSearch:!fonts}).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok||res.type==="opaque"){const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return res
  }).catch(()=>fonts?Response.error():caches.match("index.html"))));
});
