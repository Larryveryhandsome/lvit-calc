// 台灣土地增值稅 (Land Value Increment Tax) 計算核心
// 本模組為純函式，無副作用；可在瀏覽器、Node、邊緣運算環境使用。
// 公式依據：平均地權條例 § 33、土地稅法 § 33、§ 34
//
// 2026-10-02 改版：與 LINE 查詢服務（Python core/lvit.py）逐行對齊，兩邊用同一組官方案例測試，
// 該版已與財政部稅務入口網「土地增值稅試算」逐案比對（10 組，9 組一元不差、1 組為官方浮點誤差差 1 元）。
// 與舊版（沿用原 Flutter App）不同之處——都是照法條修正：
//   1. 漲價倍數恰為 1 或 2 時，舊版算出 0 元 → 依官方「1(含)~2 倍為第二級、2 倍以上為第三級」歸級。
//   2. 持有年限改用真正的日曆日期（舊版只看前次移轉的年份、忽略月份，接近 20／30／40 年時會少減徵）。
//   3. 持有恰好滿 20／30／40 年（同月同日）：依條文「超過」，當天還不減徵，隔天起減徵。
//   4. 稅額元以下捨去。
// 不處理：改良土地費用、工程受益費、重劃負擔等扣除額，以及一生一次／一生一屋的資格判斷（兩種稅額都列出）。
//
// Glossary
// ─────────────────────────────────────────────────────────────
// landValue        公告土地現值 (申報移轉時點之公告現值，元 / 平方公尺)
// landOrgValue     原規定地價 或 前次移轉現值 (元 / 平方公尺)
// landArea         土地面積 (平方公尺)
// landYear/Month   前次移轉之民國年月；landDay 可省略（預設 1 日，與財政部試算只收年月一致）
// numerator/denom  移轉持分 (持分比例)
// isCity           都市土地 (true) / 非都市土地 (false)
// targetDate       本次移轉日期 (預設為今天)
// cpi              有官方數字（稅單、官方試算填的值）就直接用；沒給就查物價表

// 用命名空間匯入：瀏覽器若一時拿到快取的舊版 cpi.js（沒有 CPI_MONTH），也不會整頁載入失敗
import * as CPI_TABLE from "./cpi.js";

const { getCPI } = CPI_TABLE;
const CPI_MONTH = CPI_TABLE.CPI_MONTH ?? [CPI_TABLE.CPI_MAX_YEAR, CPI_TABLE.CPI[CPI_TABLE.CPI_MAX_YEAR].length];

/**
 * @typedef {Object} CalcInput
 * @property {number} landValue        公告現值 (元/㎡)
 * @property {number} landOrgValue     原地價 / 前次移轉現值 (元/㎡)
 * @property {number} landArea         土地面積 (㎡)
 * @property {number} landYear         前次移轉民國年
 * @property {number} landMonth        前次移轉月份 (1-12)
 * @property {number=} landDay         前次移轉日 (預設 1)
 * @property {number} landNumerator    移轉分子
 * @property {number} landDenominator  移轉分母
 * @property {boolean} isCity          是否為都市土地
 * @property {Date=} targetDate        本次移轉日期 (預設: 今天)
 * @property {number=} cpi             指定物價指數 (預設: 查表)
 */

/**
 * @typedef {Object} CalcResult
 * @property {number} landHoldYear     持有年限 (年，日數 ÷ 365.2425)
 * @property {number} holdBand         長期持有減徵區間 0／20／30／40（「超過」該年數才算）
 * @property {number} landTransferArea 該宗土地轉移面積 (㎡)
 * @property {number} landTransferValue 申報土地移轉現值 (元) — A
 * @property {number} landCPI          消費者物價指數
 * @property {number} landCPIValue     物價指數調整後原地價 (元) — B
 * @property {number} landTotalValue   土地漲價總數額 (元) — a = A − B
 * @property {number} landMultiple     漲價倍數 = a / B
 * @property {number} landTaxLevel1    按第一級稅率預估稅額
 * @property {number} landTaxLevel2    按第二級稅率預估稅額（已含長期持有減徵）
 * @property {number} landTaxLevel3    按第三級稅率預估稅額（已含長期持有減徵）
 * @property {number} landTaxValueNORMAL 按一般用地稅率預估稅額（元以下捨去）
 * @property {number} landTaxValueSELF   按自用住宅用地稅率預估稅額（元以下捨去）
 * @property {boolean} isOver          是否超過自用住宅面積上限 (都市 300㎡ / 非都市 700㎡)
 * @property {number} selfLimit        自用住宅面積上限
 * @property {string} tierUsed         實際適用級距 ("L1"/"L2"/"L3"/"none")
 * @property {string[]} warnings       警告訊息
 */

