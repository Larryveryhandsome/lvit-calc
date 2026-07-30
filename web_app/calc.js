// 台灣土地增值稅 (Land Value Increment Tax) 計算核心
// 本模組為純函式，無副作用；可在瀏覽器、Node、邊緣運算環境使用。
// 計算邏輯完全對應原 Flutter App (land_price_calc_app/lib/classes.dart → AData)
// 公式依據：平均地權條例 § 33、土地稅法 § 33、§ 34
//
// Glossary
// ─────────────────────────────────────────────────────────────
// landValue        公告土地現值 (申報移轉時點之公告現值，元 / 平方公尺)
// landOrgValue     原規定地價 或 前次移轉現值 (元 / 平方公尺)
// landArea         土地面積 (平方公尺)
// landYear/Month   前次移轉之民國年月
// numerator/denom  移轉持分 (持分比例)
// isCity           都市土地 (true) / 非都市土地 (false)
// targetDate       本次移轉日期 (預設為今天)

import { getCPI } from "./cpi.js";

/**
 * @typedef {Object} CalcInput
 * @property {number} landValue        公告現值 (元/㎡)
 * @property {number} landOrgValue     原地價 / 前次移轉現值 (元/㎡)
 * @property {number} landArea         土地面積 (㎡)
 * @property {number} landYear         前次移轉民國年
 * @property {number} landMonth        前次移轉月份 (1-12)
 * @property {number} landNumerator    移轉分子
 * @property {number} landDenominator  移轉分母
 * @property {boolean} isCity          是否為都市土地
 * @property {Date=} targetDate        本次移轉日期 (預設: 今天)
 */

/**
 * @typedef {Object} CalcResult
 * @property {number} landHoldYear     持有年限 (年)
 * @property {number} landTransferArea 該宗土地轉移面積 (㎡)
 * @property {number} landTransferValue 申報土地移轉現值 (元) — A
 * @property {number} landCPI          消費者物價指數
 * @property {number} landCPIValue     物價指數調整後原地價 (元) — B
 * @property {number} landTotalValue   土地漲價總數額 (元) — a = A − B
 * @property {number} landMultiple     漲價倍數 = a / B
 * @property {number} landTaxLevel1    按第一級稅率預估稅額
 * @property {number} landTaxLevel2    按第二級稅率預估稅額
 * @property {number} landTaxLevel3    按第三級稅率預估稅額
 * @property {number} landTaxValueNORMAL 按一般用地稅率預估稅額
 * @property {number} landTaxValueSELF   按自用住宅用地稅率預估稅額
 * @property {boolean} isOver          是否超過自用住宅面積上限 (都市 300㎡ / 非都市 700㎡)
 * @property {number} selfLimit        自用住宅面積上限
 * @property {string} tierUsed         實際適用級距 ("L1"/"L2"/"L3"/"none")
 * @property {string[]} warnings       警告訊息
 */

const ROC_EPOCH = 1911;

/**
 * 將 Date 物件轉成 Flutter App 使用的 todayNum (民國年*365 + 月*30 + 日)。
 * 此為刻意保留原 App 採用的簡化日期算法，確保網頁版結果與手機 App 一致。
 */
