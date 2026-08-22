/* ============================================================================
   우물사이 — 관리 화면 (admin.html)
   ============================================================================
   올라온 악보를 훑고, 내리고, 문서를 받아 오는 자리. 편집기(index.html)·모아보기
   (browse.html)와 **다른 문서**라 app.js도 cloud.js도 안 싣는다 — 여기서는 악보를
   그리지 않으므로(카드의 그림은 올린 사람 브라우저가 게시할 때 떠 둔 것이다).

   ── 열쇠가 어디 있나 ──────────────────────────────────────────────────────
   익명 게시의 열쇠는 **토큰**이고 관리자의 열쇠는 **로그인 + 명단**이다. 로그인·토큰
   갱신·RPC 호출은 **js/admin-session.js(window.jgbAdmin)에 한 벌만** 있다 —
   편집기의 js/cloud.js도 `#va=` 관리자 열기에서 같은 것을 쓰기 때문이다.
   열쇠는 sessionStorage에만 둔다(창을 닫으면 풀린다).

   서버가 하는 확인은 둘이다: 로그인했는가 + admins 명단에 있는가(require_admin).
   그러니 이 파일이 화면을 아무리 열어 줘도 권한이 늘지 않는다 — 화면을 숨기는 것은
   보안이 아니라 정리다.
   ============================================================================ */
