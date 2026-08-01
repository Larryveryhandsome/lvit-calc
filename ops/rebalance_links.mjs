// 重新平衡文章間的內部連結
// 問題：related 區塊的連結集中在少數熱門文章，21 篇長尾文章只有 1 個連入，
//       Google 會判定它們不重要。目標是讓每篇都被連到 4 次以上。
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ART = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app/articles";
const PER_PAGE = 5;   // 每篇的相關文章數（維持原本設計）
const CANDIDATES = 14; // 先取相似度前 N 名，再從中挑連入少的

const files = (await readdir(ART)).filter((f) => f.endsWith(".html") && f !== "index.html" && !f.includes(".bak-"));

// 主題詞：從 slug 與標題萃取，用來衡量相關性
const STOP = new Set(["html", "the", "and", "lvit", "tax", "land", "how", "to", "vs", "of"]);
const docs = new Map();
for (const f of files) {
  const t = await readFile(join(ART, f), "utf8");
  const slug = f.replace(".html", "");
  const title = ((t.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/｜土增稅神器$/, "").trim();
  const slugTokens = slug.split("-").filter((w) => w.length > 2 && !STOP.has(w));
  // 中文標題用 2-gram 取詞
  const zh = new Set();
  const clean = title.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < clean.length - 1; i++) zh.add(clean.slice(i, i + 2));
  docs.set(slug, { file: f, title, tokens: new Set([...slugTokens, ...zh]), html: t });
}

const sim = (a, b) => {
  let n = 0;
  for (const t of docs.get(a).tokens) if (docs.get(b).tokens.has(t)) n++;
  return n;
};

const slugs = [...docs.keys()];
const inbound = new Map(slugs.map((s) => [s, 0]));
const picks = new Map();

// 依「目前連入最少者優先被選」的貪婪法配置
for (const s of slugs) {
  const ranked = slugs
    .filter((o) => o !== s)
    .map((o) => ({ o, score: sim(s, o) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES);

  // 在相似度前段班中，挑目前連入最少的
  const chosen = ranked
    .sort((a, b) => (inbound.get(a.o) - inbound.get(b.o)) || (b.score - a.score))
    .slice(0, PER_PAGE)
    .map((x) => x.o);

  picks.set(s, chosen);
  for (const c of chosen) inbound.set(c, inbound.get(c) + 1);
}

// ── 修正階段 ──────────────────────────────────────────
// 貪婪配置有順序偏差：先處理的文章配置時所有人都還是 0，等於隨機選。
// 這裡把「連入過多者」的名額讓給「連入不足者」，直到無法再改善。
const MIN_IN = 4;
for (let pass = 0; pass < 40; pass++) {
  const needy = [...inbound.entries()].filter(([, n]) => n < MIN_IN).sort((a, b) => a[1] - b[1]);
  if (!needy.length) break;
  let moved = false;

  for (const [poor] of needy) {
    // 找一篇跟 poor 夠相關、且其名單中有「連入過剩」對象可替換的來源
    const sources = slugs
      .filter((s) => s !== poor && !picks.get(s).includes(poor))
      .map((s) => ({ s, score: sim(s, poor) }))
      .sort((a, b) => b.score - a.score);

    for (const { s } of sources) {
      const victim = picks.get(s)
        .filter((v) => v !== poor)
        .sort((a, b) => inbound.get(b) - inbound.get(a))[0];
      if (!victim || inbound.get(victim) <= MIN_IN + 1) continue;

      picks.set(s, picks.get(s).map((x) => (x === victim ? poor : x)));
      inbound.set(victim, inbound.get(victim) - 1);
      inbound.set(poor, inbound.get(poor) + 1);
      moved = true;
      break;
    }
  }
  if (!moved) break;
}

// 寫回 related 區塊
let changed = 0;
for (const s of slugs) {
  const d = docs.get(s);
  const items = picks.get(s)
    .map((o) => `<li><a href="./${o}.html">${docs.get(o).title}</a></li>`)
    .join("\n");
  const block = `<h2>相關文章</h2>\n<ul class="related-list">\n${items}\n</ul>`;

  const re = /<h2>相關文章<\/h2>\s*<ul class="related-list">[\s\S]*?<\/ul>/;
  if (!re.test(d.html)) { console.log(`  ! ${s} 找不到相關文章區塊`); continue; }
  const out = d.html.replace(re, block);
  if (out !== d.html) { await writeFile(join(ART, d.file), out, "utf8"); changed++; }
}

const counts = [...inbound.values()];
const min = Math.min(...counts), max = Math.max(...counts);
const under = [...inbound.entries()].filter(([, n]) => n < 3);

console.log(`重寫 ${changed} 篇的相關文章區塊`);
console.log(`連入分布：最少 ${min}／最多 ${max}／平均 ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}`);
console.log(`連入 < 3 的文章：${under.length}${under.length ? " → " + under.map(([s]) => s).join(", ") : ""}`);
