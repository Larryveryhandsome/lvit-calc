// 極簡離線快取 — 首次瀏覽後可完全離線使用
const CACHE = "lvit-v28";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./line-config.js",
  "./app.js",
  "./calc.js",
  "./cpi.js",
  "./i18n.js",
  "./api.js",
  "./crypto_compat.js",
  "./tw_codes.js",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./sitemap.xml",
  "./og-image.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Network-first for navigations (HTML) so updates deploy cleanly,
  // fall back to cache offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Network-first for same-origin JS/CSS/JSON — 讓更新快速上線，離線才 fallback
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isCodeAsset = sameOrigin && /\.(js|css|json|webmanifest|xml)$/.test(url.pathname);

  if (isCodeAsset) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for images / fonts / etc.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((r) => {
        if (r.ok && sameOrigin) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      })
    )
  );
});
