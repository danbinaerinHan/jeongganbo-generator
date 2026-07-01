/**
 * 설정 + 에디터를 읽어 미리보기를 갱신하는 진입점.
 */
(function () {
  const { parseScore, parseDaegang } = window.JGBParser;
  const { renderPages } = window.JGBRender;

  const controls = {
    orientation: document.getElementById("set-orientation"),
    gakPerRow: document.getElementById("set-gak-per-row"),
    jeonggan: document.getElementById("set-jeonggan"),
    daegang: document.getElementById("set-daegang"),
    bands: document.getElementById("set-bands"),
  };
  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const btnPrint = document.getElementById("btn-print");

  /** 현재 UI 상태에서 설정 객체를 만든다. */
  function readSettings() {
    const jeongganCount = clampInt(controls.jeonggan.value, 1, 40, 6);
    const gakPerRow = clampInt(controls.gakPerRow.value, 1, 30, 10);
    const orientation = controls.orientation.value === "landscape" ? "landscape" : "portrait";
    const daegang = parseDaegang(controls.daegang.value, jeongganCount);
    const bandsPerPage = resolveBands(controls.bands.value, jeongganCount);

    return { orientation, gakPerRow, jeongganCount, daegang, bandsPerPage };
  }

  /** 페이지당 밴드 수 결정. 자동이면 12정간 이하 → 2행. */
  function resolveBands(value, jeongganCount) {
    if (value === "auto") {
      return jeongganCount <= 12 ? 2 : 1;
    }
    return clampInt(value, 1, 3, 1);
  }

  function clampInt(raw, min, max, fallback) {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function update() {
    const settings = readSettings();
    const gaks = parseScore(editor.value, settings.jeongganCount);
    const pages = renderPages(gaks, settings);

    preview.replaceChildren(...pages);
  }

  // 이벤트 바인딩
  Object.values(controls).forEach((ctrl) => {
    ctrl.addEventListener("input", update);
    ctrl.addEventListener("change", update);
  });
  editor.addEventListener("input", update);
  btnPrint.addEventListener("click", () => window.print());

  // 초기 렌더
  update();
})();
