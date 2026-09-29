/* ============================================================================
   우물사이 — 이용자 세션 (window.jgbUser)
   ============================================================================
   전자우편 매직 링크로 들어오는 **이용자** 계정. 관리자 세션(js/admin-session.js)과
   짜임은 닮았지만 **일부러 따로 선다** — 둘을 한 파일에 합치면 아래 세 가지가 한
   덩어리로 섞여, 언젠가 한쪽 규칙이 다른 쪽에 새어 든다.

   ── 관리자 세션과 무엇이 다른가 ──────────────────────────────────────────
   ① **사는 곳이 다르다.** 관리자는 sessionStorage(`jgb_admin_v1`, 창을 닫으면 풀림),
      이용자는 **localStorage**(`jgb_user_v1`). 관리 열쇠는 남의 악보에까지 닿으므로
      오래 두지 않지만, 이용자 로그인은 **오래 유지되어야 뜻이 있다** — 매직 링크는
      풀릴 때마다 메일을 한 번씩 왕복해야 해서, 자주 풀리면 그게 곧 못 쓸 기능이다.
      (게시 토큰 `jgb_published_v1`이 localStorage인 것과 같은 결이다.)
   ② **드는 길이 다르다.** 관리자는 비밀번호(`grant_type=password`), 이용자는
      비밀번호가 없다(`/auth/v1/otp`). 비밀번호를 안 두므로 '비밀번호 찾기'라는
      문제가 통째로 사라지고, 가입 확인 절차도 따로 없다 — **링크를 눌렀다는 것
      자체가 확인**이다. 수집하는 개인정보는 전자우편 주소 하나뿐이다.
   ③ **여는 문이 다르다.** 관리자 토큰은 `admin_*` RPC를, 이용자 토큰은 제 것만
      만지는 RPC를 연다. 서버는 함수마다 첫 줄에서 `require_admin()`을 다시 묻는다 —
      **이용자가 로그인하기 시작하면 'authenticated = 관리자일 수도 있는 사람'이라는
      옛 전제가 깨지므로**, 그 이중 방어가 여기서 진짜로 값을 한다.

   ── 대기 모드 ────────────────────────────────────────────────────────────
   `JGB_CLOUD.accounts`가 참이 아니면 이 모듈은 스스로 물러난다(`on === false`).
   cloud-config.js의 `browse`, analytics.js의 GOATCOUNTER_CODE와 같은 수법이다.
   **SMTP가 붙기 전에는 켜지 말 것** — 메일이 안 가면 아무도 못 들어오는데 문만
   열려 있으면 그건 고장이다. 약관·개인정보처리방침의 개정도 이 스위치와 같은
   날에 나간다(계정이 없는데 '전자우편을 수집한다'고 적으면 사실과 다르다).

   ── 매직 링크가 돌아오는 자리 ────────────────────────────────────────────
   Supabase는 메일 속 링크를 `/auth/v1/verify`로 받아 **redirect_to에 해시로**
   토큰을 붙여 되돌려 준다(`#access_token=…&refresh_token=…&type=magiclink`).
   그래서 돌아올 곳은 `login.html` 한 장이다 — index.html은 해시를 이미 악보
   주소로 쓰고 있어(`#v=`·`#s=`·`#va=`) 거기로 되돌리면 두 문법이 부딪힌다.
   ============================================================================ */
