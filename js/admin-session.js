/* ============================================================================
   우물사이 — 관리 세션 (window.jgbAdmin)
   ============================================================================
   관리자 로그인과 admin_* RPC 호출을 **한 곳에** 둔다. 이 파일을 따로 뺀 까닭은
   쓰는 데가 둘이기 때문이다:
     · js/admin.js  (admin.html) — 로그인·목록·내리기·판
     · js/cloud.js  (index.html) — `#va=`로 관리자가 편집기에서 악보를 여는 길
   같은 셈(토큰 갱신·헤더·오류 번역)을 두 벌 적으면 한쪽만 고쳐지는 날이 온다.

   ── 열쇠를 어디에 두나 ────────────────────────────────────────────────────
   **sessionStorage다**(localStorage 아님). 창을 닫으면 풀린다 — 게시 토큰
   (jgb_published_v1, localStorage)이 '내 악보의 열쇠'인 데 비해 이것은 '남의
   악보에까지 닿는 열쇠'라 오래 두지 않는다.

   ★ 그래서 **새 탭에는 저절로 안 따라간다.** 2026-08-21 크롬 실측:
       <a target="_blank" rel="noopener">   → 안 넘어감
       <a target="_blank">                  → 안 넘어감 (요즘 크롬은 암묵적 noopener)
       window.open(url, "_blank", "noopener") → 안 넘어감
       window.open(url, "_blank")           → **넘어감**
     admin.html의 [열기]가 굳이 window.open을 쓰는 까닭이 이것이다. 링크(<a>)로
     바꾸면 편집기 탭에서 관리 세션이 사라져 '관리자로 열기'가 조용히 고장 난다.
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const BASE = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const ON = !!(BASE && KEY) && location.protocol !== "file:";
  const API = BASE + "/rest/v1/rpc/";
  const AUTH = BASE + "/auth/v1/";
  const SS = "jgb_admin_v1";

  function load() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SS));
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }
  function save(s) {
    try { s ? sessionStorage.setItem(SS, JSON.stringify(s)) : sessionStorage.removeItem(SS); }
    catch (e) {}
  }
  function mk(r) {
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

  // 서버가 사람 말로 적어 둔 까닭(사유를 안 적었다·관리자가 아니다)을 그대로 보여준다 —
  // 여기서 다시 번역하면 서버와 말이 어긋난다.
  function toErr(data, status, fallback) {
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
        throw toErr(data, res.status, "로그인하지 못했습니다");
      });
    });
  }

  // 만료가 가까우면 미리 새로 받는다. 60초 여유를 두는 건 부르는 도중에 만료되지 않게.
  function fresh() {
    const s = load();
    if (!s) return Promise.reject(new Error("로그인이 필요합니다."));
    const now = Math.floor(Date.now() / 1000);
    if (s.expires_at - now > 60) return Promise.resolve(s);
    if (!s.refresh_token) return Promise.reject(new Error("로그인이 풀렸습니다."));
    return authPost("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
      .then(function (r) { const n = mk(r); save(n); return n; })
      .catch(function () {
        save(null);
        throw new Error("로그인이 풀렸습니다. 다시 들어와 주세요.");
      });
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
          // 토큰이 죽었으면 들고 있어 봐야 소용이 없다 — 버리고 다시 들어오게 한다.
          if (res.status === 401) { save(null); throw new Error("로그인이 풀렸습니다."); }
          throw toErr(data, res.status, "서버 오류");
        });
      });
    });
  }

  window.jgbAdmin = {
    on: ON,                 // 서버 설정이 있는가 (로그인 여부와 무관)
    has: function () { return !!load(); },
    get: load,
    signIn: function (email, pw) {
      return authPost("token?grant_type=password", { email: email, password: pw })
        .then(function (r) { const s = mk(r); save(s); return s; });
    },
    signOut: function () { save(null); },
    rpc: rpc,
  };
})();
