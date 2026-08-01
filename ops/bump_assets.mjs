// Cache busting：把所有 HTML 的資產連結加上 ?v=<SW版本>，避免訪客拿到舊 CSS/JS 而破版
// 用法：node bump_assets.mjs   （版本號自動讀 sw.js 的 CACHE 常數）
import { readFile, writeFile, readdir } from "node:fs/promises";

const ROOT = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app";

const sw = await readFile(`${ROOT}/sw.js`, "utf8");
const ver = sw.match(/const CACHE = "lvit-v(\d+)"/)?.[1];
if (!ver) { console.error("找不到 sw.js 的 CACHE 版本號"); process.exit(1); }

// 要加版本參數的資產（相對路徑寫法皆會處理）
const ASSETS = ["styles.css", "articles.css", "app.js", "line-config.js", "i18n.js", "calc.js", "api.js",
  "pay-config.js", "cpi.js", "tw_codes.js", "crypto_compat.js"];

const files = [];
const walk = async (dir, prefix = "") => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (["node_modules", ".git"].includes(e.name)) continue;
      await walk(`${dir}/${e.name}`, `${prefix}${e.name}/`);
    } else if (e.name.endsWith(".html")) {
      files.push(`${dir}/${e.name}`);
    }
  }
};
await walk(ROOT);

let touched = 0;
for (const f of files) {
  let html = await readFile(f, "utf8");
  const before = html;
  for (const a of ASSETS) {
    // 先移除既有的 ?v=xx，再統一加上新版本（idempotent）
    const esc = a.replace(".", "\\.");
    html = html.replace(new RegExp(`(["'])([^"']*${esc})(\\?v=\\d+)?(["'])`, "g"),
      (_m, q1, path, _old, q2) => `${q1}${path}?v=${ver}${q2}`);
  }
  if (html !== before) { await writeFile(f, html, "utf8"); touched++; }
}

console.log(`cache-bust v${ver} 套用於 ${touched}/${files.length} 個 HTML`);
