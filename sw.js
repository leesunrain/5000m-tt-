const C='nirc5000-v52';
const A=['./','styles.css','app-v52.js','data.js','manifest.webmanifest'];
self.addEventListener('install',e=>{
 self.skipWaiting();
 e.waitUntil(caches.open(C).then(c=>c.addAll(A)));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
 if(e.request.mode==='navigate'){
   e.respondWith(fetch(e.request).catch(()=>caches.match('./')));
   return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
