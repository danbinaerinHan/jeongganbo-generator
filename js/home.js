/* ============================================================================
   우물사이 — 첫 화면 (index.html)
   ============================================================================
   하는 일은 셋뿐이다(워드마크는 index.html에 인라인):
     ② 저장된 작업이 있으면 편집기 칸에 '작업 중인 악보 · 「제목」'을 적는다
     ③ 공유마당 칸에 곡 수 한 줄(올라온 악보 · 국악원 정악보)을 적는다
     ④ 게시판 스위치가 켜져 있으면 윗줄에 [문의·제안]를 띄운다
   악보를 그리지 않으므로 app.js·기호 데이터를 안 싣는다(공유마당과 같다).
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const API = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/rpc/";
  const HEADERS = { "apikey": KEY, "Content-Type": "application/json" };
  if (/^eyJ/.test(KEY)) HEADERS["Authorization"] = "Bearer " + KEY;
  const SERVER = !!(CFG.url && KEY) && location.protocol !== "file:";
  // ★ browse.js의 NGC_AUTHOR와 글자까지 같아야 한다 — 어긋나면 국악원 몫이 빈다
  const NGC_AUTHOR = "국립국악원 (OMR)";

  function $(id) { return document.getElementById(id); }
  function track(name, props) { try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) {} }

  // ---------- 화면 설정(테마·다크)은 편집기를 따라간다 ----------
  try {
    if (localStorage.getItem("jgb_dark_v1") === "1") document.body.classList.add("dark");
    const th = localStorage.getItem("jgb_theme_v1");
    if (th === "crystal") document.body.classList.add("theme-crystal");
    else if (th === "celadon") document.body.classList.add("theme-celadon");
  } catch (e) {}

  // ---------- ② 작업 중인 악보 ----------
  // 편집기의 자동 저장(app.js LS_KEY = jgb_state_v1)에서 제목만 읽는다. 칸 전체가 편집기로 가는
  // 링크이고 편집기가 그 작업을 알아서 연다 — 그래서 여기는 글로만 알린다.
  try {
    const raw = localStorage.getItem("jgb_state_v1");
    if (raw) {
      let title = "";
      try { title = ((JSON.parse(raw).controls || {}).title || "").trim(); } catch (e) {}
      const r = $("hmResume");
      r.textContent = title ? "작업 중인 악보 · 「" + title + "」" : "작업 중인 악보가 있습니다";
      r.hidden = false;
    }
  } catch (e) {}

  // ---------- ④ 문의·제안 ----------
  if (SERVER && CFG.board !== false) $("hmBoard").hidden = false;

  // ---------- ③ 공유마당 곡 수 ----------
  // 목록은 부르지 않고 수만 센다(p_limit 1 — total만 쓴다). 못 받으면 조용히 그 줄을 비워 둔다.
  function rpc(fn, body) {
    return fetch(API + fn, { method: "POST", headers: HEADERS, body: JSON.stringify(body || {}) })
      .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); });
  }
  if (SERVER && CFG.browse !== false) {
    const base = { p_sort: "recent", p_q: "", p_limit: 1, p_offset: 0 };
    Promise.all([
      rpc("list_scores", Object.assign({ p_author: null, p_author_not: NGC_AUTHOR }, base)),
      rpc("list_scores", Object.assign({ p_author: NGC_AUTHOR, p_author_not: null }, base)),
    ]).then(function (rs) {
      const c = $("hmCounts");
      c.textContent = "올라온 악보 " + (rs[0].total || 0) + "곡 · 국악원 정악보 " + (rs[1].total || 0) + "곡";
      c.hidden = false;
    }).catch(function () {});
  }

  track("home_open");
})();
