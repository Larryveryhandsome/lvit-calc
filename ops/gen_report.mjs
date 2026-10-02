// 個案土地稅負情境對照報告產生器
//   node gen_report.mjs --sample            產出去識別化範例（放商品頁）
//   node gen_report.mjs --order LVXXXXXX    依訂單產出客戶專屬報告
//
// 用網站同一套 calc.js 引擎跑多次，零新演算法——確保報告數字與線上工具一致。
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const BASE = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器";
const WEB = `${BASE}/web_app`;
const { calculateLVIT, formatTWD } = await import(pathToFileURL(`${WEB}/calc.js`).href);

const W = (n) => formatTWD(Math.round(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── 情境定義 ──────────────────────────────────────────
// 全部只呈現「不同情況下的試算結果」，不作任何行為建議或節稅指導
function buildScenarios(c) {
  const base = {
    landValue: c.landValue,
    landOrgValue: c.landOrgValue,
    landArea: c.landArea,
    landYear: c.landYear,
    landMonth: c.landMonth,
    landNumerator: 1,
    landDenominator: 1,
    isCity: c.isCity,
  };

  const run = (over) => calculateLVIT({ ...base, ...over });
  const out = [];
  const now = new Date();

  const r0 = run({});
  out.push({
    key: "general",
    name: "一般用地稅率（現在出售）",
    note: "未申請或不符自用住宅要件時適用的三級累進稅率。",
    lvit: r0.landTaxValueNORMAL,
    detail: r0,
  });

  out.push({
    key: "self",
    name: "自用住宅用地 10%（現在出售）",
    note: `需符合設籍、地上有房屋、出售前一年未出租或營業等要件，且面積在都市 300㎡／非都市 700㎡ 以內。本案面積上限 ${r0.selfLimit}㎡${r0.isOver ? "，超過部分已按一般稅率分段計算" : ""}。`,
    lvit: r0.landTaxValueSELF,
    detail: r0,
  });

  // 跨年度：公告現值每年 1 月調整，以近年常見調幅示意
  const bump = 1.03;
  const rNext = run({ landValue: c.landValue * bump });
  out.push({
    key: "next-year",
    name: "跨年度出售（假設公告現值調漲 3%）",
    note: "公告土地現值每年 1 月 1 日公告並適用全年。此列為示意：實際調幅由各地方政府公告，可能高於或低於 3%，亦可能不調整。",
    lvit: rNext.landTaxValueNORMAL,
    detail: rNext,
    assumed: true,
  });

  // 長期持有：若尚未滿 20 年，計算滿 20 年當下的稅額
  const held = r0.landHoldYear;
  if (r0.holdBand === 0) {
    // 「超過」20 年才減徵：取剛好跨過 20 年的那個週年
    const wait = Math.floor(20 - held) + 1;
    const target = new Date(now.getFullYear() + wait, now.getMonth(), now.getDate());
    const r20 = run({ targetDate: target });
    out.push({
      key: "hold20",
      name: `持有超過 20 年後出售（約 ${wait} 年後）`,
      note: "依土地稅法第 33 條，持有滿 20 年者，超過最低稅率 20% 之部分減徵 20%。此列未計入該期間公告現值可能的變動。",
      lvit: r20.landTaxValueNORMAL,
      detail: r20,
      assumed: true,
    });
  } else {
    out.push({
      key: "hold20",
      name: `目前持有 ${held.toFixed(1)} 年，已適用長期持有減徵`,
      note: "超過最低稅率 20% 之部分已按持有年限減徵，上方一般用地稅率之數字已包含此減徵。",
      lvit: r0.landTaxValueNORMAL,
      detail: r0,
    });
  }

  // 分持分兩次出售（各 1/2）
  const rHalf = run({ landNumerator: 1, landDenominator: 2 });
  const splitTotal = rHalf.landTaxValueNORMAL * 2;
  const sameAsOnce = Math.abs(splitTotal - r0.landTaxValueNORMAL) < 1;
  out.push({
    key: "split",
    name: "分二次出售（每次 1/2 持分）",
    note: sameAsOnce
      ? "兩次合計金額。此處值得留意：漲價倍數＝漲價總數額÷原地價，持分減半時分子與分母同時減半，倍數不變，因此稅率級距也不變——分次出售並不會讓稅額變低。這是實務上常見的誤解。（此列假設兩次的公告現值與前次移轉現值相同；實務上第二次的前次移轉現值會以第一次移轉時的申報現值為準，屆時結果會不同。）"
      : "兩次合計金額。分次移轉時每次各自計算漲價倍數與級距；此列假設兩次的公告現值與前次移轉現值均相同，實務上第二次的前次移轉現值會以第一次移轉時的申報現值為準，結果可能不同。",
    lvit: splitTotal,
    detail: rHalf,
    assumed: true,
  });

  // 繼承取得：原地價以繼承開始時公告現值重設（土地稅法§31 II）
  const rInherit = run({ landOrgValue: c.landValue * 0.97, landYear: Math.max(48, new Date().getFullYear() - 1911 - 1), landMonth: 1 });
  out.push({
    key: "inherit",
    name: "（對照）若為近年繼承取得後出售",
    note: "依土地稅法第 31 條第 2 項，因繼承取得之土地再行移轉者，前次移轉現值以繼承開始時之公告土地現值計算，起算點因此被墊高。此列僅為制度對照，非本案現況。",
    lvit: rInherit.landTaxValueNORMAL,
    detail: rInherit,
    assumed: true,
  });

  return out;
}

// ── HTML ──────────────────────────────────────────────
function renderHtml(c, scenarios, meta) {
  const real = scenarios.filter((s) => !s.assumed);
  const min = Math.min(...real.map((s) => s.lvit));

  const rows = scenarios.map((s) => {
    const diff = s.lvit - min;
    return `<tr${s.lvit === min && !s.assumed ? ' class="best"' : ""}>
      <td>${esc(s.name)}${s.assumed ? ' <span class="tag">情境假設</span>' : ""}</td>
      <td>${W(s.lvit)}</td>
      <td>${diff === 0 ? "—" : (diff > 0 ? "+" : "") + W(diff)}</td>
    </tr>`;
  }).join("\n");

  const details = scenarios.map((s) => `
    <div class="sc">
      <h3>${esc(s.name)}</h3>
      <p class="note">${esc(s.note)}</p>
      <table class="calc">
        <tr><td>申報移轉現值 A ＝ 公告現值 × 面積</td><td>${W(s.detail.landTransferValue)}</td></tr>
        <tr><td>物價指數</td><td>${(s.detail.landCPI * 100).toFixed(2)}%</td></tr>
        <tr><td>物價調整後原地價 B</td><td>${W(s.detail.landCPIValue)}</td></tr>
        <tr><td>土地漲價總數額 a ＝ A − B</td><td>${W(s.detail.landTotalValue)}</td></tr>
        <tr><td>漲價倍數 ＝ a ÷ B</td><td>${s.detail.landMultiple.toFixed(3)}</td></tr>
        <tr><td>持有年限</td><td>${s.detail.landHoldYear.toFixed(2)} 年</td></tr>
        <tr class="sum"><td>本情境土地增值稅</td><td>${W(s.lvit)}</td></tr>
      </table>
    </div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>個案土地稅負情境對照報告 ${esc(meta.code)}｜土增稅神器</title>
<meta name="robots" content="noindex, nofollow" />
<link rel="icon" type="image/svg+xml" href="../favicon.svg" />
<link rel="stylesheet" href="../styles.css" />
<link rel="stylesheet" href="../articles/articles.css" />
<script>try{var t=localStorage.getItem("lvit.theme");if(t&&t!=="auto")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<style>
.rh { border-bottom:2px solid var(--brand); padding-bottom:10px; margin-bottom:16px; }
.rh .meta { font-size:.78rem; color:var(--ink-faint); margin-top:5px; }
.case { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--surface-2); padding:14px 16px; margin:16px 0; }
.case dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:5px 16px; font-size:.85rem; }
.case dt { color:var(--ink-soft); font-weight:700; }
.case dd { margin:0; font-variant-numeric:tabular-nums; }
.cmp { width:100%; border-collapse:collapse; font-size:.87rem; margin:12px 0; }
.cmp th, .cmp td { border:1px solid var(--border); padding:8px 10px; text-align:left; }
.cmp td:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
.cmp thead th { background:var(--surface-2); font-weight:700; }
.cmp tr.best td { background:color-mix(in srgb, var(--brand) 10%, transparent); font-weight:700; }
.tag { font-size:.68rem; background:var(--surface-2); border:1px solid var(--border); border-radius:99px; padding:1px 7px; color:var(--ink-faint); font-weight:400; }
.sc { border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px 16px; margin:12px 0; }
.sc h3 { font-size:.92rem; margin:0 0 6px; }
.sc .note { font-size:.78rem; color:var(--ink-soft); line-height:1.7; margin:0 0 10px; }
.calc { width:100%; border-collapse:collapse; font-size:.82rem; }
.calc td { border-bottom:1px solid var(--border); padding:5px 8px; }
.calc td:last-child { text-align:right; font-variant-numeric:tabular-nums; }
.calc tr.sum td { font-weight:800; border-bottom:none; border-top:1.5px solid var(--brand); color:var(--brand-ink); }
.law { font-size:.78rem; line-height:1.85; color:var(--ink-soft); }
.disc { border:1px solid var(--border-strong); background:var(--surface-2); border-radius:var(--radius-sm); padding:14px 16px; font-size:.76rem; line-height:1.8; color:var(--ink-soft); margin-top:20px; }
@media print { .no-print { display:none !important; } .sc, .case { break-inside:avoid; } }
</style>
</head>
<body>
<div class="article-wrap">
<div class="article-top no-print">
  <a class="article-brand" href="https://calc.zengzhisui.com/">土增稅神器</a>
  <a class="to-calc" href="javascript:window.print()">列印／存 PDF</a>
</div>

<article class="post">
<div class="rh">
  <h1 style="border:none;padding:0;margin:0;font-size:1.3rem">個案土地稅負情境對照報告</h1>
  <div class="meta">報告編號 ${esc(meta.code)}　產製日期 ${esc(meta.date)}${meta.sample ? "　（示範用去識別化案例）" : ""}</div>
</div>

<div class="case">
  <dl>
    <dt>公告土地現值</dt><dd>${W(c.landValue)} 元／㎡</dd>
    <dt>前次移轉現值</dt><dd>${W(c.landOrgValue)} 元／㎡</dd>
    <dt>面積／持分面積</dt><dd>${c.landArea} ㎡</dd>
    <dt>前次移轉時間</dt><dd>民國 ${c.landYear} 年 ${c.landMonth} 月</dd>
    <dt>土地類型</dt><dd>${c.isCity ? "都市土地（自用上限 300㎡）" : "非都市土地（自用上限 700㎡）"}</dd>
  </dl>
</div>

<h2>情境對照</h2>
<p style="font-size:.83rem;color:var(--ink-soft);line-height:1.7">下表為同一筆土地在不同情況下的土地增值稅試算結果。標示「情境假設」者含有本報告所設定之假設條件，請一併參考該列說明。</p>
<table class="cmp">
<thead><tr><th>情境</th><th>土地增值稅</th><th>與最低者差額</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>

<h2>各情境計算式</h2>
${details}

<h2>計算依據</h2>
<p class="law">
土地稅法第 31 條（土地漲價總數額之計算）、第 31 條第 2 項（因繼承取得之土地再行移轉，前次移轉現值以繼承開始時公告土地現值計算）、第 32 條（原地價依物價指數調整）、第 33 條（三級累進稅率與持有滿 20／30／40 年之減徵）、第 34 條（自用住宅用地稅率 10%、一生一次與一生一屋之面積上限）、平均地權條例第 33 條。
</p>

<div class="disc">
本報告為<strong>依委託人所提供之數據所作之試算與資訊整理</strong>，非稅務簽證、非法律意見、非投資建議，亦非任何行為之建議。<br />
各情境之試算結果僅供比較參考；<strong>實際應納稅額、各項優惠之適用要件是否具備，一律以主管稽徵機關之核定為準</strong>。<br />
所輸入之公告現值、前次移轉現值、面積、持分與取得時間，其正確性由委託人自行負責。<br />
本公司<strong>不代辦、不代理申報、不代收稅款</strong>。土地登記與土地移轉現值申報依《地政士法》屬地政士業務，稅務申報代理屬記帳士或會計師業務，請洽具名之持照專業人員辦理。<br />
本報告可列印後提供予您委任之專業人員核對。<br /><br />
留白創研有限公司｜統一編號 00018173｜宜蘭縣宜蘭市新東里陽明三路 65 號 1 樓<br />
本公司為顧問服務業者，非地政士／會計師／記帳士／律師事務所。
</div>

</article>
</div>
</body>
</html>
`;
}

// ── 主流程 ────────────────────────────────────────────
const args = process.argv.slice(2);
const isSample = args.includes("--sample");
const orderId = args[args.indexOf("--order") + 1];

let c, meta;

if (isSample) {
  c = { landValue: 80000, landOrgValue: 20000, landArea: 120, landYear: 90, landMonth: 6, isCity: true };
  meta = { code: "SAMPLE", date: new Date().toISOString().slice(0, 10), sample: true };
} else {
  if (!orderId) { console.error("用法：--sample 或 --order <訂單編號>"); process.exit(1); }
  const lines = (await readFile(`${BASE}/orders.jsonl`, "utf8")).trim().split("\n");
  const o = lines.map((l) => JSON.parse(l)).find((x) => x.id === orderId);
  if (!o) { console.error(`找不到訂單 ${orderId}`); process.exit(1); }
  // 先檢查必填欄位，給清楚的缺件清單，而不是讓計算引擎拋原始錯誤
  const need = [
    ["value", "公告土地現值"],
    ["org", "前次移轉現值"],
    ["area", "面積或持分面積"],
    ["when", "前次移轉年月"],
  ];
  const missing = need.filter(([k]) => !o[k] || !String(o[k]).trim());
  const year = Number((o.when || "").match(/(\d+)\s*年/)?.[1]);
  if (o.when && !year) missing.push(["when", "前次移轉年月（格式應如「90 年 6 月」）"]);

  if (missing.length) {
    console.error(`訂單 ${o.id} 資料不完整，無法產出報告。`);
    console.error(`缺少：${missing.map(([, label]) => label).join("、")}`);
    console.error(`\n聯絡方式：${o.contact}`);
    console.error(`請先向客戶補齊上述欄位；補齊後可直接編輯 orders.jsonl 該筆記錄再重跑。`);
    process.exit(1);
  }

  c = {
    landValue: Number(o.value), landOrgValue: Number(o.org), landArea: Number(o.area),
    landYear: year,
    landMonth: Number((o.when || "").match(/(\d+)\s*月/)?.[1] || 1),
    isCity: o.urban !== "非都市土地",
  };
  meta = { code: o.id, date: new Date().toISOString().slice(0, 10), sample: false };
}

const scenarios = buildScenarios(c);
const html = renderHtml(c, scenarios, meta);
// 隨機碼讓網址無法被猜到；客戶透過 /lookup.html 用訂單編號＋末五碼取回
const slug = isSample ? "sample" : `${meta.code}-${randomBytes(6).toString("hex")}`;
const out = `${WEB}/r/${slug}.html`;
await writeFile(out, html, "utf8");

// 寫入狀態，讓查詢頁能回傳網址——交付因此不需要寄信或發訊息
if (!isSample) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(`${BASE}/orders-status.jsonl`,
    JSON.stringify({ id: meta.code, status: "done", reportUrl: `/r/${slug}.html`, at: new Date().toISOString() }) + "\n", "utf8");
  console.log(`已登錄狀態：客戶可在 /lookup.html 用訂單編號＋末五碼取回`);
}

console.log(`已產出：${out}`);
console.log(`網址：https://calc.zengzhisui.com/r/${slug}.html`);
console.log("\n情境對照：");
for (const s of scenarios) console.log(`  ${W(s.lvit).padStart(12)}  ${s.name}${s.assumed ? " [假設]" : ""}`);
