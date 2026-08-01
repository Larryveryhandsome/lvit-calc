// 收款資訊設定（付款頁唯一資料來源）
// ready 為 false 時，付款頁改為顯示 LINE 洽詢，不會出現空白的匯款欄位。
window.LVIT_PAY = {
  ready: true,
  bank: "中華郵政（金融機構代號 700）",
  branch: "局號 0111000",
  account: "0111000-1113273",
  holder: "留白創研有限公司",
  taxId: "00018173",
  // 訂單表單內建於 offer/pay.html，直送 /api/order
  formUrl: "",
};

document.addEventListener("DOMContentLoaded", () => {
  const p = window.LVIT_PAY || {};
  const show = (sel, on) => document.querySelectorAll(sel).forEach((el) => { el.hidden = !on; });

  show(".js-pay-ready", !!p.ready);
  show(".js-pay-pending", !p.ready);

  if (p.ready) {
    const put = (sel, val) => document.querySelectorAll(sel).forEach((el) => { el.textContent = val || ""; });
    put(".js-pay-bank", p.bank);
    put(".js-pay-branch", p.branch);
    put(".js-pay-account", p.account);
    put(".js-pay-holder", p.holder);
    put(".js-pay-taxid", p.taxId);
  }

  if (p.formUrl) {
    document.querySelectorAll(".js-pay-form").forEach((el) => {
      el.href = p.formUrl;
      el.hidden = false;
    });
  }

  // LINE 作為未開通前的唯一聯絡管道
  if (window.LVIT_LINE_URL) {
    document.querySelectorAll(".js-line-cta").forEach((el) => {
      el.href = window.LVIT_LINE_URL;
      el.hidden = false;
    });
  }
});
