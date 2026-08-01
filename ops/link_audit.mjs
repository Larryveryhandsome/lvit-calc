// 內部連結結構稽核：找出孤島頁（沒有任何其他頁面連過去）
// 孤島頁 Google 爬不到，等於不存在——即使它在 sitemap 裡
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const WEB = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app";
const SITE = "https://calc.zengzhisui.com";

const collect = async (dir, prefix) => {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".html") || e.name.includes(".bak-")) continue;
    out.push({ path: join(dir, e.name), url: prefix + (e.name === "index.html" ? "" : e.name) });
  }
  return out;
};

const pages = [
  ...(await collect(WEB, "/")),
  ...(await collect(join(WEB, "tools"), "/tools/")),
  ...(await collect(join(WEB, "articles"), "/articles/")),
  ...(await collect(join(WEB, "offer"), "/offer/")),
  ...(await collect(join(WEB, "legal"), "/legal/")),
  ...(await collect(join(WEB, "pro"), "/pro/")),
];

// 排除刻意 noindex 的頁面
const contents = new Map();
const indexable = [];
for (const p of pages) {
  const t = await readFile(p.path, "utf8");
  contents.set(p.url, t);
  if (!/<meta name="robots"[^>]*noindex/i.test(t)) indexable.push(p);
}

// 統計每頁被連入次數
const inbound = new Map(indexable.map((p) => [p.url, 0]));
const outbound = new Map();

for (const p of pages) {
  const t = contents.get(p.url);
  const links = new Set();
  for (const m of t.matchAll(/href="([^"]+)"/g)) {
    let h = m[1];
    if (h.startsWith(SITE)) h = h.slice(SITE.length);
    else if (h.startsWith("./")) h = p.url.replace(/[^/]*$/, "") + h.slice(2);
    else if (h.startsWith("../")) {
      const base = p.url.replace(/[^/]*$/, "");
      h = new URL(h, "http://x" + base).pathname;
    } else if (!h.startsWith("/")) continue;
    h = h.split("#")[0].split("?")[0];
    if (h.endsWith("/index.html")) h = h.slice(0, -10);
    if (!h) continue;
    links.add(h);
  }
  outbound.set(p.url, links);
  for (const l of links) {
    if (l !== p.url && inbound.has(l)) inbound.set(l, inbound.get(l) + 1);
  }
}

const orphans = [...inbound.entries()].filter(([, n]) => n === 0);
const weak = [...inbound.entries()].filter(([, n]) => n > 0 && n <= 2).sort((a, b) => a[1] - b[1]);

console.log(`可索引頁面：${indexable.length}`);
console.log(`\n孤島頁（0 個內部連結指向它，Google 難以發現）：${orphans.length}`);
for (const [u] of orphans) console.log(`  ✗ ${u}`);

console.log(`\n連入偏少（1–2 個）：${weak.length}`);
for (const [u, n] of weak.slice(0, 12)) console.log(`  ${n} ← ${u}`);

const outCounts = indexable.map((p) => ({ url: p.url, n: (outbound.get(p.url) || new Set()).size }));
const noOut = outCounts.filter((o) => o.n <= 3);
console.log(`\n對外連結過少（≤3 個，權重無法傳遞出去）：${noOut.length}`);
for (const o of noOut.slice(0, 10)) console.log(`  ${o.n} → ${o.url}`);
