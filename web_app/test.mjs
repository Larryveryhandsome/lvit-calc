// 快速驗證腳本：使用 Node >= 18
// node test.mjs
import { calculateLVIT } from "./calc.js";

function approxEq(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

const cases = [
  {
    name: "都市 120㎡，民國 100/6 購入，今試算",
    input: {
      landValue: 80000,
      landOrgValue: 20000,
      landArea: 120,
      landYear: 100,
      landMonth: 6,
      landNumerator: 1,
      landDenominator: 1,
      isCity: true,
      // 以 Flutter App 本次計算日模擬，固定 targetDate 讓輸出穩定
      targetDate: new Date("2026-04-21T00:00:00"),
    },
    expect: {
      // Flutter 公式：
      //  todayNum = 115*365 + 4*30 + 21 = 42116
      //  holdYear = (42116 - 101*365 - 30 -1)/365 = 5220/365 ≈ 14.301
      landHoldYear: 14.301,
      landTransferArea: 120,
      landTransferValue: 9_600_000,
      landCPI: 120.6, // 民國 100/6 (CPI 表當期 115/3,2026-07-10 更新)
      landCPIValue: 2_894_400, // 20000*120.6/100 *120
      landTotalValue: 6_705_600,
      landMultiple: 2.3167, // 6705600/2894400
      landTaxLevel1: 1_341_120, // 6705600*0.2
      landTaxLevel2: 1_722_240, // 6705600*0.3 - 2894400*0.1
      landTaxLevel3: 1_813_920, // 6705600*0.4 - 2894400*0.3
      landTaxValueNORMAL: 1_813_920,
      landTaxValueSELF: 670_560, // 6705600*0.1
      isOver: false,
      tierUsed: "L3",
    },
  },

  {
    name: "都市超 300㎡ 試算 (500㎡)",
    input: {
      landValue: 100000,
      landOrgValue: 10000,
      landArea: 500,
      landYear: 80,
      landMonth: 1,
      landNumerator: 1,
      landDenominator: 1,
      isCity: true,
      targetDate: new Date("2026-04-21T00:00:00"),
    },
    // 自用稅額應為 300㎡ 內 10% + 超過部分依級距
    // 不逐一硬編碼，僅檢查結構
  },

  {
    name: "非都市 800㎡ 試算",
    input: {
      landValue: 50000,
      landOrgValue: 30000,
      landArea: 800,
      landYear: 95,
      landMonth: 3,
      landNumerator: 1,
      landDenominator: 1,
      isCity: false,
      targetDate: new Date("2026-04-21T00:00:00"),
    },
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = calculateLVIT(c.input);
  console.log(`\n── ${c.name}`);
  console.log(`  holdYear: ${r.landHoldYear.toFixed(4)}`);
  console.log(`  area:     ${r.landTransferArea.toFixed(2)} ㎡`);
  console.log(`  A (申報): ${r.landTransferValue.toLocaleString()}`);
  console.log(`  B (調整): ${r.landCPIValue.toLocaleString()}`);
  console.log(`  a (漲價): ${r.landTotalValue.toLocaleString()}`);
  console.log(`  倍數:      ${r.landMultiple.toFixed(4)}`);
  console.log(`  L1/L2/L3:  ${r.landTaxLevel1.toLocaleString()} / ${r.landTaxLevel2.toLocaleString()} / ${r.landTaxLevel3.toLocaleString()}`);
  console.log(`  NORMAL:    ${r.landTaxValueNORMAL.toLocaleString()} (${r.tierUsed})`);
  console.log(`  SELF:      ${r.landTaxValueSELF.toLocaleString()}  isOver=${r.isOver}`);

  if (c.expect) {
    for (const [k, v] of Object.entries(c.expect)) {
      const got = r[k];
      const ok = typeof v === "boolean" || typeof v === "string" ? got === v : approxEq(got, v);
      if (ok) { pass++; console.log(`  ✓ ${k} = ${got}`); }
      else { fail++; console.log(`  ✗ ${k} expected ${v}, got ${got}`); }
    }
  }
}

console.log(`\n結果：${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