const ROC_EPOCH = 1911;

// 持有年限區間 → [第二級 a 係數, 第二級 B 係數, 第三級 a 係數, 第三級 B 係數]（財政部速算公式）
export const RATES = {
  0: [0.30, 0.10, 0.40, 0.30],
  20: [0.28, 0.08, 0.36, 0.24],
  30: [0.27, 0.07, 0.34, 0.21],
  40: [0.26, 0.06, 0.32, 0.18],
};
const SELF_LIMIT = { true: 300, false: 700 };   // 都市／非都市 自用住宅面積上限（㎡）

// 日期一律只看「年月日」，用 UTC 日數比較，避開時區與夏令時間
const dayNum = (y, m, d) => Date.UTC(y, m - 1, d) / 86_400_000;
const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

function addYears([y, m, d], n) {
  // 2/29 加年遇到平年 → 2/28
  if (m === 2 && d === 29 && new Date(Date.UTC(y + n, 1, 29)).getUTCMonth() !== 1) return [y + n, 2, 28];
  return [y + n, m, d];
}

/** 持有「超過」20／30／40 年 → 20／30／40；滿當天還不算超過。 */
export function holdingBand(prev, transfer) {
  const t = dayNum(...transfer);
  for (const years of [40, 30, 20]) {
    if (t > dayNum(...addYears(prev, years))) return years;
  }
  return 0;
}

/** 一般用地稅額（未捨去）與級距 */
export function generalTax(a, b, band) {
  if (a <= 0 || b <= 0) return [0, "none"];
  const m = a / b;
  const [r2a, r2b, r3a, r3b] = RATES[band];
  if (m < 1) return [a * 0.20, "L1"];
  if (m < 2) return [Math.max(a * r2a - b * r2b, 0), "L2"];
  return [Math.max(a * r3a - b * r3b, 0), "L3"];
}

/** 自用住宅用地稅額（未捨去）：上限內 10%，超過的部分照一般用地累進 */
export function selfUseTax(a, b, area, isCity, band) {
  if (a <= 0) return 0;
  const limit = SELF_LIMIT[Boolean(isCity)];
  if (area <= limit) return a * 0.10;
  const inside = limit / area;
  const [over] = generalTax(a * (1 - inside), b * (1 - inside), band);
  return a * inside * 0.10 + over;
}

/**
 * 主計總處約每月 7 日公布上個月的表；在下一張公布前，申報用的就是這張。
 * 例：115 年 8 月的表 → 適用 115/9/7 前後到 115/10/7 前後。抓寬一點：下個月整月＋再下個月 1–7 日。
 */
export function tableFits([y, m, d]) {
  const diff = (y - ROC_EPOCH) * 12 + m - (CPI_MONTH[0] * 12 + CPI_MONTH[1]);
  return diff === 1 || (diff === 2 && d <= 7);
}

/**
 * 主計算函式
 * @param {CalcInput} input
 * @returns {CalcResult}
 */
