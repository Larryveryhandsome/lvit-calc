// 土增稅神器 — 線上版主程式
import { calculateLVIT, formatTWD, formatNum } from "./calc.js";
import { I18N, t, DISCLAIMER_ZH, DISCLAIMER_EN } from "./i18n.js";
import { CITIES, TOWNS } from "./tw_codes.js";
import * as API from "./api.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const LS_KEYS = {
  theme: "lvit.theme",
  lang: "lvit.lang",
  history: "lvit.history",
  token: "lvit.token",
  member: "lvit.member",
  onboardDismissed: "lvit.onboard_dismissed",
};

// ── 免費檢查（lead）設定 ──
// LINE 網址統一由 line-config.js 的 window.LVIT_LINE_URL 控制（全站唯一開關）
const getLineUrl = () => (typeof window !== "undefined" && window.LVIT_LINE_URL) || "";

const state = {
  lang: localStorage.getItem(LS_KEYS.lang) || (navigator.language?.startsWith("en") ? "en" : "zh"),
  theme: localStorage.getItem(LS_KEYS.theme) || "auto",
  lastResult: null,
  lastInput: null,
  token: localStorage.getItem(LS_KEYS.token),
  member: JSON.parse(localStorage.getItem(LS_KEYS.member) || "null"),
  sections: [],  // 搜尋到的段小段
};

// ─── 新用戶引導彈窗 ───────────────────────
function initOnboarding() {
  // 已登入 或 曾看過並關閉 → 不再彈
  const dismissed = localStorage.getItem(LS_KEYS.onboardDismissed);
  if (state.token || dismissed) return;

  let interactionCount = 0;
  const THRESHOLD = 3; // 東點西點 3 次後跳

  const maybeShow = () => {
    // 再次檢查（可能中途登入/關掉了）
    if (state.token || localStorage.getItem(LS_KEYS.onboardDismissed)) return;
    const dlg = $("#onboard-dialog");
    // 其他 modal 開著就延後
    if (document.querySelector("dialog[open]")) return;
    if (dlg && !dlg.open) dlg.showModal();
  };

  const onInteract = (e) => {
    // 只計算點按、送出 類別的操作，滑鼠移動不算
    const tag = e.target?.closest?.("button, a, select, input, label, summary");
    if (!tag) return;
    // 忽略在 dialog 裡的點擊
    if (e.target.closest("dialog")) return;
    interactionCount++;
    if (interactionCount >= THRESHOLD) {
      document.removeEventListener("click", onInteract);
      maybeShow();
    }
  };
  document.addEventListener("click", onInteract);

  // 綁關閉動作 → 只在這個 session 內不再彈，但下次 session 會再跳（除非按「晚點再說」則永久關）
  $("#onboard-later")?.addEventListener("click", () => {
    localStorage.setItem(LS_KEYS.onboardDismissed, "1");
    $("#onboard-dialog").close();
  });
  $("#onboard-login")?.addEventListener("click", () => {
    $("#onboard-dialog").close();
    $("#login-dialog").showModal();
  });
}

// ─── Tab switching ───────────────────────
function switchTab(tabId) {
  // Set aria-selected + active on buttons
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  // Toggle panels
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.id !== `tab-${tabId}`;
  });
}

function initTabs() {
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

// ─── PDF tab (骨架) ──────────────────────
function initPdfTab() {
  const drop = document.getElementById("pdf-drop");
  const input = document.getElementById("pdf-input");
  const status = document.getElementById("pdf-status");

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
      status.hidden = false;
      status.style.background = "";
      status.textContent = t(state.lang, "pdf.notSupported");
      return;
    }
    status.hidden = false;
    status.textContent = t(state.lang, "pdf.loaded", { name: f.name, size: Math.round(f.size / 1024) });
    // TODO: 實際解析留待後續
  };

  input.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag-over");
    handleFile(e.dataTransfer?.files?.[0]);
  });
}

// ─── 主題 ────────────────────────────────
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", state.theme);
}
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
  localStorage.setItem(LS_KEYS.theme, state.theme);
  applyTheme();
}

// ─── 語言 ────────────────────────────────
function applyLang() {
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-Hant-TW";
  $$("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(state.lang, key);
  });
  // 動態更新免責聲明
  const dis = $("#disclaimer-box");
  if (dis) dis.textContent = state.lang === "en" ? DISCLAIMER_EN : DISCLAIMER_ZH;

  // 若已有計算結果，重繪
  if (state.lastResult) renderResult(state.lastResult, state.lastInput);
  renderHistory();
  if (typeof renderMember === "function") renderMember();
}
function toggleLang() {
  state.lang = state.lang === "zh" ? "en" : "zh";
  localStorage.setItem(LS_KEYS.lang, state.lang);
  applyLang();
}

// ─── 表單處理 ────────────────────────────
function collectInput() {
  const isCity = $("input[name=landType]:checked").value === "city";
  const targetDateVal = $("#targetDate").value;
  return {
    landValue: parseFloat($("#landValue").value),
    landOrgValue: parseFloat($("#landOrgValue").value),
    landArea: parseFloat($("#landArea").value),
    landYear: parseInt($("#landYear").value, 10),
    landMonth: parseInt($("#landMonth").value, 10),
    landNumerator: parseInt($("#landNumerator").value, 10),
    landDenominator: parseInt($("#landDenominator").value, 10),
    isCity,
    targetDate: targetDateVal ? new Date(targetDateVal) : new Date(),
    memo: $("#extText").value.trim(),
  };
}