(function () {
  "use strict";

  const PAGE = 24;

  function $(id) { return document.getElementById(id); }

  // ---------- 서버와 말하기 ----------
  // 세션·토큰 갱신·헤더·오류 번역은 **js/admin-session.js에 한 벌만** 있다
  // (편집기의 js/cloud.js도 `#va=` 관리자 열기에서 같은 것을 쓴다).
  const A = window.jgbAdmin || { on: false, has: function () { return false; },
                                 rpc: function () { return Promise.reject(new Error("설정 없음")); } };
  function rpc(fn, body) {
    return A.rpc(fn, body).catch(function (e) {
      // 열쇠가 죽으면 화면도 로그인으로 돌려놓아야 한다 — 목록만 남아 있으면 고장으로 읽힌다.
      if (!A.has()) signOut(true);
      throw e;
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
  // 편집기를 **관리자로** 연다(`#va=`). 그냥 `#v=`로 열면 fetch_score를 타서
  //  · 내려간 악보는 아예 안 열리고
  //  · 조회수가 올라가며(운영자가 들여다본 것은 사람들이 본 것이 아니다)
  //  · 고쳐도 되돌릴 길이 없다(게시자 토큰이 없으므로).
  //
  // ★ <a target="_blank">가 아니라 window.open인 까닭: 관리 세션은 sessionStorage에
  //   있는데 요즘 크롬은 target="_blank"에 암묵적으로 noopener를 걸어 **세션이 새 탭에
  //   안 따라간다**(2026-08-21 실측 — 자세한 것은 js/admin-session.js 머리말).
  //   noopener 없는 window.open만 넘어간다. 링크로 되돌리지 말 것.
  function openInEditor(id) {
    window.open("index.html#va=" + encodeURIComponent(id), "_blank");
  }

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
    A.signOut();
    showLogin(quiet ? "로그인이 풀렸습니다. 다시 들어와 주세요." : "");
  }

  // 들어온 사람이 정말 관리자인지는 **서버가** 답한다. 화면을 먼저 열어 놓고 물으면
  // 관리자가 아닌 사람에게 잠깐이라도 관리 화면이 보인다.
  function enter() {
    return rpc("admin_me", {}).then(function (me) {
      const s = A.get();
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

    // 내려간 악보도 열린다 — 관리자 열기는 admin_get_score를 타므로 hidden을 안 가린다.
    // 무엇 때문에 내렸는지 보려면 열어 봐야 한다.
    const openBtn = '<button type="button" class="ad-btn ad-mini ad-ghost" data-act="open" ' +
      'title="편집기에서 관리자로 엽니다 — 고친 뒤 [파일 › 악보 게시]에서 갱신할 수 있습니다">열기</button>';

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
      '<td class="ad-c-ver"><button type="button" class="ad-verbtn" data-act="ver" ' +
        'title="판과 운영 기록 보기">v' + (s.ver || 1) + "</button></td>" +
      '<td class="ad-c-lint">' + lint + "</td>" +
      '<td class="ad-c-num">' + (s.view_count || 0) + "</td>" +
      '<td><div class="ad-date">' + dateText(s.created_at) + "<br>" + dateText(s.updated_at) + "</div></td>" +
      '<td class="ad-c-act"><div class="ad-acts">' + openBtn +
        '<button type="button" class="ad-btn ad-mini ad-ghost" data-act="doc">문서 받기</button>' +
        offBtn + "</div></td>";

    tr.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        const act = b.getAttribute("data-act");
        if (act === "open") openInEditor(s.id);
        else if (act === "hide") openDlg(s);
        else if (act === "show") unhide(s);
        else if (act === "doc") grabDoc(s, b);
        else if (act === "ver") openVerDlg(s);
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
  function saveDoc(title, ver, doc) {
    const name = (title || "악보").replace(/[\\/:*?"<>|]/g, "_") + " (v" + ver + ").jgb.json";
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function grabDoc(s, btn) {
    btn.disabled = true;
    rpc("admin_get_score", { p_id: s.id }).then(function (r) {
      saveDoc(r.title, r.ver, r.doc);
      btn.disabled = false;
    }).catch(function (e) {
      btn.disabled = false;
      alert((e && e.message) || "문서를 받지 못했습니다.");
    });
  }

  // ---------- 판과 기록 ----------
  // 판 목록과 운영 기록을 한 창에서 함께 본다. 둘은 같은 물음의 두 얼굴이다 —
  // '이 악보의 내용이 어떻게 달라져 왔나'와 '누가 무엇을 했나'.
  let verScore = null;

  const LOG_KO = {
    save: "교정", hide: "내림", unhide: "다시 엶", restore: "되돌림", delete: "지움",
  };

  function stampText(iso) {
    const t = Date.parse(iso);
    if (!t) return "";
    const d = new Date(t);
    const p = function (n) { return (n < 10 ? "0" : "") + n; };
    return dateText(iso) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  // 'v2로' / 'v3으로' — 조사는 숫자를 **읽은 소리**의 받침이 정한다.
  // 끝자리가 3(삼)·6(육)이면 받침이 있고, 0으로 끝나는 수는 십·이십·백이라 역시 받침이 있다.
  // 나머지(일·이·사·오·칠·팔·구)는 받침이 없거나 ㄹ이라 '로'다. 서버(admin_restore의
  // 기본 메모)도 같은 셈을 쓴다 — 화면과 기록에 적히는 말이 어긋나면 안 된다.
  function roFor(n) { return [0, 3, 6].indexOf(n % 10) >= 0 ? "으로" : "로"; }

  function kbText(bytes) {
    if (!bytes) return "";
    return Math.max(1, Math.round(bytes / 1024)) + "KB";
  }

  function verErr(msg) {
    const e = $("adVerErr");
    e.textContent = msg || "";
    e.style.display = msg ? "" : "none";
  }

  function openVerDlg(s) {
    verScore = s;
    $("adVerTitle").textContent = s.title || "제목 없음";
    $("adVerId").textContent = "#v=" + s.id;
    verErr("");
    $("adVerRows").innerHTML = '<div class="ad-log-none">불러오는 중…</div>';
    $("adLogRows").innerHTML = '<div class="ad-log-none">불러오는 중…</div>';
    $("adVerDlg").style.display = "flex";
    loadVer();
  }
  function closeVerDlg() { $("adVerDlg").style.display = "none"; verScore = null; }

  function loadVer() {
    if (!verScore) return;
    const id = verScore.id;
    // 둘을 함께 부른다 — 한쪽이 실패해도 나머지는 보이게 따로 받는다.
    rpc("admin_versions", { p_id: id }).then(function (r) {
      if (!verScore || verScore.id !== id) return;      // 그 사이 창이 바뀌었으면 버린다
      drawVersions(r.versions || []);
    }).catch(function (e) {
      $("adVerRows").innerHTML = "";
      verErr((e && e.message) || "판을 불러오지 못했습니다.");
    });

    rpc("admin_log_list", { p_limit: 30, p_offset: 0, p_id: id }).then(function (r) {
      if (!verScore || verScore.id !== id) return;
      drawLog(r.items || []);
    }).catch(function () {
      $("adLogRows").innerHTML = '<div class="ad-log-none">기록을 불러오지 못했습니다.</div>';
    });
  }

  // 판 하나 = 표의 한 줄이 아니라 **두 줄짜리 덩이**다. 처음엔 5칸 표로 짰는데, 메모가
  // 길이를 알 수 없는 유일한 값이라 좁은 창에서 그 칸만 뭉개졌다(500px에서 53px까지 줄어
  // 글자가 한 자씩 끊겼다 — 실측). 길이를 모르는 것에는 제 줄을 준다.
  function drawVersions(list) {
    const box = $("adVerRows");
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<div class="ad-log-none">남아 있는 판이 없습니다.</div>';
      return;
    }
    // 서버가 최신 판을 맨 앞에 준다(ver desc). 첫 줄이 곧 지금 쓰이는 판이다.
    const now = list[0].ver;
    list.forEach(function (v) {
      const el = document.createElement("div");
      el.className = "ad-veritem" + (v.ver === now ? " ad-v-now" : "");

      const meta = [v.by === "admin" ? "운영자" : "게시자", stampText(v.created_at)];
      if (v.bytes) meta.push(kbText(v.bytes));

      const act = (v.ver === now)
        ? '<span class="ad-v-nowtag">지금</span>' +
          '<button type="button" class="ad-btn ad-mini ad-ghost" data-vact="doc">문서</button>'
        : '<button type="button" class="ad-btn ad-mini ad-ghost" data-vact="doc">문서</button>' +
          '<button type="button" class="ad-btn ad-mini ad-ghost" data-vact="back">되돌리기</button>';

      el.innerHTML =
        '<div class="ad-v-head">' +
          '<span class="ad-v-num">v' + v.ver + "</span>" +
          '<span class="ad-v-meta">' + esc(meta.join(" · ")) + "</span>" +
          '<span class="ad-v-act">' + act + "</span>" +
        "</div>" +
        (v.note ? '<div class="ad-v-note">' + esc(v.note) + "</div>" : "");

      el.querySelectorAll("[data-vact]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (b.getAttribute("data-vact") === "doc") grabVersion(v, b);
          else openBackBar(el, v);
        });
      });
      box.appendChild(el);
    });
  }

  function grabVersion(v, btn) {
    if (!verScore) return;
    btn.disabled = true;
    rpc("admin_version", { p_id: verScore.id, p_ver: v.ver }).then(function (r) {
      saveDoc(r.title, r.ver, r.doc);
      btn.disabled = false;
    }).catch(function (e) {
      btn.disabled = false;
      verErr((e && e.message) || "그 판을 받지 못했습니다.");
    });
  }

  // 되돌리기는 **두 걸음**이다. 지금 판을 덮는 일이라 [내리기]·[지우기]와 같은 무게로
  // 다룬다 — 누르면 줄이 하나 펼쳐지고, 거기서 한 번 더 눌러야 바뀐다.
  // 사유는 선택이다(서버가 'vN으로 되돌림'을 기본으로 적는다). 적으면 그것이 판에 실린다.
  function openBackBar(item, v) {
    const old = $("adVerRows").querySelector(".ad-backbar");
    if (old) old.remove();
    const bar = document.createElement("div");
    bar.className = "ad-backbar";
    bar.innerHTML =
      '<input type="text" placeholder="왜 되돌리는지 (안 적으면 «v' + v.ver + roFor(v.ver) + ' 되돌림»)">' +
      '<button type="button" class="ad-btn ad-mini ad-ghost" data-b="no">취소</button>' +
      '<button type="button" class="ad-btn ad-mini ad-primary" data-b="yes">v' + v.ver + roFor(v.ver) + ' 되돌리기</button>';
    item.appendChild(bar);
    const input = bar.querySelector("input");
    input.focus();
    input.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중 Enter 무시
      if (e.key === "Enter") { e.preventDefault(); doRestore(v, input.value.trim(), bar); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); bar.remove(); }
    });
    bar.querySelector('[data-b="no"]').addEventListener("click", function () { bar.remove(); });
    bar.querySelector('[data-b="yes"]').addEventListener("click", function () {
      doRestore(v, input.value.trim(), bar);
    });
  }

  function doRestore(v, note, bar) {
    if (!verScore) return;
    verErr("");
    bar.querySelectorAll("button, input").forEach(function (el) { el.disabled = true; });
    rpc("admin_restore", { p_id: verScore.id, p_ver: v.ver, p_note: note || null })
      .then(function (r) {
        // 창은 열어 둔 채 다시 그린다 — 방금 얹힌 새 판이 목록 맨 위에 나타나는 것을
        // 보여 주는 것이 '역사를 지운 게 아니라 덧댄 것'이라는 말보다 낫다.
        verScore.ver = r.ver;
        loadVer();
        load(true);
      })
      .catch(function (e) {
        bar.querySelectorAll("button, input").forEach(function (el) { el.disabled = false; });
        verErr((e && e.message) || "되돌리지 못했습니다.");
      });
  }

  function drawLog(items) {
    const box = $("adLogRows");
    box.innerHTML = "";
    if (!items.length) {
      box.innerHTML = '<div class="ad-log-none">이 악보에 대한 운영 기록이 없습니다.</div>';
      return;
    }
    items.forEach(function (it) {
      const d = it.detail || {};
      // 무엇을 적어 보일지는 한 일마다 다르다 — 내린 것은 사유가, 교정은 메모가 알맹이다.
      const bits = [];
      if (d.reason) bits.push(d.reason);
      if (d.note) bits.push(d.note);
      if (d.from_ver != null) bits.push("v" + d.from_ver + " → v" + (d.ver != null ? d.ver : "?"));
      else if (d.ver != null) bits.push("v" + d.ver);
      const el = document.createElement("div");
      el.className = "ad-log-item";
      el.innerHTML =
        '<span class="ad-log-when">' + stampText(it.at) + "</span> " +
        '<span class="ad-log-what">' + (LOG_KO[it.action] || esc(it.action)) + "</span>" +
        (it.who ? ' <span class="ad-log-detail">· ' + esc(it.who) + "</span>" : "") +
        (bits.length ? '<div class="ad-log-detail">' + esc(bits.join(" · ")) + "</div>" : "");
      box.appendChild(el);
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
    A.signIn($("adEmail").value.trim(), $("adPw").value).then(function () {
      $("adPw").value = "";
      return enter();
    }).then(function () {
      btn.disabled = false;
    }).catch(function (err) {
      A.signOut();
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

  $("adVerClose").addEventListener("click", closeVerDlg);
  $("adVerDlg").addEventListener("mousedown", function (e) {
    if (e.target === $("adVerDlg")) closeVerDlg();
  });

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
    if (e.key !== "Escape") return;
    // 내린 뒤(중단 내역 줄이 떠 있을 때)는 실수로 닫히지 않게 둔다 — 그 줄을 놓치면
    // 언제 무엇을 내렸는지 다시 맞춰 봐야 한다.
    if ($("adDlg").style.display !== "none") {
      if ($("adDlgAfter").style.display === "none") closeDlg();
      return;
    }
    if ($("adVerDlg").style.display !== "none") closeVerDlg();
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
  if (!A.on) {
    showLogin("게시 서버가 연결되지 않았습니다(js/cloud-config.js).");
    $("adForm").querySelectorAll("input, button").forEach(function (el) { el.disabled = true; });
  } else if (A.has()) {
    // 창을 새로 고쳤을 뿐이면 세션이 살아 있다. 살아 있는지는 서버에 물어서 안다.
    enter().catch(function () { signOut(true); });
  } else {
    showLogin("");
  }
})();
