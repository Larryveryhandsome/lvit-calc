// 重建 articles/index.html 的文章清單：標題/描述一律從各篇實際內容讀取，保證同步
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ART = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app/articles";
const INDEX = join(ART, "index.html");

// 新文插入位置：key 之後緊接著放 value
const INSERT_AFTER = {
  "urban-renewal-lvit": "land-consolidation-lvit-inheritance",
  "lvit-vs-house-tax": "land-value-increment-total-amount-deduction",
};

const idx = await readFile(INDEX, "utf8");

// 既有順序
const order = [...idx.matchAll(/href="\.\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]);

const files = (await readdir(ART))
  .filter((f) => f.endsWith(".html") && f !== "index.html" && !f.includes(".bak-"))
  .map((f) => f.replace(".html", ""));

// 依既有順序排，並在指定位置插入新文；剩下沒排到的補在最後
const seq = [];
for (const s of order) {
  if (!files.includes(s)) continue;      // 檔案已不存在就跳過
  seq.push(s);
  if (INSERT_AFTER[s] && files.includes(INSERT_AFTER[s])) seq.push(INSERT_AFTER[s]);
}
for (const f of files) if (!seq.includes(f)) seq.push(f);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const items = [];
for (const slug of seq) {
  const t = await readFile(join(ART, `${slug}.html`), "utf8");
  const title = ((t.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/｜留白事務所$/, "").trim();
  const desc = ((t.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "").trim();
  if (!title) { console.log(`  ! ${slug} 缺 title，跳過`); continue; }
  items.push(`  <li><a href="./${slug}.html"><div class="t">${esc(title)}</div><div class="d">${esc(desc)}</div></a></li>`);
}

const listRe = /(<ul class="article-list">)([\s\S]*?)(<\/ul>)/;
if (!listRe.test(idx)) { console.error("找不到 article-list"); process.exit(1); }
const out = idx.replace(listRe, (_m, a, _old, b) => `${a}\n${items.join("\n")}\n${b}`);
await writeFile(INDEX, out, "utf8");

console.log(`index.html 已重建：${items.length} 篇`);
for (const [after, added] of Object.entries(INSERT_AFTER)) {
  console.log(`  新文 ${added} 已插在 ${after} 之後：${seq.indexOf(added) === seq.indexOf(after) + 1 ? "是" : "否"}`);
}