function resetForm() {
  $("#calc-form").reset();
  $("#landNumerator").value = 1;
  $("#landDenominator").value = 1;
  hideResult();
  hideError();
}

function loadExample() {
  switchTab("manual");
  $("#landValue").value = "80000";
  $("#landOrgValue").value = "20000";
  $("#landArea").value = "120";
  $("#landYear").value = "90";
  $("#landMonth").value = "6";
  $("#landNumerator").value = "1";
  $("#landDenominator").value = "1";
  $("#landType-city").checked = true;
  $("#extText").value = state.lang === "en"
    ? "Example: purchased 120 m² in 2001"
    : "範例：民國 90 年購入 120 ㎡";
  $("#calc-form").requestSubmit();
}

function showError(msg) {
  const box = $("#form-error");
  box.textContent = msg;
  box.hidden = false;
}
function hideError() {
  const box = $("#form-error");
  box.textContent = "";
  box.hidden = true;
}
function hideResult() {
  $("#result-body").hidden = true;
  $("#result-empty").style.display = "";
  const hooks = $("#result-hooks");
  if (hooks) hooks.hidden = true;
  state.lastResult = null;
  state.lastInput = null;
  ["btn-share", "btn-save", "btn-print"].forEach((id) => ($("#" + id).disabled = true));
}

// ─── 計算並顯示 ─────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  hideError();
  let input, result;
  try {
    input = collectInput();
    result = calculateLVIT(input);
  } catch (err) {
    showError(err.message);
    hideResult();
    return;
  }
  state.lastInput = input;
  state.lastResult = result;
  renderResult(result, input);
  $("#result-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResult(res, input) {
  $("#result-empty").style.display = "none";
  $("#result-body").hidden = false;

  $("#r-self").textContent = formatTWD(res.landTaxValueSELF);
  $("#r-normal").textContent = formatTWD(res.landTaxValueNORMAL);
  $("#r-tier").textContent = t(state.lang, `tier.${res.tierUsed}`);

  $("#r-hold").textContent = `${formatNum(res.landHoldYear, 2)} ${t(state.lang, "holdYears")}`;
  $("#r-area").textContent = `${formatNum(res.landTransferArea, 2)} ㎡`;
  $("#r-transferVal").textContent = formatTWD(res.landTransferValue);
  $("#r-cpiVal").textContent = formatTWD(res.landCPIValue);
  $("#r-totalVal").textContent = formatTWD(res.landTotalValue);
  $("#r-multiple").textContent = formatNum(res.landMultiple, 4);
  $("#r-cpi").textContent = formatNum(res.landCPI, 2);
  $("#r-over").textContent = res.isOver
    ? t(state.lang, "overYes", { limit: res.selfLimit })
    : t(state.lang, "overNo");

  $("#r-L1").textContent = formatTWD(res.landTaxLevel1);
  $("#r-L2").textContent = formatTWD(res.landTaxLevel2);
  $("#r-L3").textContent = formatTWD(res.landTaxLevel3);
  ["row-L1", "row-L2", "row-L3"].forEach((id) => $("#" + id).classList.remove("highlight"));
  if (res.tierUsed !== "none") $(`#row-${res.tierUsed}`).classList.add("highlight");

  const warnEl = $("#result-warnings");
  if (res.warnings.length) {
    warnEl.hidden = false;
    warnEl.innerHTML = "<strong>⚠︎</strong><ul>" + res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("") + "</ul>";
  } else {
    warnEl.hidden = true;
    warnEl.innerHTML = "";
  }

  ["btn-share", "btn-save", "btn-print"].forEach((id) => ($("#" + id).disabled = false));

  renderResultHooks(res, input);
}

// ─── 一頁三鉤：差額 badge + 免費檢查表單 ────
function renderResultHooks(res, input) {
  const wrap = $("#result-hooks");
  if (!wrap) return;

  const diff = (res.landTaxValueNORMAL ?? 0) - (res.landTaxValueSELF ?? 0);
  const amountEl = $("#hook-diff-amount");
  const noteEl = $("#hook-diff-note");
  if (diff > 0) {
    amountEl.textContent = formatTWD(diff);
    noteEl.textContent = t(state.lang, "hooks.diffNote");
  } else {
    amountEl.textContent = "—";
    noteEl.textContent = t(state.lang, "hooks.zeroDiff");
  }

  // 保留本次試算摘要，隨表單一起送出（不含任何個資）
  state.leadSummary =
    `prev ${input.landYear}/${input.landMonth} · ${input.landArea}㎡ · ${input.isCity ? "city" : "rural"}` +
    ` · normal ${Math.round(res.landTaxValueNORMAL)} · self ${Math.round(res.landTaxValueSELF)}` +
    (input.memo ? ` · memo: ${input.memo}` : "");

  // LINE 優先導流：有設定 lineUrl 時，LINE 按鈕為主 CTA、表單為備援
  const lineBtn = $("#hook-line-btn");
  const orEl = $("#hook-or");
  const lineUrl = getLineUrl();
  if (lineUrl) {
    lineBtn.href = lineUrl;
    lineBtn.hidden = false;
    orEl.hidden = false;
  } else {
    lineBtn.hidden = true;
    orEl.hidden = true;
  }

  // 每次新結果都回到表單狀態（成功畫面只在剛送出後顯示）
  $("#lead-form").hidden = false;
  $("#lead-success").hidden = true;
  wrap.hidden = false;
}

