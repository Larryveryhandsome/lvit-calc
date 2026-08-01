// 收款資訊唯一開關（比照 line-config.js 的作法）
// 老闆提供公司帳戶後，只改這個檔案，付款頁自動上線；ready 設 false 時付款頁會顯示「設定中」而非空白帳號。
//
// ★ 必須是「公司戶」不是個人戶：個人帳戶收陌生人小額款項，只要有一位買家事後報案
//   就可能被列為警示帳戶，並連帶凍結同一身分證字號在他行的帳戶。
// ★ 戶名必須與經濟部登記名稱一致（留白創研有限公司），否則買家不敢匯。
window.LVIT_PAY = {
  ready: true,
  bank: "中華郵政（金融機構代號 700）",
  branch: "局號 0111000",
  account: "0111000-1113273",
  // ⚠ 戶名待確認：郵局匯款以局號＋帳號為準，戶名供匯款人核對用。
  //   若實際戶名不是公司全名（例如是個人戶），必須改成實際戶名，
  //   否則匯款人核對不符會不敢匯。
  holder: "留白創研有限公司",
  taxId: "00018173",
  // 訂單表單已內建於 offer/pay.html，直送 /api/order，不需外部表單
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
