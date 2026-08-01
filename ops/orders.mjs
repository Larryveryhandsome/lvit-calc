// 訂單管理：看單、追狀態、接報告產生
//   node ops/orders.mjs               列出待處理訂單
//   node ops/orders.mjs --all         含已處理與測試單
//   node ops/orders.mjs --show <id>   看單一訂單完整內容
//   node ops/orders.mjs --done <id>   標記為已交付
//
// 訂單存在 web_app 之外的 orders.jsonl（不對外提供、已列入 .gitignore）
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = dirname(dirname(fileURLToPath(import.meta.url)));
const ORDERS = join(BASE, "orders.jsonl");
const STATUS = join(BASE, "orders-status.jsonl");

const load = async (p) => {
  try {
    const t = await readFile(p, "utf8");
    return t.trim() ? t.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  } catch { return []; }
};

// 測試單判定：我自己打進去的驗證資料，不該混在真實訂單裡
const isTest = (o) =>
  /測試|test/i.test(o.note || "") ||
  /example\.com|test@/i.test(o.contact || "") ||
  o.ip === "127.0.0.1";

const orders = await load(ORDERS);
const statuses = await load(STATUS);
const doneIds = new Set(statuses.filter((s) => s.status === "done").map((s) => s.id));

const args = process.argv.slice(2);
const showId = args[args.indexOf("--show") + 1];
const doneId = args[args.indexOf("--done") + 1];
const all = args.includes("--all");

if (args.includes("--done")) {
  if (!doneId || !orders.find((o) => o.id === doneId)) { console.error(`找不到訂單 ${doneId}`); process.exit(1); }
  await appendFile(STATUS, JSON.stringify({ id: doneId, status: "done", at: new Date().toISOString() }) + "\n", "utf8");
  console.log(`✓ ${doneId} 已標記為已交付`);
  process.exit(0);
}

if (args.includes("--show")) {
  const o = orders.find((x) => x.id === showId);
  if (!o) { console.error(`找不到訂單 ${showId}`); process.exit(1); }
  console.log(`訂單 ${o.id}${isTest(o) ? "  ⚠ 測試單" : ""}${doneIds.has(o.id) ? "  ✓ 已交付" : ""}`);
  console.log(`收單時間  ${o.at}`);
  console.log(`商品      ${o.product || "-"}  NT$${o.amount || "-"}`);
  console.log(`聯絡      ${o.contact}`);
  console.log(`匯款末五碼 ${o.last5}`);
  if (o.invoice || o.taxId) console.log(`發票      ${o.invoice || "-"} / 統編 ${o.taxId || "-"}`);
  console.log("\n── 案件資料 ──");
  console.log(`公告現值    ${o.value || "(未填)"} 元/㎡`);
  console.log(`前次移轉現值 ${o.org || "(未填)"} 元/㎡`);
  console.log(`面積        ${o.area || "(未填)"} ㎡`);
  console.log(`前次移轉    ${o.when || "(未填)"}`);
  console.log(`土地類型    ${o.urban || "-"}   自用要件 ${o.selfUse || "-"}`);
  if (o.sale || o.cost) console.log(`房地交易    成交 ${o.sale || "-"} 萬 / 成本 ${o.cost || "-"} 萬`);
  if (o.note) console.log(`\n備註：${o.note}`);

  const missing = ["value", "org", "area", "when"].filter((k) => !o[k]);
  if (missing.length) console.log(`\n⚠ 缺必要欄位：${missing.join(", ")} — 需先向客戶補齊才能產報告`);
  else console.log(`\n可產出報告：node scratchpad/gen_report.mjs --order ${o.id}`);
  process.exit(0);
}

// 列表
const real = orders.filter((o) => all || !isTest(o));
const pending = real.filter((o) => !doneIds.has(o.id));

console.log(`訂單總數 ${orders.length}（測試單 ${orders.filter(isTest).length}）｜待處理 ${pending.length}\n`);

if (!real.length) { console.log("目前沒有訂單。"); process.exit(0); }

for (const o of real) {
  const flags = [isTest(o) ? "測試" : "", doneIds.has(o.id) ? "已交付" : "待處理"].filter(Boolean).join(" ");
  const missing = ["value", "org", "area", "when"].filter((k) => !o[k]);
  console.log(`${o.id}  ${o.at.slice(0, 16).replace("T", " ")}  ${String(o.contact).slice(0, 28).padEnd(30)} 末五碼 ${o.last5}  [${flags}]${missing.length ? "  ⚠ 缺 " + missing.length + " 欄" : ""}`);
}

console.log(`\n看細節：node ops/orders.mjs --show <id>`);
