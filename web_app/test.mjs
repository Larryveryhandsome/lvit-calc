// 計算引擎驗證：node web_app/test.mjs（Node >= 18）
// 案例與 LINE 查詢服務（Python）的 tests/test_lvit_official.py 相同：2026-10-02 在財政部稅務入口網
// 「土地增值稅試算」逐案操作比對。官方試算只收前次移轉年月、物價指數要自己填，所以這裡指定同一個指數，
// 比的是公式本身（級距、減徵、自用面積上限、持分）。數字全部是合成的，不是任何真實地號。
import { calculateLVIT, holdingBand } from "./calc.js";
import { CPI_MONTH, getCPI } from "./cpi.js";

const T = new Date(2026, 9, 2);   // 本次移轉日＝比對當天 2026-10-02
// [案例, 公告現值, 前次移轉現值, 面積, 都市, 前次移轉民國年, 月, 分子, 分母, 官方自用, 官方一般, 官方試算填的物價指數]
const OFFICIAL = [
  ["C1 都市120㎡ 第三級", 80000, 20000, 120, true, 100, 6, 1, 1, 670_560, 1_813_920, 120.6],
  ["C2 非都市900㎡ 超面積 20–30年", 50000, 15000, 900, false, 92, 5, 1, 1, 3_424_500, 6_039_000, 135.0],
  ["C3 都市450㎡ 超面積 30–40年", 120000, 12000, 450, true, 79, 3, 1, 1, 7_317_000, 13_073_400, 178.0],
  ["C4 超過40年", 60000, 3000, 200, true, 69, 8, 1, 1, 1_061_820, 3_149_100, 230.3],
  ["C5 持分1/3 第一級", 40000, 25000, 330, true, 105, 1, 1, 3, 117_425, 234_850, 117.3],
  ["C6 滿240個月 第一級", 50000, 20000, 100, true, 95, 10, 1, 1, 241_200, 482_400, 129.4],
  ["C6b 滿240個月 第二級（官方已減徵）", 70000, 20000, 100, true, 95, 10, 1, 1, 441_200, 1_028_320, 129.4],
  ["C8 20年又1個月", 50000, 20000, 100, true, 95, 9, 1, 1, 241_400, 482_800, 129.3],
  ["C9 239個月 第二級（官方未減徵）", 70000, 20000, 100, true, 95, 11, 1, 1, 441_000, 1_064_000, 129.5],
  // C7：官方顯示 515,751（浮點誤差被進位）；精確值 515,750，本產品照精確值
  ["C7 持分1/3 除不盡", 90000, 25000, 100, true, 105, 1, 1, 3, 202_250, 515_750, 117.3],
];

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `：expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
};
const throws = (name, fn) => {
  try { fn(); check(name, "沒有報錯", "報錯"); } catch { check(name, true, true); }
};

console.log("── 財政部官方試算比對");
for (const [name, v, o, area, city, y, m, n, d, wantSelf, wantGen, cpi] of OFFICIAL) {
  const r = calculateLVIT({ landValue: v, landOrgValue: o, landArea: area, isCity: city, landYear: y, landMonth: m,
    landNumerator: n, landDenominator: d, targetDate: T, cpi });
  check(name, [r.landTaxValueSELF, r.landTaxValueNORMAL], [wantSelf, wantGen]);
}

console.log("── 邊界（照法條，與舊版不同處）");
const base = { landValue: 80000, landOrgValue: 20000, landArea: 120, isCity: true, landYear: 100, landMonth: 6,
  landDay: 15, landNumerator: 1, landDenominator: 1, targetDate: new Date(2026, 3, 21), cpi: 120.6 };
const run = (over) => calculateLVIT({ ...base, ...over });
const one = run({ landValue: 20000, landArea: 100, landOrgValue: 10000, landYear: 115, landMonth: 3, landDay: 1,
  targetDate: new Date(2026, 2, 20), cpi: 100 });
check("倍數恰 1 → 第二級、20 萬", [one.landMultiple, one.tierUsed, one.landTaxValueNORMAL], [1, "L2", 200_000]);
const two = run({ landValue: 30000, landArea: 100, landOrgValue: 10000, landYear: 115, landMonth: 3, landDay: 1,
  targetDate: new Date(2026, 2, 20), cpi: 100 });
check("倍數恰 2 → 第三級、50 萬", [two.landMultiple, two.tierUsed, two.landTaxValueNORMAL], [2, "L3", 500_000]);
const on = run({ landYear: 95, landMonth: 4, landDay: 21, targetDate: new Date(2026, 3, 21) });
const after = run({ landYear: 95, landMonth: 4, landDay: 21, targetDate: new Date(2026, 3, 22) });
check("恰滿 20 年當天不減徵、隔天減徵", [on.holdBand, after.holdBand, on.landTaxValueNORMAL > after.landTaxValueNORMAL], [0, 20, true]);
check("前次移轉月份要算（19 年 10 個月 vs 20 年 2 個月）",
  [holdingBand([2006, 6, 1], [2026, 4, 21]), holdingBand([2006, 2, 1], [2026, 4, 21])], [0, 20]);
check("閏日加年", [holdingBand([1996, 2, 29], [2026, 3, 1]), holdingBand([1986, 1, 1], [2026, 1, 2])], [30, 40]);
check("參考 App 案例（都市 120㎡、指數 120.6）", [run({}).landTaxValueNORMAL, run({}).landTaxValueSELF], [1_813_920, 670_560]);
check("持分一半 → 稅額一半", run({ landDenominator: 2 }).landTaxValueNORMAL, Math.floor(1_813_920 / 2));
check("沒漲價 → 0", [run({ landValue: 10000 }).landTaxValueNORMAL, run({ landValue: 10000 }).tierUsed], [0, "none"]);

console.log("── 物價表");
check(`表頭月份 民國${CPI_MONTH[0]}年${CPI_MONTH[1]}月＝100`, getCPI(...CPI_MONTH), 100);
const fromTable = run({ cpi: undefined, targetDate: new Date(2026, 9, 2) });
check("沒指定指數就查表（民國100年6月）", fromTable.landCPI, getCPI(100, 6));
check("表的適用期間內不提醒", fromTable.warnings, []);
const late = run({ cpi: undefined, targetDate: new Date(CPI_MONTH[0] + 1911, CPI_MONTH[1] + 2, 20) });
check("超過表的適用期間要提醒", late.warnings.some((w) => w.includes(`${CPI_MONTH[0]}年${CPI_MONTH[1]}月的表`)), true);
throws("表外的月份要報錯，不能預設", () => run({ cpi: undefined, landYear: CPI_MONTH[0] + 1, landMonth: 1, landDay: 1,
  targetDate: new Date(CPI_MONTH[0] + 1912, 5, 1) }));
throws("民國 47 年報錯", () => run({ landYear: 47 }));
throws("前次移轉不能晚於本次", () => run({ landYear: 115, landMonth: 4, landDay: 21 }));
throws("沒有 2 月 30 日", () => run({ landMonth: 2, landDay: 30 }));

console.log(`\n結果：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
