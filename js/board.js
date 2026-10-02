/* ============================================================================
   우물사이 — 문의·제안 (board.html)
   ============================================================================
   탭이 둘이다: 자주 묻는 질문(운영자가 board.html에 손으로 적어 둔 답) | 게시판.
   게시판은 갈래를 나누지 않는다 — '이건 질문인가 제안인가'를 쓰는 사람이 먼저 고민하게 하면
   안 쓰고 만다(사용자 확정, 2026-09-29).

   화면은 주소 해시가 고른다(한 문서 안에서 오간다):
     ""        자주 묻는 질문
     #faq-<id> 자주 묻는 질문의 항목 하나(펼쳐서 그 자리로) · #faq-g-<갈래>는 갈래 머리로
     #ask      게시판 목록
     #p=<id>   글 하나 (댓글·공감)
     #new      글쓰기 · #edit=<id> 고치기
   글 주소가 해시인 것은 공유마당·게시 악보(#v=)와 같은 까닭이다(GitHub Pages).

   서버와 말하는 법은 browse.js와 같다(fetch 한 덩어리). 약속은 server/schema.sql의
   '문의·제안' 절에 있다 — 표는 닫혀 있고 board_* RPC만 열려 있다.

   ── 글쓴이 열쇠 ───────────────────────────────────────────────────────────
   계정이 없으므로 **브라우저마다 열쇠 하나**를 둔다(jgb_board_v1.key, 처음 쓸 때 무작위로
   만든다). 글·댓글마다 함께 보내고 서버에는 해시만 남는다. 이 열쇠가 ① 그 브라우저에서 쓴
   글·댓글을 고치고 지울 권한이고 ② 닉네임 옆 꼬리표('해금 #k7m2')의 씨앗이다 — 같은 닉네임을
   쓰는 다른 사람과 갈라 준다. 꼬리표는 **서버가 셈한다**(board_tag) — 여기서 한 벌 더 셈하면
   두 곳이 어긋나는 날 제 글에 남의 꼬리표가 붙는다. 그래서 '내 것인가'도 서버에 묻는다
   (board_get의 p_key → mine).
   ★ 브라우저의 사이트 데이터를 지우면 열쇠가 바뀐다 — 꼬리표가 새로 생기고 예전 글은 못
     고친다. 글쓰기 창 아래 안내가 그 사실을 미리 말한다.

   ── 운영자 ────────────────────────────────────────────────────────────────
   관리 화면(admin.html)에서 로그인한 **같은 탭**이면(admin-session.js, sessionStorage)
   내리기·운영자 답변 칸이 뜬다. 보이는 것은 편의이고 빗장은 서버의
   require_admin()이다.
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const API = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/rpc/";
  const HEADERS = { "apikey": KEY, "Content-Type": "application/json" };
  if (/^eyJ/.test(KEY)) HEADERS["Authorization"] = "Bearer " + KEY;
  const ON = !!(CFG.url && KEY) && CFG.board !== false;

  function $(id) { return document.getElementById(id); }
  function track(name, props) { try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) {} }

  // 내용 칸의 길잡이. 오류는 되풀이해 볼 수 있어야 고칠 수 있어서 순서를 함께 묻는다.
  const BODY_HINT = "• 질문: 하려던 작업과 문제가 발생한 단계\n"
    + "• 오류: 수행한 조작(순서대로) · 기대한 결과 · 실제 결과\n"
    + "• 제안: 필요한 기능과 그 기능으로 가능해지는 작업";

  // ---------- 서버 ----------
  function rpc(fn, body) {
    return fetch(API + fn, { method: "POST", headers: HEADERS, body: JSON.stringify(body || {}) })
      .catch(function () { throw new Error("서버에 연결하지 못했습니다. 인터넷 연결 상태를 확인하십시오."); })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.ok) return data;
          throw new Error((data && data.message) || ("요청을 처리하지 못했습니다 (" + res.status + ")"));
        });
      });
  }
  // 운영자 호출은 admin-session.js를 지난다(토큰 갱신·오류 번역을 두 벌 적지 않으려고)
  function staffRpc(fn, body) { return window.jgbAdmin.rpc(fn, body); }

  // ---------- 이 브라우저의 글쓴이 열쇠 ----------
  // localStorage가 막힌 창(사생활 보호 모드 등)에서도 그 창 안에서는 같은 열쇠를 쓰게
  // 메모리에 한 벌 둔다 — 안 그러면 글을 올리자마자 제 글을 못 알아본다.
  const LS = "jgb_board_v1";
  let mem = null;
  function me() {
    if (mem) return mem;
    let k = null;
    try { k = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
    if (!k || typeof k !== "object" || typeof k.key !== "string" || k.key.length < 32) {
      const b = new Uint8Array(24);
      crypto.getRandomValues(b);
      k = { key: Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join(""),
            name: (k && k.name) || "" };
      try { localStorage.setItem(LS, JSON.stringify(k)); } catch (e) {}
    }
    mem = { key: k.key, name: k.name || "" };
    return mem;
  }
  function rememberName(name) {
    const k = me(); k.name = name;
    try { localStorage.setItem(LS, JSON.stringify(k)); } catch (e) {}
  }
  // '해금 #k7m2' — 닉네임은 비워도 된다(사용자 확정). 꼬리표가 없는 것은 운영자 답변뿐이다.
  function whoEl(cls, name, tag) {
    const w = el("span", cls, name || "이름 없음");
    if (tag) w.appendChild(el("span", "bd-tagid", "#" + tag));
    return w;
  }

  // ---------- 작은 도구 ----------
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
    if (mon < 12) return mon + "개월 전";
    return Math.floor(mon / 12) + "년 전";
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function setMsg(id, msg, kind) {
    const m = $(id);
    m.textContent = msg || "";
    m.className = "sc-status" + (kind ? " " + kind : "");
    m.style.display = msg ? "" : "none";
  }
  function showErr(id, msg) { const e = $(id); e.textContent = msg || ""; e.hidden = !msg; }
  // 공감 = 엄지 하나. 누른 상태는 CSS가 속을 채운다(.on) — 모양은 그대로 두고 채움만 바꿔야
  // 눌렀는지가 한눈에 보인다. 선은 currentColor라 색은 CSS 한 곳(.bd-vote)이 정한다.
  const THUMB = "M7 10v11M7 10l4-8c1.7 0 3 1.3 3 3v4h5.2c1.3 0 2.2 1.2 2 2.4l-1.4 8"
    + "c-.2 1-1 1.6-2 1.6H7M7 10H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3";
  function thumbIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "bd-vote-ic");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", THUMB);
    svg.appendChild(path);
    return svg;
  }
  function voteLabel(btn, n, on) {
    btn.textContent = "";
    btn.appendChild(thumbIcon());
    btn.appendChild(el("span", "bd-vote-n", String(n || 0)));
    btn.classList.toggle("on", !!on);
    btn.title = on ? "공감 취소" : "공감";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function envText() {
    const ua = navigator.userAgent;
    const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome"
             : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "기타 브라우저";
    const os = /Mac OS X/.test(ua) ? (/iPhone|iPad/.test(ua) ? "iOS" : "macOS")
             : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android"
             : /Linux/.test(ua) ? "Linux" : "기타 OS";
    return br + " · " + os + " · 화면 " + window.innerWidth + "×" + window.innerHeight;
  }

  // 공감 누르기 — 목록과 글 보기가 같은 셈을 쓴다. 누르자마자 숫자를 바꾸고 서버 답으로 맞춘다.
  function wireVote(btn, id, state) {
    voteLabel(btn, state.votes, state.voted);
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (btn.disabled) return;
      const on = !state.voted;
      state.voted = on; state.votes = Math.max(0, (state.votes || 0) + (on ? 1 : -1));
      voteLabel(btn, state.votes, state.voted);
      btn.disabled = true;
      rpc("board_vote", { p_post: id, p_on: on })
        .then(function (r) { state.votes = r.votes; state.voted = r.voted; })
        .catch(function () { state.voted = !on; state.votes = Math.max(0, state.votes + (on ? -1 : 1)); })
        .then(function () { btn.disabled = false; voteLabel(btn, state.votes, state.voted); });
      if (on) track("board_vote");
    });
  }

  // =========================================================================
  // ① 목록
  // =========================================================================
  const PAGE = 30;
  let sort = "recent", q = "", offset = 0, total = 0, loading = false;

  function rowEl(p) {
    const li = el("li", "bd-row");
    const a = el("a", "bd-row-main");
    a.href = "#p=" + encodeURIComponent(p.id);
    a.appendChild(el("h3", "bd-row-title", p.title));
    if (p.excerpt) a.appendChild(el("p", "bd-row-ex", p.excerpt));
    const meta = el("div", "bd-meta");
    meta.appendChild(whoEl("", p.author, p.author_tag));
    meta.appendChild(el("span", "", agoText(p.created_at)));
    meta.appendChild(el("span", "bd-meta-replies", "댓글 " + (p.replies || 0)));
    if (p.staff_replied) meta.appendChild(el("span", "bd-meta-staff", "운영자 답변"));
    a.appendChild(meta);
    li.appendChild(a);

    // 공감은 줄 오른쪽 끝에 작게(사용자 요청) — 제목이 먼저 읽혀야 한다
    const vote = el("button", "bd-vote");
    vote.type = "button";
    wireVote(vote, p.id, { votes: p.votes, voted: p.voted });
    li.appendChild(vote);
    return li;
  }

  function loadList(reset) {
    if (loading) return;
    if (!ON) {
      document.querySelector("#bdAsk .sc-controls").style.display = "none";
      setMsg("bdStatusMsg", CFG.board === false
        ? "문의·제안는 준비 중입니다."
        : "게시 서버가 연결되어 있지 않습니다.", "sc-empty");
      return;
    }
    loading = true;
    if (reset) { offset = 0; $("bdRows").innerHTML = ""; setMsg("bdStatusMsg", "불러오는 중…"); }
    $("bdMore").disabled = true;
    rpc("board_list", {
      p_sort: sort, p_q: q,
      p_limit: PAGE, p_offset: offset,
    }).then(function (r) {
      loading = false;
      total = r.total || 0;
      (r.items || []).forEach(function (p) { $("bdRows").appendChild(rowEl(p)); });
      offset += (r.items || []).length;
      if (total === 0) {
        setMsg("bdStatusMsg", q ? "조건에 맞는 글이 없습니다."
          : "등록된 글이 없습니다.", "sc-empty");
        $("bdCount").textContent = "";
      } else {
        setMsg("bdStatusMsg", "");
        $("bdCount").textContent = total + "개";
      }
      $("bdMore").style.display = offset < total ? "" : "none";
      $("bdMore").disabled = false;
    }).catch(function (e) {
      loading = false;
      $("bdMore").disabled = false;
      setMsg("bdStatusMsg", e.message || "목록을 불러오지 못했습니다.", "sc-error");
    });
  }

  document.querySelectorAll("#bdList .sc-sort").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.classList.contains("on")) return;
      document.querySelectorAll("#bdList .sc-sort").forEach(function (o) { o.classList.remove("on"); });
      b.classList.add("on");
      sort = b.getAttribute("data-sort");
      loadList(true);
    });
  });
  let searchTimer = null;
  $("bdSearch").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      const v = $("bdSearch").value.trim();
      if (v === q) return;
      q = v; loadList(true);
    }, 240);
  });
  $("bdSearch").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중 Enter 무시
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); q = this.value.trim(); loadList(true); }
  });
  $("bdMore").addEventListener("click", function () { loadList(false); });

  // =========================================================================
  // ② 글 보기
  // =========================================================================
  let staff = false;        // 운영자 확인이 끝났는가(admin_me)
  let cur = null;           // 지금 보는 글

  function replyEl(r) {
    const li = el("li", "bd-reply" + (r.is_staff ? " bd-reply-staff" : "") + (r.hidden ? " bd-reply-hidden" : ""));
    if (r.hidden) {
      li.appendChild(el("p", "bd-reply-body", "운영자가 게시를 중단한 댓글입니다."));
      if (staff) {
        const un = el("button", "bd-link", "다시 게시");
        un.type = "button";
        un.addEventListener("click", function () { staffHideReply(r.id, false); });
        li.appendChild(un);
      }
      return li;
    }
    const head = el("div", "bd-meta");
    head.appendChild(whoEl("bd-reply-who", r.author, r.author_tag));
    if (r.is_staff) head.appendChild(el("span", "bd-meta-staff", "운영자"));
    head.appendChild(el("span", "", agoText(r.created_at)));
    if (r.mine) {
      const del = el("button", "bd-link bd-danger", "삭제");
      del.type = "button";
      del.addEventListener("click", function () {
        if (!confirm("이 댓글을 삭제합니다. 삭제한 댓글은 복구할 수 없습니다.")) return;
        rpc("board_reply_delete", { p_reply: r.id, p_key: me().key })
          .then(function () { openPost(cur.id); })
          .catch(function (e) { alert(e.message); });
      });
      head.appendChild(del);
    }
    if (staff && !r.is_staff) {
      const hide = el("button", "bd-link bd-danger", "게시 중단");
      hide.type = "button";
      hide.addEventListener("click", function () { staffHideReply(r.id, true); });
      head.appendChild(hide);
    }
    li.appendChild(head);
    li.appendChild(el("p", "bd-reply-body", r.body));
    return li;
  }

  function openPost(id) {
    $("bdPost").hidden = true; $("bdReplies").hidden = true;
    setMsg("bdViewMsg", "불러오는 중…");
    rpc("board_get", { p_id: id, p_key: me().key }).then(function (r) {
      const p = r.post;
      cur = p;
      setMsg("bdViewMsg", "");
      document.title = p.title + " · 문의·제안 · 우물사이";

      $("bdPostTitle").textContent = p.title;
      const meta = $("bdPostMeta");
      meta.textContent = "";
      meta.appendChild(whoEl("bd-reply-who", p.author, p.author_tag));
      meta.appendChild(el("span", "", agoText(p.created_at) + (p.edited_at ? " · 수정됨" : "")));
      $("bdPostBody").textContent = p.body;          // 글자 그대로 — HTML로 읽지 않는다

      const vote = $("bdPostVote").cloneNode(false);   // 앞 글의 배선을 떼어 낸다
      $("bdPostVote").replaceWith(vote);
      wireVote(vote, p.id, { votes: p.votes, voted: p.voted });

      $("bdPostOwn").hidden = !p.mine;
      $("bdStaff").hidden = !staff;

      const list = $("bdReplyList");
      list.innerHTML = "";
      (r.replies || []).forEach(function (x) { list.appendChild(replyEl(x)); });
      $("bdRepliesHead").textContent = "댓글 " + (r.replies || []).filter(function (x) { return !x.hidden; }).length;
      $("bdReplyName").value = me().name;
      $("bdStaffReplyWrap").hidden = !staff;
      showErr("bdReplyErr", "");
      $("bdPost").hidden = false; $("bdReplies").hidden = false;
    }).catch(function (e) {
      cur = null;
      setMsg("bdViewMsg", e.message || "글을 불러오지 못했습니다.", "sc-error");
    });
  }

  $("bdReplyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!cur) return;
    const body = $("bdReplyBody").value.trim();
    const name = $("bdReplyName").value.trim();
    if (!body) return;
    const btn = this.querySelector("button[type=submit]");
    btn.disabled = true; showErr("bdReplyErr", "");
    const asStaff = staff && $("bdStaffReply").checked;
    const call = asStaff
      ? staffRpc("admin_board_reply", { p_post: cur.id, p_body: body })
      : rpc("board_reply", { p_post: cur.id, p_body: body, p_author: name, p_key: me().key });
    call.then(function () {
      if (!asStaff) rememberName(name);
      $("bdReplyBody").value = "";
      track("board_reply");
      openPost(cur.id);
    }).catch(function (err) { showErr("bdReplyErr", err.message); })
      .then(function () { btn.disabled = false; });
  });

  $("bdPostEdit").addEventListener("click", function () { if (cur) location.hash = "#edit=" + encodeURIComponent(cur.id); });
  $("bdPostDel").addEventListener("click", function () {
    if (!cur) return;
    if (!cur.mine || !confirm("이 글을 삭제합니다. 달린 댓글도 함께 삭제되며 복구할 수 없습니다.")) return;
    rpc("board_delete", { p_id: cur.id, p_key: me().key }).then(function () {
      location.hash = "#ask";
    }).catch(function (e) { alert(e.message); });
  });

  // ---------- 운영자 ----------
  $("bdStaffHide").addEventListener("click", function () {
    if (!cur) return;
    const why = prompt("게시 중단 사유 (글 주소로 접속한 이용자에게 그대로 표시됩니다)");
    if (!why || !why.trim()) return;
    staffRpc("admin_board_set", { p_id: cur.id, p_hidden: true, p_reason: why.trim() })
      .then(function () { location.hash = "#ask"; })
      .catch(function (e) { alert(e.message); });
  });
  function staffHideReply(id, hide) {
    let why = null;
    if (hide) { why = prompt("댓글 게시 중단 사유"); if (!why || !why.trim()) return; }
    staffRpc("admin_board_hide_reply", { p_reply: id, p_hidden: hide, p_reason: why })
      .then(function () { openPost(cur.id); })
      .catch(function (e) { alert(e.message); });
  }

  // =========================================================================
  // ③ 글쓰기 · 고치기
  // =========================================================================
  let editing = null;       // 고치는 중인 글 id(없으면 새 글)

  function syncEnv() {
    $("bdEnvWrap").hidden = !!editing;       // 고칠 땐 이미 적힌 본문을 건드리지 않는다
    $("bdEnvText").textContent = envText();
  }

  function openNew(editId) {
    editing = editId || null;
    showErr("bdNewErr", "");
    $("bdNewHead").textContent = editing ? "글 수정" : "글쓰기";
    $("bdNewSubmit").textContent = editing ? "수정 내용 등록" : "등록";
    $("bdNewName").parentNode.hidden = !!editing;
    if (!ON) { showErr("bdNewErr", "문의·제안는 준비 중입니다."); $("bdNewSubmit").disabled = true; }
    if (editing) {
      if (!cur || cur.id !== editing) { location.hash = "#p=" + encodeURIComponent(editing); return; }
      $("bdNewTitle").value = cur.title;
      $("bdNewBody").value = cur.body;
    } else {
      $("bdEnv").checked = false;
      $("bdNewTitle").value = ""; $("bdNewBody").value = "";
      $("bdNewName").value = me().name;
    }
    $("bdFaqHint").hidden = true;
    $("bdNewBody").placeholder = BODY_HINT;
    syncEnv();
    setTimeout(function () { $("bdNewTitle").focus(); }, 0);
  }

  $("bdNewForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const title = $("bdNewTitle").value.trim();
    let body = $("bdNewBody").value.trim();
    const name = $("bdNewName").value.trim();
    if (!editing && $("bdEnv").checked) body += "\n\n— 사용 환경: " + envText();
    const btn = $("bdNewSubmit");
    btn.disabled = true; showErr("bdNewErr", "");
    const call = editing
      ? rpc("board_update", { p_id: editing, p_key: me().key, p_title: title, p_body: body })
      : rpc("board_post", { p_title: title, p_body: body, p_author: name, p_key: me().key });
    call.then(function (r) {
      const id = editing || r.id;
      if (!editing) { rememberName(name); track("board_post"); }
      location.hash = "#p=" + encodeURIComponent(id);
    }).catch(function (err) { showErr("bdNewErr", err.message); })
      .then(function () { btn.disabled = false; });
  });

  // =========================================================================
  // 자주 묻는 질문 — 찾기 · 항목 주소 · 글 쓰기의 '비슷한 질문'
  // =========================================================================
  // 목록은 board.html에 손으로 적힌 <details>다. 여기는 그것을 읽기만 한다 — 질문을 JS에 한 벌
  // 더 적으면 두 곳이 어긋난다. 찾는 대상은 질문 + 답 + data-kw(화면에 안 나오는 별칭).
  const FAQ_ITEMS = Array.prototype.slice.call(document.querySelectorAll("#bdFaq .bd-faq-item"));
  const FAQ_HAY = FAQ_ITEMS.map(function (d) {
    return (d.textContent + " " + (d.getAttribute("data-kw") || "")).toLowerCase();
  });
  function faqTerms(q) {
    return String(q || "").toLowerCase().split(/[\s,.?!·]+/).filter(Boolean);
  }
  // 낱말 하나가 걸리나 — 조사가 붙은 말('가사를'·'빨간색으로')도 걸리게 끝 글자를 두 자까지
  // 떼어 본다. 두 글자보다 짧게는 안 줄인다('가'만 남으면 어디에나 걸린다).
  function faqHit(hay, t) {
    for (let k = 0; k <= 2 && t.length - k >= 2; k++) {
      if (hay.indexOf(t.slice(0, t.length - k)) >= 0) return true;
    }
    return false;
  }

  function filterFaq() {
    const terms = faqTerms($("bdFaqSearch").value);
    let shown = 0;
    FAQ_ITEMS.forEach(function (d, i) {
      const ok = terms.every(function (t) { return faqHit(FAQ_HAY[i], t); });
      d.hidden = !ok;
      if (ok) shown++;
    });
    document.querySelectorAll("#bdFaq .bd-faq-group").forEach(function (g) {
      g.hidden = !g.querySelector(".bd-faq-item:not([hidden])");
    });
    $("bdFaqNone").hidden = shown > 0;
    $("bdFaqCount").textContent = terms.length
      ? "검색 결과 " + shown + "건" : "전체 " + FAQ_ITEMS.length + "건";
    FAQ_ITEMS.forEach(function (d, i) { markSummary(d, i, terms); });
    countToc();
    markToc();
    syncAllBtn();
  }

  // 질문 글자 가운데 검색어에 걸린 곳을 칠한다. 글자는 노드로만 다룬다(innerHTML을 안 쓴다 —
  // 검색어가 그대로 마크업이 되면 안 되므로).
  const SUM_TEXT = FAQ_ITEMS.map(function (d) { return d.querySelector("summary").textContent; });
  function markSummary(d, i, terms) {
    const sum = d.querySelector("summary");
    const text = SUM_TEXT[i];
    const lower = text.toLowerCase();
    const hit = new Array(text.length).fill(false);
    terms.forEach(function (t) {
      for (let k = 0; k <= 2 && t.length - k >= 2; k++) {
        const w = t.slice(0, t.length - k);
        let at = lower.indexOf(w);
        if (at < 0) continue;
        while (at >= 0) { for (let x = at; x < at + w.length; x++) hit[x] = true; at = lower.indexOf(w, at + 1); }
        break;
      }
    });
    // 글자는 span 하나 안에 담는다 — summary가 격자(번호 | 질문 | 표시)라, 조각이 맨몸으로 들어가면
    // 조각마다 격자 칸을 하나씩 차지해 줄이 깨진다
    sum.textContent = "";
    const q = document.createElement("span");
    q.className = "bd-q";
    sum.appendChild(q);
    let run = "", on = false;
    const flush = function () {
      if (!run) return;
      if (on) { const m = document.createElement("mark"); m.textContent = run; q.appendChild(m); }
      else q.appendChild(document.createTextNode(run));
      run = "";
    };
    for (let x = 0; x < text.length; x++) {
      if (hit[x] !== on) { flush(); on = hit[x]; }
      run += text[x];
    }
    flush();
  }

  // 모두 펼치기 / 모두 접기 — 보이는 질문이 하나라도 닫혀 있으면 '펼치기'다
  let bulkToggling = false;
  function visibleItems() { return FAQ_ITEMS.filter(function (d) { return !d.hidden; }); }
  function syncAllBtn() {
    const vis = visibleItems();
    const anyClosed = vis.some(function (d) { return !d.open; });
    $("bdFaqAll").textContent = anyClosed ? "모두 펼치기" : "모두 접기";
    $("bdFaqAll").hidden = vis.length === 0;
  }
  $("bdFaqAll").addEventListener("click", function () {
    const vis = visibleItems();
    const open = vis.some(function (d) { return !d.open; });
    bulkToggling = true;
    vis.forEach(function (d) { d.open = open; });
    // toggle 이벤트는 다음 틈에 오므로 빗장도 그 뒤에 푼다(안 그러면 주소가 마지막 항목으로 바뀐다)
    setTimeout(function () { bulkToggling = false; syncAllBtn(); }, 0);
  });


  // 분류 차례 — 분류마다 보이는 질문 수를 적고, 찾기로 다 걸러진 분류는 옅게 둔다
  const TOC = Array.prototype.slice.call(document.querySelectorAll(".bd-faq-toc a"));
  function countToc() {
    TOC.forEach(function (a) {
      const g = document.querySelector(a.getAttribute("href"));
      const n = g ? g.querySelectorAll(".bd-faq-item:not([hidden])").length : 0;
      a.querySelector(".n").textContent = n;
      a.classList.toggle("empty", n === 0);
    });
  }
  // 지금 보고 있는 분류를 짚는다 — 위쪽 머리줄(약 76px) 아래를 처음 지난 분류가 '지금'이다
  function markToc() {
    if ($("bdFaq").hidden) return;
    let cur = null;
    TOC.forEach(function (a) {
      const g = document.querySelector(a.getAttribute("href"));
      if (g && !g.hidden && g.getBoundingClientRect().top < 120) cur = a;
    });
    if (!cur) cur = TOC.filter(function (a) { return !a.classList.contains("empty"); })[0] || null;
    TOC.forEach(function (a) { a.classList.toggle("on", a === cur); });
  }
  window.addEventListener("scroll", markToc, { passive: true });
  $("bdFaqSearch").addEventListener("input", filterFaq);

  // 펼친 항목은 주소에 남긴다 — 그 주소를 복사해 게시판 답변에 붙이면 그 항목이 펼쳐져 열린다.
  // replaceState라 hashchange가 안 나 route()를 다시 안 탄다(화면이 맨 위로 튀지 않는다).
  FAQ_ITEMS.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (bulkToggling) return;
      if (d.open && d.id && history.replaceState) history.replaceState(null, "", "#" + d.id);
      syncAllBtn();
    });
  });

  // 번호 — 분류는 01~, 질문은 분류 안에서 01~. 찾기로 걸러져도 바뀌지 않게 처음에 한 번 박는다
  // (CSS 카운터는 숨은 항목을 안 세어 번호가 출렁인다). 그리는 것은 CSS의 attr(data-n).
  const two = function (n) { return (n < 10 ? "0" : "") + n; };
  document.querySelectorAll("#bdFaq .bd-faq-group").forEach(function (g, gi) {
    g.querySelector("h2").setAttribute("data-n", two(gi + 1));
    const a = document.querySelector('.bd-faq-toc a[href="#' + g.id + '"]');
    if (a) a.setAttribute("data-n", two(gi + 1));
    g.querySelectorAll(".bd-faq-item summary").forEach(function (s, qi) { s.setAttribute("data-n", two(qi + 1)); });
  });
  filterFaq();     // 첫 그리기 — 개수·차례·버튼을 한 번 맞춘다

  function showFaqTarget(id) {
    const el = document.getElementById(id);
    if (!el || !$("bdFaq").contains(el)) return;
    if ($("bdFaqSearch").value) { $("bdFaqSearch").value = ""; filterFaq(); }
    if (el.tagName === "DETAILS") el.open = true;
    el.scrollIntoView({ block: "start" });
    markToc();
  }

  // 글 쓰기 — 제목을 치면 비슷한 질문을 세 개까지 띄운다. 같은 질문이 게시판에 쌓이는 것을
  // 가장 앞에서 막는 자리다. 새 탭으로 여는 것은 쓰던 글이 지워지지 않게(openNew가 칸을 비운다).
  // 어느 질문에나 나오는 말은 고르는 데 도움이 안 되어 뺀다. 질문·별칭에 걸리면 3점, 답에만 걸리면 1점 —
  // 답에는 곁가지 말이 많아 그것만으로 고르면 엉뚱한 질문이 앞에 선다.
  const FAQ_STOP = /^(악보|악보를|악보가|정간|어떻게|하는|하고|싶습니다|싶어요|있나요|되나요|안|왜|좀|방법|문의|질문)$/;
  const FAQ_HEAD = FAQ_ITEMS.map(function (d) {
    return (d.querySelector("summary").textContent + " " + (d.getAttribute("data-kw") || "")).toLowerCase();
  });
  function faqSimilar(q) {
    const terms = faqTerms(q).filter(function (t) { return t.length >= 2 && !FAQ_STOP.test(t); });
    if (!terms.length) return [];
    return FAQ_ITEMS.map(function (d, i) {
      const n = terms.reduce(function (sum, t) {
        return sum + (faqHit(FAQ_HEAD[i], t) ? 3 : faqHit(FAQ_HAY[i], t) ? 1 : 0);
      }, 0);
      return { d: d, n: n };
    }).filter(function (x) { return x.n >= 3; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 3);
  }
  let faqHintTimer = 0;
  function showFaqHint() {
    const box = $("bdFaqHint");
    const hits = editing ? [] : faqSimilar($("bdNewTitle").value);
    box.textContent = "";
    box.hidden = !hits.length;
    if (!hits.length) return;
    const cap = document.createElement("span");
    cap.textContent = "관련된 자주 묻는 질문";
    box.appendChild(cap);
    hits.forEach(function (x) {
      const a = document.createElement("a");
      a.href = "#" + x.d.id;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = x.d.querySelector("summary").textContent;
      box.appendChild(a);
    });
  }
  $("bdNewTitle").addEventListener("input", function () {
    clearTimeout(faqHintTimer);
    faqHintTimer = setTimeout(showFaqHint, 250);
  });

  // =========================================================================
  // 화면 고르기 (해시)
  // =========================================================================
  function route() {
    const h = location.hash;
    const mP = /^#p=([^&]+)/.exec(h), mE = /^#edit=([^&]+)/.exec(h);
    const inList = !(mP || mE || h === "#new");
    const ask = h === "#ask";
    $("bdList").hidden = !inList;
    $("bdView").hidden = !mP;
    $("bdNew").hidden = !(mE || h === "#new");
    if (mP) openPost(decodeURIComponent(mP[1]));
    else if (mE) openNew(decodeURIComponent(mE[1]));
    else if (h === "#new") openNew(null);
    else {
      document.title = "문의·제안 · 우물사이";
      $("bdFaq").hidden = ask;
      $("bdAsk").hidden = !ask;
      document.querySelectorAll("#bdList .sc-tab").forEach(function (t) {
        t.classList.toggle("on", t.getAttribute("data-tab") === (ask ? "ask" : "faq"));
      });
      // 글을 쓰거나 지우고 돌아왔으면 목록이 낡았다 — 늘 새로 받는다
      if (ask) loadList(true);
      if (/^#faq-/.test(h)) { showFaqTarget(decodeURIComponent(h.slice(1))); return; }
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // 편집기로 가는 버튼 이름 — 공유마당(browse.js)과 같은 규칙
  try {
    if (localStorage.getItem("jgb_state_v1")) {
      $("scBack").textContent = "← 편집기로 돌아가기";
      $("scBack").title = "작성 중인 악보로 돌아갑니다";
    }
  } catch (e) {}

  // 운영자인가 — 관리 세션이 있을 때만 묻는다. 확인되면 지금 보는 글을 다시 그린다.
  if (window.jgbAdmin && window.jgbAdmin.on && window.jgbAdmin.has()) {
    window.jgbAdmin.rpc("admin_me").then(function () {
      staff = true;
      document.body.classList.add("bd-is-staff");
      if (cur && !$("bdView").hidden) openPost(cur.id);
    }).catch(function () {});
  }

  track("board_open");
  route();
})();