function dateToRocNum(date) {
  const y = date.getFullYear() - ROC_EPOCH;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y * 365 + m * 30 + d;
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
    landNumerator,
    landDenominator,
    isCity,
    targetDate = new Date(),
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
  if (landNumerator > landDenominator) warnings.push("移轉分子大於分母，請確認持分是否正確。");

  const cpi = getCPI(landYear, landMonth);
  if (cpi == null)
    throw new Error(`查無民國 ${landYear} 年 ${landMonth} 月之消費者物價指數資料`);

  // ── 1. 持有年限 ───────────────────────────
  // 依照原 Flutter App：以簡化 1 年=365 日、1 月=30 日換算
  const todayNum = dateToRocNum(targetDate);
  const landHoldYear =
    (todayNum - (landYear + 1) * 365 - 30 - 1) / 365;

  if (landHoldYear < 0)
    warnings.push("持有年限為負值，表示本次移轉日早於前次移轉日。");

  // ── 2. 面積與現值 ────────────────────────
  const landTransferArea = (landArea * landNumerator) / landDenominator;
  const landTransferValue = landValue * landTransferArea;

  // ── 3. 物價指數調整 ──────────────────────
  const landCPIValue = (landOrgValue * cpi) / 100 * landTransferArea;

  // ── 4. 漲價總數額與倍數 ──────────────────
  const landTotalValue = landTransferValue - landCPIValue;
  const landMultiple = landCPIValue !== 0 ? landTotalValue / landCPIValue : 0;

  // ── 5. 三級累進稅額 ──────────────────────
  // 第一級：a × 20%
  const landTaxLevel1 = landTotalValue * 0.2;

  // 第二級 / 第三級 依持有年限給予長期減徵
  let landTaxLevel2 = 0;
  let landTaxLevel3 = 0;
  const hy = landHoldYear;

  if (hy < 20) {
    landTaxLevel2 = landTotalValue * 0.30 - landCPIValue * 0.10;
    landTaxLevel3 = landTotalValue * 0.40 - landCPIValue * 0.30;
  } else if (hy > 20 && hy < 30) {
    landTaxLevel2 = landTotalValue * 0.28 - landCPIValue * 0.08;
    landTaxLevel3 = landTotalValue * 0.36 - landCPIValue * 0.24;
  } else if (hy > 30 && hy < 40) {
    landTaxLevel2 = landTotalValue * 0.27 - landCPIValue * 0.07;
    landTaxLevel3 = landTotalValue * 0.34 - landCPIValue * 0.21;
  } else if (hy >= 40) {
    landTaxLevel2 = landTotalValue * 0.26 - landCPIValue * 0.06;
    landTaxLevel3 = landTotalValue * 0.32 - landCPIValue * 0.18;
  } else {
    // hy 落在 20 / 30 / 40 整數點上（原 App 不處理的邊界）
    warnings.push("持有年限正好落在長期優惠級距邊界 (20/30/40 年)，稅額採用 < 20 年之費率估算。");
    landTaxLevel2 = landTotalValue * 0.30 - landCPIValue * 0.10;
    landTaxLevel3 = landTotalValue * 0.40 - landCPIValue * 0.30;
  }

  // ── 6. 按一般用地稅率預估 ─────────────────
  let landTaxValueNORMAL = 0;
  let tierUsed = "none";
  if (landMultiple > 0 && landMultiple < 1) {
    landTaxValueNORMAL = landTaxLevel1;
    tierUsed = "L1";
  } else if (landMultiple > 1 && landMultiple < 2) {
    landTaxValueNORMAL = landTaxLevel2;
    tierUsed = "L2";
  } else if (landMultiple >= 2) {
    landTaxValueNORMAL = landTaxLevel3;
    tierUsed = "L3";
  }
  if (landTaxValueNORMAL < 0) landTaxValueNORMAL = 0;

  // ── 7. 按自用住宅用地稅率預估 ─────────────
  // 都市 300㎡ / 非都市 700㎡ 以下皆 10%
  // 超過部分依一般用地稅率計算
  const selfLimit = isCity ? 300 : 700;
  const isOver = landTransferArea > selfLimit;

  let landTaxValueSELF = Math.max(landTotalValue * 0.1, 0);

  if (isOver) {
    const areaReal = landTransferArea;
    const portionInLimit = selfLimit / areaReal;

    // 300/700 ㎡ 內：漲價總數額 × 10%
    const aInLimit = landTotalValue * portionInLimit;
    const taxInLimit = aInLimit * 0.1;

    // 超過部分：改用一般用地稅率累進
    const aOverLimit = landTotalValue - aInLimit;
    const bAdj = (areaReal - selfLimit) / areaReal;
    const bOver = landCPIValue * bAdj;

    let taxOverLimit = 0;
    if (landMultiple < 1.0) {
      // 一律 20%，不扣減
      taxOverLimit = aOverLimit * 0.2;
    } else if (landMultiple < 2.0) {
      if (hy < 20) {
        taxOverLimit = aOverLimit * 0.30 - bOver * 0.10;
      } else if (hy > 20 && hy < 30) {
        taxOverLimit = aOverLimit * 0.28 - bOver * 0.08;
      } else if (hy > 30 && hy < 40) {
        taxOverLimit = aOverLimit * 0.27 - bOver * 0.07;
      } else if (hy >= 40) {
        // 2026-07-10 修正: 依土地稅法§33 持有>40年減徵40%,速算係數應為 b×6%
        // (原 Flutter App 誤植 0.05,已一併修正)
        taxOverLimit = aOverLimit * 0.26 - bOver * 0.06;
      }
    } else {
      if (hy < 20) {
        taxOverLimit = aOverLimit * 0.40 - bOver * 0.30;
      } else if (hy > 20 && hy < 30) {
        taxOverLimit = aOverLimit * 0.36 - bOver * 0.24;
      } else if (hy > 30 && hy < 40) {
        taxOverLimit = aOverLimit * 0.34 - bOver * 0.21;
      } else if (hy >= 40) {
        taxOverLimit = aOverLimit * 0.32 - bOver * 0.18;
      }
    }

    landTaxValueSELF = taxInLimit + Math.max(taxOverLimit, 0);
  }

  return {
    landHoldYear,
    landTransferArea,
    landTransferValue,
    landCPI: cpi,
    landCPIValue,
    landTotalValue,
    landMultiple,
    landTaxLevel1,
    landTaxLevel2,
    landTaxLevel3,
    landTaxValueNORMAL,
    landTaxValueSELF,
    isOver,
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