function initLeadForm() {
  const form = $("#lead-form");
  if (!form) return;

  // 房仲/代書分享連結 ?ref=CODE → 記到 sessionStorage，lead 送出時帶上
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) sessionStorage.setItem("lvit.ref", ref.slice(0, 40));
  } catch { /* ignore */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#lead-error");
    errEl.hidden = true;

    const name = $("#ld-name").value.trim();
    const contact = $("#ld-contact").value.trim();
    if (!name || !contact) {
      errEl.textContent = t(state.lang, "hooks.missing");
      errEl.hidden = false;
      return;
    }

    const btn = $("#ld-submit");
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = t(state.lang, "hooks.submitting");

    const payload = new URLSearchParams({
      "form-name": "lead",
      name,
      contact,
      need: $("#ld-need").value,
      calc_summary: state.leadSummary || "",
      ref: sessionStorage.getItem("lvit.ref") || "",
      lang: state.lang,
      website: "", // honeypot
    });

    try {
      const r = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload.toString(),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      form.hidden = true;
      const success = $("#lead-success");
      success.hidden = false;
      if (getLineUrl()) {
        $("#lead-line-wrap").hidden = false;
        $("#lead-line-link").href = getLineUrl();
      }
    } catch {
      errEl.textContent = t(state.lang, "hooks.error");
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ─── 分享連結 ───────────────────────────
function buildShareHash(input) {
  const params = new URLSearchParams({
    v: String(input.landValue),
    o: String(input.landOrgValue),
    a: String(input.landArea),
    y: String(input.landYear),
    m: String(input.landMonth),
    n: String(input.landNumerator),
    d: String(input.landDenominator),
    c: input.isCity ? "1" : "0",
  });
  if (input.memo) params.set("r", input.memo);
  return "#" + params.toString();
}
function parseShareHash() {
  if (!location.hash || location.hash.length < 2) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.get("v")) return null;
  return {
    landValue: parseFloat(p.get("v")),
    landOrgValue: parseFloat(p.get("o")),
    landArea: parseFloat(p.get("a")),
    landYear: parseInt(p.get("y"), 10),
    landMonth: parseInt(p.get("m"), 10),
    landNumerator: parseInt(p.get("n"), 10) || 1,
    landDenominator: parseInt(p.get("d"), 10) || 1,
    isCity: p.get("c") !== "0",
    memo: p.get("r") || "",
  };
}
function applyShareInput(inp) {
  $("#landValue").value = inp.landValue;
  $("#landOrgValue").value = inp.landOrgValue;
  $("#landArea").value = inp.landArea;
  $("#landYear").value = inp.landYear;
  $("#landMonth").value = inp.landMonth;
  $("#landNumerator").value = inp.landNumerator;
  $("#landDenominator").value = inp.landDenominator;
  $(`#landType-${inp.isCity ? "city" : "rural"}`).checked = true;
  $("#extText").value = inp.memo;
}

async function copyShareLink() {
  if (!state.lastInput) return;
  const url = location.origin + location.pathname + buildShareHash(state.lastInput);
  try {
    await navigator.clipboard.writeText(url);
    toast(t(state.lang, "toast.copied"));
  } catch {
    prompt(t(state.lang, "toast.copied"), url);
  }
}

// ─── 歷史紀錄 ───────────────────────────
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.history) || "[]");
  } catch {
    return [];
  }
}
function saveHistoryArr(arr) {
  localStorage.setItem(LS_KEYS.history, JSON.stringify(arr));
}
function saveCurrentToHistory() {
  if (!state.lastInput || !state.lastResult) return;
  const arr = loadHistory();
  arr.unshift({
    id: crypto.randomUUID(),
    ts: Date.now(),
    input: { ...state.lastInput, targetDate: state.lastInput.targetDate?.toISOString?.() },
    self: state.lastResult.landTaxValueSELF,
    normal: state.lastResult.landTaxValueNORMAL,
  });
  // 只保留最近 20 筆
  saveHistoryArr(arr.slice(0, 20));
  renderHistory();
  toast(t(state.lang, "toast.saved"));
}
function renderHistory() {
  const list = $("#history-list");
  const arr = loadHistory();
  if (!arr.length) {
    list.innerHTML = `<li class="history-empty">${t(state.lang, "history.empty")}</li>`;
    return;
  }
  list.innerHTML = arr
    .map((row) => {
      const d = new Date(row.ts);
      const title = row.input.memo || `${row.input.landYear}/${row.input.landMonth} · ${row.input.landArea}㎡`;
      const dateStr = d.toLocaleDateString(state.lang === "en" ? "en-US" : "zh-TW", {
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      return `
        <li class="item" data-id="${row.id}">
          <div>
            <div>${escapeHtml(title)}</div>
            <div class="hist-meta">${dateStr} · ${row.input.isCity ? t(state.lang, "input.city") : t(state.lang, "input.rural")}</div>
          </div>
          <div class="hist-amount">${formatTWD(row.self)}</div>
          <div style="display:flex;gap:6px">
            <button data-act="load">${state.lang === "en" ? "Load" : "載入"}</button>
            <button data-act="del">${state.lang === "en" ? "Delete" : "刪除"}</button>
          </div>
        </li>`;
    })
    .join("");
  list.onclick = (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.closest("li").dataset.id;
    const arr = loadHistory();
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return;
    if (btn.dataset.act === "del") {
      arr.splice(idx, 1);
      saveHistoryArr(arr);
      renderHistory();
    } else {
      const inp = arr[idx].input;
      applyShareInput({ ...inp, memo: inp.memo || "" });
      switchTab("manual");
      $("#calc-form").requestSubmit();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
}
function clearHistory() {
  if (!confirm(state.lang === "en" ? "Clear all history?" : "確定要清除全部歷史紀錄嗎？")) return;
  saveHistoryArr([]);
  renderHistory();
  toast(t(state.lang, "toast.cleared"));
}

// ─── Toast ──────────────────────────────
let toastTimer;
function toast(msg) {
  let box = $("#toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.style.cssText =
      "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 18px;border-radius:999px;font-size:.9rem;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none";
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.style.opacity = "0"), 2200);
}

// ─── 初始化 ────────────────────────────
function init() {
  applyTheme();
  applyLang();
  initTabs();
  initPdfTab();
  initLookupUI();
  initLeadForm();
  renderMember();
  initOnboarding();

  // ── 登入 / 會員 ──
  $("#btn-member").addEventListener("click", () => {
    if (state.token) openProfile();
    else $("#login-dialog").showModal();
  });
  $("#login-form").addEventListener("submit", handleLoginSubmit);
  $("#lg-cancel").addEventListener("click", () => $("#login-dialog").close());
  $("#lg-goto-register").addEventListener("click", (ev) => {
    ev.preventDefault();
    $("#login-dialog").close();
    $("#register-dialog").showModal();
  });
  $("#lg-goto-forgot").addEventListener("click", (ev) => {
    ev.preventDefault();
    $("#login-dialog").close();
    $("#fg-account").value = $("#lg-account").value.trim();
    $("#forgot-dialog").showModal();
  });

  // ── 註冊 ──
  $("#register-form").addEventListener("submit", handleRegisterSubmit);
  $("#rg-cancel").addEventListener("click", () => $("#register-dialog").close());

  // ── 忘記密碼 ──
  $("#forgot-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleForgotOrChange(e.target, $("#forgot-error"), () => $("#forgot-dialog").close(), false);
  });
  $("#fg-cancel").addEventListener("click", () => $("#forgot-dialog").close());

  // ── 修改密碼 ──
  $("#changepw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleForgotOrChange(e.target, $("#changepw-error"), () => $("#changepw-dialog").close(), true);
  });
  $("#cp-cancel").addEventListener("click", () => $("#changepw-dialog").close());

  // ── 會員中心按鈕 ──
  $("#pf-close-x").addEventListener("click", () => $("#profile-dialog").close());
  $("#pf-logout").addEventListener("click", logout);
  $("#pf-refresh").addEventListener("click", () => refreshMember(true));
  $("#pf-topup").addEventListener("click", () => $("#topup-dialog").showModal());
  $("#pf-delete").addEventListener("click", handleDeleteAccount);
  $("#pf-edit").addEventListener("click", () => {
    if (!state.member) return;
    $("#ed-mobile").value = state.member.mobile || "";
    $("#ed-birthday").value = state.member.birthday || "";
    $("#profile-dialog").close();
    $("#edit-dialog").showModal();
  });
  $("#pf-change-pw").addEventListener("click", () => {
    $("#cp-mobile").value = state.member?.mobile || "";
    $("#profile-dialog").close();
    $("#changepw-dialog").showModal();
  });

  // ── 修改資料 ──
  $("#edit-form").addEventListener("submit", handleEditSubmit);
  $("#ed-cancel").addEventListener("click", () => $("#edit-dialog").close());

  // ── 選資料 / 綜合計算 ──
  $("#pick-cancel").addEventListener("click", () => $("#pick-dialog").close());
  $("#pick-close-x").addEventListener("click", () => $("#pick-dialog").close());
  $("#pick-submit").addEventListener("click", handlePickSubmit);
  $("#combined-close").addEventListener("click", () => $("#combined-dialog").close());
  $("#combined-close-x").addEventListener("click", () => $("#combined-dialog").close());
  $("#combined-print").addEventListener("click", () => window.print());

  // 從 hash 還原
  const shared = parseShareHash();
  if (shared) {
    applyShareInput(shared);
    switchTab("manual");
    setTimeout(() => $("#calc-form").requestSubmit(), 50);
  }

  // 綁定事件
  $("#btn-theme").addEventListener("click", cycleTheme);
  $("#btn-lang").addEventListener("click", toggleLang);
  $("#btn-example").addEventListener("click", loadExample);
  $("#btn-reset").addEventListener("click", resetForm);
  $("#calc-form").addEventListener("submit", handleSubmit);
  $("#btn-share").addEventListener("click", copyShareLink);
  $("#btn-save").addEventListener("click", saveCurrentToHistory);
  $("#btn-print").addEventListener("click", () => window.print());
  $("#btn-clear-history").addEventListener("click", clearHistory);

  const aboutDlg = $("#about-dialog");
  $("#btn-about").addEventListener("click", (e) => {
    e.preventDefault();
    aboutDlg.showModal();
  });

  $("#year").textContent = new Date().getFullYear();

  // 允許 Enter 在任何欄位送出
  $("#calc-form").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      e.preventDefault();
      $("#calc-form").requestSubmit();
    }
  });

  // 偵測 hash 變更 (返回等)
  window.addEventListener("hashchange", () => {
    const s = parseShareHash();
    if (s) {
      applyShareInput(s);
      $("#calc-form").requestSubmit();
    }
  });

  // 註冊 Service Worker (離線)
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// ─── 會員 / 登入 ─────────────────────────
function renderMember() {
  const label = $("#member-label");
  const badge = $("#member-badge");
  if (state.member && state.token) {
    const name = state.member.name || state.member.account || "Member";
    label.textContent = name;
    badge.hidden = false;
    badge.textContent = `${state.member.points ?? 0} pts`;
  } else {
    label.textContent = t(state.lang, "nav.login");
    badge.hidden = true;
    badge.textContent = "";
  }
}

