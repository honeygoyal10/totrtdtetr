const CACHE_NAME='orders-invoices-v21'; // bumped from v20 -> v21: order-db.js changed
                                          // (itemSummary/summary stores, DB_VERSION 5).
                                          // NOTE FOR NEXT TIME: bump this number EVERY
                                          // time any file in ASSETS below changes, even a
                                          // small one. This is a cache-first service
                                          // worker, so old clients keep serving the old
                                          // cached file forever until CACHE_NAME changes -
                                          // that's why the itemSummary fix in order-db.js
                                          // didn't actually reach already-installed users
                                          // last time even though the source was fixed.
const ASSETS=['./','./index.html','./order.html','./invoice.html','./manifest.json','./config.js','./order-app.js','./order-db.js','./order-sync.js','./api.js','./calc.js','./invoice.js','./storage.js','./json.js','./tally.js','./sync.js','./history.js','./print.js','./order-autofill.js','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS).catch(()=>{})));});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('orders-invoices-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
// NOTE: caches.keys() returns every cache on this ORIGIN, not just this
// app's. If another PWA (e.g. the Gate Pass app) shares the same domain,
// its cache appears here too. The filter above only ever deletes caches
// starting with "orders-invoices-" (this app's own prefix) so activating
// this SW never wipes out the other app's offline cache.
// Cache-first for app-shell files: serves the cached copy instantly if we
// have one, only touching the network for files we don't have yet.
// `response.ok` is already checked before writing to cache, so a
// Cloudflare/origin error page (502/522/523 etc, resolved fetch but bad
// status) never overwrites a good cached file - that part was already
// correct here. The one gap: if a file ISN'T cached yet and the network
// fetch throws (true offline / DNS failure), there was no .catch(), which
// left the fetch event unhandled instead of failing gracefully.
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    caches.match(event.request).then(cached=>
      cached || fetch(event.request).then(response=>{
        // IMPORTANT: clone() must happen synchronously, right here, before
        // any "await"/.then hand-off. caches.open() is async - by the time
        // it resolves, the page may have already read the original
        // response's body (e.g. via .json()), which "locks" it. Cloning
        // AFTER that point throws "Response body is already used". Cloning
        // immediately (before returning/using the response at all) avoids
        // the race entirely.
        const isSameOrigin = new URL(event.request.url).origin===location.origin;
        const responseToCache = (response.ok && isSameOrigin) ? response.clone() : null;

        if(responseToCache){
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,responseToCache)).catch(()=>{});
        }

        return response;
      }).catch(()=>cached)
    )
  );
});
