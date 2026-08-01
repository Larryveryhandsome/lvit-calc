// 用官方公開範例驗算兩個新試算器的稅率常數與計算邏輯
// 常數直接從上線的 HTML 抽出，確保驗的是實際跑的值，不是複製品
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(dirname(fileURLToPath(import.meta.url))), "web_app");

const gift = await readFile(join(WEB, "tools/gift-tax.html"), "utf8");
const deed = await readFile(join(WEB, "tools/deed-tax.html"), "utf8");

// ── 從 HTML 抽出常數 ────────────────────────────────
const EXEMPTION = Number((gift.match(/var EXEMPTION = (\d+)/) || [])[1]);
const BRACKETS = [...gift.matchAll(/\{ cap: (\d+|Infinity),\s*rate: ([\d.]+),\s*qd: (\d+) \}/g)]
  .map((m) => ({ cap: m[1] === "Infinity" ? Infinity : Number(m[1]), rate: Number(m[2]), qd: Number(m[3]) }));

const RATES = {};
for (const m of deed.matchAll(/(\w+):\s*\{ name: "([^"]+)",\s*rate: ([\d.]+)/g)) {
  RATES[m[1]] = { name: m[2], rate: Number(m[3]) };
}
const DIFF_RATE = Number((deed.match(/var DIFF_RATE = ([\d.]+)/) || [])[1]);

// ── 重現計算邏輯（與 HTML 中一致）──────────────────
function giftTax({ value, prior = 0, lvit = 0, deedTax = 0, burden = 0, paid = 0, payFor = false }) {
  const addBack = payFor ? lvit + deedTax : 0;
  const gross = prior + value + addBack;
  const burdenCapped = Math.min(burden, value);
  const deduct = lvit + deedTax + burdenCapped;
  const net = Math.max(0, gross - deduct - EXEMPTION);
  let b = BRACKETS[0];
  for (const br of BRACKETS) { if (net <= br.cap) { b = br; break; } }
  const taxYTD = Math.max(0, net * b.rate - b.qd);
  return { net, taxYTD, due: Math.max(0, taxYTD - paid), rate: b.rate };
}

function deedTaxCalc(type, value, other = 0) {
  const cfg = RATES[type];
  if (type === "swap" || type === "split") {
    const equalPart = Math.min(value, other);
    const diffPart = Math.max(0, value - other);
    return equalPart * cfg.rate + diffPart * DIFF_RATE;
  }
  return value * cfg.rate;
}

// ── 官方公開範例 ────────────────────────────────────
const cases = [
  { g: "贈與稅", name: "案例1 未達免稅額（贈與現金 200 萬）",
    got: () => giftTax({ value: 2000000 }).due, want: 0 },
  { g: "贈與稅", name: "案例2 跨第二級距（贈與 4,000 萬）",
    got: () => giftTax({ value: 40000000 }).due, want: 4228500 },
  // 年度合併：淨額 47,560,000 落第二級 → 5,728,500，扣第一次已繳 2,756,000
  // 反例：若第二次獨立計算並再減一次免稅額只會得到 1,756,000，短漏 1,216,500
  { g: "贈與稅", name: "案例3 同年度二次贈與合併（3,000萬後再贈 2,000萬）",
    got: () => giftTax({ value: 20000000, prior: 30000000, paid: 2756000 }).due, want: 2972500 },
  { g: "贈與稅", name: "案例3 反例·免稅額不得重複減除（獨立算會短漏）",
    got: () => giftTax({ value: 20000000 }).due, want: 1756000 },
  { g: "贈與稅", name: "案例4A 財政部範例·受贈人自繳（900萬，扣土增稅契稅 129萬）",
    got: () => giftTax({ value: 9000000, lvit: 1290000 }).due, want: 527000 },
  { g: "贈與稅", name: "案例4B 財政部範例·贈與人代繳",
    got: () => giftTax({ value: 9000000, lvit: 1290000, payFor: true }).due, want: 656000 },

  { g: "契稅", name: "案例1 買賣（評定現值 185 萬，成交價 2,280 萬不影響）",
    got: () => deedTaxCalc("sale", 1850000), want: 111000 },
  { g: "契稅", name: "案例2 贈與（評定現值 96 萬）",
    got: () => deedTaxCalc("gift", 960000), want: 57600 },
  { g: "契稅", name: "案例3 交換·甲（取得 120萬、讓出 100萬）",
    got: () => deedTaxCalc("swap", 1200000, 1000000), want: 32000 },
  { g: "契稅", name: "案例3 交換·乙（取得 100萬、讓出 120萬，無差額）",
    got: () => deedTaxCalc("swap", 1000000, 1200000), want: 20000 },
  { g: "契稅", name: "案例4 逾期案之本稅（評定現值 80 萬）",
    got: () => deedTaxCalc("sale", 800000), want: 48000 },
  { g: "契稅", name: "典權 4%（評定現值 100 萬）",
    got: () => deedTaxCalc("dian", 1000000), want: 40000 },
];

console.log(`抽出常數：免稅額 ${EXEMPTION.toLocaleString()}｜級距 ${BRACKETS.length} 級｜契稅類型 ${Object.keys(RATES).length} 種｜差額稅率 ${DIFF_RATE}`);
console.log(`級距：${BRACKETS.map((b) => `≤${b.cap === Infinity ? "∞" : b.cap.toLocaleString()} ${b.rate * 100}% 差額${b.qd.toLocaleString()}`).join(" ／ ")}\n`);

let pass = 0, fail = 0;
for (const c of cases) {
  const got = Math.round(c.got());
  const ok = got === c.want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${c.g}] ${c.name}`);
  if (!ok) console.log(`        得到 ${got.toLocaleString()}，應為 ${c.want.toLocaleString()}（差 ${(got - c.want).toLocaleString()}）`);
}

console.log(`\n通過 ${pass} / ${cases.length}${fail ? `，失敗 ${fail}` : ""}`);
process.exit(fail ? 1 : 0);