(function () {
  "use strict";

  const CFG = window.JGB_CLOUD || {};
  const KEY = CFG.key || CFG.anonKey || "";
  const BASE = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  // 서버 설정이 있고 · 계정 기능이 켜져 있고 · file:// 이 아닐 때만 선다.
  // file://을 빼는 까닭은 돌아올 주소(redirect_to)를 만들 수 없어서다.
  const ON = !!(BASE && KEY) && CFG.accounts === true && location.protocol !== "file:";
  const API = BASE + "/rest/v1/rpc/";
  const AUTH = BASE + "/auth/v1/";
  const LS = "jgb_user_v1";

  const subs = [];
  function notify() { subs.forEach(function (f) { try { f(load()); } catch (e) {} }); }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS));
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }
  function save(s) {
    try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); }
    catch (e) {}
    notify();
  }
  function mk(r) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      // expires_at을 안 주는 판도 있어 expires_in에서 셈해 둔다(관리 세션과 같은 대비).
      expires_at: Number(r.expires_at) || (now + (Number(r.expires_in) || 3600)),
      email: (r.user && r.user.email) || "",
      uid: (r.user && r.user.id) || "",
    };
  }

  // 서버가 사람 말로 적어 둔 까닭을 그대로 보여준다 — 여기서 다시 번역하면 서버와
  // 말이 어긋난다. 다만 이용자가 실제로 마주치는 두 가지(한도 초과·링크 만료)만
  // 한국어로 갈아 준다. 영어로 나오면 무엇을 해야 할지 알 수가 없어서다.
  function toErr(data, status, fallback) {
    const code = data && (data.error_code || data.code || "");
    if (status === 429 || code === "over_email_send_rate_limit") {
      return new Error("메일을 너무 자주 보냈습니다. 잠시 뒤에 다시 시도해 주세요.");
    }
    if (code === "otp_expired") {
      return new Error("링크가 만료되었습니다. 메일을 다시 받아 주세요.");
    }
    // 대시보드에서 신규 가입이 꺼져 있으면 처음 오는 주소가 여기서 막힌다. 서버 말은
    // "Signups not allowed for otp"라 무엇을 해야 할지 알 수가 없으므로 갈아 준다.
    // ★ 이 프로젝트는 관리자만 쓰던 때에 가입을 꺼 두었다(2026-08-26 실측 disable_signup:true) —
    //   계정 기능을 켜는 날 대시보드에서 함께 열어야 한다. 자세한 것은 NEXT-SESSION.md.
    if (code === "signup_disabled" || /signups? not allowed/i.test(String(
        (data && (data.message || data.msg || data.error_description)) || ""))) {
      return new Error("아직 새 계정을 만들 수 없습니다. 잠시 뒤에 다시 시도해 주세요.");
    }
    const m = data && (data.message || data.error_description || data.msg ||
                       data.error || data.hint);
    return new Error(m || (fallback + " (" + status + ")"));
  }

  function authPost(path, body, token) {
    const h = { "apikey": KEY, "Content-Type": "application/json" };
    if (token) h["Authorization"] = "Bearer " + token;
    return fetch(AUTH + path, {
      method: "POST", headers: h, body: JSON.stringify(body || {}),
    }).catch(function () {
      throw new Error("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.ok) return data;
        throw toErr(data, res.status, "요청이 처리되지 않았습니다");
      });
    });
  }

  // 만료가 가까우면 미리 새로 받는다. 60초 여유는 부르는 도중에 만료되지 않게.
  function fresh() {
    const s = load();
    if (!s) return Promise.reject(new Error("로그인이 필요합니다."));
    const now = Math.floor(Date.now() / 1000);
    if (s.expires_at - now > 60) return Promise.resolve(s);
    if (!s.refresh_token) { save(null); return Promise.reject(new Error("로그인이 풀렸습니다.")); }
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

  // 돌아올 주소 — 지금 보고 있는 login.html 그대로(질의·해시는 뗀다).
  function redirectTo() {
    return location.origin + location.pathname;
  }

  window.jgbUser = {
    on: ON,                 // 계정 기능이 켜져 있는가 (로그인 여부와 무관)
    has: function () { return !!load(); },
    get: load,

    /* 메일 보내기. create_user:true라 처음 오는 주소면 그 자리에서 계정이 생긴다 —
       '가입'과 '로그인'을 가르지 않는 것이 매직 링크의 값이다(둘 다 링크 한 번). */
    sendLink: function (email) {
      return authPost("otp", {
        email: email,
        create_user: true,
        options: { email_redirect_to: redirectTo() },
        // Supabase는 판에 따라 이 두 이름 중 하나를 읽는다. 둘 다 실어 두면
        // 어느 쪽이든 돌아올 자리를 안다(안 읽는 쪽은 그냥 무시된다).
        redirect_to: redirectTo(),
      });
    },

    /* 여섯 자리 코드로 들어오기. 링크를 **다른 브라우저**(메일 앱의 내장 창 등)에서
       열면 세션이 그쪽에 생겨 버리는데, 코드 길이 함께 두면 그 자리에서 풀린다. */
    verifyCode: function (email, code) {
      return authPost("verify", { email: email, token: String(code).trim(), type: "email" })
        .then(function (r) { const s = mk(r); save(s); return s; });
    },

    /* 매직 링크가 되돌려 준 해시를 걷어 세션으로 삼는다.
       쓰자마자 replaceState로 주소에서 떼는 것은 `?first=1`·`#v=`와 **같은 규칙**이다 —
       토큰이 박힌 주소를 북마크하거나 남에게 붙여 넣는 일을 막는다.
       돌려주는 값: {ok:세션} · {err:"까닭"} · null(해시에 아무것도 없음). */
    consumeHash: function () {
      const h = location.hash || "";
      if (h.length < 2 || h.indexOf("=") < 0) return null;
      const q = new URLSearchParams(h.slice(1));
      const strip = function () {
        try { history.replaceState(null, "", location.pathname + location.search); }
        catch (e) { location.hash = ""; }
      };
      if (q.get("error") || q.get("error_code")) {
        strip();
        const c = q.get("error_code") || "";
        if (c === "otp_expired" || c === "access_denied") {
          return { err: "링크가 만료되었거나 이미 쓰인 링크입니다. 메일을 다시 받아 주세요." };
        }
        return { err: q.get("error_description") || "들어오지 못했습니다." };
      }
      const at = q.get("access_token");
      if (!at) return null;
      strip();
      const s = mk({
        access_token: at,
        refresh_token: q.get("refresh_token") || "",
        expires_at: q.get("expires_at"),
        expires_in: q.get("expires_in"),
      });
      save(s);
      // 주소엔 전자우편이 안 실려 온다 — 누구로 들어왔는지는 서버에 물어 채운다.
      return { ok: s, who: whoAmI(s) };
    },

    /* 나가기 — 이 브라우저의 열쇠를 버리고 서버의 갱신 토큰도 함께 거둔다.
       서버 쪽이 실패해도 로컬은 반드시 지운다(내 손에 남은 열쇠가 더 급하다). */
    signOut: function () {
      const s = load();
      save(null);
      if (!s) return Promise.resolve();
      return authPost("logout", {}, s.access_token).catch(function () {});
    },

    rpc: rpc,
    fresh: fresh,
    /* 로그인 상태가 바뀔 때 부를 것 — 레일의 [계정] 버튼이 이걸로 글씨를 갈아 끼운다.
       등록하는 즉시 지금 상태로 한 번 부른다(부르는 쪽이 초기화를 또 안 적게). */
    onChange: function (cb) {
      if (typeof cb !== "function") return;
      subs.push(cb);
      try { cb(load()); } catch (e) {}
    },
  };

  // 누구로 들어왔는지 서버에 묻고 세션에 적어 둔다(해시엔 주소가 안 실려 온다).
  function whoAmI(s) {
    return fetch(AUTH + "user", {
      headers: { "apikey": KEY, "Authorization": "Bearer " + s.access_token },
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      if (!u || !u.email) return s;
      const cur = load();
      if (!cur || cur.access_token !== s.access_token) return s;
      cur.email = u.email; cur.uid = u.id || cur.uid;
      save(cur);
      return cur;
    }).catch(function () { return s; });
  }

  /* 다른 탭에서 들어오거나 나가면 이 탭도 따라간다. 매직 링크는 '메일 앱이 연 새 탭'
     에서 풀리는 일이 잦아, 원래 쓰던 탭이 옛 상태로 남으면 방금 로그인한 사람에게
     로그인하라는 화면이 계속 보인다. */
  window.addEventListener("storage", function (e) { if (e.key === LS) notify(); });
})();
