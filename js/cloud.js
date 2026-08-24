/* ============================================================================
   우물사이 — 악보 게시 (1단계: 계정 없는 익명 게시)
   ============================================================================
   [재생]처럼 눌러야 쓰이는 기능이 아니라 언제든 주소로 들어올 수 있어서
   index.html이 app.js **뒤에** 미리 싣는다(window.jgbDoc이 있어야 하므로 뒤).

   ── 이 파일이 app.js를 한 줄도 안 고치는 까닭 ──────────────────────────────
   app.js는 4,000줄짜리 단일 IIFE다. 게시 배선을 그 안에 넣으면 문서·렌더·팔레트와
   서버 이야기가 한 덩어리로 엉킨다. 그래서 app.js는 `window.jgbDoc` 여섯 개만
   내놓고(state·adopt·hasSavedWork·title·pubId·setPubId), 서버와 말하는 일은
   전부 여기서 한다. 이 창구 밖으로 손을 뻗지 말 것 — 창구가 곧 경계다.

   ── 주소 규칙: umulsai.com/#v=ab12cd34 ────────────────────────────────────
   경로(/s/ab12cd34)가 아니라 **해시**인 것은 지금 호스팅(GitHub Pages)이 경로
   리라이트를 못 해서다. 링크 공유(#s=…)와 같은 방식이라 서버 설정이 0이고,
   짧은 주소의 목적(메신저에서 안 잘림)은 이걸로 이미 이룬다. 경로 주소는 카톡·
   트위터 공유 카드(OG 태그)가 필요해질 때 호스팅과 함께 옮기면 된다.

   ── 수정 권한이 어디 있나 ────────────────────────────────────────────────
   게시하면 서버가 토큰을 딱 한 번 돌려준다. 그 토큰은 **이 브라우저의
   localStorage(jgb_published_v1)에만** 남고, 문서에는 게시물 id만 실린다.
   그래서 .jgb.json 파일이나 공유 링크를 남에게 줘도 수정 권한은 안 넘어가고,
   남의 악보를 열어 고친 뒤 게시하면 새 게시물이 되며 원래 id가 원본(fork_of)으로
   기록된다. 토큰을 잃으면 되찾을 길이 없다(익명이라 본인 확인을 할 수가 없다).
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  // 공개 키. Supabase가 2025년에 이름을 바꿔 지금은 `sb_publishable_…`이고, 그 전 프로젝트는
  // JWT 꼴 anon 키(`eyJ…`)를 쓴다. 둘 다 받는다(`anonKey`는 옛 설정 파일 이름).
  const KEY = CFG.key || CFG.anonKey || "";
  const ON = !!(CFG.url && KEY) && location.protocol !== "file:";
  // 모아보기(공개 목록)를 열어 두었는가 — 운영 스위치. 닫혀 있으면 목록으로 가는 길과
  // '공개로 올리기' 선택이 함께 사라지고, 모든 게시가 '주소를 아는 사람만'이 된다.
  // 까닭은 js/cloud-config.js 주석 참고(신고 절차가 갖춰지기 전에는 목록을 안 연다).
  const BROWSE_ON = CFG.browse !== false;
  const HASH_RE = /^#v=([a-z0-9]{4,32})$/;
  // 관리자로 열기 — 관리 화면(admin.html)의 [열기]가 이 주소로 보낸다.
  const AHASH_RE = /^#va=([a-z0-9]{4,32})$/;

  function $(id) { return document.getElementById(id); }
  // 통계는 앱 동작에 영향 주지 않는다 (app.js의 track과 같은 성격)
  function track(name, props) { try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) {} }
  function stripHash() {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }

  // ---------- 서버가 없을 때 ----------
  // 버튼을 숨겨 '눌렀는데 아무 일도 안 일어나는' 상태를 안 만든다. 주소로 들어온
  // 경우엔 왜 안 열리는지 한 번은 말해 줘야 하므로 알림만 남긴다.
  if (!ON) {
    const b = $("btnPublish");
    if (b) b.style.display = "none";
    const br = $("btnBrowse");
    if (br) br.style.display = "none";   // 목록도 서버가 있어야 뜻이 있다
    if (HASH_RE.test(location.hash)) {
      stripHash();
      alert("이 주소의 악보를 여는 기능이 아직 켜져 있지 않습니다.");
    }
    return;
  }

  // 모아보기를 닫아 둔 동안은 목록으로 가는 길도 없앤다 — 눌러 봐야 '준비 중'만 나오는
  // 버튼을 상단바에 세워 두면 고장으로 읽힌다.
  if (!BROWSE_ON) {
    const br = $("btnBrowse");
    if (br) br.style.display = "none";
  }

  // ---------- 서버와 말하기 ----------
  // supabase-js를 안 들인다(무의존 원칙) — PostgREST의 RPC는 그냥 POST 한 번이다.
  // 대시보드가 보여주는 주소는 자리에 따라 `…supabase.co`이기도 하고 `…/rest/v1`이기도 하다.
  // 어느 쪽을 붙여넣어도 되게 받아들인다 — 복사한 자리 때문에 안 되는 일은 없어야 한다.
  const API = CFG.url.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/rpc/";

  // 헤더는 `apikey` 하나면 된다 — 로그인이 없으므로 PostgREST가 anon 역할로 처리하고,
  // 권한은 서버가 준 것(RPC 넷)까지다. 옛 JWT 꼴 키(eyJ…)일 때만 Authorization도 함께
  // 보낸다: 그 시절 관례라 안 보내도 되지만, 옛 프로젝트에서 굳이 다르게 굴 이유가 없다.
  // 새 키(sb_publishable_…)는 JWT가 아니라 Bearer로 실어 보내면 안 된다.
  const HEADERS = { "apikey": KEY, "Content-Type": "application/json" };
  if (/^eyJ/.test(KEY)) HEADERS["Authorization"] = "Bearer " + KEY;

  function rpc(fn, body) {
    return fetch(API + fn, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body || {}),
    }).catch(function () {
      throw new Error("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.ok) return data;
        // PostgREST는 raise exception의 문구를 message로 돌려준다. 서버가 사람 말로
        // 적어 둔 이유(악보가 너무 큼·시간당 횟수 넘김·권한 없음)를 그대로 보여주는
        // 것이 가장 친절하다 — 여기서 다시 번역하면 서버와 말이 어긋난다.
        throw new Error((data && (data.message || data.hint)) || ("게시 서버 오류 (" + res.status + ")"));
      });
    });
  }

  // ---------- 이 브라우저가 가진 수정 열쇠 ----------
  const LS_PUB = "jgb_published_v1";     // [{ id, token, title, time }]
  const LS_PREF = "jgb_pub_prefs_v1";    // 지난번 지은이·이용 조건 (매번 다시 고르지 않게)
  const PUB_MAX = 30;

  function loadPubs() {
    try { const a = JSON.parse(localStorage.getItem(LS_PUB)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function savePubs(list) {
    try { localStorage.setItem(LS_PUB, JSON.stringify(list.slice(0, PUB_MAX))); } catch (e) {}
  }
  function pubRec(id) {
    if (!id) return null;
    return loadPubs().filter(function (p) { return p.id === id; })[0] || null;
  }
  function tokenFor(id) { const r = pubRec(id); return r ? r.token : null; }
  function rememberPub(id, token, title, isPublic) {
    const list = loadPubs().filter(function (p) { return p.id !== id; });
    list.unshift({ id: id, token: token, title: title || "제목 없음",
                   pub: isPublic !== false, time: new Date().toISOString() });
    savePubs(list);
  }
  function forgetPub(id) {
    savePubs(loadPubs().filter(function (p) { return p.id !== id; }));
  }
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(LS_PREF)) || {}; } catch (e) { return {}; }
  }
  function savePrefs() {
    try {
      localStorage.setItem(LS_PREF, JSON.stringify({
        author: $("pubAuthor").value.trim(), license: $("pubLicense").value,
        pub: $("pubPublic").checked }));
    } catch (e) {}
  }

  function scoreUrl(id) { return location.origin + location.pathname + "#v=" + id; }

  // 자동 복사가 막힌 환경(권한 없음·비보안 출처)에서는 손으로 복사할 수 있게 보여준다
  // — app.js의 링크 복사와 같은 폴백.
  function copyText(text, okMsg) {
    return navigator.clipboard.writeText(text).then(function () {
      alert(okMsg);
    }).catch(function () {
      prompt("자동 복사가 막혀 있습니다. 아래 주소를 직접 복사해 주세요.", text);
    });
  }

  // ---------- 미리보기 그림 ----------
  // 모아보기 목록의 카드에 쓸 그림. 서버는 악보를 그릴 줄 모르지만 **브라우저는 이미 그려
  // 놓았으므로**, 첫 장 SVG를 작은 캔버스에 옮겨 담기만 하면 된다 — 서버 렌더러가 통째로
  // 필요 없어지는 자리다(PNG 내보내기가 쓰는 길과 같다).
  // 실패해도 게시는 그대로 간다 — 그림 하나 때문에 악보를 못 올리면 안 된다.
  const THUMB_W = 300;
  function makeThumb() {
    return new Promise(function (res) {
      const svg = document.querySelector("#sheet .page svg");
      if (!svg) { res(null); return; }
      let node, xml;
      try {
        const vb = (svg.getAttribute("viewBox") || "0 0 210 297").split(/\s+/).map(Number);
        const pw = vb[2] || 210, ph = vb[3] || 297;
        node = svg.cloneNode(true);
        // 화면 확인용 표시(편집·재생 하이라이트)는 그림에 남기지 않는다 — PNG 저장과 같은 규칙
        node.querySelectorAll(".no-print").forEach(function (n) { n.remove(); });
        xml = new XMLSerializer().serializeToString(node);
        const img = new Image();
        img.onload = function () {
          try {
            const c = document.createElement("canvas");
            c.width = THUMB_W;
            c.height = Math.round(THUMB_W * ph / pw);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";              // 악보는 늘 흰 종이(다크모드와 무관)
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            const uri = c.toDataURL("image/png");
            res(uri.length > 190000 ? null : uri);   // 서버 문턱(200KB)을 넘길 바엔 안 보낸다
          } catch (e) { res(null); }
        };
        img.onerror = function () { res(null); };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
      } catch (e) { res(null); }
    });
  }

  const LICENSE_KO = {
    "none": "저작권 유보", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC",
    "cc-by-sa": "CC BY-SA", "cc-by-nc-sa": "CC BY-NC-SA", "cc0": "CC0",
  };

  // ---------- 게시 창 ----------
  function setBusy(on) {
    ["pubGo", "pubNew", "pubCancel", "pubDelete", "pubAdminGo"].forEach(function (id) {
      const el = $(id); if (el) el.disabled = on;
    });
  }

  // 관리자로 연 악보를 편집 중인가. pubId가 갈아치워졌으면(새 문서·다른 악보 열기) 아니다 —
  // adminEditing만 보면 엉뚱한 악보를 남의 자리에 되쓸 수 있다.
  function adminMode() {
    return !!(adminEditing && adminOn() && window.jgbDoc.pubId() === adminEditing);
  }

  // 이 문서에 앱이 못 읽는 자리가 몇 군데인가. 세는 자는 app.js에 있다(선율 에디터가 빨간
  // 바탕을 깔 때 쓰는 그 함수) — 여기서 다시 세면 화면에 빨갛게 보이는 자리와 어긋난다.
  // 서버는 악보를 못 읽으므로(schema.sql 설계 뼈대 ①) **재는 일은 여기서 하고 숫자만 올린다.**
  // 옛 app.js(badCount가 없던 판)와도 같이 돌게 null을 돌려준다 — 그러면 서버가 안 적는다.
  function badCount() {
    try { return window.jgbDoc.badCount ? window.jgbDoc.badCount() : null; } catch (e) { return null; }
  }

  // 올리기 전 한 줄.
  function showSyntaxNote() {
    const el = $("pubSyntax");
    if (!el) return;
    const n = badCount() || 0;
    el.textContent = n ? ("문법이 틀린 곳이 " + n + "군데 있습니다.") : "";
    el.style.display = n ? "" : "none";
  }

  function openPubModal() {
    // 관리자로 연 악보는 **되쓰는 길 하나만** 연다. 여느 칸을 살려 두면 [게시]를 눌러
    // 남의 악보를 베낀 새 게시물이 하나 더 생긴다.
    const adm = adminMode();
    // ★ 되돌리는 쪽도 함께 적을 것. 창은 한 번 만들어 두고 여닫으므로, 관리자 모드에서
    //   숨긴 것을 여느 모드에서 되살리지 않으면 그 탭에서는 영영 안 보인다(열쇠 안내가
    //   그랬다). 아래 네 개는 여느 경로가 다시 정해 주지만 그래도 여기서 함께 되돌린다 —
    //   '숨긴 자리와 되살리는 자리가 같아야' 새 항목을 더할 때 빠뜨리지 않는다.
    ["pubExisting", "pubForkNote", "pubNew", "pubDelete", "pubKeyNote"].forEach(function (k) {
      const el = $(k); if (el) el.style.display = adm ? "none" : "";
    });
    $("pubAdmin").style.display = adm ? "" : "none";
    $("pubAdminGo").style.display = adm ? "" : "none";
    $("pubGo").style.display = adm ? "none" : "";
    ["pubAuthor", "pubLicense", "pubPublic", "pubRights"].forEach(function (k) {
      const f = $(k) && $(k).closest(".field");
      if (f) f.style.display = adm ? "none" : "";
    });
    showSyntaxNote();
    if (adm) {
      $("pubHead").textContent = "관리자 갱신";
      $("pubAdminNote").value = "";
      setBusy(false);
      $("pubModal").style.display = "flex";
      setTimeout(function () { $("pubAdminNote").focus(); }, 0);
      return;
    }

    const id = window.jgbDoc.pubId();
    const rec = pubRec(id);
    const tok = rec ? rec.token : null;
    const mine = !!(id && tok);          // 내가 게시했고 열쇠도 이 브라우저에 있다
    const orphan = !!(id && !tok);       // 게시물에서 온 문서인데 열쇠가 없다(남의 것/열쇠 잃음)

    $("pubHead").textContent = mine ? "게시한 악보 갱신" : "악보 게시";
    $("pubExisting").style.display = mine ? "" : "none";
    if (mine) $("pubUrl").value = scoreUrl(id);
    $("pubForkNote").style.display = orphan ? "" : "none";
    $("pubNew").style.display = mine ? "" : "none";
    $("pubDelete").style.display = mine ? "" : "none";
    $("pubGo").textContent = mine ? "갱신" : "게시";
    // 이미 한 번 확인하고 올린 사람에게 같은 것을 또 묻지 않는다
    $("pubRights").checked = mine;

    const pref = loadPrefs();
    if (!$("pubAuthor").value && pref.author) $("pubAuthor").value = pref.author;
    if (pref.license) $("pubLicense").value = pref.license;
    // 공개가 기본이다 — 여기는 '나눠 보는 곳'이라 올리는 이의 보통 뜻이 그쪽이다.
    // 이미 올린 것을 다시 열 때는 그때 정한 값을 그대로 보여준다.
    $("pubPublic").checked = BROWSE_ON && (mine ? (rec.pub !== false) : (pref.pub !== false));
    // 모아보기를 닫아 둔 동안엔 고를 것이 없다 — 목록이 없는데 '목록에 올리기'를 물으면
    // 켜 놓고도 아무 데도 안 뜨는 꼴이 된다. 칸을 감추고 모두 '주소를 아는 사람만'으로.
    $("pubPublic").closest(".field").style.display = BROWSE_ON ? "" : "none";

    setBusy(false);
    $("pubModal").style.display = "flex";
  }
  function closePubModal() { $("pubModal").style.display = "none"; }

  // asNew = true → 열쇠가 있어도 일부러 새 게시물로 (원본은 fork_of로 남는다)
  function doPublish(asNew) {
    if (!$("pubRights").checked) {
      alert("이 악보를 공개할 권리가 있는지 확인해 주세요.");
      return;
    }
    const doc = window.jgbDoc.state();
    const id = window.jgbDoc.pubId();
    const tok = tokenFor(id);
    const isPublic = $("pubPublic").checked;
    savePrefs();
    setBusy(true);

    const done = function () { setBusy(false); };
    const fail = function (e) { setBusy(false); alert((e && e.message) || "게시하지 못했습니다."); };
    const whereNote = isPublic
      ? "• 모아보기 목록에 올라갑니다\n"
      : "• 주소를 아는 사람만 볼 수 있습니다(목록에 오르지 않습니다)\n";

    // 그림을 먼저 뜬 뒤 올린다. 못 떠도(null) 그냥 올린다 — 카드에 그림만 안 보일 뿐이다.
    makeThumb().then(function (thumb) {
      if (tok && !asNew) {
        return rpc("update_score", { p_id: id, p_token: tok, p_doc: doc,
                                     p_public: isPublic, p_thumb: thumb,
                                     p_lint: badCount() }).then(function () {
          rememberPub(id, tok, window.jgbDoc.title(), isPublic);
          track("publish_update");
          done(); closePubModal();
          return copyText(scoreUrl(id), "악보를 갱신했습니다.\n주소는 그대로입니다(복사되었습니다).");
        });
      }
      return rpc("publish_score", {
        p_doc: doc,
        p_author: $("pubAuthor").value.trim(),
        p_license: $("pubLicense").value,
        // 지금 문서가 어느 게시물에서 왔다면 그것을 원본으로 남긴다 — 같은 곡의 다른
        // 가락이 계보로 쌓인다. 서버가 실재하는 id만 받아 적으므로 낯선 값은 그냥 버려진다.
        p_fork_of: id || null,
        p_public: isPublic,
        p_thumb: thumb,
        // 올리는 순간 함께 재 둔다 — 관리 화면의 '문법 오류' 탭이 저절로 채워진다
        p_lint: badCount(),
      }).then(function (r) {
        rememberPub(r.id, r.token, window.jgbDoc.title(), isPublic);
        window.jgbDoc.setPubId(r.id);
        track("publish", { v: isPublic ? "public" : "unlisted" });
        done(); closePubModal();
        return copyText(scoreUrl(r.id),
          "악보를 게시했습니다. 주소가 복사되었습니다.\n\n" + whereNote +
          "• 수정·삭제 열쇠는 이 브라우저에만 저장됩니다 — 지우면 되돌릴 수 없습니다");
      });
    }).catch(fail);
  }

  function doDelete() {
    const id = window.jgbDoc.pubId();
    const tok = tokenFor(id);
    if (!tok) return;
    if (!confirm("게시한 악보를 내립니다.\n주소를 나눠 준 사람은 더 이상 볼 수 없게 됩니다. 계속할까요?")) return;
    setBusy(true);
    rpc("delete_score", { p_id: id, p_token: tok }).then(function () {
      forgetPub(id);
      window.jgbDoc.setPubId(null);
      track("publish_delete");
      setBusy(false); closePubModal();
      alert("게시를 내렸습니다.\n지금 편집 중인 악보는 그대로 남아 있습니다.");
    }).catch(function (e) {
      setBusy(false); alert((e && e.message) || "내리지 못했습니다.");
    });
  }

  // ---------- 주소로 받은 악보 열기 ----------
  // 신고 창구 — policy.html에 적힌 곳과 **같은 주소**여야 한다(제103조가 요구하는 '지정·공지된
  // 수령인'이 두 군데서 다르면 안 된다). 편지에 악보 주소를 미리 채워 넣는다 — 신고하는 사람이
  // 무엇을 적어야 하는지 몰라 그냥 닫는 일을 줄인다.
  const REPORT_TO = "naerin71@kaist.ac.kr";
  function reportMailto(id, title) {
    const subj = "[우물사이] 악보 신고 (" + id + ")";
    const body = [
      "문제가 되는 악보", "  주소: " + scoreUrl(id), "  제목: " + (title || ""), "",
      "어떤 저작물의 권리인지 (곡명·저작자)", "  ", "",
      "신고하시는 분", "  성함/연락처: ", "  권리자 본인 / 대리인: ", "",
      "그 밖에 알려 주실 내용", "  ", "",
      "— 확인 즉시 해당 악보를 내리고 결과를 알려 드리겠습니다.",
    ].join("\n");
    return "mailto:" + REPORT_TO + "?subject=" + encodeURIComponent(subj) +
           "&body=" + encodeURIComponent(body);
  }

  function showBanner(meta, mine) {
    const who = meta.author ? (" · " + meta.author) : "";
    const lic = LICENSE_KO[meta.license] ? (" · " + LICENSE_KO[meta.license]) : "";
    $("cbText").textContent = mine
      ? ("내가 게시한 악보입니다" + who + " — 고친 뒤 [파일 › 악보 게시]에서 같은 주소로 갱신할 수 있습니다")
      : ("공유받은 악보입니다" + who + lic + " — 여기서 고쳐도 원본은 바뀌지 않습니다");
    // 내가 올린 악보를 나에게 신고하라고 할 일은 없다
    const rep = $("cbReport");
    rep.style.display = mine ? "none" : "";
    if (!mine) rep.href = reportMailto(meta.id, meta.title);
    $("cloudBanner").style.display = "";
  }

  // ---------- 관리자로 열기 (#va=) ----------
  // 여느 열기(#v=)와 무엇이 다른가:
  //   · admin_get_score를 타므로 **내려간 악보도 열리고** 조회수가 안 오른다.
  //   · 게시자 토큰이 없어도 같은 자리에 되쓸 수 있다(admin_save_score).
  // 관리 세션은 sessionStorage에 있어 **이 탭에만** 있다 — 주소를 복사해 남에게 줘 봐야
  // 그쪽에서는 열리지 않는다(열쇠가 주소에 실리지 않는다).
  let adminEditing = null;     // 지금 관리자로 열어 둔 게시물 id

  function adminOn() {
    return !!(window.jgbAdmin && window.jgbAdmin.on && window.jgbAdmin.has());
  }

  function consumeAdminHash() {
    const m = location.hash.match(AHASH_RE);
    if (!m) return false;
    const id = m[1];
    stripHash();                       // #v=·?first=1과 같은 규칙
    if (!adminOn()) {
      // 알림창이 아니라 배너로 말한다. 이 자리는 **페이지가 뜨자마자**인데, 알림창은
      // 눌러 없애기 전까지 렌더러를 통째로 막아 악보가 그려지는 것조차 못 본다.
      // 게다가 이 길로 들어오는 사람은 대개 주소만 얻어 걸린 경우라, 하던 일을 멈춰
      // 세울 만한 소식이 아니다.
      $("cbText").textContent =
        "관리자로 열 수 없습니다 — 관리 화면에서 로그인한 뒤 [열기]를 눌러 주세요.";
      $("cbReport").style.display = "none";
      $("cloudBanner").style.display = "";
      return true;
    }
    window.jgbAdmin.rpc("admin_get_score", { p_id: id }).then(async function (r) {
      if (!(await window.jgbDoc.adopt(r.doc, window.jgbDoc.hasSavedWork(),
            "게시된 악보를 관리자로 엽니다.", "관리자 열기 전 자동 저장"))) return;
      window.jgbDoc.setPubId(id);
      adminEditing = id;
      showAdminBanner(r);
      track("admin_open");
    }).catch(function (e) {
      alert("악보를 열지 못했습니다.\n" + ((e && e.message) || ""));
    });
    return true;
  }

  function showAdminBanner(meta) {
    const who = meta.author ? (" · " + meta.author) : "";
    const down = meta.hidden_at ? " · 내려간 악보" : "";
    $("cbText").textContent =
      "관리자로 열었습니다 (v" + (meta.ver || 1) + ")" + who + down +
      " — 고친 뒤 [파일 › 악보 게시]의 [관리자 갱신]으로 같은 주소에 되씁니다";
    $("cbReport").style.display = "none";     // 내가 처리하는 자리라 나에게 신고할 일이 없다
    $("cloudBanner").style.display = "";
  }

  // 관리자 갱신 — 약관 제5조 제4항의 범위 안에서 표기를 고친 것을 같은 자리에 되쓴다.
  // 메모를 안 적으면 서버가 막지만(admin_save_score), 서버까지 다녀와서 막히면 그 사이
  // 무엇이 잘못됐는지 알기 어려우므로 여기서 먼저 붙든다.
  function doAdminSave() {
    const note = $("pubAdminNote").value.trim();
    if (!note) {
      alert("무엇을 왜 고쳤는지 적어 주세요.\n이 기록은 게시한 사람이 열람을 요구할 수 있습니다(약관 제5조 제6항).");
      $("pubAdminNote").focus();
      return;
    }
    setBusy(true);
    window.jgbAdmin.rpc("admin_save_score", {
      p_id: adminEditing, p_doc: window.jgbDoc.state(), p_note: note,
      p_lint: badCount(),      // 고치고 되쓰는 자리이므로 여기서도 다시 재 둔다
    }).then(function (r) {
      setBusy(false);
      closePubModal();
      track("admin_save");
      alert(r && r.changed === false
        ? "달라진 것이 없어 그대로 두었습니다."
        : "고친 내용을 되썼습니다 (v" + (r && r.ver) + ").\n지난 판은 그대로 남아 있습니다.");
    }).catch(function (e) {
      setBusy(false);
      alert((e && e.message) || "되쓰지 못했습니다.");
    });
  }

  function consumeScoreHash() {
    const m = location.hash.match(HASH_RE);
    if (!m) return;
    const id = m[1];
    // 해시는 먼저 뗀다 — 이 주소를 북마크해 두고 새로고침할 때마다 편집하던 악보가
    // 게시본으로 되돌아가면 안 된다(#s=·?first=1과 같은 규칙).
    stripHash();
    rpc("fetch_score", { p_id: id }).then(async function (r) {
      const mine = !!tokenFor(id);
      // 작업 중이던 문서가 있으면 묻고 보관함에 자동 저장한다 — 절차는 링크 열기와 한 몸(app.js)
      if (!(await window.jgbDoc.adopt(r.doc, window.jgbDoc.hasSavedWork(),
            "게시된 악보를 엽니다.", "게시 악보 열기 전 자동 저장"))) return;
      // 들인 문서 안의 pubId는 게시 당시 값이라 실제와 어긋날 수 있다(예: 다른 게시물을
      // 복사해 만든 문서). 방금 연 주소가 정본이므로 그것으로 맞춰 둔다.
      window.jgbDoc.setPubId(id);
      showBanner(r, mine);
      track("publish_open");
    }).catch(function (e) {
      alert("악보를 열지 못했습니다.\n" + ((e && e.message) || ""));
    });
  }

  // ---------- 배선 ----------
  $("btnPublish").addEventListener("click", openPubModal);
  $("pubAdminGo").addEventListener("click", doAdminSave);
  $("pubCancel").addEventListener("click", closePubModal);
  $("pubGo").addEventListener("click", function () { doPublish(false); });
  $("pubNew").addEventListener("click", function () { doPublish(true); });
  $("pubDelete").addEventListener("click", doDelete);
  $("pubCopy").addEventListener("click", function () {
    copyText($("pubUrl").value, "주소가 복사되었습니다.");
  });
  $("cbClose").addEventListener("click", function () { $("cloudBanner").style.display = "none"; });

  // 검증·임베드용 노출 (window.jgbShareLink·window.jgbTrack과 같은 성격)
  window.jgbCloud = {
    publish: openPubModal,
    url: scoreUrl,
    published: loadPubs,
  };

  // #va=(관리자)를 먼저 본다. 둘은 서로 다른 주소라 겹칠 일이 없지만, 순서를 못 박아
  // 두면 나중에 형식이 늘어도 '어느 쪽이 먼저인가'를 다시 정할 일이 없다.
  if (!consumeAdminHash()) consumeScoreHash();
})();