function logout() {
  state.token = null;
  state.member = null;
  localStorage.removeItem(LS_KEYS.token);
  localStorage.removeItem(LS_KEYS.member);
  renderMember();
  $("#profile-dialog").close();
}

function formErrorToText(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err.errors && typeof err.errors === "object") {
    // {"email":["請輸入賬號"], ...}
    return Object.entries(err.errors)
      .map(([k, v]) => Array.isArray(v) ? v.join("、") : String(v))
      .join("\n");
  }
  return err.message || "";
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const err = $("#login-error");
  err.hidden = true;
  const submitBtn = e.target.querySelector("button[type=submit]");
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t(state.lang, "login.loggingIn");
  try {
    const account = $("#lg-account").value.trim();
    const password = $("#lg-password").value;
    const r = await API.login(account, password);
    if (!r.ok) {
      err.textContent = r.message || t(state.lang, "login.fail");
      err.hidden = false;
      return;
    }
    state.token = r.token;
    state.member = r.member;
    localStorage.setItem(LS_KEYS.token, r.token);
    localStorage.setItem(LS_KEYS.member, JSON.stringify(r.member));
    renderMember();
    $("#login-dialog").close();
    toast(t(state.lang, "login.success", { name: r.member?.name || r.member?.account || "" }));
  } catch (e) {
    err.textContent = e.message || "Login failed";
    err.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// ─── 註冊 ────────────────────────────────
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const err = $("#register-error");
  err.hidden = true;

  const p1 = $("#rg-password").value;
  const p2 = $("#rg-password2").value;
  if (p1 !== p2) {
    err.textContent = t(state.lang, "register.pwMismatch");
    err.hidden = false;
    return;
  }
  if (!$("#rg-agree").checked) {
    err.textContent = t(state.lang, "register.mustAgree");
    err.hidden = false;
    return;
  }

  const submitBtn = e.target.querySelector("button[type=submit]");
  const origText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t(state.lang, "register.submitting");

  try {
    const r = await API.register({
      account: $("#rg-account").value.trim(),
      password: p1,
      name: $("#rg-name").value.trim(),
      mobile: $("#rg-mobile").value.trim() || undefined,
      birthday: $("#rg-birthday").value || undefined,
    });
    if (!r.ok) {
      err.textContent = formErrorToText(r) || t(state.lang, "login.fail");
      err.hidden = false;
      return;
    }
    // 成功 → 關閉註冊、自動打開登入並帶入帳號
    $("#register-dialog").close();
    $("#lg-account").value = $("#rg-account").value.trim();
    $("#lg-password").value = "";
    toast(t(state.lang, "register.success"));
    $("#login-dialog").showModal();
  } catch (e) {
    err.textContent = e.message || "Network error";
    err.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
}

// ─── 忘記密碼 / 修改密碼 (共用流程) ────────
async function handleForgotOrChange(formEl, errEl, closeDialog, isChange = false) {
  errEl.hidden = true;
  const submitBtn = formEl.querySelector("button[type=submit]");
  const orig = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t(state.lang, "forgot.submitting");

  // 修改密碼時已登入 → 帳號從 state 帶
  const account = isChange
    ? (state.member?.account || "")
    : $("#fg-account").value.trim();
  const prefix = isChange ? "cp" : "fg";
  const mobile = $(`#${prefix}-mobile`).value.trim();
  const birthday = $(`#${prefix}-birthday`).value;
  const password = $(`#${prefix}-password`).value;

  try {
    // 先做身分驗證
    const check = await API.identityCheck({ account, mobile, birthday });
    if (!check.ok) {
      errEl.textContent = formErrorToText(check) || "身分驗證失敗";
      errEl.hidden = false;
      return;
    }
    const finalAccount = check.account || account;

    // 設新密碼
    const r = await API.setNewPassword({
      account: finalAccount,
      mobile,
      birthday,
      password,
    });
    if (!r.ok) {
      errEl.textContent = formErrorToText(r) || "設定密碼失敗";
      errEl.hidden = false;
      return;
    }
    closeDialog();
    toast(t(state.lang, "forgot.success"));
    if (isChange) {
      // 改密碼成功 → 登出讓使用者用新密碼重登
      logout();
      $("#login-dialog").showModal();
    } else {
      // 忘記密碼 → 開啟登入 dialog
      $("#lg-account").value = finalAccount;
      $("#login-dialog").showModal();
    }
  } catch (e) {
    errEl.textContent = e.message || "Network error";
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = orig;
  }
}

// ─── 修改個人資料 ────────────────────────
async function handleEditSubmit(e) {
  e.preventDefault();
  const err = $("#edit-error");
  err.hidden = true;
  if (!state.token) return;
  const submitBtn = e.target.querySelector("button[type=submit]");
  const orig = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = t(state.lang, "edit.submitting");

  try {
    const r = await API.updateUserInfo(state.token, {
      mobile: $("#ed-mobile").value.trim(),
      birthday: $("#ed-birthday").value,
    });
    if (!r.ok) {
      err.textContent = formErrorToText(r) || "更新失敗";
      err.hidden = false;
      return;
    }
    // 刷新會員資料
    await refreshMember(false);
    $("#edit-dialog").close();
    toast(t(state.lang, "edit.success"));
  } catch (e) {
    err.textContent = e.message || "Network error";
    err.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = orig;
  }
}

// ─── 會員中心開/關 ─────────────────────
async function openProfile() {
  if (!state.token) {
    $("#login-dialog").showModal();
    return;
  }
  renderProfile();
  $("#profile-dialog").showModal();
  // 背景刷新
  refreshMember(false);
}

function renderProfile() {
  const m = state.member || {};
  const ns = t(state.lang, "profile.notSet");
  $("#pf-name").textContent = m.name || ns;
  $("#pf-account").textContent = m.account || ns;
  $("#pf-mobile").textContent = m.mobile || ns;
  $("#pf-tw-id").textContent = m.tw_id_number || m.twIdNumber || ns;
  $("#pf-member-exp").textContent = m.member_expired || m.memberExpired || ns;
  $("#pf-commercial-exp").textContent = m.commercial_expired || m.commercialExpired || ns;
  $("#pf-points").textContent = m.points ?? 0;
}

async function refreshMember(showToast = true) {
  if (!state.token) return;
  const r = await API.getMemberInfoByToken(state.token);
  if (!r.ok) {
    if (r.status === 401) {
      logout();
      toast(t(state.lang, "login.fail"));
    }
    return;
  }
  state.member = r.member;
  localStorage.setItem(LS_KEYS.member, JSON.stringify(r.member));
  renderMember();
  renderProfile();
  if (showToast) toast(t(state.lang, "profile.refreshed"));
}

async function handleDeleteAccount() {
  if (!state.token) return;
  if (!confirm(t(state.lang, "profile.deleteConfirm"))) return;
  const r = await API.deleteAccount(state.token);
  if (!r.ok) {
    toast(r.message || "刪除失敗");
    return;
  }
  toast(t(state.lang, "profile.deleted"));
  logout();
}

// ─── 地號查詢 UI ─────────────────────────
function initLookupUI() {
  const citySel = $("#lk-city");
  const townSel = $("#lk-town");
  const sectionSel = $("#lk-section");
  const filterInput = $("#lk-section-filter");
  const hintEl = $("#lk-section-hint");

  // 填入縣市
  citySel.innerHTML = Object.entries(CITIES)
    .map(([code, name]) => `<option value="${code}">${name}</option>`)
    .join("");

  const resetSections = () => {
    state.sections = [];
    sectionSel.innerHTML = `<option value="">${t(state.lang, "lookup.selectTownFirst")}</option>`;
    sectionSel.disabled = true;
    if (hintEl) hintEl.textContent = "";
  };

  const fillTowns = (opts = {}) => {
    const city = citySel.value;
    const towns = TOWNS[city] || {};
    townSel.innerHTML = Object.entries(towns)
      .map(([idx, name]) => `<option value="${idx}">${name}</option>`)
      .join("");
    resetSections();
    // 初次載入時由 initLookupUI 延後呼叫，避免阻塞首屏；使用者切換縣市則立即載入
    if (!opts.skipSections) autoLoadSections();
  };

  citySel.addEventListener("change", () => fillTowns());
  townSel.addEventListener("change", autoLoadSections);

  filterInput.addEventListener("input", () => applySectionFilter());

  $("#btn-lookup").addEventListener("click", lookupParcel);

  ["#lk-no1", "#lk-no2"].forEach((sel) => {
    $(sel).addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    });
  });

  // 只填縣市/鄉鎮下拉（純本機資料，不打 API）
  fillTowns({ skipSections: true });

  // 段小段需呼叫後端（實測約 1.9 秒），延後到瀏覽器閒置時再載入，
  // 避免阻塞首屏——多數訪客只用「手動計算」，不需要這份資料。
  const lazyLoadSections = () => autoLoadSections();
  if ("requestIdleCallback" in window) requestIdleCallback(lazyLoadSections, { timeout: 2500 });
  else setTimeout(lazyLoadSections, 1200);
}

