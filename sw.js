// Bump this version any time you change a cached file, so phones pick up updates.
const CACHE_VERSION = "furniture-inventory-firebase-v4";

// This caches the app SHELL only (so it opens instantly, and the interface still
// shows even with no connection) — NOT the live inventory data. The data itself
// comes from Firestore, which needs real connectivity to sync changes between
// devices; Firestore has its own separate offline cache for previously-seen data
// (enabled in app.js via enableIndexedDbPersistence), independent of this file.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./app.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // Never intercept Firebase/Firestore traffic — let it hit the network directly
  // so real-time sync and auth behave normally (and predictably fail, rather than
  // silently serving stale cached responses, when there's genuinely no connection).
  if (url.includes("firestore.googleapis.com") || url.includes("googleapis.com") || url.includes("gstatic.com/firebasejs")) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
