// 極簡離線快取 — 首次瀏覽後可完全離線使用
const CACHE = "lvit-v29";

// 爬蟲檔案永遠不經過快取：若站台真的掛了必須讓它明確失敗，
// 不能回傳快取的 HTML 把問題蓋掉（2026-07 曾因此讓 DNS 中斷數日未被發現）。
const NEVER_CACHE = /^\/(robots\.txt|sitemap\.xml|ads\.txt|.*\.well-known\/.*)$/;

// 離線 fallback 時注入橫幅，讓使用者知道看到的不是即時內容
const OFFLINE_BANNER = `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;padding:8px 14px;font:600 13px/1.5 system-ui,sans-serif;text-align:center">
⚠️ 目前無法連線，您看到的是先前存在裝置上的版本，內容可能不是最新的。
</div>`;
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

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // 爬蟲檔案：完全不介入，讓它直接對網路成功或失敗
  if (sameOrigin && NEVER_CACHE.test(url.pathname)) return;

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
        .catch(async () => {
          // 只回傳「這個 URL 自己」的快取；沒有就給首頁，
          // 絕不讓任意路徑都變成首頁（那會讓壞掉的站看起來是好的）
          const exact = await caches.match(req);
          const res = exact || (await caches.match("./index.html"));
          if (!res) return new Response("離線中，且此頁尚未快取。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
          const html = await res.text();
          return new Response(html.replace(/<body([^>]*)>/i, `<body$1>${OFFLINE_BANNER}`), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        })
    );
    return;
  }

  // Network-first for same-origin JS/CSS/JSON — 讓更新快速上線，離線才 fallback
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
