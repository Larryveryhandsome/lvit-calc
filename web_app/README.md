# 土增稅神器 — 線上版 (LVIT Web Calculator)

免費、可離線、PWA 的台灣土地增值稅線上試算工具。
由「土增稅神器」行動 App（土增稅神器）移植為純靜態網頁 + 呼叫現有後端，全世界任何人只要有瀏覽器即可使用。

## 特色

### 計算工具（完全本機，不需登入）
- **完整公式**：與 iOS / Android App 同源的計算邏輯（平均地權條例 §33、土地稅法 §§33, 34）
- **CPI 資料完整**：民國 48 年 ~ 113 年每月消費者物價指數
- **自動分級**：自用住宅超 300 ㎡（都市）/ 700 ㎡（非都市）依法自動分段計算
- **PWA 離線可用**、**分享連結**、**本機歷史紀錄**（僅存瀏覽器）
- **中英雙語 / 深淺色主題 / 可列印 PDF**

### 會員系統（串接 app.zengzhisui.com，與手機 App 共通）
- **註冊 / 登入 / 登出**
- **忘記密碼**：帳號 + 手機 + 生日 身分驗證後設新密碼
- **修改密碼 / 修改個人資料**
- **會員中心**：姓名、帳號、手機、到期日、剩餘點數
- **地號自動查詢**：登入後可透過縣市 / 鄉鎮 / 段小段 / 地號查詢公告現值與前次移轉，自動帶入計算欄位（每次扣除點數）
- **刪除帳號**

### 儲值點數
受 Apple / Google 平台政策限制，**點數儲值仍須透過手機 App 的內購 (IAP) 完成**。
同一帳號的點數在網頁與 App 之間即時共用，於 App 內儲值後立刻在網頁可用。

## 檔案結構

```
web_app/
├── index.html            # 主頁
├── styles.css            # 樣式（含深色模式）
├── app.js                # UI 互動與狀態管理
├── calc.js               # 土增稅計算核心（純函式）
├── cpi.js                # 物價指數資料
├── tw_codes.js           # 縣市 / 鄉鎮區代碼
├── i18n.js               # 中英雙語字典
├── api.js                # app.zengzhisui.com API 客戶端
├── crypto_compat.js      # 瀏覽器相容的 OpenSSL AES-CBC（登入加密用）
├── favicon.svg           # 圖示
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # Service Worker（離線快取）
├── test.mjs              # 驗證計算正確性的 Node 腳本
└── README.md
```

## API 依賴

本網頁呼叫的後端端點（由 `app.zengzhisui.com` 提供，與手機 App 共用）：

| 端點 | 用途 |
|------|------|
| `POST /api/land-value/v2/member/register` | 註冊 |
| `GET  /api/land-value/v2/member/info` | 登入 / 取得會員資料 |
| `POST /api/land-value/v2/member/identfy` | 忘記密碼身分驗證 |
| `POST /api/land-value/v2/member/setting/password` | 設定新密碼 |
| `POST /api/land-value/v2/member/modify/info` | 更新手機 / 生日 |
| `POST /api/land-value/v2/member/account` | 刪除帳號 |
| `POST /api/land-value/v2/unit/section` | 搜尋段小段（免登入） |
| `POST /api/land-value/v2/member/apply/section/all` | 地號查詢（扣點） |

CORS 設定：後端已開放 `Access-Control-Allow-Origin: *`，瀏覽器可直接呼叫。

## 本機預覽

```bash
cd web_app
python -m http.server 8000
# 打開 http://localhost:8000
```

或用 Node：

```bash
npx --yes http-server . -p 8000 --cors
```

> ⚠️ 本專案使用原生 ES Module (`import`)，必須透過 HTTP 伺服器瀏覽，**不能**以 `file://` 打開 `index.html`。

## 驗證計算邏輯

```bash
node test.mjs
```

會比對 Flutter App 原版公式的預期輸出。

## 部署

此為純靜態網站，上傳 `web_app/` 裡的檔案即可。推薦：

### 方案 A：Cloudflare Pages（推薦）

1. 建立 GitHub repo，把 `web_app/` 內容推上
2. Cloudflare Dashboard → Pages → Create project → 連接 GitHub
3. Build command 留空，Build output directory 填 `.`
4. Deploy 後即獲得 `https://<project>.pages.dev` 免費網址
5. 可綁自訂網域（例：`lvit.liubai.studio`）

### 方案 B：GitHub Pages

1. 把 `web_app/` 內容推至 repo 的 `main` 分支根目錄
2. Settings → Pages → Source: `main` / root
3. 幾分鐘後可用 `https://<user>.github.io/<repo>/`
4. 可加 `CNAME` 檔綁自訂網域

### 方案 C：Netlify

```bash
npx netlify-cli deploy --dir=web_app --prod
```

或拖拉 `web_app/` 整個資料夾到 https://app.netlify.com/drop

### 方案 D：Vercel

```bash
cd web_app
npx vercel --prod
```

按提示選 static，`Output Directory` 空白即可。

### 方案 E：任何靜態主機

把 `web_app/` 裡面所有檔案上傳即可。支援的主機包括：
Firebase Hosting、AWS S3 + CloudFront、Azure Static Web Apps、Surge、Render、DigitalOcean App Platform、自架 Nginx/Apache...

## SEO 建議

- 部署後到 Google Search Console 提交 sitemap 或直接提交 URL
- 可自訂 `index.html` 的 `<meta property="og:image">` 指向你的 Open Graph 卡片圖
- `index.html` 已內含繁體中文 SEO meta 標籤與 Twitter / Open Graph 卡片

## 開發者

計算公式的原始碼位於 `calc.js` 的 `calculateLVIT()`，純函式、易於測試。
若法規或稅率改變，只需修改此函式。

若 CPI 資料需要更新（每月由主計總處公告新值），修改 `cpi.js`：
- 追加新的 `rocYear: [12 個月值]`
- 不必更動任何其他檔案

## 授權

計算邏輯參考：行動 App「土增稅神器」by 留白創研有限公司。
本線上版為 App 的衍生作品。
