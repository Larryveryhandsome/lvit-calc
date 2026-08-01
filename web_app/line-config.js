// LINE 官方帳號共用設定 — 全站唯一開關
// 填入 lin.ee 網址後，主站試算頁與所有文章頁的「加 LINE」按鈕會同時亮起；
// 留空則全部保持隱藏，不會出現失效的按鈕。
window.LVIT_LINE_URL = "https://lin.ee/471bsao";

// 文章頁用：有設定網址時亮起所有 .js-line-cta 按鈕
document.addEventListener("DOMContentLoaded", () => {
  if (!window.LVIT_LINE_URL) return;
  document.querySelectorAll(".js-line-cta").forEach((el) => {
    el.href = window.LVIT_LINE_URL;
    el.hidden = false;
  });
});
