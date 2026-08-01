// 第二輪文章套版上線（全部為新增，無取代）
import { readFile, writeFile } from "node:fs/promises";

const TASKS = "C:/Users/User/AppData/Local/Temp/claude/D--1------------/4a760d60-70e5-4454-b298-fed1c9a7df14/tasks";
const ART = "D:/1.我自己的東西/留白事務所有限公司/留白事務所_土增稅神器/土增稅神器/web_app/articles";
const SITE = "https://calc.zengzhisui.com";
const TEMPLATE = "lvit-how-to-calculate.html";

// 禁用詞清理：所有內容修正一律在此，不手改產出的 HTML
const sanitize = (html) => html
  .replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "")
  .replace(/房屋稅試算工具/g, "房地合一稅試算工具")
  .replace(/房屋稅試算/g, "房地合一稅試算")
  .replace(/「保證[^」]{0,12}」/g, "「帶有保證意味的說法」")
  .replace(/「一定[^」]{0,12}」/g, "「絕對性的說法」")
  .replace(/代為申報納稅/g, "辦理申報納稅")
  .replace(/或代為申報/g, "；申報程序應由地政士辦理")
  .replace(/代辦費用/g, "地政士服務費")
  .replace(/代辦費/g, "地政士服務費")
  .replace(/代辦手續/g, "辦理手續")
  .replace(/代辦/g, "辦理")
  .trim();

const absolutise = (html) => html
  .replace(/href="\/tools\//g, `href="${SITE}/tools/`)
  .replace(/href="\/articles\//g, `href="${SITE}/articles/`)
  .replace(/href="\/"/g, `href="${SITE}/"`);

const scrollTables = (html) =>
  html.replaceAll("<table", '<div class="table-scroll"><table').replaceAll("</table>", "</table></div>");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const faqBlock = (faq) => !faq?.length ? "" :
  `\n<h2>常見問題</h2>\n` + faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${f.a}</p>`).join("\n");

const faqSchema = (faq) => !faq?.length ? "" :
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: String(f.a).replace(/<[^>]+>/g, "") } })),
  })}</script>`;

const articles = JSON.parse(await readFile(`${TASKS}/w871ued3c.output`, "utf8")).result.articles;
const tpl = await readFile(`${ART}/${TEMPLATE}`, "utf8");

for (const a of articles) {
  const body = scrollTables(absolutise(sanitize(a.html))) + faqBlock(a.faq);
  const title = a.title.replace(/｜土增稅神器$/, "").trim();
  const canonical = `${SITE}/articles/${a.slug}.html`;

  let out = tpl
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}｜土增稅神器</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(a.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(a.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`)
    .replace(/("headline"\s*:\s*")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/("description"\s*:\s*")[^"]*(")/, `$1${esc(a.description)}$2`)
    .replace(/("@id"\s*:\s*")[^"]*(")/, `$1${canonical}$2`)
    .replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${esc(title)}</h1>`)
    .replace(/(<div class="post-meta">[\s\S]*?<\/div>)([\s\S]*?)(<\/article>)/, (_m, pre, _old, post) => `${pre}\n${body}\n${post}`)
    .replace(/<script type="application\/ld\+json">\s*\{[^<]*"FAQPage"[\s\S]*?<\/script>/g, "");

  const fs2 = faqSchema(a.faq);
  if (fs2) out = out.replace("</head>", `${fs2}\n</head>`);

  await writeFile(`${ART}/${a.slug}.html`, out, "utf8");
  console.log(`  ✓ ${a.slug}.html (${out.length} bytes)`);
}

console.log(`\n上線 ${articles.length} 篇`);
