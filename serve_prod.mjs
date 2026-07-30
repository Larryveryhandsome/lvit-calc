// calc.zengzhisui.com 正式靜態伺服器
// 由獨立的 lvit-tunnel 對外服務，不影響 brands-tunnel 上的其他站台。
// 標頭行為對齊原本 Netlify 的 _headers 設定。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const ROOT = normalize("D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app");
const PORT = Number(process.env.PORT || 5900);

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

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(405, "method not allowed", { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
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
