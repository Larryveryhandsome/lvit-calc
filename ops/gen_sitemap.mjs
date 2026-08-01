// 掃描實際磁碟內容產生 sitemap.xml，不依賴任何 workflow 輸出
import { readdir, stat, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app";
const SITE = "https://calc.zengzhisui.com";

// 優先度：首頁 > 工具 > 文章索引 > 文章
const priorityFor = (url) => {
  if (url === `${SITE}/`) return "1.0";
  if (url.includes("/tools/")) return "0.9";
  if (url.endsWith("/articles/")) return "0.8";
  if (url.includes("/pro/")) return "0.7";
  return "0.7";
};

const collect = async (dir, urlPrefix) => {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".html")) continue;
    if (e.name.includes(".bak-")) continue;
    const full = join(dir, e.name);
    const info = await stat(full);
    const url = e.name === "index.html" ? `${SITE}${urlPrefix}` : `${SITE}${urlPrefix}${e.name}`;
    out.push({ loc: url, lastmod: info.mtime.toISOString().slice(0, 10) });
  }
  return out;
};

const urls = [
  ...(await collect(ROOT, "/")),
  ...(await collect(join(ROOT, "tools"), "/tools/")),
  ...(await collect(join(ROOT, "articles"), "/articles/")),
  ...(await collect(join(ROOT, "pro"), "/pro/")),
  ...(await collect(join(ROOT, "en"), "/en/")),
  ...(await collect(join(ROOT, "offer"), "/offer/")).filter((u) => !u.loc.endsWith("pay.html")), // 付款頁 noindex，不進 sitemap
  ...(await collect(join(ROOT, "legal"), "/legal/")),
];

// 去重並排序（首頁在最前）
const seen = new Set();
const uniq = urls.filter((u) => (seen.has(u.loc) ? false : seen.add(u.loc)));
uniq.sort((a, b) => Number(priorityFor(b.loc)) - Number(priorityFor(a.loc)) || a.loc.localeCompare(b.loc));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniq.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${priorityFor(u.loc)}</priority>
  </url>`).join("\n")}
</urlset>
`;

await writeFile(join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`sitemap.xml 已重建：${uniq.length} 個 URL`);
for (const g of ["/tools/", "/articles/", "/pro/", "/en/"]) {
  console.log(`  ${g.padEnd(12)} ${uniq.filter((u) => u.loc.includes(g)).length}`);
}
console.log(`  ${"根層".padEnd(11)} ${uniq.filter((u) => u.loc.replace(SITE + "/", "").split("/").length === 1).length}`);
const has = uniq.some((u) => u.loc.endsWith("/tools/report.html"));
console.log(`report.html 已納入：${has ? "是" : "否"}`);
