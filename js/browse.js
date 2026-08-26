/* ============================================================================
   우물사이 — 공유마당 (browse.html)
   ============================================================================
   사람들이 공개로 올린 악보를 모아 보여주는 페이지. 편집기(index.html)와 **다른 문서**다:
   여기서는 악보를 그리지 않으므로 app.js·기호 데이터(600KB)를 안 싣는다. 카드에 보이는
   그림은 올린 사람의 브라우저가 게시할 때 미리 떠 둔 것(서버는 악보를 그릴 줄 모른다).

   카드를 누르면 편집기의 `#v=<id>` 주소로 넘어가고, 거기서 cloud.js가 받아 연다 —
   목록과 편집기 사이에 다른 약속은 없다.

   서버와 말하는 법은 cloud.js와 같지만, 이 페이지는 cloud.js를 싣지 않는다(그쪽은
   window.jgbDoc이 있어야 돌아간다). 겹치는 것은 fetch 한 덩어리뿐이라 여기 다시 적었다.
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const API = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/rpc/";
  const HEADERS = { "apikey": KEY, "Content-Type": "application/json" };
  if (/^eyJ/.test(KEY)) HEADERS["Authorization"] = "Bearer " + KEY;

  function $(id) { return document.getElementById(id); }
  function track(name, props) { try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) {} }

  const PAGE = 24;
  let sort = "recent", q = "", offset = 0, total = 0, loading = false;

  // 탭 — "all"(올라온 악보) | "ngc"(국악원 정악보). 가르는 열쇠는 지은이 한 값이고 서버가
  // 거른다(list_scores의 p_author/p_author_not). ★ 이 문자열은 게시 스크립트
  // (tools/publish-ngc-omr.mjs의 AUTHOR)와 글자까지 같아야 한다 — 어긋나면 탭이 빈다.
  const NGC_AUTHOR = "국립국악원 (OMR)";
  let tab = "all";

  const LICENSE_KO = {
    "none": "저작권 유보", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC",
    "cc-by-sa": "CC BY-SA", "cc-by-nc-sa": "CC BY-NC-SA", "cc0": "CC0",
  };

  function editorUrl(id) {
    // 같은 폴더의 편집기로 넘긴다(브라우저가 알아서 절대 주소로 만든다)
    return "index.html#v=" + encodeURIComponent(id);
  }

  // "3일 전"처럼 — 목록에서는 정확한 시각보다 얼마나 됐는지가 알고 싶은 것이다
  function agoText(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return "방금";
    if (min < 60) return min + "분 전";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "시간 전";
    const day = Math.floor(hr / 24);
    if (day < 30) return day + "일 전";
    const mon = Math.floor(day / 30);
    if (mon < 12) return mon + "달 전";
    return Math.floor(mon / 12) + "년 전";
  }

  function rpc(fn, body) {
    return fetch(API + fn, { method: "POST", headers: HEADERS, body: JSON.stringify(body || {}) })
      .catch(function () { throw new Error("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요."); })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.ok) return data;
          throw new Error((data && data.message) || ("목록을 불러오지 못했습니다 (" + res.status + ")"));
        });
      });
  }

  // ---------- 카드 ----------
  function cardEl(s) {
    const a = document.createElement("a");
    a.className = "sc-card";
    a.href = editorUrl(s.id);

    const thumb = document.createElement("div");
    thumb.className = "sc-thumb";
    if (s.thumb) {
      const img = document.createElement("img");
      img.src = s.thumb;
      img.alt = "";
      img.loading = "lazy";       // 목록이 길어지면 보이는 것만 받는다
      thumb.appendChild(img);
    } else {
      // 그림 없이 올라온 것(옛 게시물·그리기 실패) — 빈 칸 대신 정간 격자를 흉내낸 표시
      thumb.classList.add("sc-thumb-none");
      thumb.textContent = "井";
    }
    a.appendChild(thumb);

    const body = document.createElement("div");
    body.className = "sc-body";
    const h = document.createElement("h3");
    h.className = "sc-title";
    h.textContent = s.title || "제목 없음";
    body.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "sc-meta";
    meta.textContent = (s.author ? s.author : "이름 없음") + " · " + agoText(s.created_at);
    body.appendChild(meta);

    const tags = document.createElement("div");
    tags.className = "sc-tags";
    const lic = document.createElement("span");
    lic.className = "sc-tag";
    lic.textContent = LICENSE_KO[s.license] || s.license;
    tags.appendChild(lic);
    if (s.fork_of) {
      const f = document.createElement("span");
      f.className = "sc-tag sc-tag-fork";
      f.textContent = "다른 악보에서";
      f.title = "이 악보는 다른 게시물을 고쳐 만든 것입니다";
      tags.appendChild(f);
    }
    const v = document.createElement("span");
    v.className = "sc-views";
    v.textContent = "본 횟수 " + (s.view_count || 0);
    tags.appendChild(v);
    body.appendChild(tags);

    a.appendChild(body);
    return a;
  }

  // ---------- 목록 ----------
  function setStatus(msg, kind) {
    const el = $("scStatus");
    el.textContent = msg || "";
    el.className = "sc-status" + (kind ? " " + kind : "");
    el.style.display = msg ? "" : "none";
  }

  function load(reset) {
    if (loading) return;
    // 공유마당를 닫아 둔 동안 — 주소를 직접 쳐서 들어와도 목록을 부르지 않는다.
    // 화면을 닫는 것이지 서버를 닫는 것은 아니다(까닭은 js/cloud-config.js 주석 참고).
    if (CFG.browse === false) {
      document.querySelector(".sc-controls").style.display = "none";
      setStatus("공유마당은 준비 중입니다.\n악보는 [게시]로 만든 주소를 나눠 공유할 수 있습니다.", "sc-empty");
      $("scMore").style.display = "none";
      return;
    }
    if (!CFG.url || !KEY) {
      setStatus("게시 서버가 아직 연결되지 않았습니다.", "sc-empty");
      $("scMore").style.display = "none";
      return;
    }
    loading = true;
    if (reset) { offset = 0; $("scGrid").innerHTML = ""; }
    $("scMore").disabled = true;
    if (reset) setStatus("불러오는 중…");

    rpc("list_scores", {
      p_sort: sort, p_q: q, p_limit: PAGE, p_offset: offset,
      p_author: tab === "ngc" ? NGC_AUTHOR : null,        // 국악원 탭 = 그 지은이 것만
      p_author_not: tab === "all" ? NGC_AUTHOR : null,    // 올라온 악보 탭 = 그것만 빼고
    })
      .then(function (r) {
        loading = false;
        total = r.total || 0;
        const items = r.items || [];
        const grid = $("scGrid");
        items.forEach(function (s) { grid.appendChild(cardEl(s)); });
        offset += items.length;

        if (total === 0) {
          setStatus(q ? ("'" + q + "'에 해당하는 악보가 없습니다.")
                      : (tab === "ngc" ? "국악원 정악보가 아직 올라오지 않았습니다."
                                       : "아직 올라온 악보가 없습니다. 첫 악보를 올려 보세요."), "sc-empty");
        } else {
          setStatus("");
          $("scCount").textContent = total + "곡";
        }
        // 더 남았을 때만 [더 보기] — 끝까지 눌러보고 나서야 끝인 줄 알게 하지 않는다
        $("scMore").style.display = (offset < total) ? "" : "none";
        $("scMore").disabled = false;
      })
      .catch(function (e) {
        loading = false;
        $("scMore").disabled = false;
        setStatus((e && e.message) || "목록을 불러오지 못했습니다.", "sc-error");
      });
  }

  // ---------- 배선 ----------
  document.querySelectorAll(".sc-tab").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.classList.contains("on")) return;
      document.querySelectorAll(".sc-tab").forEach(function (o) { o.classList.remove("on"); });
      b.classList.add("on");
      tab = b.getAttribute("data-tab");
      // 탭마다 안내문이 다르다 — 국악원 탭의 출처·CC BY-NC-SA 표기가 그 안내문에 있다
      $("scLeadAll").style.display = tab === "all" ? "" : "none";
      $("scLeadNgc").style.display = tab === "ngc" ? "" : "none";
      track("browse_tab", { v: tab });
      load(true);
    });
  });

  document.querySelectorAll(".sc-sort").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.classList.contains("on")) return;
      document.querySelectorAll(".sc-sort").forEach(function (o) { o.classList.remove("on"); });
      b.classList.add("on");
      sort = b.getAttribute("data-sort");
      track("browse_sort", { v: sort });
      load(true);
    });
  });

  let searchTimer = null;
  $("scSearch").addEventListener("input", function () {
    // 치는 대로 바로 찾되 240ms 묶는다 — 한 글자마다 서버를 부르지 않으려고
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      const v = $("scSearch").value.trim();
      if (v === q) return;
      q = v;
      if (q) track("browse_search");
      load(true);
    }, 240);
  });
  $("scSearch").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중 Enter 무시
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); q = $("scSearch").value.trim(); load(true); }
  });

  $("scMore").addEventListener("click", function () { load(false); });

  // 편집기로 가는 버튼의 이름 — 가는 곳은 늘 index.html이지만, 편집 중이던 악보가 있으면
  // '돌아가기'라고 말해 줘야 누를 생각을 한다. '악보 만들기'만 있으면 하던 작업이 사라질까 봐
  // 안 누르고, 문패를 눌러야 돌아간다는 건 알 길이 없다.
  // 판단 근거는 편집기의 자동 저장 열쇠(app.js의 LS_KEY) 하나뿐이다 — 같은 출처라 그냥 읽힌다.
  try {
    if (localStorage.getItem("jgb_state_v1")) {
      const back = $("scBack");
      back.textContent = "← 편집기로 돌아가기";
      back.title = "편집하던 악보를 그대로 이어서";
    }
  } catch (e) {}

  // 화면 설정(색상 테마·다크)은 편집기와 같은 열쇠를 쓴다 — 두 페이지를 오갈 때 화면이
  // 바뀌면 딴 사이트처럼 보인다. 여기서 바꾸지는 않고 따라가기만 한다.
  try {
    if (localStorage.getItem("jgb_dark_v1") === "1") document.body.classList.add("dark");
    const th = localStorage.getItem("jgb_theme_v1");
    if (th === "crystal") document.body.classList.add("theme-crystal");
    else if (th === "celadon") document.body.classList.add("theme-celadon");
  } catch (e) {}

  track("browse_open");
  load(true);
})();
