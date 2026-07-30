// 留白 LINE 官方帳號共用設定 — 全站唯一開關
// 阿衛的 LINE OA 建好後，把 lin.ee 網址填入下面引號，重新部署即可讓
// 主站試算頁 + 所有文章頁的「加 LINE」按鈕同時亮起。
window.LVIT_LINE_URL = "https://lin.ee/471bsao";

// 文章頁用：有設定網址時亮起所有 .js-line-cta 按鈕
document.addEventListener("DOMContentLoaded", () => {
  if (!window.LVIT_LINE_URL) return;
  document.querySelectorAll(".js-line-cta").forEach((el) => {
    el.href = window.LVIT_LINE_URL;
    el.hidden = false;
  });
});
