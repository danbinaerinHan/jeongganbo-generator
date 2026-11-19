// 아이폰·아이패드의 무음 모드에서도 재생 소리가 나게 한다(2026-11-19, 문의·제안 게시판 제보:
// "재생하면 표시는 움직이는데 소리가 안 남 — 이어폰으로는 남").
//
// iOS Safari는 웹 오디오(AudioContext)를 '주변음' 세션으로 다뤄, 무음 스위치(또는 제어 센터의
// 무음 모드)가 켜져 있으면 **본체 스피커로는 내보내지 않는다** — 이어폰으로는 나서 고장처럼 보인다.
// 재생 버튼을 누르는 순간(사용자 동작 안에서) 세션을 '재생'으로 바꾸면 무음 모드여도 소리가 난다.
//   · iOS 16.4+ / Safari: navigator.audioSession.type = "playback" 한 줄로 된다.
//   · 그보다 오래된 iOS: 소리 없는 <audio>를 함께 틀면 세션이 '재생'으로 바뀐다(널리 쓰이는 수법).
//     재생이 끝나면 end()로 멈춘다(계속 틀어 두면 잠금 화면에 재생 표시가 남고 전지를 먹는다).
// 편집기(js/app.js)와 타악 정간보(js/percussion.js)가 함께 쓴다 — 두 페이지 모두 앞에서 싣는다.
(function () {
  "use strict";
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // 아이패드 데스크톱 모드
  var SILENT = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
  var el = null;
  // 재생을 시작할 때(버튼 클릭 처리 안에서) 부른다. light: 미리듣기처럼 짧은 소리는 세션만 바꾸고
  // 무음 <audio>는 틀지 않는다(멈출 자리가 없어서).
  function begin(light) {
    try { if (navigator.audioSession) { navigator.audioSession.type = "playback"; return; } } catch (e) {}
    if (!IOS || light) return;
    try {
      if (!el) { el = new Audio(SILENT); el.loop = true; el.setAttribute("playsinline", ""); }
      var p = el.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function end() { if (el) { try { el.pause(); } catch (e) {} } }
  window.jgbAudioSession = { begin: begin, end: end };
})();