// ── 自動載入目前縣市+鄉鎮的所有段 ──
async function autoLoadSections() {
  const city = $("#lk-city").value;
  const town = $("#lk-town").value;
  const sectionSel = $("#lk-section");
  const hintEl = $("#lk-section-hint");
  const errEl = $("#lookup-error");
  errEl.hidden = true;

  if (!city || !town) return;

  sectionSel.disabled = true;
  sectionSel.innerHTML = `<option>${t(state.lang, "lookup.loadingSections")}</option>`;
  if (hintEl) hintEl.textContent = "";

  try {
    const r = await API.searchSection(city, town, "");
    if (!r.ok) {
      state.sections = [];
      sectionSel.innerHTML = `<option value="">${t(state.lang, "lookup.sectionLoadFail")}</option>`;
      errEl.textContent = friendlyMoiError(r.message) || r.message || "段載入失敗";
      errEl.hidden = false;
      return;
    }
    state.sections = r.sections || [];
    applySectionFilter();
    sectionSel.disabled = false;
    if (hintEl) {
      hintEl.textContent = ` (${state.sections.length} 筆)`;
    }
  } catch (e) {
    state.sections = [];
    sectionSel.innerHTML = `<option value="">${t(state.lang, "lookup.sectionLoadFail")}</option>`;
    errEl.textContent = e.message || "網路錯誤";
    errEl.hidden = false;
  }
}

