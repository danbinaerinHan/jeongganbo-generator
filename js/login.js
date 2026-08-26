/* ============================================================================
   로그인 화면(login.html) — 카드 넷을 갈아 끼운다
   ============================================================================
   세션과 서버 이야기는 전부 js/user-session.js(window.jgbUser)에 있다. 여기는
   **화면만** 맡는다 — 토큰을 직접 만지거나 /auth/v1을 직접 부르지 말 것.

   카드 넷: 주소 적기(ask) → 메일 보냄(sent) → 들어와 있음(in) / 준비 중(off).
   ============================================================================ */
(function () {
  "use strict";

  const U = window.jgbUser;
  const $ = function (id) { return document.getElementById(id); };
  const track = function (n, p) { try { window.jgbTrack && window.jgbTrack(n, p); } catch (e) {} };

  // 다시 보내기 대기 — Supabase 기본 한도(같은 주소로 60초에 한 번)에 맞춘 값이다.
  // 버튼을 눌러 보고 한도 오류를 받는 것보다 눌리지 않는 편이 낫다.
  const RESEND_WAIT = 60;

  let email = "";        // 방금 보낸 주소
  let timer = 0;

  function show(which) {
    ["lgAsk", "lgSent", "lgIn", "lgOff"].forEach(function (id) {
      const el = $(id);
      if (el) el.style.display = (id === which) ? "" : "none";
    });
  }
  function err(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "" : "none";
  }
  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    if (label != null) btn.textContent = label;
  }

  /* ---------- ③ 들어와 있음 ---------- */
  function showIn(s) {
    // 해시로 막 들어온 참이면 주소가 아직 안 채워져 있다 — 서버 대답을 기다리는
    // 동안 빈칸을 두지 않고 점을 찍어 둔다.
    $("lgWho").textContent = (s && s.email) || "…";
    show("lgIn");
  }

  /* ---------- ② 메일 보냄 ---------- */
  function showSent(to) {
    email = to;
    $("lgSentTo").textContent = to;
    err("lgErr2", "");
    $("lgCode").value = "";
    show("lgSent");
    startWait();
    $("lgCode").focus();
  }
  function startWait() {
    const b = $("lgResend");
    let left = RESEND_WAIT;
    clearInterval(timer);
    const tick = function () {
      if (left <= 0) {
        clearInterval(timer);
        b.disabled = false;
        b.textContent = "다시 보내기";
        return;
      }
      b.disabled = true;
      b.textContent = "다시 보내기 (" + left + "초)";
      left--;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function send(to, btn, errBox, label) {
    err(errBox, "");
    busy(btn, true, "보내는 중…");
    return U.sendLink(to).then(function () {
      track("login_send");
      showSent(to);
    }).catch(function (e) {
      err(errBox, e.message || "메일을 보내지 못했습니다.");
    }).then(function () {
      busy(btn, false, label);
    });
  }

  /* ---------- 배선 ---------- */
  function wire() {
    $("lgForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const to = $("lgEmail").value.trim();
      if (!to) return;
      send(to, $("lgGo"), "lgErr", "메일로 링크 받기");
    });

    $("lgResend").addEventListener("click", function () {
      if (!email) return;
      send(email, $("lgResend"), "lgErr2", "다시 보내기");
    });

    // 주소를 잘못 적었을 때 — 적었던 것을 그대로 남겨 고치게 한다(다시 치게 하지 않는다)
    $("lgBack").addEventListener("click", function () {
      clearInterval(timer);
      $("lgEmail").value = email;
      err("lgErr", "");
      show("lgAsk");
      $("lgEmail").focus();
      $("lgEmail").select();
    });

    $("lgCodeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      const code = $("lgCode").value.replace(/\D/g, "");
      if (code.length < 6) { err("lgErr2", "여섯 자리 번호를 적어 주세요."); return; }
      err("lgErr2", "");
      busy($("lgCodeGo"), true, "확인하는 중…");
      U.verifyCode(email, code).then(function (s) {
        clearInterval(timer);
        track("login_ok", { v: "code" });
        showIn(s);
      }).catch(function (ex) {
        // 서버는 만료와 오타를 같은 오류로 준다(번호를 훑어 맞히지 못하게) — 여기서
        // 지어내지 말고 둘 다일 수 있다고 그대로 적는다.
        err("lgErr2", "번호가 맞지 않거나 시간이 지났습니다. 다시 보내 주세요.");
      }).then(function () {
        busy($("lgCodeGo"), false, "번호로 들어가기");
      });
    });

    $("lgOut").addEventListener("click", function () {
      busy($("lgOut"), true, "나가는 중…");
      U.signOut().then(function () {
        track("logout");
        busy($("lgOut"), false, "나가기");
        show("lgAsk");
        $("lgEmail").focus();
      });
    });

    // 다른 탭에서 들어오거나 나가면 이 탭도 따라간다. 매직 링크는 '메일 앱이 연 새 탭'
    // 에서 풀리는 일이 잦아, 이 창이 옛 화면으로 남으면 방금 로그인한 사람에게
    // 로그인하라는 카드가 계속 보인다.
    U.onChange(function (s) {
      if (s) { clearInterval(timer); showIn(s); }
    });
  }

  /* ---------- 시작 ---------- */
  if (!U || !U.on) { show("lgOff"); return; }
  wire();

  // 매직 링크가 돌아온 자리인가부터 본다 — 주소에 실려 온 토큰은 쓰는 즉시 떼어진다.
  const back = U.consumeHash();
  if (back && back.err) {
    err("lgErr", back.err);
    show("lgAsk");
  } else if (back && back.ok) {
    track("login_ok", { v: "link" });
    showIn(back.ok);
    // 누구로 들어왔는지는 한 박자 뒤에 서버가 알려 준다(해시엔 주소가 안 실려 온다)
    if (back.who && back.who.then) back.who.then(showIn);
  } else if (U.has()) {
    showIn(U.get());
  } else {
    show("lgAsk");
    $("lgEmail").focus();
  }
})();
