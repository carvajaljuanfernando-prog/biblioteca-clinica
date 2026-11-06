var V="bc-v10";
var ARCH=["./","index.html","standalone.js","jspdf.min.js","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",function(e){ e.waitUntil(caches.open(V).then(function(c){ return c.addAll(ARCH); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener("activate",function(e){ e.waitUntil(caches.keys().then(function(k){ return Promise.all(k.filter(function(x){ return x!==V; }).map(function(x){ return caches.delete(x); })); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener("fetch",function(e){
  var u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin) return; /* PubMed, Anthropic y fuentes: siempre red */
  e.respondWith(fetch(e.request).then(function(r){ var cp=r.clone(); caches.open(V).then(function(c){ c.put(e.request,cp); }); return r; }).catch(function(){ return caches.match(e.request).then(function(m){ return m||caches.match("index.html"); }); }));
});