function applySectionFilter() {
  const sectionSel = $("#lk-section");
  const filterInput = $("#lk-section-filter");
  const q = (filterInput?.value || "").trim().toLowerCase();
  const all = state.sections || [];
  const filtered = q
    ? all.filter((s) =>
        (s.NAME || "").toLowerCase().includes(q) ||
        (s.SEC || "").toLowerCase().includes(q),
      )
    : all;

  if (filtered.length === 0) {
    sectionSel.innerHTML = `<option value="">${t(state.lang, "lookup.noMatch")}</option>`;
    sectionSel.disabled = true;
    return;
  }
  sectionSel.innerHTML =
    `<option value="">${t(state.lang, "lookup.pickSection")}</option>` +
    filtered
      .map(
        (s, i) =>
          `<option value="${state.sections.indexOf(s)}">${escapeHtml(s.NAME)}（${s.SEC}）${s.COMMENT ? " · " + escapeHtml(s.COMMENT) : ""}</option>`,
      )
      .join("");
  sectionSel.disabled = false;
}

function friendlyMoiError(msg) {
  if (!msg) return null;
  if (msg.includes("A0702") || msg.includes("內政部相關API取得失敗")) {
    return state.lang === "en"
      ? "⚠ Ministry of Interior (MOI) API is currently down. This is not a bug on our side — the same error is happening to the mobile app and all other tools that depend on MOI. Please try again in 10-30 minutes, or use Manual Calculation tab in the meantime."
      : "⚠ 內政部地政協作平台 API 目前無回應（全台所有地號查詢都受影響，不是我們的問題）。這也會影響手機 App 的新查詢。請稍後 10-30 分鐘再試，或切到「手動計算」分頁直接輸入。(錯誤碼 A0702)";
  }
  if (msg.includes("找不到") || msg.includes("not found")) {
    return state.lang === "en"
      ? "Parcel not found. Please double-check the number."
      : "查無此地號，請確認輸入是否正確。";
  }
  if (msg.includes("點數不足") || msg.includes("Insufficient")) {
    return state.lang === "en"
      ? "Insufficient points. Please top up through the mobile app."
      : "點數不足，請至手機 App 儲值。";
  }
  return null; // fall through to original message
}

