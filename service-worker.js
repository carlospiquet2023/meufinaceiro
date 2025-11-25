const CACHE_NAME = "meufin-cache-v1";
const ASSETS = [
  "./",
  "index.html",
  "entradas.html",
  "relatorio.html",
  "config.html",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/js/app.js",
  "assets/js/db.js",
  "assets/js/charts.js",
  "assets/js/report.js",
  "assets/js/email.js",
  "assets/js/whatsapp.js",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match("index.html"))
    )
  );
});
