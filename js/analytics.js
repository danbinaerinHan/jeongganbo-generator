// 익명 사용 통계 — 경량 로깅 래퍼 (쿠키·식별자·개인정보 없음)
//
// 앱(js/app.js)에는 window.jgbTrack(name, props) 하나만 노출한다. 실제 전송은 이 파일이
// 담당하므로, 백엔드(GoatCounter 등)를 붙이거나 갈아끼워도 app.js는 손댈 필요가 없다.
//
// 원칙
// - 개인정보 없음: 이벤트 이름 + 앱 버전만 보낸다. 쿠키·로컬스토리지 식별자·IP 저장 없음
//   → 개인정보보호법상 동의 배너 불필요(푸터 고지 한 줄이면 충분).
// - 브라우저의 추적 거부(DNT) 설정과 로컬 개발 환경에서는 아예 전송하지 않는다.
// - 백엔드 미연동(GOATCOUNTER_CODE 비어 있음) 상태여도 앱은 평소처럼 돌고,
//   이벤트는 검증용 메모리 링(window.jgbTrack.recent, 새로고침하면 사라짐)에만 남는다.
(function () {
  "use strict";

  // ── 설정 ─────────────────────────────────────────────────────────────
  // GoatCounter 계정 코드. 예: "jeongganbo" → https://jeongganbo.goatcounter.com
  // 비어 있으면 전송하지 않는다(연동 전 대기 모드). 계정을 만들면 여기 한 줄만 채우면 끝.
  var GOATCOUNTER_CODE = "";
  // 기능이 크게 바뀔 때 갱신 — 대시보드에서 "버전별 사용 변화"를 나눠 볼 수 있게 이벤트에 붙는다
  var APP_VERSION = "2026-07-10";

  // 대시보드에 보일 한글 라벨 (없으면 이벤트 이름 그대로)
  var EVENT_LABELS = {
    doc_new: "새 문서 생성",
    export_png: "PNG 내보내기",
    export_print: "인쇄",
    export_file: "파일 저장(.jgb.json)",
    import_file: "파일 불러오기",
    play: "재생(청음)",
    input_mode: "입력 방식 전환",
    help_open: "도움말 열람",
    tour_start: "둘러보기 시작",
    save_snapshot: "임시저장"
  };

  // ── 수집 제외 판정 ────────────────────────────────────────────────────
  var isLocal = location.protocol === "file:" ||
    /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(location.hostname);
  var dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
  var enabled = !!GOATCOUNTER_CODE && !isLocal && !dnt;

  // ── 전송(GoatCounter 어댑터) ──────────────────────────────────────────
  // 커스텀 이벤트는 path("event/이름")로 집계된다. props.v(변형값)가 있으면 path에 붙여
  // "event/input_mode/direct"처럼 변형별 집계도 가능. 그 외 props는 GoatCounter가 못 받는
  // 확장 여지(나중에 다른 백엔드로 교체 시 활용)로만 시그니처에 남겨 둔다.
  var queue = [];
  var MAX_QUEUE = 50;

  function gcReady() {
    return !!(window.goatcounter && typeof window.goatcounter.count === "function");
  }
  function sendGC(ev) {
    window.goatcounter.count({ path: ev.path, title: ev.title, event: true });
  }
  function flush() {
    if (!gcReady()) return;
    queue.splice(0, queue.length).forEach(sendGC);
  }

  // ── 앱에 노출하는 단일 진입점 ─────────────────────────────────────────
  function jgbTrack(name, props) {
    var path = "event/" + name + (props && props.v ? "/" + props.v : "");
    var title = (EVENT_LABELS[name] || name) + " · v" + APP_VERSION;
    // 검증용 메모리 링(최근 20건) — 전송 여부와 무관, 저장 안 됨
    jgbTrack.recent.push({ name: name, props: props || null, sent: enabled });
    if (jgbTrack.recent.length > 20) jgbTrack.recent.shift();
    if (!enabled) return;
    var ev = { path: path, title: title };
    if (gcReady()) sendGC(ev);
    else if (queue.length < MAX_QUEUE) queue.push(ev);
  }
  jgbTrack.recent = [];
  window.jgbTrack = jgbTrack;

  // ── GoatCounter 스크립트 로드(연동된 경우에만) ────────────────────────
  // count.js가 로드되면 페이지뷰는 자동 집계되고, 그 전에 쌓인 이벤트는 flush로 마저 보낸다.
  if (enabled) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + GOATCOUNTER_CODE + ".goatcounter.com/count");
    s.addEventListener("load", flush);
    document.head.appendChild(s);
  }
})();