async function lookupParcel() {
  const errEl = $("#lookup-error");
  errEl.hidden = true;

  if (!state.token) {
    errEl.textContent = t(state.lang, "lookup.needLogin");
    errEl.hidden = false;
    $("#login-dialog").showModal();
    return;
  }

  const city = $("#lk-city").value;
  const sectionIdx = $("#lk-section").value;
  const section = state.sections[parseInt(sectionIdx, 10)];
  let no1 = $("#lk-no1").value.trim();
  let no2 = $("#lk-no2").value.trim();
  if (!section || !no1) {
    errEl.textContent = t(state.lang, "lookup.missingFields");
    errEl.hidden = false;
    return;
  }
  no1 = no1.padStart(4, "0");
  no2 = (no2 || "0000").padStart(4, "0");
  const no = no1 + no2;

  const btn = $("#btn-lookup");
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = t(state.lang, "lookup.fetching");
  try {
    const r = await API.fetchLandSet(state.token, city, section.UNIT, section.SEC, no);
    if (!r.ok) {
      if (r.status === 401) {
        logout();
        errEl.textContent = t(state.lang, "login.fail");
      } else {
        errEl.textContent = friendlyMoiError(r.message) || r.message || "查詢失敗";
      }
      errEl.hidden = false;
      return;
    }
    const rows = API.flattenLandSet(r);
    if (rows.length === 0) {
      errEl.textContent = t(state.lang, "lookup.noResult");
      errEl.hidden = false;
      return;
    }

    // 更新會員點數
    if (state.member && typeof r.memberPoints === "number") {
      state.member.points = r.memberPoints;
      localStorage.setItem(LS_KEYS.member, JSON.stringify(state.member));
      renderMember();
    }

    // 只有一筆 → 直接帶入；多筆 → 讓使用者選
    if (rows.length === 1) {
      fillFormWith(rows[0]);
      switchTab("manual");
      $("#calc-form").requestSubmit();
      toast(`${t(state.lang, "lookup.success")}。${t(state.lang, "lookup.costPoints", { p: r.apiPrice ?? "?", r: r.memberPoints ?? "?" })}`);
    } else {
      showPickDialog(rows, r);
    }
  } catch (e) {
    errEl.textContent = e.message || "網路錯誤";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function fillFormWith(row) {
  $("#landValue").value = row.landValue;
  $("#landOrgValue").value = row.landOrgValue;
  $("#landArea").value = row.landArea;
  $("#landYear").value = row.landYear;
  $("#landMonth").value = row.landMonth;
  $("#landNumerator").value = row.landNumerator;
  $("#landDenominator").value = row.landDenominator;
  $(`#landType-${row.isCity ? "city" : "rural"}`).checked = true;
}

function showPickDialog(rows, fetchResult) {
  state.pickRows = rows;
  state.pickFetchResult = fetchResult;

  const ul = $("#pick-list");
  ul.innerHTML = rows
    .map((r, i) => {
      const title = t(state.lang, "pick.title2", { idx: i + 1 });
      const owner = t(state.lang, "pick.owner", { n: r.owrNo });
      const transfer = t(state.lang, "pick.transfer", {
        y: r.landYear,
        m: String(r.landMonth).padStart(2, "0"),
        num: r.landNumerator,
        den: r.landDenominator,
      });
      const prev = t(state.lang, "pick.prevValue");
      return `
        <li class="row" data-idx="${i}">
          <label class="row-label">
            <input type="checkbox" data-idx="${i}" />
            <div class="row-body">
              <div class="row-title">
                <span>${title}</span>
                <span class="secondary">${escapeHtml(owner)}</span>
              </div>
              <div class="pick-meta">${escapeHtml(transfer)}</div>
              <div class="pick-meta">${prev}：${formatTWD(r.landOrgValue)} / ㎡</div>
            </div>
          </label>
        </li>`;
    })
    .join("");

  // checkbox 事件
  const checks = ul.querySelectorAll('input[type="checkbox"]');
  const allCb = $("#pick-all");
  allCb.checked = false;
  const updateState = () => {
    const selected = [...checks].filter((c) => c.checked);
    const n = selected.length;
    $("#pick-count").textContent = `${n} / ${rows.length}`;
    const submitBtn = $("#pick-submit");
    const label = $("#pick-submit-label");
    submitBtn.disabled = n === 0;
    if (n === 0) {
      label.textContent = t(state.lang, "pick.calculate");
    } else if (n === 1) {
      label.textContent = t(state.lang, "pick.calculateN", { n: 1 });
    } else {
      label.textContent = t(state.lang, "pick.combineN", { n });
    }
    // 標記被勾選的 row
    checks.forEach((c) => {
      c.closest("li")?.classList.toggle("checked", c.checked);
    });
    allCb.checked = n === rows.length && n > 0;
  };
  checks.forEach((c) => c.addEventListener("change", updateState));
  allCb.onchange = () => {
    checks.forEach((c) => (c.checked = allCb.checked));
    updateState();
  };
  updateState();

  $("#pick-dialog").showModal();
}

function handlePickSubmit() {
  const checks = $("#pick-list").querySelectorAll('input[type="checkbox"]');
  const selected = [...checks].filter((c) => c.checked).map((c) => parseInt(c.dataset.idx, 10));
  if (selected.length === 0) return;

  const rows = state.pickRows;
  const fetchResult = state.pickFetchResult;

  if (selected.length === 1) {
    // 單選 → 帶入表單 + 試算
    fillFormWith(rows[selected[0]]);
    $("#pick-dialog").close();
    switchTab("manual");
    $("#calc-form").requestSubmit();
    toast(
      `${t(state.lang, "lookup.success")}。${t(state.lang, "lookup.costPoints", {
        p: fetchResult?.apiPrice ?? "?",
        r: fetchResult?.memberPoints ?? "?",
      })}`,
    );
  } else {
    // 多選 → 各筆分別計算後加總
    showCombinedResult(selected.map((i) => rows[i]));
  }
}

// ─── 綜合計算（多筆加總） ────────────
function showCombinedResult(selectedRows) {
  const targetDateVal = $("#targetDate").value;
  const targetDate = targetDateVal ? new Date(targetDateVal) : new Date();

  const perRow = selectedRows.map((row, i) => {
    try {
      const res = calculateLVIT({
        landValue: row.landValue,
        landOrgValue: row.landOrgValue,
        landArea: row.landArea,
        landYear: row.landYear,
        landMonth: row.landMonth,
        landNumerator: row.landNumerator,
        landDenominator: row.landDenominator,
        isCity: row.isCity,
        targetDate,
      });
      return { idx: i, row, res, error: null };
    } catch (e) {
      return { idx: i, row, res: null, error: e.message };
    }
  });

  const totalSelf = perRow.reduce((s, x) => s + (x.res?.landTaxValueSELF ?? 0), 0);
  const totalNormal = perRow.reduce((s, x) => s + (x.res?.landTaxValueNORMAL ?? 0), 0);
  const tiers = [...new Set(perRow.map((x) => x.res?.tierUsed).filter(Boolean))];
  const tierText =
    tiers.length === 1
      ? t(state.lang, `tier.${tiers[0]}`)
      : t(state.lang, "combined.mixed") +
        " (" + tiers.map((x) => x.replace("L", "第") + "級").join(", ") + ")";

  $("#combined-self").textContent = formatTWD(totalSelf);
  $("#combined-normal").textContent = formatTWD(totalNormal);
  $("#combined-tier").textContent = tierText;
  $("#combined-intro").textContent = t(state.lang, "combined.intro", { n: selectedRows.length });

  const detail = $("#combined-detail");
  detail.innerHTML = perRow
    .map(({ idx, row, res, error }) => {
      const rowTitle = t(state.lang, "pick.title2", { idx: idx + 1 });
      if (error) {
        return `<div class="combined-row" style="border-left:3px solid var(--error)">
          <div class="combined-row-head">${rowTitle}</div>
          <div style="color:var(--error)">${escapeHtml(error)}</div>
        </div>`;
      }
      return `
        <div class="combined-row">
          <div class="combined-row-head">${rowTitle} — 持分 ${row.landNumerator}/${row.landDenominator} · 前次 ${row.landYear}/${String(row.landMonth).padStart(2, "0")}</div>
          <div class="combined-row-grid">
            <div>${t(state.lang, "result.selfTitle")}: <strong>${formatTWD(res.landTaxValueSELF)}</strong></div>
            <div>${t(state.lang, "result.normalTitle")}: <strong>${formatTWD(res.landTaxValueNORMAL)}</strong></div>
            <div>${t(state.lang, "result.totalValue")}: ${formatTWD(res.landTotalValue)}</div>
            <div>${t(state.lang, "result.multiple")}: ${formatNum(res.landMultiple, 3)}</div>
            <div>${t(state.lang, "result.hold")}: ${formatNum(res.landHoldYear, 2)} ${t(state.lang, "holdYears")}</div>
            <div>${t(state.lang, "result.transferArea")}: ${formatNum(res.landTransferArea, 2)} ㎡</div>
          </div>
        </div>`;
    })
    .join("");

  state.combinedData = { perRow, selectedRows, totalSelf, totalNormal, targetDate };

  $("#pick-dialog").close();
  $("#combined-dialog").showModal();
}

document.addEventListener("DOMContentLoaded", init);