export function calculateLVIT(input) {
  const warnings = [];

  const {
    landValue,
    landOrgValue,
    landArea,
    landYear,
    landMonth,
    landDay = 1,
    landNumerator,
    landDenominator,
    isCity,
    targetDate = new Date(),
    cpi: cpiGiven = null,
  } = input;

  // ── 輸入驗證 ───────────────────────────────
  if (!(landValue > 0)) throw new Error("公告現值必須大於 0");
  if (!(landOrgValue > 0)) throw new Error("原地價 / 前次移轉現值必須大於 0");
  if (!(landArea > 0)) throw new Error("土地面積必須大於 0");
  if (!Number.isInteger(landYear) || landYear < 48)
    throw new Error("前次移轉年需為民國 48 年(含)以後");
  if (!Number.isInteger(landMonth) || landMonth < 1 || landMonth > 12)
    throw new Error("前次移轉月份需為 1 到 12");
  if (!(landNumerator > 0)) throw new Error("移轉分子需大於 0");
  if (!(landDenominator > 0)) throw new Error("移轉分母需大於 0");
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime()))
    throw new Error("本次移轉日期格式不正確");

  const prev = [landYear + ROC_EPOCH, landMonth, landDay];
  const transfer = ymd(targetDate);
  if (!Number.isInteger(landDay) || new Date(Date.UTC(prev[0], prev[1] - 1, landDay)).getUTCDate() !== landDay)
    throw new Error("前次移轉日期不存在");
  if (dayNum(...prev) >= dayNum(...transfer)) throw new Error("本次移轉日要晚於前次移轉日。");
  if (landNumerator > landDenominator) warnings.push("持分分子大於分母，請確認。");

  let cpi = cpiGiven;
  if (cpi == null) {
    cpi = getCPI(landYear, landMonth);
    if (cpi == null)
      throw new Error(`查不到 民國${landYear}年${landMonth}月 的物價指數（表內：民國48年1月～`
        + `${CPI_MONTH[0]}年${CPI_MONTH[1]}月），無法試算。`);
    if (!tableFits(transfer))
      warnings.push(`物價指數用的是民國${CPI_MONTH[0]}年${CPI_MONTH[1]}月的表，本次移轉在`
        + `民國${transfer[0] - ROC_EPOCH}年${transfer[1]}月；主計總處每月更新，數字可能有些微差異。`);
  }

  // ── 1. 持有年限 ───────────────────────────
  const landHoldYear = (dayNum(...transfer) - dayNum(...prev)) / 365.2425;
  const holdBand = holdingBand(prev, transfer);

  // ── 2. 面積與現值（運算順序與 Python 版相同，浮點結果才會一模一樣）────
  const landTransferArea = landArea * landNumerator / landDenominator;
  const landTransferValue = landValue * landTransferArea;

  // ── 3. 物價指數調整 ──────────────────────
  const landCPIValue = landOrgValue * cpi / 100 * landTransferArea;

  // ── 4. 漲價總數額與倍數 ──────────────────
  const landTotalValue = landTransferValue - landCPIValue;
  const landMultiple = landCPIValue !== 0 ? landTotalValue / landCPIValue : 0;

  // ── 5. 三級稅額（給明細表看；已含長期持有減徵）────
  const [r2a, r2b, r3a, r3b] = RATES[holdBand];
  const up = landTotalValue > 0;
  const landTaxLevel1 = up ? landTotalValue * 0.2 : 0;
  const landTaxLevel2 = up ? Math.max(landTotalValue * r2a - landCPIValue * r2b, 0) : 0;
  const landTaxLevel3 = up ? Math.max(landTotalValue * r3a - landCPIValue * r3b, 0) : 0;

  // ── 6. 一般用地／自用住宅用地 ─────────────
  const [general, tierUsed] = generalTax(landTotalValue, landCPIValue, holdBand);
  const self = selfUseTax(landTotalValue, landCPIValue, landTransferArea, isCity, holdBand);
  const selfLimit = SELF_LIMIT[Boolean(isCity)];

  return {
    landHoldYear,
    holdBand,
    landTransferArea,
    landTransferValue,
    landCPI: cpi,
    landCPIValue,
    landTotalValue,
    landMultiple,
    landTaxLevel1,
    landTaxLevel2,
    landTaxLevel3,
    landTaxValueNORMAL: Math.floor(general),
    landTaxValueSELF: Math.floor(self),
    isOver: landTransferArea > selfLimit,
    selfLimit,
    tierUsed,
    warnings,
  };
}

// ── 輔助函式 ────────────────────────────────
export function rocToWestern(rocYear) {
  return rocYear + ROC_EPOCH;
}
export function westernToRoc(year) {
  return year - ROC_EPOCH;
}
export function formatTWD(n, decimals = 0) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: decimals,
  }).format(n);
}
export function formatNum(n, decimals = 2) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}
