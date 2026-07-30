// app.zengzhisui.com API 客戶端
// 對應 lib/helper/network_helper.dart
import { encryptOpenSSL } from "./crypto_compat.js";

const HOST = "https://app.zengzhisui.com";
// Api-Key 與原 Flutter App 相同；自家 API 允許 CORS *，設計上可公開分發給用戶端。
const API_KEY = "5u3RPqBTAhDlt5uNI3VADA3ShMTuw0PNYWPvlDjO7HI";

const HEADERS_JSON = {
  "Api-Key": API_KEY,
  "Content-Type": "application/json",
};

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: { ...HEADERS_JSON, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function get(path, extraHeaders = {}) {
  const res = await fetch(`${HOST}${path}`, {
    headers: { "Api-Key": API_KEY, ...extraHeaders },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─── 登入 ───────────────────────────────────────────────────
// Flutter 的 getUserInfo: 把 {account, password} 加密後放 Member 標頭
// 成功 → 回傳 memberAccount (account, name, points, expired...)
// 加密輸出本身就是可複用的 Member token，之後每個 API 都用它。
export async function login(account, password) {
  const token = await encryptOpenSSL({ account, password }, API_KEY);
  const { status, data } = await get("/api/land-value/v2/member/info", {
    Member: token,
  });
  if (status >= 400) {
    return { ok: false, message: data?.message || "帳號或密碼錯誤", status };
  }
  return { ok: true, token, member: data?.data ?? null };
}

export async function getMemberInfoByToken(token) {
  const { status, data } = await get("/api/land-value/v2/member/info", {
    Member: token,
  });
  if (status >= 400) return { ok: false, status };
  return { ok: true, member: data?.data ?? null };
}

// ─── 段小段搜尋 (匿名) ────────────────────────────────────
// ⚠ town 必須補 0 到至少 2 位數，否則後端轉 MOI 會回 A0702
// 對應 Flutter page_search.dart:1749 的 padLeft 行為
export async function searchSection(city, town, filter = "") {
  let townStr = String(town);
  if (townStr.length === 1) townStr = "0" + townStr;
  const { status, data } = await post("/api/land-value/v2/unit/section", {
    city,
    town: townStr,
    filter,
  });
  if (status >= 400) {
    return { ok: false, message: data?.message || "搜尋失敗" };
  }
  return { ok: true, sections: data?.data ?? [] };
}

// ─── 註冊 ────────────────────────────────────────────────
// 對應 lib/helper/network_helper.dart APIAccount.signUp
export async function register({ account, password, name, mobile, birthday }) {
  const body = { account, password, name };
  if (mobile) body.mobile = mobile;
  if (birthday) body.birthday = birthday.replaceAll("/", "-");
  const { status, data } = await post("/api/land-value/v2/member/register", body);
  if (status >= 400) {
    return { ok: false, status, message: data?.message, errors: data?.errors };
  }
  return { ok: true };
}

// ─── 忘記密碼 / 身分驗證 ─────────────────────────────────
export async function identityCheck({ account, mobile, birthday }) {
  const { status, data } = await post("/api/land-value/v2/member/identfy", {
    account,
    mobile,
    birthday: birthday?.replaceAll("/", "-"),
  });
  if (status >= 400) {
    return { ok: false, status, message: data?.message, errors: data?.errors };
  }
  return { ok: true, message: data?.message, account: data?.account };
}

export async function setNewPassword({ account, mobile, birthday, password }) {
  const { status, data } = await post("/api/land-value/v2/member/setting/password", {
    account,
    mobile,
    birthday: birthday?.replaceAll("/", "-"),
    password,
  });
  if (status >= 400) {
    return { ok: false, status, message: data?.message, errors: data?.errors };
  }
  return { ok: true };
}

// ─── 更新資料 ────────────────────────────────────────────
export async function updateUserInfo(token, { mobile, birthday }) {
  const body = {};
  if (mobile !== undefined) body.new_mobile = mobile;
  if (birthday !== undefined) body.new_birthday = birthday?.replaceAll("/", "-");
  const { status, data } = await post(
    "/api/land-value/v2/member/modify/info",
    body,
    { Member: token },
  );
  if (status >= 400) {
    return { ok: false, status, message: data?.message, errors: data?.errors };
  }
  return { ok: true };
}

// ─── 刪除帳號 ────────────────────────────────────────────
export async function deleteAccount(token) {
  const res = await fetch(`${HOST}/api/land-value/v2/member/account`, {
    method: "POST",
    headers: { "Api-Key": API_KEY, Member: token },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status >= 400) return { ok: false, status: res.status, message: data?.message };
  return { ok: true };
}

// ─── 地號查詢 (需登入 + 扣點) ────────────────────────────
// 回傳 resp 的欄位（來自原 App network_helper.dart jsonToLandSet）：
//   alPrice         → 公告土地現值 (元/㎡)
//   landArea        → 土地面積 (㎡)
//   landSection     → "空白" 表示都市土地
//   ownerRights[]   → 每位所有權人
//     .owrNo        → 權利編號
//     .ltprice[]    → 歷次移轉
//       .ltValue    → 前次移轉現值
//       .ltDate     → YYYMM (民國年月)
//       .poRightNumerator / poRightDenominator → 持分
//   memberPoints    → 剩餘點數
//   apiPrice        → 本次查詢扣除點數
export async function fetchLandSet(token, city, unit, sec, no) {
  const { status, data } = await post(
    "/api/land-value/v2/member/apply/section/all",
    { city, unit, sec, no },
    { Member: token },
  );
  if (status >= 400) {
    return { ok: false, message: data?.message || "查詢失敗", status };
  }
  return {
    ok: true,
    raw: data,
    memberPoints: data?.memberPoints,
    apiPrice: data?.apiPrice,
    landValue: data?.alPrice != null ? parseFloat(data.alPrice) : null,
    landArea: data?.landArea != null ? parseFloat(data.landArea) : null,
    isCity: data?.landSection === "空白",
    ownerRights: Array.isArray(data?.ownerRights) ? data.ownerRights : [],
  };
}

// ─── 把 API 回應轉成計算所需的 AData 記錄陣列 ────────────
// 每位所有權人 × 每筆歷次移轉 = 一個可計算的 row
export function flattenLandSet(fetchResult) {
  const rows = [];
  for (const owner of fetchResult.ownerRights) {
    for (const t of owner.ltprice ?? []) {
      const ltDate = String(t.ltDate || "");
      const landYear = parseInt(ltDate.slice(0, 3), 10);
      const landMonth = parseInt(ltDate.slice(3, 5), 10);
      rows.push({
        owrNo: owner.owrNo,
        landValue: fetchResult.landValue,
        landOrgValue: parseFloat(t.ltValue),
        landArea: fetchResult.landArea,
        landYear,
        landMonth,
        landNumerator: parseInt(t.poRightNumerator, 10),
        landDenominator: parseInt(t.poRightDenominator, 10),
        isCity: fetchResult.isCity,
      });
    }
  }
  return rows;
}
