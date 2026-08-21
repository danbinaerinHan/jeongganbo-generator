/* ============================================================================
   우물사이 — 관리 화면 (admin.html)
   ============================================================================
   올라온 악보를 훑고, 내리고, 문서를 받아 오는 자리. 편집기(index.html)·모아보기
   (browse.html)와 **다른 문서**라 app.js도 cloud.js도 안 싣는다 — 여기서는 악보를
   그리지 않으므로(카드의 그림은 올린 사람 브라우저가 게시할 때 떠 둔 것이다).

   ── 열쇠가 어디 있나 ──────────────────────────────────────────────────────
   익명 게시의 열쇠는 **토큰**이고 관리자의 열쇠는 **로그인 + 명단**이다. 로그인은
   Supabase Auth(전자우편+비밀번호)를 fetch로 직접 부르고(supabase-js를 안 들이는
   무의존 원칙), 받은 access_token을 `Authorization: Bearer`로 실어 admin_* RPC를
   부른다. 그 토큰은 **sessionStorage에만** 둔다 — 창을 닫으면 풀리는 쪽이 맞다.

   서버가 하는 확인은 둘이다: 로그인했는가 + admins 명단에 있는가(require_admin).
   그러니 이 파일이 화면을 아무리 열어 줘도 권한이 늘지 않는다 — 화면을 숨기는 것은
   보안이 아니라 정리다.
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const BASE = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const API = BASE + "/rest/v1/rpc/";
  const AUTH = BASE + "/auth/v1/";
  const ON = !!(BASE && KEY) && location.protocol !== "file:";

  const PAGE = 24;

  function $(id) { return document.getElementById(id); }

  // ---------- 이 브라우저의 관리 세션 ----------
  // sessionStorage다(localStorage 아님). 관리 열쇠는 오래 두지 않는다 — 창을 닫으면
  // 풀리고, 다시 들어오려면 비밀번호를 다시 친다. 그 대가는 로그인 한 번뿐이다.
  const SS = "jgb_admin_v1";
  function loadSess() {
    try { return JSON.parse(sessionStorage.getItem(SS)) || null; } catch (e) { return null; }
  }
  function saveSess(s) {
    try { s ? sessionStorage.setItem(SS, JSON.stringify(s)) : sessionStorage.removeItem(SS); }
    catch (e) {}
  }
  function mkSess(r) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      // expires_at을 안 주는 판도 있어 expires_in에서 셈해 둔다
      expires_at: r.expires_at || (now + (r.expires_in || 3600)),
      email: (r.user && r.user.email) || "",
      uid: (r.user && r.user.id) || "",
    };
  }

  // ---------- 서버와 말하기 ----------
  function jsonErr(data, status, fallback) {
    // Supabase Auth는 error_description·msg로, PostgREST는 message로 답한다.
    // 서버가 사람 말로 적어 둔 까닭(사유를 안 적었다·관리자가 아니다)을 그대로 보여주는
    // 것이 가장 친절하다 — 여기서 다시 번역하면 서버와 말이 어긋난다.
    const m = data && (data.message || data.error_description || data.msg ||
                       data.error || data.hint);
    return new Error(m || (fallback + " (" + status + ")"));
  }

  function authPost(path, body) {
    return fetch(AUTH + path, {
      method: "POST",
      headers: { "apikey": KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).catch(function () {
      throw new Error("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.ok) return data;
        if (res.status === 400 || res.status === 401) {
          throw new Error("전자우편이나 비밀번호가 맞지 않습니다.");
        }
        throw jsonErr(data, res.status, "로그인하지 못했습니다");
      });
    });
  }

  // 만료가 가까우면 미리 새로 받는다. 60초 여유를 두는 건 부르는 도중에 만료되지 않게.
  function fresh() {
    const s = loadSess();
    if (!s || !s.access_token) return Promise.reject(new Error("로그인이 필요합니다."));
    const now = Math.floor(Date.now() / 1000);
    if (s.expires_at - now > 60) return Promise.resolve(s);
    if (!s.refresh_token) return Promise.reject(new Error("로그인이 풀렸습니다."));
    return authPost("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
      .then(function (r) { const n = mkSess(r); saveSess(n); return n; })
      .catch(function () { throw new Error("로그인이 풀렸습니다. 다시 들어와 주세요."); });
  }

  function rpc(fn, body) {
    return fresh().then(function (s) {
      return fetch(API + fn, {
        method: "POST",
        headers: {
          "apikey": KEY,
          "Authorization": "Bearer " + s.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body || {}),
      }).catch(function () {
        throw new Error("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.");
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.ok) return data;
          if (res.status === 401) { signOut(true); throw new Error("로그인이 풀렸습니다."); }
          throw jsonErr(data, res.status, "서버 오류");
        });
      });
    });
  }

  // ---------- 잔글씨 ----------
  function dateText(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const d = new Date(t);
    const p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const LICENSE_KO = {
    "none": "저작권 유보", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC",
    "cc-by-sa": "CC BY-SA", "cc-by-nc-sa": "CC BY-NC-SA", "cc0": "CC0",
  };
  function editorUrl(id) { return "index.html#v=" + encodeURIComponent(id); }

  function copyText(text, okMsg) {
    return navigator.clipboard.writeText(text).then(function () {
      alert(okMsg);
    }).catch(function () {
      prompt("자동 복사가 막혀 있습니다. 아래를 직접 복사해 주세요.", text);
    });
  }

  // ---------- 로그인 화면 ↔ 목록 화면 ----------
  function showLogin(msg) {
    $("adLogin").style.display = "";
    $("adMain").style.display = "none";
    $("adOut").style.display = "none";
    $("adWho").textContent = "";
    const e = $("adLoginErr");
    e.textContent = msg || "";
    e.style.display = msg ? "" : "none";
    const em = $("adEmail");
    if (em && !msg) setTimeout(function () { em.focus(); }, 0);
  }
  function showMain(who) {
    $("adLogin").style.display = "none";
    $("adMain").style.display = "";
    $("adOut").style.display = "";
    $("adWho").textContent = who || "";
  }
  function signOut(quiet) {
    saveSess(null);
    showLogin(quiet ? "로그인이 풀렸습니다. 다시 들어와 주세요." : "");
  }

  // 들어온 사람이 정말 관리자인지는 **서버가** 답한다. 화면을 먼저 열어 놓고 물으면
  // 관리자가 아닌 사람에게 잠깐이라도 관리 화면이 보인다.
  function enter() {
    return rpc("admin_me", {}).then(function (me) {
      const s = loadSess();
      showMain((me && me.name) || (s && s.email) || "");
      load(true);
    });
  }

  // ---------- 목록 ----------
  let filter = "all", sort = "recent", q = "", offset = 0, total = 0, loading = false;

  function setStatus(msg, kind) {
    const el = $("adStatus");
    el.textContent = msg || "";
    el.className = "ad-status" + (kind ? " " + kind : "");
    el.style.display = msg ? "" : "none";
  }

  function stateTag(s) {
    if (s.hidden_at) return '<span class="ad-tag ad-tag-off">내림</span>';
    if (s.visibility === "public") return '<span class="ad-tag ad-tag-pub">공개</span>';
    return '<span class="ad-tag">주소만</span>';
  }

  function rowEl(s) {
    const tr = document.createElement("tr");
    if (s.hidden_at) tr.className = "ad-hidden";

    const thumb = s.thumb
      ? '<img class="ad-th" src="' + esc(s.thumb) + '" alt="" loading="lazy">'
      : '<div class="ad-th-none">井</div>';

    // 내려간 악보는 편집기에서 안 열린다(fetch_score가 막는다) — 눌러도 안 되는 버튼을
    // 살려 두면 고장으로 읽히므로 끄고 까닭을 붙인다. ⑤ 관리자 열기가 붙으면 살아난다.
    const openBtn = s.hidden_at
      ? '<button type="button" class="ad-btn ad-mini ad-ghost" disabled ' +
        'title="내려간 악보는 아직 편집기에서 열 수 없습니다. [문서 받기]로 내용을 볼 수 있습니다.">열기</button>'
      : '<a class="ad-btn ad-mini ad-ghost" href="' + editorUrl(s.id) +
        '" target="_blank" rel="noopener">열기</a>';

    const offBtn = s.hidden_at
      ? '<button type="button" class="ad-btn ad-mini ad-ghost" data-act="show">다시 열기</button>'
      : '<button type="button" class="ad-btn ad-mini ad-danger" data-act="hide">내리기</button>';

    const lint = (s.lint_bad == null) ? '<span class="ad-sub">—</span>'
      : (s.lint_bad > 0 ? '<span class="ad-lintbad">' + s.lint_bad + '</span>' : "0");

    tr.innerHTML =
      "<td>" + thumb + "</td>" +
      '<td><div class="ad-title">' + esc(s.title || "제목 없음") + "</div>" +
        '<div class="ad-id">#v=' + esc(s.id) + "</div>" +
        (s.hidden_at ? '<div class="ad-sub">' + esc(s.hidden_reason || "") + "</div>" : "") +
      "</td>" +
      "<td>" + esc(s.author || "이름 없음") +
        '<div class="ad-sub">' + esc(LICENSE_KO[s.license] || s.license || "") + "</div></td>" +
      "<td>" + stateTag(s) + "</td>" +
      '<td class="ad-c-ver">v' + (s.ver || 1) + "</td>" +
      '<td class="ad-c-lint">' + lint + "</td>" +
      '<td class="ad-c-num">' + (s.view_count || 0) + "</td>" +
      '<td><div class="ad-date">' + dateText(s.created_at) + "<br>" + dateText(s.updated_at) + "</div></td>" +
      '<td class="ad-c-act"><div class="ad-acts">' + openBtn +
        '<button type="button" class="ad-btn ad-mini ad-ghost" data-act="doc">문서 받기</button>' +
        offBtn + "</div></td>";

    tr.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        const act = b.getAttribute("data-act");
        if (act === "hide") openDlg(s);
        else if (act === "show") unhide(s);
        else if (act === "doc") grabDoc(s, b);
      });
    });
    return tr;
  }

  function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) { offset = 0; $("adRows").innerHTML = ""; setStatus("불러오는 중…"); }
    $("adMore").disabled = true;

    rpc("admin_list_scores", {
      p_sort: sort, p_q: q, p_limit: PAGE, p_offset: offset, p_filter: filter,
    }).then(function (r) {
      loading = false;
      total = r.total || 0;
      const items = r.items || [];
      const body = $("adRows");
      items.forEach(function (s) { body.appendChild(rowEl(s)); });
      offset += items.length;

      if (total === 0) {
        setStatus(q ? ("'" + q + "'에 해당하는 악보가 없습니다.")
                    : "여기에 해당하는 악보가 없습니다.");
        $("adCount").textContent = "";
      } else {
        setStatus("");
        $("adCount").textContent = total + "곡";
      }
      $("adMore").style.display = (offset < total) ? "" : "none";
      $("adMore").disabled = false;
    }).catch(function (e) {
      loading = false;
      $("adMore").disabled = false;
      setStatus((e && e.message) || "목록을 불러오지 못했습니다.", "ad-error");
    });
  }

  // ---------- 문서 받기 ----------
  // 고치는 첫 걸음이다: 문서를 .jgb.json으로 받아 편집기에서 [불러오기]로 열면 문법이
  // 틀린 글자에 빨간 바탕이 깔린다. 내려간 악보도 받을 수 있다(admin_get_score는
  // hidden을 안 가린다) — 무엇 때문에 내렸는지 보려면 열어 봐야 하므로.
  function grabDoc(s, btn) {
    btn.disabled = true;
    rpc("admin_get_score", { p_id: s.id }).then(function (r) {
      const name = (r.title || "악보").replace(/[\\/:*?"<>|]/g, "_") + " (v" + r.ver + ").jgb.json";
      const blob = new Blob([JSON.stringify(r.doc, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      btn.disabled = false;
    }).catch(function (e) {
      btn.disabled = false;
      alert((e && e.message) || "문서를 받지 못했습니다.");
    });
  }

  // ---------- 내리기 · 다시 열기 ----------
  let dlgScore = null;

  function openDlg(s) {
    dlgScore = s;
    $("adDlgTitle").textContent = s.title || "제목 없음";
    $("adDlgId").textContent = "#v=" + s.id;
    $("adDlgReason").value = s.hidden_reason || "";
    $("adDlgNote").value = s.hidden_note || "";
    $("adDlgErr").style.display = "none";
    $("adDlgAfter").style.display = "none";
    $("adDlgBtns").style.display = "";
    $("adDlgGo").disabled = false;
    $("adDlgReason").disabled = false;
    $("adDlgNote").disabled = false;
    $("adDlg").style.display = "flex";
    setTimeout(function () { $("adDlgReason").focus(); }, 0);
  }
  function closeDlg() { $("adDlg").style.display = "none"; dlgScore = null; }

  function dlgErr(msg) {
    const e = $("adDlgErr");
    e.textContent = msg;
    e.style.display = msg ? "" : "none";
  }

  // 중단 내역(notices.html)에 붙일 <tr>. 서버는 HTML을 모른다 — 만드는 것은 여기다.
  // 꼴은 그 파일 <tbody> 위 주석의 보기와 같아야 한다.
  function noticeRow(id, title, reason, when) {
    return [
      "<tr>",
      "  <td>" + when + "</td>",
      '  <td><code>#v=' + id + '</code><br><span class="t-sub">' + esc(title || "제목 없음") + "</span></td>",
      "  <td>" + esc(reason) + "</td>",
      "</tr>",
    ].join("\n");
  }

  function doHide() {
    if (!dlgScore) return;
    const reason = $("adDlgReason").value.trim();
    if (!reason) { dlgErr("사유를 적어 주세요. 이 주소를 여는 사람에게 그대로 보입니다."); return; }
    dlgErr("");
    $("adDlgGo").disabled = true;

    const s = dlgScore;
    rpc("admin_set_hidden", {
      p_id: s.id, p_hidden: true,
      p_reason: reason, p_note: $("adDlgNote").value.trim() || null,
    }).then(function (r) {
      // 창을 바로 닫지 않는다 — 약관 제6조 제4항이 약속하는 '중단 내역에 게시'가 아직
      // 남아 있고, 여기서 놓치면 언제 무엇을 내렸는지 다시 맞춰 봐야 한다.
      $("adDlgTr").value = noticeRow(s.id, r.title || s.title, reason,
                                     dateText(r.hidden_at) || dateText(new Date().toISOString()));
      $("adDlgAfter").style.display = "";
      // 이미 내렸으므로 [내리기]와 칸을 잠근다 — 살려 두면 같은 창에서 또 누를 수 있는
      // 것처럼 보이고, 실제로는 아무 일도 안 일어난다.
      $("adDlgBtns").style.display = "none";
      $("adDlgReason").disabled = true;
      $("adDlgNote").disabled = true;
      load(true);
    }).catch(function (e) {
      $("adDlgGo").disabled = false;
      dlgErr((e && e.message) || "내리지 못했습니다.");
    });
  }

  function unhide(s) {
    if (!confirm("‘" + (s.title || "제목 없음") + "’을 다시 엽니다.\n" +
                 "올린 사람이 골랐던 공개 설정(" +
                 (s.visibility === "public" ? "모아보기 목록에 올림" : "주소를 아는 사람만") +
                 ")으로 돌아갑니다. 계속할까요?")) return;
    rpc("admin_set_hidden", { p_id: s.id, p_hidden: false }).then(function () {
      load(true);
    }).catch(function (e) {
      alert((e && e.message) || "다시 열지 못했습니다.");
    });
  }

  // ---------- 배선 ----------
  $("adForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const btn = $("adGo");
    btn.disabled = true;
    $("adLoginErr").style.display = "none";
    authPost("token?grant_type=password", {
      email: $("adEmail").value.trim(), password: $("adPw").value,
    }).then(function (r) {
      saveSess(mkSess(r));
      $("adPw").value = "";
      return enter();
    }).then(function () {
      btn.disabled = false;
    }).catch(function (err) {
      saveSess(null);
      btn.disabled = false;
      const e2 = $("adLoginErr");
      e2.textContent = (err && err.message) || "들어가지 못했습니다.";
      e2.style.display = "";
    });
  });

  $("adOut").addEventListener("click", function () { signOut(false); });

  $("adTabs").addEventListener("click", function (e) {
    const b = e.target.closest(".ad-tab");
    if (!b || b.classList.contains("on")) return;
    $("adTabs").querySelectorAll(".ad-tab").forEach(function (o) { o.classList.remove("on"); });
    b.classList.add("on");
    filter = b.getAttribute("data-filter");
    load(true);
  });

  $("adSorts").addEventListener("click", function (e) {
    const b = e.target.closest(".ad-sort");
    if (!b || b.classList.contains("on")) return;
    $("adSorts").querySelectorAll(".ad-sort").forEach(function (o) { o.classList.remove("on"); });
    b.classList.add("on");
    sort = b.getAttribute("data-sort");
    load(true);
  });

  let searchTimer = null;
  $("adSearch").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      const v = $("adSearch").value.trim();
      if (v === q) return;
      q = v; load(true);
    }, 240);
  });
  $("adSearch").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중 Enter 무시
    if (e.key === "Enter") {
      e.preventDefault(); clearTimeout(searchTimer);
      q = $("adSearch").value.trim(); load(true);
    }
  });

  $("adMore").addEventListener("click", function () { load(false); });

  $("adDlgGo").addEventListener("click", doHide);
  $("adDlgCancel").addEventListener("click", closeDlg);
  $("adDlgClose").addEventListener("click", closeDlg);
  $("adDlgCopy").addEventListener("click", function () {
    copyText($("adDlgTr").value, "복사했습니다.\nnotices.html의 <tbody> 맨 위에 붙여 넣으세요.");
  });
  $("adDlg").addEventListener("mousedown", function (e) {
    // 바탕을 눌러 닫기 — 다만 내린 뒤(중단 내역 줄이 떠 있을 때)는 실수로 닫히지 않게 둔다
    if (e.target === $("adDlg") && $("adDlgAfter").style.display === "none") closeDlg();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("adDlg").style.display !== "none" &&
        $("adDlgAfter").style.display === "none") closeDlg();
  });

  // 화면 설정(색상 테마·다크)은 편집기와 같은 열쇠를 쓴다 — 여기서 바꾸지는 않고 따라간다
  // (browse.js와 같은 규칙).
  try {
    if (localStorage.getItem("jgb_dark_v1") === "1") document.body.classList.add("dark");
    const th = localStorage.getItem("jgb_theme_v1");
    if (th === "crystal") document.body.classList.add("theme-crystal");
    else if (th === "celadon") document.body.classList.add("theme-celadon");
  } catch (e) {}

  // ---------- 들어오기 ----------
  if (!ON) {
    showLogin("게시 서버가 연결되지 않았습니다(js/cloud-config.js).");
    $("adForm").querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
  } else if (loadSess()) {
    // 창을 새로 고쳤을 뿐이면 세션이 살아 있다. 살아 있는지는 서버에 물어서 안다.
    enter().catch(function () { signOut(true); });
  } else {
    showLogin("");
  }
})();
