// calc.zengzhisui.com 正式靜態伺服器
// 由獨立的 lvit-tunnel 對外服務，不影響 brands-tunnel 上的其他站台。
// 標頭行為對齊原本 Netlify 的 _headers 設定。
import { createServer } from "node:http";
import { readFile, stat, appendFile } from "node:fs/promises";
import { extname, join, normalize, sep, dirname } from "node:path";

const ROOT = normalize("D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app");
const PORT = Number(process.env.PORT || 5900);
// 訂單落在網站目錄之外，避免被當成靜態檔案對外提供
const ORDERS = normalize(join(ROOT, "..", "orders.jsonl"));
const STATUS_FILE = normalize(join(ROOT, "..", "orders-status.jsonl"));

const MAX_BODY = 16 * 1024;        // 訂單頂多幾百 bytes，16KB 已極寬鬆
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;                // 同一來源每分鐘最多 5 筆
const rate = new Map();

// 走 Cloudflare Tunnel 時 socket IP 一律是 CF 的，真實來源在這個標頭
const clientIp = (req) =>
  (req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "unknown").toString();

const rateOk = (ip, now) => {
  const hits = (rate.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { rate.set(ip, hits); return false; }
  hits.push(now);
  rate.set(ip, hits);
  if (rate.size > 5000) rate.clear();   // 粗暴但足夠：防止 map 無限成長
  return true;
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

// 對齊 _headers
const cacheFor = (path) => {
  if (path === "/sw.js") return "no-cache";
  if (path === "/" || path.endsWith("/index.html")) return "public, max-age=0, must-revalidate";
  if (path === "/favicon.svg") return "public, max-age=604800";
  if (path === "/manifest.webmanifest") return "public, max-age=86400";
  if (path === "/sitemap.xml") return "public, max-age=3600";
  if (path === "/robots.txt" || path === "/ads.txt") return "public, max-age=3600";
  if (/\.(js|css)$/.test(path)) return "public, max-age=3600, must-revalidate";
  if (/\.(png|jpg|jpeg|webp|svg|ico)$/.test(path)) return "public, max-age=604800";
  return "public, max-age=300";
};

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

let hits = 0;
const log = (...a) => console.log(new Date().toISOString(), ...a);

createServer(async (req, res) => {
  const send = (code, body, headers = {}) => {
    res.writeHead(code, { ...SECURITY, ...headers });
    res.end(body);
  };

  // ── POST 端點：只開放收單與訂單查詢 ──────────────────
  if (req.method === "POST") {
    const url = new URL(req.url, "http://x");

    // 訂單查詢：客戶用訂單編號＋匯款末五碼自行取回報告網址，
    // 交付因此不需要寄信或發訊息。
    if (url.pathname === "/api/lookup") {
      const ip = clientIp(req);
      if (!rateOk(ip, Date.now())) {
        return send(429, JSON.stringify({ ok: false, error: "查詢過於頻繁，請稍後再試" }), { "Content-Type": "application/json; charset=utf-8" });
      }
      let body = "", tooBig = false;
      req.on("data", (c) => { if (tooBig) return; body += c; if (body.length > 2048) { tooBig = true; req.destroy(); } });
      req.on("end", async () => {
        if (tooBig) return send(413, JSON.stringify({ ok: false }), { "Content-Type": "application/json; charset=utf-8" });
        let d;
        try { d = JSON.parse(body); } catch { return send(400, JSON.stringify({ ok: false, error: "格式錯誤" }), { "Content-Type": "application/json; charset=utf-8" }); }
        const id = String(d?.id || "").trim().toUpperCase();
        const last5 = String(d?.last5 || "").trim();
        if (!id || !last5) return send(400, JSON.stringify({ ok: false, error: "請輸入訂單編號與匯款末五碼" }), { "Content-Type": "application/json; charset=utf-8" });
        try {
          const lines = (await readFile(ORDERS, "utf8")).trim().split("\n");
          const order = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .find((o) => o && o.id === id && o.last5 === last5);
          // 編號與末五碼都對才回應，避免用編號窮舉他人訂單
          if (!order) return send(404, JSON.stringify({ ok: false, error: "查無此訂單，請確認編號與末五碼是否正確" }), { "Content-Type": "application/json; charset=utf-8" });

          let reportUrl = null;
          try {
            const st = (await readFile(STATUS_FILE, "utf8")).trim().split("\n");
            const rec = st.map((l) => { try { return JSON.parse(l); } catch { return null; } })
              .filter((s) => s && s.id === id && s.reportUrl).pop();
            if (rec) reportUrl = rec.reportUrl;
          } catch {}

          send(200, JSON.stringify({ ok: true, id, at: order.at, ready: !!reportUrl, reportUrl }), { "Content-Type": "application/json; charset=utf-8" });
        } catch {
          send(500, JSON.stringify({ ok: false, error: "系統忙碌，請改用 LINE 聯繫" }), { "Content-Type": "application/json; charset=utf-8" });
        }
      });
      return;
    }

    if (url.pathname !== "/api/order") {
      return send(404, "not found", { "Content-Type": "text/plain; charset=utf-8" });
    }
    const ip = clientIp(req);
    if (!rateOk(ip, Date.now())) {
      log("RATE-LIMIT", ip);
      return send(429, JSON.stringify({ ok: false, error: "請稍後再試" }), { "Content-Type": "application/json; charset=utf-8" });
    }

    let body = "", tooBig = false;
    req.on("data", (c) => {
      if (tooBig) return;
      body += c;
      if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
    });
    req.on("end", async () => {
      if (tooBig) return send(413, JSON.stringify({ ok: false, error: "資料過長" }), { "Content-Type": "application/json; charset=utf-8" });
      let data;
      try { data = JSON.parse(body); } catch {
        return send(400, JSON.stringify({ ok: false, error: "格式錯誤" }), { "Content-Type": "application/json; charset=utf-8" });
      }
      // 必要欄位：沒有這兩項就無法核對款項與聯繫
      if (!data || typeof data !== "object" || !data.last5 || !data.contact) {
        return send(400, JSON.stringify({ ok: false, error: "請填寫匯款末五碼與聯絡方式" }), { "Content-Type": "application/json; charset=utf-8" });
      }
      const order = {
        id: "LV" + Date.now().toString(36).toUpperCase(),
        at: new Date().toISOString(),
        ip,
        ua: String(req.headers["user-agent"] || "").slice(0, 200),
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "").slice(0, 500)])),
      };
      try {
        await appendFile(ORDERS, JSON.stringify(order) + "\n", "utf8");
        log("ORDER", order.id, order.contact);
        send(200, JSON.stringify({ ok: true, id: order.id }), { "Content-Type": "application/json; charset=utf-8" });
      } catch (e) {
        log("ORDER-FAIL", e.message);
        send(500, JSON.stringify({ ok: false, error: "系統忙碌，請改用 LINE 聯繫" }), { "Content-Type": "application/json; charset=utf-8" });
      }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(405, "method not allowed", { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD, POST" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return send(400, "bad request", { "Content-Type": "text/plain; charset=utf-8" });
  }

  const cachePath = pathname;
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = normalize(join(ROOT, pathname));
  // 目錄逃逸防護
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    return send(403, "forbidden", { "Content-Type": "text/plain; charset=utf-8" });
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(301, { Location: cachePath.replace(/\/?$/, "/") });
      return res.end();
    }
    const data = await readFile(file);
    hits++;
    if (hits % 50 === 0) log(`served ${hits} requests`);
    send(200, req.method === "HEAD" ? "" : data, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": cacheFor(cachePath),
      "Content-Length": info.size,
      "Last-Modified": info.mtime.toUTCString(),
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      // 真 404：不做 SPA fallback。爬蟲必須拿到正確狀態碼。
      return send(404, "404 Not Found", { "Content-Type": "text/plain; charset=utf-8" });
    }
    log("ERROR", pathname, err.message);
    send(500, "500 Internal Server Error", { "Content-Type": "text/plain; charset=utf-8" });
  }
}).listen(PORT, "127.0.0.1", () => log(`lvit static server on http://127.0.0.1:${PORT} → ${ROOT}`));
