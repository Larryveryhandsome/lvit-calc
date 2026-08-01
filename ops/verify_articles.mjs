// 全站文章健檢：禁用詞、結構、canonical、內部死連結
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app";
const ART = join(ROOT, "articles");
const SITE = "https://calc.zengzhisui.com";

// 法遵紅線（地政士法§49／公平法§21／消保法§22）
const BANNED = [
  { re: /代辦/g, why: "地政士法§49：不得表示代辦" },
  { re: /保證(省|可省|節省|退|過|沒問題)/g, why: "公平法§21：保證性宣稱" },
  { re: /一定(省|可省|能省|會過)/g, why: "絕對性宣稱" },
  { re: /國稅局.{0,6}查不到|不會被查|規避查核/g, why: "逃漏稅暗示" },
  // 只抓保證語境；純百分比是稅率級距的正常用語（如「未達100%部分適用20%」）
  { re: /100%\s*(保證|過件|沒問題)|保證\s*100%|百分之百保證/g, why: "絕對性宣稱" },
  { re: /代理申報|代客申報|代為申報/g, why: "地政士法§16 專屬業務" },
];

const files = (await readdir(ART)).filter((f) => f.endsWith(".html") && !f.includes(".bak-"));
const existing = new Set(files.map((f) => `${SITE}/articles/${f}`));
const toolFiles = (await readdir(join(ROOT, "tools"))).filter((f) => f.endsWith(".html"));
for (const t of toolFiles) existing.add(`${SITE}/tools/${t}`);
existing.add(`${SITE}/`);
existing.add(`${SITE}/articles/`);
// 其餘可被文章連到的區塊
for (const dir of ["pro", "offer", "legal", "r"]) {
  let fs2 = [];
  try { fs2 = (await readdir(join(ROOT, dir))).filter((f) => f.endsWith(".html")); } catch { continue; }
  existing.add(`${SITE}/${dir}/`);
  for (const f of fs2) existing.add(`${SITE}/${dir}/${f}`);
}

let problems = 0;
const titles = new Map();

for (const f of files) {
  if (f === "index.html") continue;
  const t = await readFile(join(ART, f), "utf8");
  const issues = [];

  // 禁用詞
  for (const b of BANNED) {
    const m = t.match(b.re);
    if (m) issues.push(`禁用詞 ${[...new Set(m)].join("/")} — ${b.why}`);
  }

  // 結構
  const h1s = (t.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) issues.push(`H1 數量 = ${h1s}（應為 1）`);
  const title = (t.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
  if (!title) issues.push("缺 title");
  else {
    if (titles.has(title)) issues.push(`title 與 ${titles.get(title)} 重複`);
    titles.set(title, f);
  }
  const canon = (t.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
  const expect = `${SITE}/articles/${f}`;
  if (canon !== expect) issues.push(`canonical 不符：${canon} ≠ ${expect}`);
  const desc = (t.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  if (!desc) issues.push("缺 description");
  else if (desc.length > 110) issues.push(`description 過長 ${desc.length} 字`);

  // 標籤平衡（粗略）
  const openA = (t.match(/<article[\s>]/g) || []).length;
  const closeA = (t.match(/<\/article>/g) || []).length;
  if (openA !== closeA) issues.push(`article 標籤不平衡 ${openA}/${closeA}`);
  const openT = (t.match(/<table[\s>]/g) || []).length;
  const closeT = (t.match(/<\/table>/g) || []).length;
  if (openT !== closeT) issues.push(`table 標籤不平衡 ${openT}/${closeT}`);

  // 內部死連結
  for (const m of t.matchAll(/href="(https:\/\/calc\.zengzhisui\.com[^"#?]*)"/g)) {
    const u = m[1];
    if (!existing.has(u) && !existing.has(u.replace(/\/$/, "/"))) {
      issues.push(`死連結 ${u}`);
    }
  }

  if (issues.length) {
    problems++;
    console.log(`\n✗ ${f}`);
    for (const i of [...new Set(issues)]) console.log(`    ${i}`);
  }
}

console.log(`\n檢查 ${files.length - 1} 篇文章，有問題 ${problems} 篇`);
