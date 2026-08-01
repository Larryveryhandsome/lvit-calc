// 訂單監看：有新訂單就輸出一行事件
//   node ops/watch_orders.mjs
// 刻意不輸出 Email 或末五碼——事件會進到對話訊息，客戶個資不該出現在那裡。
// 要看細節用：node ops/orders.mjs --show <id>
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = dirname(dirname(fileURLToPath(import.meta.url)));
const ORDERS = join(BASE, "orders.jsonl");
const POLL_MS = 30_000;

const load = async () => {
  try {
    const t = await readFile(ORDERS, "utf8");
    if (!t.trim()) return [];
    return t.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
};

const isTest = (o) =>
  /測試|test/i.test(o.note || "") || /example\.com|test@|test\.local/i.test(o.contact || "") || o.ip === "127.0.0.1";

// 啟動時先記住現況，只回報之後進來的訂單
let seen = new Set((await load()).map((o) => o.id));
console.log(`監看啟動，已知訂單 ${seen.size} 筆（含測試單）`);

const NEED = [["value", "公告現值"], ["org", "前次移轉現值"], ["area", "面積"], ["when", "前次移轉年月"]];

while (true) {
  try {
    const orders = await load();
    for (const o of orders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      if (isTest(o)) { console.log(`（測試單 ${o.id}，略過）`); continue; }

      const missing = NEED.filter(([k]) => !o[k] || !String(o[k]).trim());
      const state = missing.length
        ? `需補件：缺 ${missing.map(([, label]) => label).join("、")}`
        : "資料齊全，可直接產報告";
      console.log(`🔔 新訂單 ${o.id}｜${o.product || "未註明商品"} NT$${o.amount || "?"}｜${state}`);
    }
  } catch (e) {
    console.log(`監看讀取失敗：${e.message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
