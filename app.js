(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const CJK = "'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

  const PAGE_W = 210, PAGE_H = 297;
  // MARGIN_BASE: '페이지 채움' 0%일 때 기본 페이지 여백 / MARGIN_MIN: 100%여도 남기는 최소 여백(mm)
  // — 예시 악보처럼 테두리가 페이지 끝에 닿지 않고 항상 여백을 조금 둔다
  const MARGIN_BASE = 12, MARGIN_MIN = 9, INNER_PAD = 5;
  const T_THIN = 0.14, T_THICK = 0.32, T_FRAME = 0.63, T_DAEGANG = 0.45;   // 정간·각 선은 아주 살짝 얇게(0.16/0.36에서)
  // 셀 서식(직접 입력)에서 사용자가 고르는 테두리 굵기 3단계 — 격자선보다 눈에 띄게 조금 더 굵게
  const CELL_BORDER_WIDTH_PX = { thin: 0.3, medium: 0.6, thick: 1.0 };

  const DAEGANG_PRESET = { 8: "", 10: "7 3", 12: "3 3 3 3", 16: "3 2 3 3 2 3", 20: "6 4 4 6" };
  let daegangAuto = "";
  let palView = "yul";       // 팔레트 보기: 율명 / 시김새(orn)
  let yulMode = "grid";      // 율명 입력 방식: 표(grid) / 피아노 건반(piano)
  let inputMode = "direct";   // 정간 클릭 동작(선율·장단·가사 공통): direct(옆 입력창, 기본) / editor(에디터로 커서 이동)
  let gakUserSet = false;   // 사용자가 '총 각 수'를 직접 입력했는지(아니면 페이지를 꽉 채움)
  let activeGak = -1, activeCellIdx = -1;   // 현재 편집 중인 정간
  let activeRow = -1, activeRows = 1;        // 정간 내부 행(분박) 위치 (-1 = 정간 전체)
  let activeArea = "mel";                    // 하이라이트 대상: mel(선율) / jd(장단) / ly(가사)
  let cellGeom = {};                        // 렌더 시 정간 좌표 저장(하이라이트용, page 포함)
  let jdGeom = {};                          // 렌더 시 장단 칸 좌표 저장(하이라이트용)
  let hiLyGap = 0, hiLyW = 0, hiLyricsOn = false;   // 가사 줄 하이라이트용 치수(렌더 시 갱신)
  let pageHi = [];                          // 페이지별 하이라이트 사각형
  let playHi = [];                          // 페이지별 재생 하이라이트 사각형
  let pageSvgs = [];                        // 페이지별 svg
  let cellEditor = null, cellEditInput = null;  // 정간 옆 직접 입력 카드
  let cellEditDomain = null;                // 카드가 선율/장단/가사 중 어디서 열렸는지("mel"/"jd"/"ly")
  let cellEditGi = -1, cellEditCi = -1;     // 카드가 열려 있는 정간 좌표 (전역 커서와 별개로 기억)
  let keepCellEditor = false;               // true면 render()가 직접 입력 카드를 닫지 않음(실시간 반영용)
  let ornEditMode = false;                  // 시김새 수정 모드
  let ornSel = null;                        // 선택된 시김새 {gak, cell, k}
  let ornInstances = [];                    // 렌더된 시김새 위치 목록(수정 모드 히트용)
  let ornAddMode = false;                   // 시김새 추가 모드(직접 입력) — 숫자키로 붙임표 시김새를 고른 뒤 음을 클릭해 붙임
  let ornAddArmed = null;                   // 지금 골라둔(armed) 붙임표 시김새의 stem
  // 정간보 기본 드래그 = 구간 선택(스프레드시트 방식). 드래그 없이 그냥 누르면(클릭) 그 정간을
  // 편집하고, 다른 칸으로 번지면(mouseenter) 드래그로 확정해 구간을 고른다 — 선택은 손을 뗀
  // 뒤에도 남아있어서, 구간 지우기·셀 서식 칠하기/지우기 버튼을 나중에 눌러 적용할 수 있다.
  let melSelStart = null, melSelEnd = null;  // 지금 선택된 정간 구간(없으면 null)
  let melSelActive = false;                  // 마우스가 눌린 채로 클릭/드래그 판정 중인지
  let melSelDidDrag = false;                 // 이번 제스처가 다른 칸으로 번져 드래그로 확정됐는지
  function hasMelSel() { return !!(melSelStart && melSelEnd); }
  // 셀 서식 모드인지 — 직접 입력에선 셀 서식 도구창이 떠 있을 때(.win-open), 에디터에선
  // 셀 서식 레일 탭이 활성일 때(.active). 이 모드에선 정간 클릭이 '내용 편집'(노란 입력창)이
  // 아니라 '서식 적용 대상 선택'이 된다 — 한 칸 클릭도, 여러 칸 드래그도 전부 선택.
  function cellStyleMode() {
    const w = $("cellStyleWin");
    return inputMode === "direct" ? w.classList.contains("win-open") : w.classList.contains("active");
  }
  // 선택된 구간이 없으면 '구간 지우기'·셀 서식 실행 버튼들을 비활성화 — 눌러도 아무 일 없는
  // 상태를 미리 보여준다. 렌더마다 호출(선택이 render()로만 바뀌므로).
  const MEL_SEL_BTN_IDS = ["rangeClearToggle", "cellFillPaintToggle", "cellFillEraseToggle",
    "cellBorderPaintToggle", "cellBorderEraseToggle",
    "cellBorderPresetAll", "cellBorderPresetOuter", "cellBorderPresetInner"];
  function refreshMelSelBtns() {
    const on = hasMelSel();
    MEL_SEL_BTN_IDS.forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = !on;
    });
  }
  let cellStylePendingColor = "#ffe08a";     // 배경색 칠하기에 쓸 현재 색(여러 색을 번갈아 칠할 수 있음)
  let cellBorderSides = { top: false, right: false, bottom: false, left: false };  // 테두리 칠할 변(직접 선택)
  let cellBorderWidth = "medium";            // "thin" | "medium" | "thick"
  let cellBorderStyle = "solid";             // "solid" | "dashed" | "double"
  // 정간보는 한 칸씩 세로로 쌓인 '열이 하나뿐인 표'라, 워드/페이지스의 표 테두리 프리셋 중
  // 바깥쪽/안쪽만 '고른 구간 전체를 하나의 사각형으로 볼 때' 의미가 있다(가로 구분선 개념이 없음).
  // "custom"이면 cellBorderSides 체크값을 모든 선택 칸에 똑같이 적용, "all"은 칸마다 네 변
  // 전부(변 버튼 상태와 무관), "outer"/"inner"는 드래그로 고른 범위 안에서 칸의 위치
  // (첫 칸/마지막 칸/중간)를 따져 계산한다.
  let cellBorderPreset = "custom";           // "custom" | "all" | "outer" | "inner"
  // 자유 텍스트 주석(예: '대여음') — 첫 페이지 위에 세로로 표시, 마우스로 위치·크기 조절
  let customTexts = [];                     // { id, text, xf, yf, size } — xf/yf는 페이지 폭/높이 대비 비율(0~1)
  let cellStyles = {};                      // [gi][ci] = { fill: "#rrggbb" } — 정간 배경색(나중에 border 등 확장 가능)
  let nextTextId = 1;
  let textSel = null;                       // 선택된 텍스트 id (크기·삭제 패널용)
  // 곡 전체 텍스트(원본). 페이지가 여러 장이면 텍스트 에디터에는 현재 페이지 조각만 보여준다.
  let melodyFull = "", lyricsFull = "";
  let edPage = 0;                           // 텍스트 에디터가 보고 있는 페이지 번호
  let pageGakRanges = [];                   // 렌더 시 채움: 페이지별 각 범위 [{start, end}]
  let edRange = null, edLyRange = null;     // 에디터에 로드된 전체 텍스트의 줄 범위 {start, count}

  function stackFor(beats) {
    if (beats > 12) return 1;
    if (beats >= 6) return 2;
    return 3;
  }

  function parseDaegang(str, beats) {
    if (!str.trim()) return { groups: null, ok: true };
    const parts = str.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.some(n => !Number.isFinite(n) || n <= 0)) return { groups: null, ok: false };
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== beats) return { groups: null, ok: false };
    return { groups: parts, ok: true };
  }

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function rect(x, y, w, h, sw, extra) {
    return el("rect", Object.assign({ x, y, width: w, height: h, fill: "none",
      stroke: "#000", "stroke-width": sw }, extra || {}));
  }
  function line(x1, y1, x2, y2, sw) {
    return el("line", { x1, y1, x2, y2, stroke: "#000", "stroke-width": sw, "stroke-linecap": "square" });
  }
  function verticalText(cx, startY, str, font, weight, color, family, spacing) {
    const g = el("g", {});
    const lineH = font * 1.12 + (spacing || 0);
    let y = startY;
    for (const ch of Array.from(str)) {
      if (ch === " ") { y += lineH * 0.55; continue; }
      const t = el("text", { x: cx, y: y, "text-anchor": "middle",
        "font-size": font, "font-family": family || CJK, "font-weight": weight, fill: color });
      t.textContent = ch;
      g.appendChild(t);
      y += lineH;
    }
    return { g, endY: y };
  }

  // 가로쓰기 자유 텍스트 — verticalText와 같은 꼴로 {g} 반환 (cx가 가로 중심)
  function horizontalText(cx, y, str, font, weight, color, family, spacing) {
    const g = el("g", {});
    const t = el("text", { x: cx, y: y, "text-anchor": "middle",
      "font-size": font, "font-family": family || CJK, "font-weight": weight, fill: color });
    if (spacing) t.setAttribute("letter-spacing", spacing);
    t.textContent = str;
    g.appendChild(t);
    return { g, endY: y };
  }

  // ---------- 멜로디(내용) 레이어 ----------
  // 인코딩 문자열을 각[][] (각마다 {text,start,end} 칸 배열)로 파싱. start/end=원본 문자 위치.
  function parseMelodyOffsets(text) {
    const gaks = [];
    let cur = [], cellText = "", cellBeg = 0, i = 0;
    const pushCell = (endIdx) => { cur.push({ text: cellText.trim(), start: cellBeg, end: endIdx }); cellText = ""; };
    while (i < text.length) {
      // 각 구분: 줄바꿈(기본) 또는 || (기존 호환). "||\n"은 한 번만 처리.
      if (text[i] === "|" && text[i + 1] === "|") {
        pushCell(i); gaks.push(cur); cur = []; i += 2;
        if (text[i] === "\n") i += 1;
        cellBeg = i;
      } else if (text[i] === "\n") {
        pushCell(i); gaks.push(cur); cur = []; i += 1; cellBeg = i;
      } else if (text[i] === "|") { pushCell(i); i += 1; cellBeg = i; }
      else { cellText += text[i]; i += 1; }
    }
    pushCell(i); gaks.push(cur);
    return gaks;
  }

  // 현재 폼의 구조(정간수, 총 각 수 등). reconcile/render 매핑 공용.
  function formStructure() {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const gakPerRow = Math.max(1, parseInt($("gakPerRow").value) || 1);
    const autoStack = stackFor(beats);
    const stack = $("stackAuto").checked ? autoStack
      : Math.max(1, Math.min(12, parseInt($("stackCount").value) || autoStack));
    let titleGak = 0;
    // 가로(맨 위) 제목은 오른쪽 제목 칸을 쓰지 않으므로 각 자리를 차지하지 않는다
    if ($("title").value.trim() && $("titleLayout").value !== "top") {
      titleGak = gakPerRow >= 6 ? 2 : 1;
      if (gakPerRow - titleGak < 1) titleGak = Math.max(0, gakPerRow - 1);
    }
    // 제목 칸은 첫 페이지 전체 높이를 차지하므로 모든 밴드가 제목 자리만큼 좁아지고,
    // 장단을 켜면 맨 처음 밴드에서 한 각 자리를 더 차지한다
    const jdSlot = $("wantJangdan").checked ? 1 : 0;
    const capacity = Math.max(1, (gakPerRow - titleGak) * stack - jdSlot);
    return { beats, gakPerRow, stack, titleGak, capacity };
  }

  // ---------- 텍스트 에디터 페이지 조각(슬라이스) ----------
  // 곡 전체(melodyFull/lyricsFull)가 원본이고, 에디터에는 현재 페이지의 줄들만 보여준다.
  // 에디터에서 타이핑하면 그 조각을 원본의 해당 줄 범위에 되써넣는다(줄 추가/삭제도 그대로 반영).
  function syncFullFromEditor() {
    if (!edRange) { melodyFull = $("melody").value; return; }
    const lines = melodyFull.split("\n");
    const vis = $("melody").value.split("\n");
    lines.splice(edRange.start, edRange.count, ...vis);
    melodyFull = lines.join("\n");
    edRange.count = vis.length;
  }
  function syncLyricsFromEditor() {
    if (!edLyRange) { lyricsFull = $("lyrics").value; return; }
    const lines = lyricsFull.split("\n");
    const vis = $("lyrics").value.split("\n");
    lines.splice(edLyRange.start, edLyRange.count, ...vis);
    lyricsFull = lines.join("\n");
    edLyRange.count = vis.length;
  }
  function sliceLines(fullText, r) {
    if (!r) return fullText;
    return fullText.split("\n").slice(r.start, r.end).join("\n");
  }
  // ---------- 선율 에디터 그리드 정렬 ----------
  // 옛 형식(||) 각 구분을 줄바꿈으로 통일 — 에디터·페이지 슬라이스는 '한 줄 = 한 각'을 전제하고,
  // 그리드 정렬이 빈 정간에도 탭을 넣으면 ||가 남아 있을 수 없으므로 불러올 때 한 번 바꿔둔다.
  function normalizeGakSeparators(text) {
    return String(text || "").replace(/\|\|\n?/g, "\n");
  }
  // 각 정간 내용 뒤에 탭을 붙여 |가 탭 멈춤(고정 폭 열)에 정렬되게 한다 — 글자 폭이 달라도
  // 탭 멈춤은 픽셀 고정이라 줄끼리 |가 나란해진다. 탭은 파서(trim)가 무시하므로 데이터에 남아도 무해.
  function formatMelodyGrid(text) {
    return text.split("\n").map(function (line) {
      const cells = line.split("|");
      return cells.map(function (c, i) {
        // 탭·앞쪽 공백은 자리만 차지하므로 정리(칸 앞 공백은 파서도 무시).
        // 뒤쪽 공백은 분박(스페이스) 입력 중일 수 있어 그대로 둔다.
        c = c.replace(/\t/g, "").replace(/^ +/, "");
        // 빈 정간도 탭을 넣어 기본 폭 열을 유지 — |끼리 붙어 ||(옛 각 구분)로
        // 읽히는 일도 함께 막는다. 옛 || 구분은 불러올 때 줄바꿈으로 통일된다.
        return i < cells.length - 1 ? c + "\t" : c;
      }).join("|");
    }).join("\n");
  }
  // 탭을 뺀 글자 수로 커서 자리를 기억했다가, 재정렬된 텍스트에서 같은 자리로 되돌린다
  function melodyCursorLogical(text, pos) {
    let n = 0;
    for (let i = 0; i < pos && i < text.length; i++) if (text[i] !== "\t") n++;
    return n;
  }
  function melodyLogicalToPos(text, n) {
    let i = 0;
    while (i < text.length && n > 0) { if (text[i] !== "\t") n--; i++; }
    return i;
  }
  let melodyComposing = false;   // 한글 IME 조합 중엔 값을 바꾸면 조합이 깨지므로 정렬을 미룬다
  function reformatMelodyEditor() {
    if (melodyComposing) return;
    const ta = $("melody");
    const before = ta.value;
    const after = formatMelodyGrid(before);
    if (after === before) return;
    const logical = melodyCursorLogical(before, ta.selectionStart);
    ta.value = after;
    const p = melodyLogicalToPos(after, logical);
    ta.setSelectionRange(p, p);
  }

  // 원본 → 에디터 조각 다시 로드 (구조 변경·페이지 전환·불러오기 때만. 타이핑 중엔 호출하지 않음)
  function refreshEditorSlices() {
    if (edPage >= pageGakRanges.length) edPage = Math.max(0, pageGakRanges.length - 1);
    const r = pageGakRanges[edPage] || null;
    const mv = formatMelodyGrid(sliceLines(melodyFull, r));
    if ($("melody").value !== mv) $("melody").value = mv;
    edRange = r ? { start: r.start, count: mv.split("\n").length } : null;
    const lv = sliceLines(lyricsFull, r);
    if ($("lyrics").value !== lv) $("lyrics").value = lv;
    edLyRange = r ? { start: r.start, count: lv.split("\n").length } : null;
    updateEdPagers();
    updateMelodyHl();
  }

  // ---------- 선율 에디터 문법 검사(빨간 표시) ----------
  // tokenizeNotes와 같은 규칙으로 걷되, 해석되지 않아 악보에 못 옮기는 글자 위치를 모은다.
  function melodyBadFlags(text) {
    const a = Array.from(text);
    const bad = new Array(a.length).fill(false);
    let i = 0;
    while (i < a.length) {
      const ch = a[i];
      if (ch === "|" || ch === "-" || ch === "<" || /\s/.test(ch)) { i += 1; continue; }
      const ornClose = ORN_BRACKET_CLOSE[ch];
      if (ornClose) {   // {..}·[..]·(..) 시김새 이름 — 이름을 모르면 괄호째 표시, 짝이 없으면 여는 괄호만 표시
        let j = i + 1, name = "";
        while (j < a.length && a[j] !== ornClose) { name += a[j]; j += 1; }
        if (j >= a.length) { bad[i] = true; i += 1; continue; }
        const at = name.indexOf("@");
        let sym = at >= 0 ? name.slice(0, at) : name;
        sym = ORN_KO[sym] || sym;
        if (!(sym in ORN_CAT) && !symURL(sym)) for (let k = i; k <= j; k++) bad[k] = true;
        i = j + 1; continue;
      }
      const t2 = ch + (a[i + 1] || "");
      if (SYM_MARK[t2]) { i += 2; continue; }
      if (SYM_MARK[ch]) { i += 1; continue; }
      const spn = matchSpecialNote(a, i);            // 특수 율명(하하배임 등) — tokenizeNotes와 같은 순서
      if (spn) { i += spn.length; continue; }
      if (PRE2.indexOf(t2) >= 0 && BASESET.has(a[i + 2])) { i += 3; continue; }
      if (PRE2U.indexOf(t2) >= 0 && BASESET.has(a[i + 2])) { i += 3; continue; }
      if (PRE1U.indexOf(ch) >= 0 && BASESET.has(a[i + 1])) { i += 2; continue; }
      if (PRE1D.indexOf(ch) >= 0 && BASESET.has(a[i + 1])) { i += 2; continue; }
      if (BASESET.has(ch)) { i += 1; continue; }
      bad[i] = true; i += 1;
    }
    return { a: a, bad: bad };
  }

  // 에디터 뒤 배경 레이어에 같은 글을 깔고, 잘못된 글자에만 빨간 배경을 입힌다
  function updateMelodyHl() {
    const back = $("melodyHlBack"), ta = $("melody");
    if (!back || !ta) return;
    const fb = melodyBadFlags(ta.value);
    let html = "", run = "", runBad = false;
    const flush = function () {
      if (!run) return;
      const esc = run.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html += runBad ? "<mark>" + esc + "</mark>" : esc;
      run = "";
    };
    for (let i = 0; i < fb.a.length; i++) {
      if (fb.bad[i] !== runBad) { flush(); runBad = fb.bad[i]; }
      run += fb.a[i];
    }
    flush();
    back.innerHTML = html + "\n";
    // 세로 스크롤바가 생겨도 줄바꿈 폭이 텍스트영역과 같도록 오른쪽을 스크롤바만큼 비운다
    back.style.right = Math.max(0, ta.offsetWidth - ta.clientWidth - 2) + "px";
    back.scrollTop = ta.scrollTop;
  }
  // ---------- 각(마디) 중간 추가·삭제 ----------
  // 핵심: 가사도 각과 줄 단위로 1:1 대응이므로, 선율에 줄을 넣고 뺄 때 가사도 같은 자리에서
  // 같이 밀고 당겨야 어긋나지 않는다.
  function lyricsHasContent() {
    return lyricsFull.split("\n").some(function (l) { return l.replace(/[|\s]/g, ""); });
  }
  // 각 추가·삭제의 기준 각 — 악보에서 정간을 클릭했거나 에디터 커서가 있는 각(하이라이트와 동일)
  function structureTargetGak() {
    if (activeGak >= 0) return activeGak;
    const ta = $("melody");
    return ta.value.slice(0, ta.selectionStart).split("\n").length - 1
      + (edRange ? edRange.start : 0);
  }
  // 구조 변경 후: 다시 그리고, 대상 각이 있는 페이지로 에디터를 맞춘 뒤 그 줄 시작에 커서
  function afterGakStructureChange(targetGak) {
    render();
    refreshEditorSlices();   // setEdPage보다 먼저 — 안 하면 옛 에디터 내용이 원본을 덮어씀
    let p = edPage;
    for (let i = 0; i < pageGakRanges.length; i++) {
      if (targetGak >= pageGakRanges[i].start && targetGak < pageGakRanges[i].end) { p = i; break; }
    }
    if (p !== edPage) setEdPage(p, { noScroll: false });
    const ta = $("melody");
    const lines = ta.value.split("\n");
    const local = Math.max(0, Math.min(lines.length - 1, targetGak - (edRange ? edRange.start : 0)));
    let pos = 0;
    for (let i = 0; i < local; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    syncActiveFromCursor();
  }
  // 커서가 있는 각 아래에 삽입. split=true면 커서 자리에서 그 각을 둘로 나눔(Enter),
  // false면 빈 각을 개수(gakInsertN)만큼 끼워 넣음(Cmd/Ctrl+Enter·버튼).
  // 가사는 두 경우 모두 같은 자리에 빈 줄이 들어가 어긋나지 않는다.
  function insertGakBelow(split) {
    syncFullFromEditor(); syncLyricsFromEditor();
    const ta = $("melody");
    const val = ta.value, pos = ta.selectionStart;
    // 각 나누기(Enter)는 에디터 커서 줄, 빈 각 삽입은 하이라이트된 각(악보 클릭 포함) 기준
    const g = split
      ? val.slice(0, pos).split("\n").length - 1 + (edRange ? edRange.start : 0)
      : structureTargetGak();
    const mLines = melodyFull.split("\n");
    if (g >= mLines.length) return;
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    // 빈 각은 " | " 꼴로 — |끼리 붙으면(||) 옛 각 구분으로 읽혀 각이 쪼개진다
    const emptyGak = new Array(beats).fill("").join(" | ");
    const n = split ? 1 : Math.max(1, Math.min(50, parseInt($("gakInsertN").value) || 1));
    let inserted = [];
    if (split) {
      // 방금 sync해서 에디터 줄과 원본 줄이 같으므로 줄-내 오프셋을 그대로 쓸 수 있다
      const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
      const off = pos - lineStart;
      mLines.splice(g, 1, mLines[g].slice(0, off), mLines[g].slice(off));
    } else {
      inserted = new Array(n).fill(emptyGak);
      mLines.splice.apply(mLines, [g + 1, 0].concat(inserted));
    }
    melodyFull = mLines.join("\n");
    if (lyricsHasContent()) {   // 나뉜 각의 가사는 앞쪽에 그대로 남기고 새 각은 빈 줄
      const lLines = lyricsFull.split("\n");
      while (lLines.length <= g) lLines.push("");
      lLines.splice.apply(lLines, [g + 1, 0].concat(new Array(split ? 1 : n).fill(emptyGak)));
      lyricsFull = lLines.join("\n");
    }
    afterGakStructureChange(g + 1);
  }
  // 하이라이트된 각을 삭제 (마지막 남은 각이면 내용만 비움). 가사도 같은 줄을 지운다.
  function deleteGakAtCursor() {
    syncFullFromEditor(); syncLyricsFromEditor();
    const g = structureTargetGak();
    const mLines = melodyFull.split("\n");
    if (g >= mLines.length) return;
    if (mLines.length <= 1) mLines[0] = "";
    else mLines.splice(g, 1);
    melodyFull = mLines.join("\n");
    if (lyricsHasContent()) {
      const lLines = lyricsFull.split("\n");
      if (g < lLines.length) {
        if (lLines.length <= 1) lLines[0] = "";
        else lLines.splice(g, 1);
        lyricsFull = lLines.join("\n");
      }
    }
    afterGakStructureChange(Math.min(g, melodyFull.split("\n").length - 1));
  }

  function updateEdPagers() {
    const n = Math.max(1, pageGakRanges.length);
    document.querySelectorAll(".ed-pager").forEach(function (p) {
      p.style.display = n > 1 ? "" : "none";
      p.querySelector(".ed-plabel").textContent = (edPage + 1) + " / " + n + " 페이지";
      p.querySelector(".ed-prev").disabled = edPage <= 0;
      p.querySelector(".ed-next").disabled = edPage >= n - 1;
    });
  }
  // 편집 페이지 전환: 지금 화면의 편집분을 저장하고 조각을 갈아끼운 뒤, 악보도 그 페이지로 스크롤
  function setEdPage(p, opts) {
    syncFullFromEditor();
    syncLyricsFromEditor();
    edPage = Math.max(0, Math.min(Math.max(0, pageGakRanges.length - 1), p));
    refreshEditorSlices();
    if (!opts || !opts.noScroll) {
      // 악보 미리보기를 편집 중인 페이지로 스크롤 (줌 배율과 무관하게 실제 화면 좌표로 계산)
      const pageEl = $("sheet").children[edPage];
      const area = $("sheetArea");
      if (pageEl && area) {
        const ar = area.getBoundingClientRect();
        const pr = pageEl.getBoundingClientRect();
        area.scrollTop += pr.top - ar.top - 12;
      }
    }
  }

  // 폼 변경 시: 멜로디 텍스트를 새 구조에 맞춰 재구성(내용 보존, 칸 수만 맞춤).
  function reconcileMelody() {
    const { beats, capacity } = formStructure();
    const parsed = parseMelodyOffsets(melodyFull);
    // 미입력(기본): 페이지 꽉 채움 / 직접 입력: 그 값(여러 페이지 가능)
    const target = !gakUserSet ? capacity
                               : Math.max(1, parseInt($("gakCount").value) || 1);
    const lines = [];
    for (let g = 0; g < target; g++) {
      const cells = [];
      for (let c = 0; c < beats; c++) cells.push((parsed[g] && parsed[g][c]) ? parsed[g][c].text : "");
      lines.push(cells.join(" | "));
    }
    melodyFull = lines.join("\n");
  }

  // 장단은 맨 처음 각 옆에만 붙으므로, 정간 수(beats)만큼만 한 줄로 맞춤(내용 보존). 미사용 시 건너뜀.
  function reconcileJangdan() {
    if (!$("wantJangdan").checked) return;
    const { beats } = formStructure();
    const jdParsed = parseMelodyOffsets($("jangdan").value);
    const cells = [];
    for (let c = 0; c < beats; c++) cells.push((jdParsed[0] && jdParsed[0][c]) ? jdParsed[0][c].text : "");
    const next = cells.join(" | ");
    if (next !== $("jangdan").value) $("jangdan").value = next;
  }

  // 가사는 매 각(정간)마다 붙으므로, 선율과 같은 구조(각 수·정간 수)로 맞춤(내용 보존).
  function reconcileLyrics() {
    if (!$("wantLyrics").checked) return;
    const { beats, capacity } = formStructure();
    const target = !gakUserSet ? capacity
                               : Math.max(1, parseInt($("gakCount").value) || 1);
    const parsed = parseMelodyOffsets(lyricsFull);
    const lines = [];
    for (let g = 0; g < target; g++) {
      const cells = [];
      for (let c = 0; c < beats; c++) cells.push((parsed[g] && parsed[g][c]) ? parsed[g][c].text : "");
      lines.push(cells.join(" | "));
    }
    lyricsFull = lines.join("\n");
  }

  // 정간 클릭 → 텍스트박스의 해당 칸으로 커서 이동 (다른 페이지 정간이면 에디터 페이지도 전환)
  function jumpToCell(gi, ci) {
    const pi = pageGakRanges.findIndex(function (r) { return gi >= r.start && gi < r.end; });
    if (pi >= 0 && pi !== edPage) setEdPage(pi, { noScroll: true });
    const ta = $("melody");
    const parsed = parseMelodyOffsets(ta.value);
    const local = gi - (edRange ? edRange.start : 0);
    const cell = parsed[local] && parsed[local][ci];
    ta.focus();
    if (cell) ta.setSelectionRange(cell.start, cell.end);
    activeArea = "mel";
    activeGak = gi; activeCellIdx = ci;
    activeRow = -1; activeRows = 1;   // 정간 클릭 = 정간 전체
    updateHighlight();
  }

  // 현재 편집 중인 칸을 밝은 색으로 표시 — 선율 정간 / 장단 칸 / 가사 줄 공용
  function updateHighlight() {
    for (let i = 0; i < pageHi.length; i++) pageHi[i].style.display = "none";
    if (activeArea === "jd") {   // 장단 칸 (악곡 맨 처음 각 옆 한 줄)
      const jg = jdGeom[activeCellIdx];
      if (!jg) return;
      const hi = pageHi[jg.page];
      if (!hi) return;
      hi.setAttribute("x", jg.x); hi.setAttribute("y", jg.y);
      hi.setAttribute("width", jg.w); hi.setAttribute("height", jg.h);
      hi.style.display = "";
      return;
    }
    const g = cellGeom[activeGak];
    const cg = g && g[activeCellIdx];
    if (!cg) return;
    const hi = pageHi[cg.page];
    if (!hi) return;
    if (activeArea === "ly") {   // 가사 줄 (해당 정간 오른쪽 좁은 칸)
      if (!hiLyricsOn) return;
      hi.setAttribute("x", cg.x + cg.w + hiLyGap); hi.setAttribute("y", cg.y);
      hi.setAttribute("width", hiLyW); hi.setAttribute("height", cg.h);
      hi.style.display = "";
      return;
    }
    let y = cg.y, h = cg.h;
    if (activeRow >= 0 && activeRows > 1) { h = cg.h / activeRows; y = cg.y + activeRow * h; }
    hi.setAttribute("x", cg.x);
    hi.setAttribute("y", y);
    hi.setAttribute("width", cg.w);
    hi.setAttribute("height", h);
    hi.style.display = "";
  }

  // 텍스트 커서 위치 → 해당 정간을 활성 표시
  function syncActiveFromCursor() {
    const ta = $("melody");
    const pos = ta.selectionStart, end = ta.selectionEnd;
    const parsed = parseMelodyOffsets(ta.value);
    for (let g = 0; g < parsed.length; g++) {
      const cells = parsed[g];
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (pos >= cell.start && pos <= cell.end) {
          activeArea = "mel";
          activeGak = g + (edRange ? edRange.start : 0);   // 에디터 조각 → 전체 각 번호
          activeCellIdx = c;
          const whole = (pos <= cell.start && end >= cell.end && end > pos);   // 정간 전체 선택
          if (whole) { activeRow = -1; activeRows = 1; }
          else {
            const raw = ta.value.slice(cell.start, cell.end);
            const info = subCellInfo(raw, pos - cell.start);
            if (info.nRows > 1) { activeRow = info.row; activeRows = info.nRows; }
            else { activeRow = -1; activeRows = 1; }
          }
          updateHighlight(); return;
        }
      }
    }
    activeGak = -1; activeCellIdx = -1; activeRow = -1; updateHighlight();
  }

  // 장단 에디터 커서 → 악보의 장단 칸 하이라이트 (장단은 맨 처음 각 옆 한 줄뿐)
  function syncJangdanFromCursor() {
    const ta = $("jangdan");
    const pos = ta.selectionStart;
    const cells = parseMelodyOffsets(ta.value)[0] || [];
    for (let c = 0; c < cells.length; c++) {
      if (pos >= cells[c].start && pos <= cells[c].end) {
        activeArea = "jd"; activeGak = 0; activeCellIdx = c;
        activeRow = -1; activeRows = 1;
        updateHighlight(); return;
      }
    }
    activeGak = -1; activeCellIdx = -1; activeRow = -1; updateHighlight();
  }

  // 가사 에디터 커서 → 해당 정간 오른쪽 가사 줄 하이라이트
  function syncLyricsFromCursor() {
    const ta = $("lyrics");
    const pos = ta.selectionStart;
    const parsed = parseMelodyOffsets(ta.value);
    for (let g = 0; g < parsed.length; g++) {
      const cells = parsed[g];
      for (let c = 0; c < cells.length; c++) {
        if (pos >= cells[c].start && pos <= cells[c].end) {
          activeArea = "ly";
          activeGak = g + (edLyRange ? edLyRange.start : 0);   // 에디터 조각 → 전체 각 번호
          activeCellIdx = c;
          activeRow = -1; activeRows = 1;
          updateHighlight(); return;
        }
      }
    }
    activeGak = -1; activeCellIdx = -1; activeRow = -1; updateHighlight();
  }

  // 장단·가사 에디터용 그리드 보호 — 선율 에디터와 같은 알고리즘으로,
  // Backspace/Delete가 정간 구분선(|)과 정렬 탭을 지우지 못하게 건너뛰고,
  // →는 다음 정간(다음 | 또는 줄바꿈 뒤)으로 점프시킨다.
  function attachGakGridGuard(id, syncFn) {
    $(id).addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = this.value;
      if (e.key === "ArrowRight") {
        let p = -1;
        for (let i = this.selectionEnd; i < v.length; i++) {
          if (v[i] === "|" || v[i] === "\n") { p = i + 1; break; }
        }
        if (p < 0) return;
        e.preventDefault();
        this.setSelectionRange(p, p);
        syncFn();
        return;
      }
      if (e.key === "Backspace" && this.selectionStart === this.selectionEnd) {
        let p = this.selectionStart;
        if (p > 0 && (v[p - 1] === "|" || v[p - 1] === "\t")) {
          e.preventDefault();
          if (v[p - 1] === "|") p--;
          while (p > 0 && v[p - 1] === "\t") p--;
          this.setSelectionRange(p, p);
          syncFn();
          return;
        }
      }
      if (e.key === "Delete" && this.selectionStart === this.selectionEnd) {
        let p = this.selectionEnd;
        if (p < v.length && (v[p] === "|" || v[p] === "\t")) {
          e.preventDefault();
          while (p < v.length && v[p] === "\t") p++;
          if (v[p] === "|") p++;
          this.setSelectionRange(p, p);
          syncFn();
          return;
        }
      }
    });
  }

  // 정간 내부 문자열에서 커서(rel)가 몇 번째 행(공백 구분)인지
  function subCellInfo(raw, rel) {
    const starts = []; const re = /\S+/g; let m;
    while ((m = re.exec(raw))) starts.push(m.index);
    const nRows = starts.length;
    if (nRows === 0) return { nRows: 0, row: -1 };
    let row = 0;
    for (let k = 0; k < starts.length; k++) { if (starts[k] <= rel) row = k; else break; }
    return { nRows: nRows, row: row };
  }

  // ---------- 구간 지우기(직접 입력) ----------
  // 정간을 순서(각 → 정간) 기준 한 줄로 폈을 때의 위치. 드래그 시작~끝 사이(양끝 포함)를 구간으로 본다.
  function melCellSeq(gi, ci) {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    return gi * beats + ci;
  }
  // 드래그로 고른 구간(startGi,startCi)~(endGi,endCi) 안의 음·시김새를 모두 지운다(빈 정간으로).
  // 매 렌더마다 전역 스냅샷(saveState)이 남으므로 전역 되돌리기(Cmd/Ctrl+Z)로 복구할 수 있다.
  function clearMelodyRange(startGi, startCi, endGi, endCi) {
    const lo = Math.min(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    const hi = Math.max(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    const rows = parseMelodyOffsets(melodyFull).map(function (g) { return g.map(function (c) { return c.text; }); });
    let changed = false;
    for (let gi = 0; gi < rows.length; gi++) {
      for (let ci = 0; ci < rows[gi].length; ci++) {
        if (melCellSeq(gi, ci) >= lo && melCellSeq(gi, ci) <= hi && rows[gi][ci] !== "") {
          rows[gi][ci] = ""; changed = true;
        }
      }
    }
    if (changed) {
      melodyFull = rows.map(function (g) { return g.join(" | "); }).join("\n");
      refreshEditorSlices();
    }
    render();
  }

  // ---------- 셀 서식(배경색·테두리, 직접 입력) ----------
  // 정간 하나의 서식 항목(fill/border)이 둘 다 없으면 cellStyles에서 아예 지워서
  // 빈 {} 찌꺼기가 저장/되돌리기 스냅샷에 남지 않게 한다.
  function pruneCellStyleEntry(gi, ci) {
    const row = cellStyles[gi];
    if (!row || !row[ci]) return;
    const entry = row[ci];
    if (!entry.fill && !entry.border) {
      delete row[ci];
      if (!Object.keys(row).length) delete cellStyles[gi];
    }
  }
  // 드래그로 고른 구간(startGi,startCi)~(endGi,endCi)의 정간마다 배경색을 적용(color가 null이면 지움).
  // 멜로디 전용 되돌리기 스택은 건드리지 않는다 — saveState()가 렌더마다 전체 상태를 스냅샷하므로
  // 앱 전체 되돌리기(Cmd/Ctrl+Z)가 색 변경도 그대로 커버한다.
  function applyCellFillRange(startGi, startCi, endGi, endCi, color) {
    const lo = Math.min(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    const hi = Math.max(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    Object.keys(cellGeom).forEach(function (giKey) {
      const gi = parseInt(giKey, 10);
      Object.keys(cellGeom[gi]).forEach(function (ciKey) {
        const ci = parseInt(ciKey, 10);
        if (melCellSeq(gi, ci) < lo || melCellSeq(gi, ci) > hi) return;
        if (color) {
          cellStyles[gi] = cellStyles[gi] || {};
          cellStyles[gi][ci] = Object.assign({}, cellStyles[gi][ci], { fill: color });
        } else if (cellStyles[gi] && cellStyles[gi][ci]) {
          delete cellStyles[gi][ci].fill;
          pruneCellStyleEntry(gi, ci);
        }
      });
    });
    render();
  }
  // 드래그로 고른 구간에서, 정간 하나의 순서 위치(seq)에 따라 어느 변을 적용할지 계산.
  // "outer"/"inner"는 정간보를 '열이 하나뿐인 표'로 보고, 고른 구간 전체를 하나의 사각형처럼
  // 다룬다 — outer는 첫 칸 위쪽·마지막 칸 아래쪽·모든 칸 좌우, inner는 칸과 칸 사이 경계선만
  // (칸을 하나만 고르면 안쪽은 해당 사항 없음).
  function sidesForCellInRange(seq, lo, hi) {
    if (cellBorderPreset === "all") return ["top", "right", "bottom", "left"];
    if (cellBorderPreset === "outer") {
      const s = ["left", "right"];
      if (seq === lo) s.push("top");
      if (seq === hi) s.push("bottom");
      return s;
    }
    if (cellBorderPreset === "inner") {
      return seq === hi ? [] : ["bottom"];
    }
    return ["top", "right", "bottom", "left"].filter(function (s) { return cellBorderSides[s]; });
  }
  // 드래그로 고른 구간의 정간마다 테두리를 적용(또는 지움).
  // 칠하기: spec = { width, style }. 지우기: spec = null (계산된 변만 지움).
  function applyCellBorderRange(startGi, startCi, endGi, endCi, spec) {
    const lo = Math.min(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    const hi = Math.max(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    Object.keys(cellGeom).forEach(function (giKey) {
      const gi = parseInt(giKey, 10);
      Object.keys(cellGeom[gi]).forEach(function (ciKey) {
        const ci = parseInt(ciKey, 10);
        const seq = melCellSeq(gi, ci);
        if (seq < lo || seq > hi) return;
        const sides = sidesForCellInRange(seq, lo, hi);
        if (!sides.length) return;
        cellStyles[gi] = cellStyles[gi] || {};
        const entry = cellStyles[gi][ci] || {};
        const border = Object.assign({}, entry.border);
        sides.forEach(function (side) {
          if (spec) border[side] = { width: spec.width, style: spec.style };
          else delete border[side];
        });
        entry.border = Object.keys(border).length ? border : undefined;
        if (!entry.border) delete entry.border;
        cellStyles[gi][ci] = entry;
        pruneCellStyleEntry(gi, ci);
      });
    });
    render();
  }
  // 이중선의 안쪽 줄이 격자선에서 칸 안쪽으로 떨어지는 거리(선 중심 기준)
  // — 굵기에 비례하되 얇아도 흰 틈이 또렷이 보이게 최소값을 둔다
  function borderDoubleInset(w) { return Math.max(w * 1.6, 0.8); }
  // 모서리에서 이웃 변의 안쪽 줄과 만날 때 끝을 다듬는 양 — 이웃 줄의 중심이 아니라
  // 바깥 가장자리까지 닿게(중심까지만 자르면 모서리에 계단이 생긴다)
  function borderCornerTrim(spec) {
    const w = CELL_BORDER_WIDTH_PX[spec.width] || CELL_BORDER_WIDTH_PX.medium;
    return borderDoubleInset(w) - w / 2;
  }
  // 흰 마스크의 반경 — 밑에 깔린 격자선을 먼저 덮어 지워야 점선 틈으로 실선이 비치지 않는다.
  // '없음'(줄 숨김)은 선을 새로 그리지 않고 이 마스크만 남기므로, 숨겨야 할 기존 격자선
  // (정간 세로선 T_THICK, 대강선 T_DAEGANG)보다 넉넉하게 잡는다.
  function borderMaskHalf(w, styleKey) {
    if (styleKey === "none") return Math.max(T_THICK, T_DAEGANG) / 2 + 0.15;
    return w / 2;
  }
  // 한 각(세로 열)의 커스텀 테두리를 선분 목록으로 모은다. 좌/우 세로선은 같은 굵기·종류로
  // 이어지는 칸끼리 한 선분으로 합친다 — 칸마다 따로 그리면 굵은 선·점선·이중선이 칸 경계에서
  // 끊겨 보인다. 그리기는 render 쪽에서 두 단계(마스크 전부 → 선 전부)로 나눠서 하는데,
  // 나중 칸의 흰 마스크가 먼저 그린 선의 모서리를 지우는 일이 없게 하기 위해서다.
  function collectCellBorderSegs(segs, gi, x, gridTop, cell, beats) {
    const row = cellStyles[gi];
    if (!row) return;
    ["left", "right"].forEach(function (side) {
      const sx = side === "left" ? x : x + cell;
      let runStart = 0, runKey = null, runSpec = null;
      for (let j = 0; j <= beats; j++) {
        const bs = (j < beats && row[j] && row[j].border) ? row[j].border[side] : null;
        const key = bs ? (bs.width + "|" + bs.style) : null;
        if (key === runKey) continue;
        if (runKey) {
          const seg = { x1: sx, y1: gridTop + runStart * cell, x2: sx, y2: gridTop + j * cell,
                        width: runSpec.width, style: runSpec.style, side: side };
          // 이중선의 안쪽 줄끼리는 모서리에서 만나 사각형을 이룬다 — 이웃 변(위/아래)도
          // 이중선이면 끝을 그 안쪽 줄 위치까지 다듬는다(안 그러면 서로를 지나쳐 #꼴로 교차).
          if (runSpec.style === "double") {
            const bs2 = row[runStart] && row[runStart].border;
            if (bs2 && bs2.top && bs2.top.style === "double") seg.y1 += borderCornerTrim(bs2.top);
            const be = row[j - 1] && row[j - 1].border;
            if (be && be.bottom && be.bottom.style === "double") seg.y2 -= borderCornerTrim(be.bottom);
          }
          segs.push(seg);
        }
        runStart = j; runKey = key; runSpec = bs;
      }
    });
    for (let j = 0; j < beats; j++) {
      const b = row[j] && row[j].border;
      if (!b) continue;
      ["top", "bottom"].forEach(function (side) {
        if (!b[side]) return;
        const y = gridTop + (side === "top" ? j : j + 1) * cell;
        const seg = { x1: x, y1: y, x2: x + cell, y2: y,
                      width: b[side].width, style: b[side].style, side: side };
        if (b[side].style === "double") {   // 좌/우가 이중선이면 모서리 다듬기(위 주석 참고)
          if (b.left && b.left.style === "double") seg.x1 += borderCornerTrim(b.left);
          if (b.right && b.right.style === "double") seg.x2 -= borderCornerTrim(b.right);
        }
        segs.push(seg);
      });
    }
  }
  function drawBorderMask(svg, s) {
    // 이중선은 정간 틀(원래 격자선)을 바깥 줄로 그대로 쓰고 안쪽에 한 줄만 더 긋는
    // 방식이라, 밑에 깔린 격자선을 지울 일이 없다 — 마스크 없음.
    if (s.style === "double") return;
    const w = CELL_BORDER_WIDTH_PX[s.width] || CELL_BORDER_WIDTH_PX.medium;
    const maskW = borderMaskHalf(w, s.style) * 2 + 0.4;
    let x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2, cap = "square";
    if (s.style === "none") {
      // '없음' 마스크는 격자선보다 넓어서, square cap으로 끝을 지나치면 교차하는
      // 세로선(정간 세로선)이나 경계 너머로 이어지는 선까지 지운다 — 대강선·통줄은
      // structuralSegs로 되살리지만 세로선은 아니라서 그 자리에 틈이 남는다.
      // butt cap으로 끝을 정확히 맞추고, 가로 마스크는 세로선 반굵기만큼 안으로
      // 들인다(가려진 가로선의 남는 토막은 세로선 밑에 정확히 숨는다).
      cap = "butt";
      if (y1 === y2) { x1 += T_THICK / 2; x2 -= T_THICK / 2; }
    }
    svg.appendChild(el("line", { x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: "#fff", "stroke-width": maskW, "stroke-linecap": cap }));
  }
  function drawBorderStroke(svg, s) {
    if (s.style === "none") return;   // '없음'은 마스크만 — 그 자리 격자선을 숨긴다
    const w = CELL_BORDER_WIDTH_PX[s.width] || CELL_BORDER_WIDTH_PX.medium;
    if (s.style === "double") {
      // 이중선 — 정간 틀(원래 격자선)을 바깥 줄로 그대로 두고, 칸 안쪽으로 나란히
      // 한 줄을 더 긋는다(전통 악보의 겹줄 표기). butt cap — square면 안쪽 줄의
      // 끝이 칸 밖(각 사이 여백)으로 삐져나온다.
      const off = borderDoubleInset(w);
      const dx = s.side === "left" ? off : s.side === "right" ? -off : 0;
      const dy = s.side === "top" ? off : s.side === "bottom" ? -off : 0;
      svg.appendChild(el("line", { x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy,
        stroke: "#000", "stroke-width": w, "stroke-linecap": "butt" }));
    } else {
      const ln = line(s.x1, s.y1, s.x2, s.y2, w);
      if (s.style === "dashed") ln.setAttribute("stroke-dasharray", (w * 2.5) + "," + (w * 1.8));
      svg.appendChild(ln);
    }
  }

  // 장단/가사 초기화 — 전용 되돌리기 버튼은 없앴다. render()마다 전역 스냅샷이 남으므로
  // 복구는 전역 되돌리기(Cmd/Ctrl+Z) 하나로 충분하다.
  function resetJangdan() {
    $("jangdan").value = "";
    reconcileJangdan();
    render();
  }
  function resetLyrics() {
    lyricsFull = "";
    reconcileLyrics();
    render();
    refreshEditorSlices();
  }

  // ---------- 상단 바: 새 문서 / 전체 초기화 ----------
  // 종이 방향·정간 크기·간격 등 '레이아웃'은 그대로 두고, 선율·장단·가사·텍스트·셀 서식처럼
  // 곡마다 달라지는 '내용'만 지운다. 앱 전체 되돌리기(Cmd/Ctrl+Z)가 render()마다 스냅샷을
  // 찍어두므로 이 초기화도 그걸로 되돌릴 수 있다.
  function resetAllContent() {
    if (!confirm("선율·장단·가사·텍스트·셀 서식 등 내용을 모두 지웁니다(레이아웃은 그대로 둠). 계속할까요?")) return;
    melodyFull = ""; $("jangdan").value = ""; lyricsFull = "";
    customTexts = []; nextTextId = 1; textSel = null;
    cellStyles = {};
    reconcileMelody(); reconcileJangdan(); reconcileLyrics();
    refreshEditorSlices();
    syncActiveFromCursor();
    render();
  }
  // ---------- 새 문서 마법사 ----------
  // '새 문서' 버튼과, 저장된 작업이 전혀 없는 첫 실행 둘 다에서 쓴다. 정간보의 가장 기본적인
  // 뼈대(정간 수·대강·총 각 수·제목·부제·장단 사용 여부)를 먼저 정하고 시작하게 한다.
  const NEWDOC_PENDING_KEY = "jgb_newdoc_pending_v1";
  function openNewDocWizard(onCreate) {
    const modal = $("newDocModal");
    $("ndBeats").value = "12";
    $("ndDaegang").value = "";
    $("ndGakCount").value = "";   // 비워두면 기본 20각 (placeholder로 안내)
    $("ndTitle").value = "";      // 비워두면 제목 없음
    $("ndTitleLayout").value = "side";
    $("ndSubtitle").value = "";
    $("ndWantJangdan").checked = false;
    modal.style.display = "flex";
    $("ndCreate").onclick = function () {
      const answers = {
        beats: Math.max(1, parseInt($("ndBeats").value) || 12),
        daegang: $("ndDaegang").value.trim(),
        gakCount: Math.max(1, parseInt($("ndGakCount").value) || 20),
        title: $("ndTitle").value.trim(),
        titleLayout: $("ndTitleLayout").value,
        subtitle: $("ndSubtitle").value.trim(),
        wantJangdan: $("ndWantJangdan").checked
      };
      modal.style.display = "none";
      onCreate(answers);
    };
    $("ndCancel").onclick = function () { modal.style.display = "none"; };
  }
  // 마법사에서 고른 값을 실제 필드에 반영 — 첫 실행(리로드 없이 바로) / 새 문서(리로드 뒤) 공용.
  function applyNewDocAnswers(a) {
    if (!a) return;
    $("beats").value = a.beats;
    $("daegang").value = a.daegang;
    $("gakCount").value = a.gakCount;
    // 마법사에서 정한(또는 기본 20) 각 수를 '사용자가 정한 값'으로 취급해야 페이지 채움
    // (capacity)으로 덮이지 않고 그대로 유지된다
    gakUserSet = true;
    $("title").value = a.title;
    $("titleLayout").value = a.titleLayout || "side";
    $("subtitle").value = a.subtitle;
    $("wantJangdan").checked = a.wantJangdan;
    reconcileJangdan();
    render();
    saveState();
  }
  // 새 문서 — 다른 프로그램의 'File > New'처럼, 마법사로 뼈대를 정하고, 임시저장 여부를 물은 뒤
  // 제목·레이아웃까지 포함해 모두 처음 상태(localStorage 없는 첫 실행과 동일)로 되돌린다.
  function startNewDocument() {
    if (!confirm("새 문서를 만들까요? 지금 작업 내용(제목·레이아웃 포함)은 모두 사라집니다.")) return;
    openNewDocWizard(function (answers) {
      if (confirm("계속하기 전에 지금 상태를 임시저장할까요?")) snapSave();
      localStorage.setItem(NEWDOC_PENDING_KEY, JSON.stringify(answers));
      localStorage.removeItem(LS_KEY);
      location.reload();
    });
  }
  $("btnResetContent").addEventListener("click", resetAllContent);
  $("btnNewDoc").addEventListener("click", startNewDocument);
  $("btnUndo").addEventListener("click", function () { undoGlobal(); });
  $("btnRedo").addEventListener("click", function () { redoGlobal(); });

  // ---------- 다크 모드 (수동 토글, localStorage에 유지) ----------
  // 색은 전부 CSS 역할 변수라 body.dark 클래스 하나로 UI 전체가 어두워진다.
  // 악보(종이)는 별도 흰색 SVG라 그대로 흰 종이로 남는다(인쇄·PNG도 안 바뀜).
  const DARK_LS_KEY = "jgb_dark_v1";
  function applyDark(on) {
    document.body.classList.toggle("dark", !!on);
    if ($("darkToggle")) $("darkToggle").setAttribute("data-tip",
      (on ? "밝은 화면으로 전환" : "어두운 화면으로 전환") + "\n· 악보(종이)는 늘 흰색으로 유지됩니다");
  }
  try { applyDark(localStorage.getItem(DARK_LS_KEY) === "1"); } catch (e) {}
  if ($("darkToggle")) $("darkToggle").addEventListener("click", function () {
    const on = !document.body.classList.contains("dark");
    applyDark(on);
    try { localStorage.setItem(DARK_LS_KEY, on ? "1" : "0"); } catch (e) {}
  });

  // ---------- 마우스 모드: 선택(클릭 편집) / 이동(악보 잡고 팬) ----------
  // 이동 모드에선 body.pan-mode가 악보 클릭을 막고(CSS), 여기서 #sheetArea를 끌어 스크롤을
  // 옮긴다. 편집 상호작용과 겹치지 않게 팬은 이동 모드에서만 동작한다.
  function setCursorMode(pan) {
    if (pan && cellEditInput) commitCellEditor(false);   // 편집 카드 열려 있으면 정리
    document.body.classList.toggle("pan-mode", pan);
    if ($("cursorSelect")) $("cursorSelect").classList.toggle("on", !pan);
    if ($("cursorPan")) $("cursorPan").classList.toggle("on", pan);
  }
  if ($("cursorSelect")) $("cursorSelect").addEventListener("click", function () { setCursorMode(false); });
  if ($("cursorPan")) $("cursorPan").addEventListener("click", function () { setCursorMode(true); });
  (function () {
    const area = $("sheetArea");
    if (!area) return;
    let panning = false, sx = 0, sy = 0, sl = 0, st = 0;
    area.addEventListener("pointerdown", function (e) {
      if (!document.body.classList.contains("pan-mode")) return;
      if (e.button !== undefined && e.button !== 0) return;
      // 악보 위에 떠 있는 컨트롤(줌·재생 바, 시김새·텍스트 조정 패널, 입력 카드)은 팬 대상에서 제외
      if (e.target.closest(".float-bar, .orn-panel, .cell-editor, #playPop")) return;
      panning = true;
      document.body.classList.add("panning");
      sx = e.clientX; sy = e.clientY; sl = area.scrollLeft; st = area.scrollTop;
      try { area.setPointerCapture(e.pointerId); } catch (_e) {}
      e.preventDefault();
    });
    area.addEventListener("pointermove", function (e) {
      if (!panning) return;
      area.scrollLeft = sl - (e.clientX - sx);
      area.scrollTop = st - (e.clientY - sy);
    });
    function endPan(e) {
      if (!panning) return;
      panning = false;
      document.body.classList.remove("panning");
      try { area.releasePointerCapture(e.pointerId); } catch (_e) {}
    }
    area.addEventListener("pointerup", endPan);
    area.addEventListener("pointercancel", endPan);
  })();

  // ---------- 정간 위 인라인 입력(선율) ----------
  function currentCellText(gi, ci) {
    const p = parseMelodyOffsets(melodyFull);
    return (p[gi] && p[gi][ci]) ? p[gi][ci].text : "";
  }

  // 한 정간의 내용을 바꾸고 텍스트 에디터·격자에 반영(양방향 동기화)
  function setCellText(gi, ci, val) {
    val = String(val).replace(/[|\n]+/g, " ").replace(/\s+/g, " ").trim();
    const rows = parseMelodyOffsets(melodyFull).map(function (g) {
      return g.map(function (c) { return c.text; });
    });
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    while (rows.length <= gi) rows.push([]);
    while (rows[gi].length <= ci) rows[gi].push("");
    rows[gi][ci] = val;
    while (rows[gi].length < beats) rows[gi].push("");   // 편집한 각은 박수만큼 칸 채움
    melodyFull = rows.map(function (g) { return g.join(" | "); }).join("\n");
    render();
    refreshEditorSlices();
  }

  // 정간 클릭 → 에디터 커서를 그 정간으로 (focusTa=true면 에디터에 포커스까지)
  // 직접 입력 모드에서도 커서를 따라가게 해서, 각 추가·삭제가 늘 '클릭한 각' 기준으로 동작한다.
  function setEditorCursorToCell(gi, ci, focusTa) {
    activeArea = "mel";
    activeGak = gi; activeCellIdx = ci; activeRow = -1; activeRows = 1;
    updateHighlight();
    // 해당 각이 있는 페이지 조각으로 전환
    let p = edPage;
    for (let i = 0; i < pageGakRanges.length; i++) {
      if (gi >= pageGakRanges[i].start && gi < pageGakRanges[i].end) { p = i; break; }
    }
    if (p !== edPage) setEdPage(p, { noScroll: true });
    const ta = $("melody");
    const local = gi - (edRange ? edRange.start : 0);
    const cells = parseMelodyOffsets(ta.value)[local] || [];
    const c = cells[Math.min(ci, Math.max(0, cells.length - 1))];
    if (focusTa) {
      // 아래 독이 선율 탭이 아니면 전환
      const railBtn = document.querySelector('#dockRail .rail-btn[data-panel="melodyArea"]');
      if (railBtn && !railBtn.classList.contains("active")) railBtn.click();
      ta.focus();
    }
    if (c) ta.setSelectionRange(c.start, c.start + c.text.length);   // 내용 선택 → 바로 덮어쓰기
    else ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // ---------- 정간 위 인라인 입력(장단) — 장단은 맨 처음 각 옆 한 줄뿐이라 gi는 늘 0 ----------
  function currentJangdanText(gi, ci) {
    const p = parseMelodyOffsets($("jangdan").value)[0] || [];
    return p[ci] ? p[ci].text : "";
  }
  function setJangdanText(gi, ci, val) {
    val = String(val).replace(/[|\n]+/g, " ").replace(/\s+/g, " ").trim();
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const cells = parseMelodyOffsets($("jangdan").value)[0] || [];
    const arr = cells.map(function (c) { return c.text; });
    while (arr.length <= ci) arr.push("");
    arr[ci] = val;
    while (arr.length < beats) arr.push("");
    $("jangdan").value = arr.join(" | ");
    render();
  }
  function setJangdanCursor(gi, ci, focusTa) {
    activeArea = "jd"; activeGak = 0; activeCellIdx = ci; activeRow = -1; activeRows = 1;
    updateHighlight();
    const ta = $("jangdan");
    if (focusTa) {
      const railBtn = document.querySelector('#dockRail .rail-btn[data-panel="jangdanArea"]');
      if (railBtn && !railBtn.classList.contains("active")) railBtn.click();
      ta.focus();
    }
    const cells = parseMelodyOffsets(ta.value)[0] || [];
    const c = cells[Math.min(ci, Math.max(0, cells.length - 1))];
    if (c) ta.setSelectionRange(c.start, c.start + c.text.length);
    else ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // ---------- 정간 위 인라인 입력(가사) ----------
  function currentLyricText(gi, ci) {
    const p = parseMelodyOffsets(lyricsFull);
    return (p[gi] && p[gi][ci]) ? p[gi][ci].text : "";
  }
  function setLyricText(gi, ci, val) {
    val = String(val).replace(/[|\n]+/g, " ").replace(/\s+/g, " ").trim();
    const rows = parseMelodyOffsets(lyricsFull).map(function (g) {
      return g.map(function (c) { return c.text; });
    });
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    while (rows.length <= gi) rows.push([]);
    while (rows[gi].length <= ci) rows[gi].push("");
    rows[gi][ci] = val;
    while (rows[gi].length < beats) rows[gi].push("");
    lyricsFull = rows.map(function (g) { return g.join(" | "); }).join("\n");
    render();
    refreshEditorSlices();
  }
  function setLyricCursor(gi, ci, focusTa) {
    activeArea = "ly"; activeGak = gi; activeCellIdx = ci; activeRow = -1; activeRows = 1;
    updateHighlight();
    let p = edPage;
    for (let i = 0; i < pageGakRanges.length; i++) {
      if (gi >= pageGakRanges[i].start && gi < pageGakRanges[i].end) { p = i; break; }
    }
    if (p !== edPage) setEdPage(p, { noScroll: true });
    const ta = $("lyrics");
    if (focusTa) {
      const railBtn = document.querySelector('#dockRail .rail-btn[data-panel="lyricsArea"]');
      if (railBtn && !railBtn.classList.contains("active")) railBtn.click();
      ta.focus();
    }
    const local = gi - (edLyRange ? edLyRange.start : 0);
    const cells = parseMelodyOffsets(ta.value)[local] || [];
    const c = cells[Math.min(ci, Math.max(0, cells.length - 1))];
    if (c) ta.setSelectionRange(c.start, c.start + c.text.length);
    else ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // ---------- 도메인별 정간 입력 어댑터 ----------
  // 직접 입력 카드가 선율/장단/가사 어디서 열렸는지에 따라 좌표·읽기·쓰기·에디터 커서
  // 이동 방식이 다르므로 한 군데(CELL_EDIT)에 모아두고, 카드 자체(위치 계산·DOM·키보드
  // 처리)는 아래 openCellEditor/commitCellEditor 하나로 공유한다.
  // 방향키 이동 — 위/아래는 같은 각 안에서 정간(박)을 오르내리고, 좌/우는 각을 넘나든다.
  // 정간보는 오른쪽 각이 먼저(이전), 왼쪽 각이 나중(다음)이라 ←는 다음 각, →는 이전 각이다.
  function gridMove(dom, gi, ci, key) {
    let ngi = gi, nci = ci;
    if (key === "ArrowUp") nci -= 1;
    else if (key === "ArrowDown") nci += 1;
    else if (key === "ArrowLeft") ngi += 1;
    else if (key === "ArrowRight") ngi -= 1;
    else return null;
    if (nci < 0 || ngi < 0) return null;
    return dom.geom(ngi, nci) ? { gi: ngi, ci: nci } : null;
  }
  const CELL_EDIT = {
    mel: {
      geom: function (gi, ci) { const g = cellGeom[gi]; return g && g[ci]; },
      getText: currentCellText, setText: setCellText, setCursor: setEditorCursorToCell,
      label: function (gi, ci) { return (gi + 1) + "각 · " + (ci + 1) + "정간"; },
      next: function (gi, ci) {
        const beats = Math.max(1, parseInt($("beats").value) || 1);
        let ng = gi, ni = ci + 1;
        if (ni >= beats) { ni = 0; ng = gi + 1; }
        return this.geom(ng, ni) ? { gi: ng, ci: ni } : null;
      },
      move: function (gi, ci, key) { return gridMove(this, gi, ci, key); }
    },
    jd: {
      geom: function (gi, ci) { return jdGeom[ci] || null; },
      getText: currentJangdanText, setText: setJangdanText, setCursor: setJangdanCursor,
      label: function (gi, ci) { return (ci + 1) + "정간 · 장단"; },
      next: function (gi, ci) {
        const beats = Math.max(1, parseInt($("beats").value) || 1);
        const ni = ci + 1;
        return (ni < beats && jdGeom[ni]) ? { gi: 0, ci: ni } : null;   // 장단은 한 줄뿐 — 다음 각으로 안 넘어감
      },
      move: function (gi, ci, key) {   // 장단은 한 줄뿐이라 좌우 이동은 없음
        if (key !== "ArrowUp" && key !== "ArrowDown") return null;
        const nci = key === "ArrowUp" ? ci - 1 : ci + 1;
        return (nci >= 0 && jdGeom[nci]) ? { gi: 0, ci: nci } : null;
      }
    },
    ly: {
      geom: function (gi, ci) {
        const g = cellGeom[gi]; const cg = g && g[ci];
        if (!cg || !hiLyricsOn) return null;
        return { page: cg.page, x: cg.x + cg.w + hiLyGap, y: cg.y, w: hiLyW, h: cg.h };
      },
      getText: currentLyricText, setText: setLyricText, setCursor: setLyricCursor,
      label: function (gi, ci) { return (gi + 1) + "각 · " + (ci + 1) + "정간 가사"; },
      next: function (gi, ci) {
        const beats = Math.max(1, parseInt($("beats").value) || 1);
        let ng = gi, ni = ci + 1;
        if (ni >= beats) { ni = 0; ng = gi + 1; }
        return this.geom(ng, ni) ? { gi: ng, ci: ni } : null;
      },
      move: function (gi, ci, key) { return gridMove(this, gi, ci, key); }
    }
  };

  function closeCellEditor() {
    // 상태를 먼저 비운 뒤 DOM에서 뗀다 — removeChild가 포커스된 입력을 지우면 blur가
    // '동기적으로' 발생하는데, 그때 cellEditInput이 아직 이전 값이면 blur 핸들러가
    // commitCellEditor를 다시 불러(재진입) 이 함수가 두 번 실행되고, 두 번째 removeChild가
    // "이미 떼어진 노드"라 던지는 예외로 바깥쪽 commitCellEditor(Enter 이동)가 중간에 끊겼다.
    const el = cellEditor;
    cellEditor = null; cellEditInput = null; cellEditDomain = null;
    cellEditGi = -1; cellEditCi = -1;
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function openCellEditor(domain, gi, ci) {
    closeCellEditor();
    const dom = CELL_EDIT[domain];
    const cg = dom.geom(gi, ci);
    if (!cg) return;
    const svg = pageSvgs[cg.page]; if (!svg) return;
    // 에디터 커서도 같은 정간으로 — 각 추가·삭제가 늘 클릭한 각 기준으로 동작하게
    dom.setCursor(gi, ci, false);

    // 직접 입력 카드 — 악보(#sheet)는 입력 때마다 다시 그려지므로 카드가 지워지지 않게
    // 스크롤 컨테이너(#sheetArea)에 픽셀 좌표로 띄운다. 렌더가 카드를 건드리지 않아
    // 포커스·한글 조합이 그대로 유지되고, 치는 대로 실시간 반영이 가능하다.
    const area = $("sheetArea");
    const sr = svg.getBoundingClientRect(), ar = area.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const kx = sr.width / vb.width, ky = sr.height / vb.height;
    const toX = function (v) { return sr.left - ar.left + area.scrollLeft + v * kx; };
    const toY = function (v) { return sr.top - ar.top + area.scrollTop + v * ky; };
    const cellPx = cg.h * ky;
    const h = Math.max(cellPx * 1.6, 46), w = Math.max(cellPx * 3.6, 120);
    // 카드는 정간의 '오른쪽'(이미 지나온 각 위)에 띄운다 — 왼쪽은 다음 각이라, 덮으면
    // 커서가 다음 각으로 넘어간 것처럼 보인다. 한계는 종이가 아니라 화면(스크롤 영역)
    // 오른쪽 — 종이 밖 회색 여백에 떠도 무방하다. 화면 밖으로 나갈 때만 왼쪽으로.
    const areaRight = area.scrollLeft + area.clientWidth - 8;
    let px = toX(cg.x + cg.w) + cellPx * 0.3;
    if (px + w > areaRight) px = Math.max(toX(0) + 2, toX(cg.x) - w - cellPx * 0.3);
    const py = Math.max(toY(0) + 2, Math.min(toY(vb.height) - h - 2, toY(cg.y + cg.h / 2) - h / 2));
    const card = document.createElement("div");
    card.className = "cell-editor";
    card.style.cssText = "position:absolute;left:" + px + "px;top:" + py + "px;" +
      "width:" + w + "px;height:" + h + "px;box-sizing:border-box;display:flex;flex-direction:column;z-index:6;" +
      "background:#fff;border:1px solid rgba(138,109,59,.45);border-radius:" + (h * 0.13) + "px;" +
      "box-shadow:0 " + (h * 0.09) + "px " + (h * 0.32) + "px rgba(31,26,18,.28);overflow:hidden;";
    const cap = document.createElement("div");
    cap.style.cssText = "flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:6px;" +
      "font-size:" + (h * 0.17) + "px;line-height:1.55;font-weight:600;" +
      "letter-spacing:.04em;color:#8a6d3b;background:#f7f3ea;padding:0 " + (h * 0.16) + "px;" +
      "border-bottom:1px solid rgba(138,109,59,.18);";
    const capLab = document.createElement("span");
    capLab.textContent = dom.label(gi, ci);
    // 키보드 이벤트가 어떤 환경에서든 막혀도 이동할 수 있는 확실한 길 — 다음 버튼
    const nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.textContent = "다음 ▶";
    nextBtn.title = "저장하고 다음 정간으로 (Enter)";
    nextBtn.style.cssText = "border:none;background:none;color:#8a6d3b;font-weight:700;cursor:pointer;" +
      "font-size:inherit;font-family:inherit;padding:0 2px;line-height:inherit;";
    nextBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });   // 포커스 유지
    nextBtn.addEventListener("click", function () { commitCellEditor(true); });
    cap.appendChild(capLab); cap.appendChild(nextBtn);
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = dom.getText(gi, ci);
    inp.style.cssText = "flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;border:none;outline:none;" +
      "text-align:center;padding:0 " + (h * 0.12) + "px;background:#fff;color:#1f1a12;" +
      "font-family:inherit;line-height:1;font-size:" + (h * 0.36) + "px;";
    card.appendChild(cap); card.appendChild(inp);
    area.appendChild(card);
    cellEditor = card; cellEditInput = inp; cellEditDomain = domain;
    cellEditGi = gi; cellEditCi = ci;
    inp.focus(); inp.select();

    // 치는 대로 실시간 반영 — 카드가 악보 밖에 있어 render()가 조합(IME)을 깨지 않는다
    inp.addEventListener("input", function () {
      if (cellEditInput !== inp) return;
      keepCellEditor = true;
      try { dom.setText(gi, ci, inp.value); } finally { keepCellEditor = false; }
    });
    inp.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); closeCellEditor(); return; }
      // 방향키로 인접 칸 이동 — 위/아래는 텍스트 입력창에서 원래 아무 동작이 없어 늘 가로채고,
      // 좌/우는 글자 편집(커서 이동)과 겹치므로 커서가 글자 맨 앞/뒤에 있을 때만 칸 이동으로 쓴다.
      let arrowKey = null;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") arrowKey = e.key;
      else if (e.key === "ArrowLeft" && inp.selectionStart === 0 && inp.selectionEnd === 0) arrowKey = e.key;
      else if (e.key === "ArrowRight" && inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length) arrowKey = e.key;
      if (!arrowKey) return;
      const target = dom.move(gi, ci, arrowKey);
      if (!target) return;
      e.preventDefault();
      commitCellEditor(false);
      openCellEditor(domain, target.gi, target.ci);
    });
    // Enter의 표준 입력 경로 — 키 이벤트가 IME에 가려져도 브라우저가 insertLineBreak를 준다.
    // keyup 경로와 어느 쪽이 먼저 올지 IME·글자 수에 따라 순서가 달라(한 글자만 입력하고
    // Enter를 치면 조합 확정 타이밍 때문에 keyup이 먼저 오기도 한다) claimCellEditMove()로
    // 먼저 온 쪽이 선점하게 해서 두 경로가 같은 Enter를 두 번 처리하지 않게 막는다.
    inp.addEventListener("beforeinput", function (e) {
      if (e.inputType === "insertLineBreak") {
        e.preventDefault();
        if (claimCellEditMove()) commitCellEditor(true);
      }
    });
    inp.addEventListener("blur", function () { if (cellEditInput === inp) commitCellEditor(false); });
  }

  // Enter/Tab → 다음 정간 이동: 문서 레벨에서 '키를 뗄 때(keyup)' 처리한다.
  // 한글 IME는 조합 중 Enter를 keydown에서 "Process"/229로 바꾸거나 브라우저마다 순서가 달라
  // 신뢰할 수 없지만, keyup 시점에는 어떤 IME든 조합이 이미 끝나 있고 값도 확정돼 있다.
  // 문서 캡처 단계라 조합 확정 과정에서 포커스가 잠깐 흔들려도 놓치지 않는다.
  function cellEditMoveKey(e) {
    return e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter" ||
           e.code === "Tab" || e.key === "Tab";
  }
  // beforeinput(insertLineBreak)·keyup 두 경로 중 같은 Enter를 먼저 처리하는 쪽이 선점하고
  // (시간 순서가 IME·글자 수에 따라 뒤바뀔 수 있어 양방향으로 막아야 한다) 나머지는 무시한다.
  let cellEditMoveClaimedUntil = 0;
  function claimCellEditMove() {
    if (Date.now() < cellEditMoveClaimedUntil) return false;
    cellEditMoveClaimedUntil = Date.now() + 350;
    return true;
  }
  document.addEventListener("keydown", function (e) {
    if (cellEditInput && cellEditMoveKey(e)) e.preventDefault();   // 폼 동작·포커스 이동만 막음
  }, true);
  document.addEventListener("keyup", function (e) {
    if (!cellEditInput || !cellEditMoveKey(e)) return;
    e.preventDefault();
    if (!claimCellEditMove()) return;
    commitCellEditor(true);
  }, true);

  // 커밋: 값 저장 후 렌더. moveNext면 다음 정간으로 이동(도메인별 next()가 판단)
  function commitCellEditor(moveNext) {
    if (!cellEditInput) return;
    // 전역 커서(activeGak)는 다른 이벤트로 바뀔 수 있으므로, 카드가 기억하는 좌표를 쓴다
    const domain = cellEditDomain, gi = cellEditGi, ci = cellEditCi, val = cellEditInput.value;
    closeCellEditor();
    if (!domain || gi < 0) return;
    const dom = CELL_EDIT[domain];
    dom.setText(gi, ci, val);
    updateHighlight();
    if (moveNext) {
      const nextPos = dom.next(gi, ci);
      if (nextPos) openCellEditor(domain, nextPos.gi, nextPos.ci);
    }
  }

  // ---------- 율명(한글→한자) 변환 ----------
  const YUL = { 황: "黃", 대: "大", 태: "太", 협: "夾", 고: "姑", 중: "仲",
                유: "蕤", 임: "林", 이: "夷", 남: "南", 무: "無", 응: "應" };
  const BASESET = new Set(Object.keys(YUL));

  // 옥타브 변형 한자(Cha-Unicode.docx의 유니코드 표 기준, 유니코드에 존재가 확인된 것만).
  // 여기 없는 조합(하배이·중청대)은 기본자 + 옥타브 점으로 표기.
  const OCT_HANJA = {
    "1":  { 황: "潢", 대: "汏", 태: "汰", 협: "浹", 고: "㴌", 중: "㳞", 유: "㶋", 임: "淋", 이: "洟", 남: "湳", 무: "潕", 응: "㶐" },
    "-1": { 황: "僙", 대: "㐲", 태: "㑀", 협: "俠", 고: "㑬", 중: "㑖", 유: "侇", 임: "㑣", 이: "侇", 남: "㑲", 무: "㒇", 응: "㒣" },
    "2":  { 황: "㶂", 태: "㳲", 협: "㴺", 고: "㵈", 중: "㴢", 유: "㶙", 임: "㵉", 이: "㴣", 남: "㵜", 무: "㶃", 응: "㶝" },
    "-2": { 황: "㣴", 대: "㣕", 태: "㣖", 협: "㣣", 고: "㣨", 중: "㣡", 유: "㣸", 임: "㣩", 남: "㣮", 무: "㣳", 응: "㣹" }
  };

  // 악보 음표용 서체(이미지 글씨와 어울리는 해서·명조 계열)
  const NOTE_FONT = "'Kaiti SC','STKaiti','KaiTi','GungSeo','Batang','AppleMyungjo','Noto Serif KR',serif";

  // 폰트가 해당 글자를 실제로 그릴 수 있는지(두부 □ 방지) 캔버스로 검사
  const glyphCache = {};
  let glyphCtx = null, tofuSigs = null;
  function canGlyph(ch) {
    if (ch in glyphCache) return glyphCache[ch];
    let ok = true;
    try {
      if (!glyphCtx) {
        const c = document.createElement("canvas");
        c.width = 28; c.height = 28;
        glyphCtx = c.getContext("2d", { willReadFrequently: true });
        glyphCtx.font = "22px " + NOTE_FONT;
        glyphCtx.textBaseline = "top";
      }
      const sig = function (s) {
        glyphCtx.clearRect(0, 0, 28, 28);
        if (s) glyphCtx.fillText(s, 1, 2);
        return glyphCtx.canvas.toDataURL();
      };
      if (!tofuSigs) tofuSigs = [sig(""), sig("͸"), sig("￿")];
      ok = tofuSigs.indexOf(sig(ch)) < 0;
    } catch (e) { ok = true; }
    glyphCache[ch] = ok;
    return ok;
  }

  // 음+옥타브 → 폰트로 그릴 변형 한자(지원될 때만), 없으면 null
  function octHanja(base, oct) {
    const m = OCT_HANJA[String(oct)];
    const ch = m && m[base];
    return (ch && canGlyph(ch)) ? ch : null;
  }
  // 숫자 → 한자 숫자 표기(만 단위까지). 자릿수 1은 접두어 생략(十, 百 등).
  const HANJA_DIGIT = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  function numToHanja(n) {
    n = Math.round(n);
    if (n === 0) return "零";
    const man = Math.floor(n / 10000) % 10000, cheon = Math.floor(n / 1000) % 10,
          baek = Math.floor(n / 100) % 10, sip = Math.floor(n / 10) % 10, il = n % 10;
    let s = "";
    if (man) s += (man > 1 ? numToHanja(man) : "") + "萬";
    if (cheon) s += (cheon > 1 ? HANJA_DIGIT[cheon] : "") + "千";
    if (baek) s += (baek > 1 ? HANJA_DIGIT[baek] : "") + "百";
    if (sip) s += (sip > 1 ? HANJA_DIGIT[sip] : "") + "十";
    if (il) s += HANJA_DIGIT[il];
    return s;
  }
  // 기호 약어 → 파일명 (짧게 입력). 이음은 이미지 대신 '-' 문자 그대로 사용.
  const SYM_MARK = { "쉼": "pause_007", "쉼표": "pause_007" };

  // 시김새 토큰 괄호 — {}·[]·() 셋 다 같은 뜻으로 허용(취향껏 섞어 써도 됨).
  // 여는 괄호로 짝 닫는 괄호를 찾는다.
  const ORN_BRACKET_CLOSE = { "{": "}", "[": "]", "(": ")" };

  // ---------- 시김새(장식음) 매핑 ----------
  // c: "wo"=음길이 없음(음표 오른쪽에 작게 붙임) / "with"=음길이 있음(독립 칸) / "both"=둘 다
  const ORN_LIST = [
    { s: "push", k: "미는표", c: "wo" }, { s: "flow", k: "흘림표", c: "wo" },
    { s: "flow-rep", k: "겹흘림표", c: "wo" }, { s: "vib", k: "농음표", c: "wo" },
    { s: "vib-long", k: "풀어내림표", c: "wo" }, { s: "roll", k: "떠이어표", c: "wo" },
    { s: "diff-str-fast", k: "싸랭", c: "wo" }, { s: "diff-str-1", k: "슬기둥1", c: "wo" },
    { s: "diff-str-2", k: "슬기둥2", c: "wo" }, { s: "diff-str-3", k: "슬기둥3", c: "wo" },
    { s: "roll-str", k: "전성", c: "wo" }, { s: "pizzicato", k: "자출", c: "wo" },
    { s: "splash", k: "잉어질표", c: "wo" }, { s: "between-up", k: "루러표", c: "wo" },
    { s: "between-down", k: "시루표", c: "wo" }, { s: "down-pitched", k: "낮게", c: "wo" },
    { s: "tongue", k: "서침표", c: "wo" }, { s: "nanina", k: "나니나", c: "wo" },
    { s: "naneuna", k: "나느나", c: "wo" }, { s: "nire", k: "니레", c: "wo" },
    { s: "nina", k: "니라", c: "wo" }, { s: "niro", k: "니로", c: "wo" },
    { s: "none", k: "노네", c: "wo" }, { s: "neonye", k: "너녜", c: "wo" },
    { s: "noniro", k: "노니로", c: "wo" }, { s: "norino", k: "노리노", c: "wo" },
    { s: "nerone", k: "네로네", c: "wo" }, { s: "neuneneu", k: "느네느", c: "wo" },
    { s: "naniro", k: "나니로", c: "wo" }, { s: "neunira", k: "느니라", c: "wo" },
    { s: "neuronireu", k: "느로니르", c: "wo" }, { s: "neunireu", k: "느니르", c: "wo" },
    { s: "niruni", k: "니루니", c: "wo" }, { s: "nanireunonireu", k: "나니르노니르", c: "wo" },
    { s: "staccato", k: "끊는표", c: "wo" }, { s: "accent", k: "특강표", c: "wo" },
    { s: "fermata", k: "늘임표", c: "wo" }, { s: "len-double", k: "덧길이표", c: "wo" },
    { s: "len-half", k: "반길이표", c: "wo" },
    { s: "no", k: "노", c: "with" }, { s: "ni", k: "니", c: "with" },
    { s: "ro", k: "로", c: "with" }, { s: "ri", k: "리", c: "with" },
    { s: "nina-dur", k: "니나", c: "with" }, { s: "neuna", k: "느나", c: "with" },
    { s: "nora", k: "노라", c: "with" }, { s: "neuni", k: "느니", c: "with" },
    { s: "noraneuni", k: "노라느니", c: "with" }, { s: "nirena", k: "니레나", c: "with" },
    { s: "nerona", k: "네로나", c: "with" }, { s: "nirona", k: "니로나", c: "with" },
    { s: "nineurani", k: "니느라니", c: "with" }, { s: "neunanina", k: "느나니나", c: "with" },
    { s: "neunareunani", k: "느나르나니", c: "with" }, { s: "shake", k: "요성표", c: "with" },
    { s: "shake-rep", k: "겹요성표", c: "with" }, { s: "repeat", k: "같은음표", c: "with" },
    { s: "bend-down", k: "퇴성", c: "both" }, { s: "bend-up", k: "추성", c: "both" }
  ];
  const ORN_CAT = {};
  ORN_LIST.forEach(function (o) { ORN_CAT[o.s] = o.c; });
  // 유독 크게 느껴지는 일부 독립 기호(노·니·로·리·니나·느나)만 추가로 축소
  const SYM_EXTRA_SCALE = { no: 0.8, ni: 0.8, ro: 0.8, ri: 0.8, "nina-dur": 0.8, neuna: 0.8 };
  // 붙임표(음표 오른쪽에 붙는 시김새) 확대 — 미는표·흘림표·니레·니라·니로·끊는표·특강표만 원래 크기 유지
  const ATT_EXTRA_SCALE = 1.2;
  const ATT_SCALE_KEEP = new Set(["push", "flow", "nire", "nina", "niro", "staccato", "accent"]);
  // 특정 붙임표만 따로 크기 조정 — 농음표·풀어내림표·잉어질표는 가늘고 길어 2.5배로,
  // 반길이표는 지금(1.2배)의 절반 크기가 되도록 0.5배 추가 축소(최종 0.6배)
  const ATT_SYM_SCALE = { vib: 2.5, "vib-long": 2.5, splash: 2.5, "len-half": 0.5 };
  // 한글 이름 → 파일 stem (토큰을 한글로 쓰기 위함). 이름이 중복되면 먼저 나온 것 우선.
  const ORN_KO = {};
  ORN_LIST.forEach(function (o) { if (!(o.k in ORN_KO)) ORN_KO[o.k] = o.s; });

  // 시김새 추가 모드(직접 입력) — 붙임표(wo/both) 시김새에 숫자 단축키(1~9,0) 배정.
  // 기본은 앞 10개지만, 시김새 팔레트 위 배정 줄(#ornAddMapBar)에서 번호마다 원하는
  // 시김새로 바꿀 수 있다 — ornAddMap[i]가 그 번호(ORN_ADD_KEYS[i])에 배정된 stem.
  const ORN_ADD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const ORN_ADD_ALL = ORN_LIST.filter(function (o) { return o.c === "wo" || o.c === "both"; });
  const ORN_ADD_DEFAULT = ORN_ADD_ALL.slice(0, ORN_ADD_KEYS.length).map(function (o) { return o.s; });
  let ornAddMap = ORN_ADD_DEFAULT.slice();
  const ORN_ADD_KEY_BY_STEM = {};
  function rebuildOrnAddKeyMap() {
    Object.keys(ORN_ADD_KEY_BY_STEM).forEach(function (k) { delete ORN_ADD_KEY_BY_STEM[k]; });
    ornAddMap.forEach(function (stem, i) { if (stem) ORN_ADD_KEY_BY_STEM[stem] = ORN_ADD_KEYS[i]; });
  }
  rebuildOrnAddKeyMap();

  // 시김새 추가 모드 숫자 배정 줄 — 번호마다 드롭다운으로 원하는 붙임표 시김새를 고른다.
  // 같은 시김새를 다른 번호에 또 고르면 중복 단축키를 막기 위해 이전 번호 쪽을 비운다.
  function buildOrnAddMapBar() {
    const wrap = $("ornAddMapBar");
    if (!wrap) return;
    wrap.innerHTML = "";
    ORN_ADD_KEYS.forEach(function (key, i) {
      const slot = document.createElement("label");
      slot.className = "oam-slot";
      const kb = document.createElement("span");
      kb.className = "oam-key"; kb.textContent = key;
      slot.appendChild(kb);
      const sel = document.createElement("select");
      const noneOpt = document.createElement("option");
      noneOpt.value = ""; noneOpt.textContent = "─";
      sel.appendChild(noneOpt);
      ORN_ADD_ALL.forEach(function (o) {
        const opt = document.createElement("option");
        opt.value = o.s; opt.textContent = o.k;
        if (ornAddMap[i] === o.s) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function () {
        const stem = sel.value || null;
        if (stem) ornAddMap.forEach(function (s, j) { if (j !== i && s === stem) ornAddMap[j] = null; });
        ornAddMap[i] = stem;
        rebuildOrnAddKeyMap();
        buildOrnAddMapBar();   // 중복 정리로 다른 슬롯이 비워졌을 수 있어 전체 다시 그림
        refreshOrnAddBadges();
        saveState();
      });
      slot.appendChild(sel);
      wrap.appendChild(slot);
    });
  }

  // 시김새 팔레트 아이콘 크기 — 실제 악보(drawCell)가 쓰는 것과 같은 상대 배율 공식으로
  // 계산해서, 팔레트에서도 실제로 그려질 때와 비슷한 비중으로 보이게 한다(칸은 균일해도
  // 아이콘 크기만 종류별로 차이가 남 — 뒤죽박죽이 아니라 의도된 크기 차이가 되게).
  function ornRelSize(o) {
    if (o.c === "wo") {
      const scale = ATT_SCALE_KEEP.has(o.s) ? 1 : ATT_EXTRA_SCALE;
      return 0.55 * scale * (ATT_SYM_SCALE[o.s] || 1);
    }
    return 0.848 * (SYM_EXTRA_SCALE[o.s] || 1);   // "with"·"both"
  }
  const ORN_REL_VALS = ORN_LIST.map(ornRelSize);
  const ORN_REL_MIN = Math.min.apply(null, ORN_REL_VALS);
  const ORN_REL_MAX = Math.max.apply(null, ORN_REL_VALS);
  function ornIconPx(o) {
    const span = ORN_REL_MAX - ORN_REL_MIN || 1;
    const t = (ornRelSize(o) - ORN_REL_MIN) / span;
    return Math.round(16 + t * (28 - 16));   // 16~28px
  }

  // 한 행의 토큰을 [주 글자(음표/독립기호) + 붙임 시김새] 그룹으로 묶는다. 렌더(drawCell)와
  // 재생(buildAudioEvents)이 같은 규칙을 공유해야 화면과 소리가 어긋나지 않는다.
  function groupRowTokens(toks) {
    const groups = [];
    toks.forEach(function (tk) {
      const cat = tk.sym ? ORN_CAT[tk.sym] : null;
      const attach = (cat === "wo") || (cat === "both" && groups.length > 0);
      if (attach && groups.length) groups[groups.length - 1].att.push(tk);
      else groups.push({ main: tk, att: [] });
    });
    return groups;
  }

  // 기호/시김새 이미지 dataURL (없으면 null)
  function symURL(key) {
    if (window.SYM_DATA && window.SYM_DATA[key]) return window.SYM_DATA[key];
    if (window.NOTE_DATA && window.NOTE_DATA[key]) return window.NOTE_DATA[key];
    return null;
  }
  const PRE2 = ["배탁", "하배"];   // 두 옥타브 아래
  const PRE2U = ["중청", "겹청"];  // 두 옥타브 위
  const PRE1U = ["청"];            // 한 옥타브 위
  const PRE1D = ["배", "탁"];      // 한 옥타브 아래

  // 공백 없는 문자열 → 음표 토큰 배열 [{base,oct} | {literal}]
  function tokenizeNotes(str) {
    const a = Array.from(str), out = [];
    let i = 0;
    while (i < a.length) {
      const ornClose = ORN_BRACKET_CLOSE[a[i]];
      if (ornClose) {   // {파일명}·[파일명]·(파일명) 또는 …@크기,좌우,상하 = 기호 이미지(+개별 조정)
        let j = i + 1, name = "";
        while (j < a.length && a[j] !== ornClose) { name += a[j]; j++; }
        if (j < a.length) {
          let sym = name, adj = null;
          const at = name.indexOf("@");
          if (at >= 0) {
            sym = name.slice(0, at);
            const p = name.slice(at + 1).split(",");
            adj = { sz: parseFloat(p[0]) || 100, dx: parseFloat(p[1]) || 0, dy: parseFloat(p[2]) || 0 };
          }
          out.push({ sym: ORN_KO[sym] || sym, adj: adj });   // 한글 이름이면 stem으로 변환
          i = j + 1; continue;
        }
      }
      // 기호 약어: -=이음(연음), 쉼/쉼표=쉼표, <=숨표(그 정간 오른쪽-아래 모서리에 고정 표시)
      const t2 = a[i] + (a[i + 1] || "");
      if (SYM_MARK[t2]) { out.push({ sym: SYM_MARK[t2] }); i += 2; continue; }
      if (SYM_MARK[a[i]]) { out.push({ sym: SYM_MARK[a[i]] }); i += 1; continue; }
      if (a[i] === "<") { out.push({ breath: true }); i += 1; continue; }
      // 특수 율명(하하배임 등) — 옥타브 접두어 규칙보다 먼저 이름 전체를 통째로 매칭
      // (안 그러면 '하하배임'이 '하'+'하배임'으로 쪼개진다)
      const spn = matchSpecialNote(a, i);
      if (spn) {
        const sp = SPECIAL_NOTES[spn];
        out.push({ base: sp.base, oct: sp.oct, file: sp.file });
        i += spn.length; continue;
      }
      const two = a[i] + (a[i + 1] || "");
      if (PRE2.indexOf(two) >= 0 && BASESET.has(a[i + 2])) { out.push({ base: a[i + 2], oct: -2 }); i += 3; continue; }
      if (PRE2U.indexOf(two) >= 0 && BASESET.has(a[i + 2])) { out.push({ base: a[i + 2], oct: 2 }); i += 3; continue; }
      const one = a[i];
      if (PRE1U.indexOf(one) >= 0 && BASESET.has(a[i + 1])) { out.push({ base: a[i + 1], oct: 1 }); i += 2; continue; }
      if (PRE1D.indexOf(one) >= 0 && BASESET.has(a[i + 1])) { out.push({ base: a[i + 1], oct: -1 }); i += 2; continue; }
      if (BASESET.has(one)) { out.push({ base: one, oct: 0 }); i += 1; continue; }
      out.push({ literal: one }); i += 1;   // 한자/기호 등 그대로 통과
    }
    return out;
  }

  // symbol_samples/notes/ — 쉼표 등 기호 이미지의 로컬 서버 폴백 경로로만 쓰임(gitignore로 커밋 제외).
  const NOTE_DIR = "symbol_samples/notes/";
  let noteMode = "font";   // "font" | "hangul" (이미지 표기 옵션은 제거됨)
  let noteScaleCur = 1;    // 율명 크기 배율 (레이아웃 탭 슬라이더, 1 = 기본이자 최소)
  let lyricsScaleCur = 1;  // 가사 크기 배율 (기능바 슬라이더 — 가사 켜졌을 때만 보임)
  let palZoom = 1;         // 율명 팔레트(표·건반) 표시 배율
  let ornPalZoom = 1;      // 시김새 팔레트 표시 배율 — 율명과 따로 조절됨
  let edFontPx = 14;       // 선율 텍스트 에디터 글자 크기(px)

  // ---------- 율명 팔레트 (음역 행 × 음계 열 매트릭스) ----------
  // 행 = 음역(낮은음→높은음), 열 = 12율 음계순
  const SCALE = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
  const OCT_ROWS = [
    { oct: -2, label: "하배", prefix: "하배" },
    { oct: -1, label: "배",   prefix: "배" },
    { oct: 0,  label: "중성", prefix: "" },
    { oct: 1,  label: "청",   prefix: "청" },
    { oct: 2,  label: "중청", prefix: "중청" }
  ];
  function octPrefix(oct) {
    const row = OCT_ROWS.find(function (r) { return r.oct === oct; });
    return row ? row.prefix : "";
  }
  // 유니코드 한자가 아예 없는 특수 율명(거문고 전용 저음역 등) — 전용 SVG 이미지로 그린다.
  // 12율×5옥타브 전부 이미지를 만드는 대신 실제로 쓰이는 음만 등록: 팔레트 '특수' 줄,
  // 이름 그대로 타이핑, 문법 검사, 재생(base+oct로 음높이 계산)이 모두 이 표를 같이 쓴다.
  const SPECIAL_NOTES = {
    "하하배임": { base: "임", oct: -3, file: "lim_ddd" }
  };
  function matchSpecialNote(a, i) {
    for (const nm in SPECIAL_NOTES) {
      if (a.slice(i, i + nm.length).join("") === nm) return nm;
    }
    return null;
  }
  // 조(악조) 프리셋 — 고르면 표 팔레트가 그 조의 구성음만 적힌 순서대로 모아 보여준다
  const JO_PRESETS = {
    "hwang-pyeong":   { label: "황종 평조",   notes: ["황", "태", "중", "임", "남"] },
    "hwang-gyemyeon": { label: "황종 계면조", notes: ["황", "협", "중", "임", "무"] },
    "jung-pyeong":    { label: "중려 평조",   notes: ["중", "임", "무", "황", "태"] }
  };

  // 커서 위치에 토큰(율명 텍스트) 삽입
  function insertToken(txt) {
    if (cellEditInput && cellEditDomain === "mel") {   // 선율 정간 인라인 편집 중이면 그 칸에 삽입
      const inp = cellEditInput;
      const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
      const e = inp.selectionEnd != null ? inp.selectionEnd : s;
      inp.value = inp.value.slice(0, s) + txt + inp.value.slice(e);
      const pos = s + txt.length;
      inp.setSelectionRange(pos, pos);
      inp.focus();
      inp.dispatchEvent(new Event("input"));   // 실시간 반영
      return;
    }
    const ta = $("melody");
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(txt, s, e, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  function insertJangdanToken(txt) {
    if (cellEditInput && cellEditDomain === "jd") {   // 직접 입력 — 지금 열려 있는 장단 정간 카드에 삽입
      const inp = cellEditInput;
      const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
      const e = inp.selectionEnd != null ? inp.selectionEnd : s;
      inp.value = inp.value.slice(0, s) + txt + inp.value.slice(e);
      const pos = s + txt.length;
      inp.setSelectionRange(pos, pos);
      inp.focus();
      inp.dispatchEvent(new Event("input"));
      return;
    }
    const ta = $("jangdan");
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(txt, s, e, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  // ---------- 장단 팔레트 (장구 구음 7종) ----------
  // 장단 텍스트는 스페이스를 분박 구분자로 쓰므로, 타이핑/저장/화면 표기 모두
  // 공백 없는 이름으로 통일한다(예: '작은덩').
  const JANGGU_NAMES = ["덩", "작은덩", "기덕", "궁", "덕", "다", "더러러러"];
  function buildJangdanPalette() {
    const wrap = $("jangdanPalette");
    if (!wrap) return;
    wrap.innerHTML = "";
    const data = window.JANGGU_DATA || {};
    const row = document.createElement("div");
    row.className = "ornrow";
    JANGGU_NAMES.forEach(function (name) {
      const item = document.createElement("div");
      item.className = "pi ornchip";
      item.title = "'" + name + "' 입력";
      if (data[name]) {
        const img = document.createElement("img");
        img.src = data[name]; img.alt = name;
        item.appendChild(img);
      }
      const cap = document.createElement("span");
      cap.className = "ocap"; cap.textContent = name;
      item.appendChild(cap);
      item.addEventListener("mousedown", function (e) { e.preventDefault(); });
      item.addEventListener("click", function () { insertJangdanToken(name); });
      row.appendChild(item);
    });
    wrap.appendChild(row);
  }

  // 팔레트 칩 하나 생성(쉼표 등 기호 이미지가 없으면 한자 폰트로 표시)
  // caption: 주 글자 아래 작은 회색 글자로 보여줄 보조 표기(예: 한자 모드엔 입력용 한글, 한글 모드엔 한자)
  // semis: 중성 황 기준 반음 수 — 값이 있으면 클릭 시 그 음을 미리듣기로 들려줌(기호 칩은 없음)
  function paletteChip(label, file, insertText, fallbackChar, dim, caption, semis) {
    const item = document.createElement("div");
    item.className = "pi";
    item.title = "‘" + label + "’ 입력";
    if (caption) item.classList.add("has-cap");
    if (file) {
      const img = document.createElement("img");
      img.src = (window.NOTE_DATA && window.NOTE_DATA[file]) ? window.NOTE_DATA[file] : NOTE_DIR + file + ".png";
      img.alt = label;
      item.appendChild(img);
    } else {
      if (dim) item.classList.add("nofile");
      const ch = document.createElement("span");
      ch.className = "pch";
      const text = fallbackChar || label;
      ch.textContent = text;
      // 한글 접두어(하배/중청 등)처럼 여러 글자면 칸 폭에 맞춰 글자 크기를 줄인다
      const len = Array.from(text).length;
      if (len >= 3) ch.style.fontSize = "9px";
      else if (len === 2) ch.style.fontSize = "13px";
      item.appendChild(ch);
    }
    if (caption) {
      const cap = document.createElement("span");
      cap.className = "pch-cap";
      cap.textContent = caption;
      item.appendChild(cap);
    }
    item.addEventListener("mousedown", function (e) { e.preventDefault(); });
    item.addEventListener("click", function () {
      if ($("palInsert").checked) insertToken(insertText);   // 입력 토글을 끄면 소리만
      if (semis != null) previewNote((parseInt($("hwangPitch").value) || 63) + semis);
    });
    return item;
  }

  // 시김새 팔레트 (붙임 / 독립 / 퇴성·추성 그룹)
  function buildOrnPalette(wrap) {
    wrap.innerHTML = "";
    wrap.classList.add("orn-view");
    // 퇴성·추성(both)은 음표에 붙여 쓰는 게 기본이라 붙임표 그룹에 함께 담는다
    const groups = [
      { title: "붙임표", sub: "음표 오른쪽에 작게 · 퇴성·추성 포함", cats: ["wo", "both"] },
      { title: "독립 기호", sub: "한 칸 차지", cats: ["with"] }
    ];
    groups.forEach(function (grp) {
      const head = document.createElement("div");
      head.className = "orn-sec";
      const tb = document.createElement("b"); tb.textContent = grp.title;
      const ts = document.createElement("span"); ts.textContent = grp.sub;
      head.appendChild(tb); head.appendChild(ts);
      wrap.appendChild(head);
      const g = document.createElement("div");
      g.className = "ornrow";
      ORN_LIST.filter(function (o) { return grp.cats.indexOf(o.c) >= 0; }).forEach(function (o) {
        const item = document.createElement("div");
        item.className = "pi ornchip"; item.title = o.k + " (" + o.s + ")";
        item.dataset.stem = o.s;
        // 배지는 늘 만들어두고(숫자 배정이 바뀌어도 새로 만들 필요 없이) 내용/보임만
        // refreshOrnAddBadges()가 그때그때 최신 배정으로 갱신한다.
        const badge = document.createElement("span");
        badge.className = "orn-key-badge";
        item.appendChild(badge);
        const url = symURL(o.s);
        if (url) {
          const img = document.createElement("img");
          img.src = url; img.alt = o.k;
          const px = ornIconPx(o);
          img.style.width = px + "px"; img.style.height = px + "px";
          item.appendChild(img);
        }
        const cap = document.createElement("span");
        cap.className = "ocap"; cap.textContent = o.k;
        item.appendChild(cap);
        item.addEventListener("mousedown", function (e) { e.preventDefault(); });
        item.addEventListener("click", function () {
          // 추가 모드에선(지금 이 시김새에 숫자가 배정돼 있으면) 칩 클릭도 숫자키처럼 골라두기만
          // 함 — ORN_ADD_KEY_BY_STEM을 매번 다시 조회해야 배정을 바꾼 뒤에도 안 어긋난다.
          if (ornAddMode && ORN_ADD_KEY_BY_STEM[o.s]) { armOrnAdd(o.s); return; }
          insertToken("{" + o.k + "}");
        });
        g.appendChild(item);
      });
      wrap.appendChild(g);
    });
    refreshOrnAddBadges();
  }

  // ---------- 시김새 추가 모드(직접 입력) ----------
  // 숫자키(또는 붙임표 칩 클릭)로 붙임표 시김새를 '골라두고(armed)', 악보의 음을 클릭하면
  // 그 옆에 붙는다. 정간 하나에 음이 여럿(분박)이면 칸의 맨 끝(가장 최근 음) 뒤에 붙인다.
  function armOrnAdd(stem) {
    ornAddArmed = stem;
    refreshOrnAddBadges();
  }
  function refreshOrnAddBadges() {
    document.body.classList.toggle("orn-add-on", ornAddMode);
    document.querySelectorAll(".ornchip").forEach(function (el) {
      const stem = el.dataset.stem;
      const key = ORN_ADD_KEY_BY_STEM[stem];
      const badge = el.querySelector(".orn-key-badge");
      if (badge) badge.textContent = key || "";
      el.classList.toggle("orn-no-key", !key);   // 숫자 배정이 없으면 배지 자리를 숨김
      el.classList.toggle("orn-armed", ornAddMode && !!ornAddArmed && stem === ornAddArmed);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (!ornAddMode || inputMode !== "direct") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;   // 텍스트 입력 중엔 숫자를 그대로 타이핑
    const idx = ORN_ADD_KEYS.indexOf(e.key);
    if (idx < 0) return;
    const stem = ornAddMap[idx];
    if (!stem) return;
    e.preventDefault();
    armOrnAdd(stem);
  });

  // 클릭한 정간(gi,ci)에 골라둔(armed) 붙임표 시김새를 붙인다 — 음이 없는 빈 칸에는 붙이지 않는다.
  // rowIdx: 분박(스페이스로 나뉜 여러 음)이 있을 때 그중 어느 음 뒤에 붙일지(클릭한 세로 위치 기준).
  // 생략하거나 범위를 벗어나면 맨 끝 음 뒤에 붙인다(기존 동작과 동일).
  function addOrnToCell(gi, ci, rowIdx) {
    if (!ornAddArmed) return;
    const o = ORN_LIST.find(function (x) { return x.s === ornAddArmed; });
    if (!o) return;
    const cur = CELL_EDIT.mel.getText(gi, ci);
    if (!cur.trim()) return;
    const rows = cur.split(" ");
    const idx = (rowIdx != null && rowIdx >= 0 && rowIdx < rows.length) ? rowIdx : rows.length - 1;
    rows[idx] = rows[idx] + "{" + o.k + "}";
    CELL_EDIT.mel.setText(gi, ci, rows.join(" "));
  }

  // ---------- 피아노 팔레트 (건반 위 율명, 클릭 입력 + 미리듣기) ----------
  const WEST_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  function isBlackKey(midi) { return [1, 3, 6, 8, 10].indexOf(midi % 12) >= 0; }
  function westName(midi) { return WEST_NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }

  // 미리듣기용 컨텍스트는 재생용과 분리(재생 정지 시 close 되므로)
  let previewCtx = null;
  function previewNote(midi) {
    if (!$("palSound").checked) return;   // 소리 미리듣기 토글 (표/건반 공통)
    try {
      if (!previewCtx) previewCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = previewCtx;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = midiToFreq(midi);
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.015);
      g.gain.linearRampToValueAtTime(0, t0 + 0.35);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.4);
    } catch (e) {}
  }

  function buildPianoPalette(wrap) {
    wrap.innerHTML = "";
    const baseMidi = parseInt($("hwangPitch").value) || 63;   // 중성 황 = 재생 기준음과 연동
    if ($("pianoBase")) $("pianoBase").value = String(baseMidi);
    const KW = 34, KB = 21;   // 흰건반/검은건반 폭(px) — CSS와 맞춤
    const kb = document.createElement("div");
    kb.className = "piano-kb";
    const startMidi = baseMidi - 24, endMidi = baseMidi + 35;   // 하배황 ~ 중청응
    // 맨 끝이 검은건반이면 받쳐줄 흰건반(율명 없음)을 하나 더 그림
    const from = isBlackKey(startMidi) ? startMidi - 1 : startMidi;
    const to = isBlackKey(endMidi) ? endMidi + 1 : endMidi;
    let wCount = 0, hwangKey = null;
    for (let midi = from; midi <= to; midi++) {
      const black = isBlackKey(midi);
      const key = document.createElement("div");
      key.className = black ? "pkey-b" : "pkey-w";
      if (midi < startMidi || midi > endMidi) {
        key.classList.add("pk-ghost");
      } else {
        const semis = midi - baseMidi;
        const oct = Math.floor(semis / 12);
        const base = SCALE[((semis % 12) + 12) % 12];
        const label = octPrefix(oct) + base;
        const yul = document.createElement("span");
        yul.className = "pk-yul";
        yul.textContent = label;
        const n = Array.from(label).length;
        yul.style.fontSize = black ? (n >= 3 ? "9px" : n === 2 ? "11px" : "13px")
                                   : (n >= 3 ? "10px" : n === 2 ? "13px" : "16px");
        key.appendChild(yul);
        const west = document.createElement("span");
        west.className = "pk-west";
        west.textContent = westName(midi);
        key.appendChild(west);
        key.title = "‘" + label + "’ 입력 (" + westName(midi) + ")";
        (function (txt, m) {
          key.addEventListener("mousedown", function (e) { e.preventDefault(); });
          key.addEventListener("click", function () {
            if ($("palInsert").checked) insertToken(txt);   // 입력 토글을 끄면 소리만
            previewNote(m);
          });
        })(label, midi);
        if (semis === 0) hwangKey = key;
      }
      if (black) key.style.left = (wCount * KW - KB / 2) + "px";
      else wCount++;
      kb.appendChild(key);
    }
    kb.style.width = (wCount * KW) + "px";
    wrap.appendChild(kb);
    fitPianoHeight();   // 팔레트 영역 높이에 맞춰 건반 높이 조정 (위아래 스크롤 없음)
    // 기본 스크롤: 중성 황 부근이 보이도록
    const pw = $("paletteWrap");
    if (hwangKey && pw) pw.scrollLeft = Math.max(0, hwangKey.offsetLeft - pw.clientWidth * 0.35);
  }

  function buildPalette() {
    const wrap = $("notePalette");
    if (!wrap) return;
    const pianoOn = palView === "yul" && yulMode === "piano";
    if ($("paletteCol")) {
      $("paletteCol").classList.toggle("orn-active", palView === "orn");
      $("paletteCol").classList.toggle("piano-active", pianoOn);
    }
    wrap.classList.toggle("orn-view", palView === "orn");
    if (palView === "orn") { buildOrnPalette(wrap); return; }
    if (pianoOn) { buildPianoPalette(wrap); return; }
    wrap.innerHTML = "";

    // 조 프리셋을 고르면 그 조의 구성음만 적힌 순서대로, 아니면 12율 전체
    const jo = JO_PRESETS[$("joPreset").value];
    const cols = jo ? jo.notes : SCALE;

    // 열 머리글 (음계: 황~응 또는 조 구성음)
    const head = document.createElement("div");
    head.className = "prow headrow";
    const corner = document.createElement("span");
    corner.className = "plabel";
    head.appendChild(corner);
    cols.forEach(function (base) {
      const h = document.createElement("span");
      h.className = "phead";
      h.textContent = base;
      head.appendChild(h);
    });
    wrap.appendChild(head);

    // 음역(하배→중청) 행 × 음계 열
    const mode = $("noteMode").value;   // 루프 밖에서 한 번만 조회
    OCT_ROWS.forEach(function (row) {
      const rowEl = document.createElement("div");
      rowEl.className = "prow";
      const lab = document.createElement("span");
      lab.className = "plabel";
      lab.textContent = row.label;
      rowEl.appendChild(lab);
      cols.forEach(function (base) {
        const label = row.prefix + base;
        // 변형 한자(지원 시) → 기본 한자(변형자 없으면 흐리게, 악보엔 점 표기)
        const variant = row.oct ? octHanja(base, row.oct) : null;
        const hanja = variant || YUL[base] || base;
        let fallback, dim, caption;
        if (mode === "hangul") { fallback = label; dim = false; caption = hanja; }
        else { fallback = hanja; dim = !variant && row.oct !== 0; caption = label; }
        const semis = SCALE.indexOf(base) + row.oct * 12;
        rowEl.appendChild(paletteChip(label, null, label, fallback, dim, caption, semis));
      });
      wrap.appendChild(rowEl);
    });

    // 특수 — 쉼표·이음·숨표(약어로 삽입)에 더해, 유니코드 없는 특수 율명(SPECIAL_NOTES,
    // 거문고 하하배임 등)도 이 줄에 들어간다(12율×5옥타브 표 밖의 음이라 매트릭스엔 자리가 없음).
    const data = window.NOTE_DATA || {};
    const symList = [];
    Object.keys(SPECIAL_NOTES).forEach(function (nm) {
      const sp = SPECIAL_NOTES[nm];
      if (data[sp.file]) symList.push({ file: sp.file, label: nm, ins: nm, cap: nm,
                                        semis: SCALE.indexOf(sp.base) + sp.oct * 12 });
    });
    if (data["pause_007"]) symList.push({ file: "pause_007", label: "쉼표", ins: "쉼", cap: "쉼표" });
    // '-' 문자 그대로 삽입 — 타이핑으로도 바로 쓸 수 있다는 걸 캡션에서 보여줌
    symList.push({ file: null, label: "이음", ins: "-", fallback: "-", cap: "이음(-)" });
    // '<' 문자 그대로 삽입 — 그 정간의 마지막 음 뒤에 바로 이어 쓰면(공백 없이) 오른쪽-아래 모서리에 표시됨
    symList.push({ file: null, label: "숨표", ins: "<", fallback: "<", cap: "숨표(<)" });
    if (symList.length) {
      const rowEl = document.createElement("div");
      rowEl.className = "prow symrow";
      const lab = document.createElement("span");
      lab.className = "plabel";
      lab.textContent = "특수";
      rowEl.appendChild(lab);
      symList.forEach(function (s) {
        rowEl.appendChild(paletteChip(s.label, s.file, s.ins, s.fallback, false, s.cap, s.semis));
      });
      wrap.appendChild(rowEl);
    }
  }

  // 장단 칸 하나 그리기: 정간 옆 좁은 줄에 구음 기호(들)를 세로로 배치(분박과 동일한 공백 규칙)
  // '다'는 원본 svg가 거의 정사각형(작은 점 하나)이라 contain 상자를 꽉 채워 세로로 긴
  // 다른 기호들보다 유독 커 보인다 — 팔레트(styles.css의 img[alt="다"])와 같은 이유로
  // 악보에서도 따로 줄여 그린다.
  const JANGGU_DRAW_SCALE = { "다": 0.3 };
  function drawJangdanCell(svg, x, yTop, width, cellH, content) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const data = window.JANGGU_DATA || {};
    const rowH = cellH / rows.length;
    rows.forEach(function (name, i) {
      const href = data[name];
      if (!href) return;
      const cy = yTop + rowH * (i + 0.5);
      const box = Math.min(width * 0.6, rowH * 0.6) * (JANGGU_DRAW_SCALE[name] || 1);
      const im = el("image", { x: x + (width - box) / 2, y: cy - box / 2, width: box, height: box,
        preserveAspectRatio: "xMidYMid meet" });
      im.setAttribute("href", href);
      im.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
      svg.appendChild(im);
    });
  }

  // 율명 분박 행들의 세로 중심 — drawCell과 같은 배치 규칙(이음(-) 단독 행 눌림,
  // 2분박 좁힘)을 그대로 따라 계산한다. 가사가 옆 율명과 나란히 앉는 데 쓴다.
  function melodyRowCenters(melRows, yTop, cellH) {
    const n = melRows.length;
    const weights = melRows.map(function (r) { return (n > 1 && r === "-") ? TIE_ROW_WEIGHT : 1; });
    if (weights.some(function (w) { return w !== 1; })) {
      const total = weights.reduce(function (a, b) { return a + b; }, 0);
      const centers = []; let acc = 0;
      for (let r = 0; r < n; r++) {
        const h = cellH * weights[r] / total;
        centers.push(yTop + acc + h / 2); acc += h;
      }
      return centers;
    }
    if (n === 2) {
      const halfGap = (cellH / 4) * PAIR_GAP_SCALE;
      return [yTop + cellH / 2 - halfGap, yTop + cellH / 2 + halfGap];
    }
    const rowH = cellH / n;
    return melRows.map(function (_, i) { return yTop + rowH * (i + 0.5); });
  }

  // 가사 칸 하나 그리기: 정간 오른쪽 좁은 줄에 글자를 세로로 배치(분박과 동일한 공백 규칙).
  // 옆 정간의 율명이 분박이면 가사도 그 행 위치를 그대로 따라가 '율 하나-가사 하나'로
  // 나란히 앉고, 글자 크기도 분박 수 때문에 줄지 않는다(율명 글자가 안 줄어드는 것과 같은
  // 규칙). 가사 글자 수가 율 수보다 많을 때만 예전처럼 가사 기준 등분으로 물러난다.
  function drawLyricCell(svg, x, yTop, width, cellH, content, family, melContent) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const melRows = (melContent || "").split(/\s+/).filter(Boolean);
    const followMel = melRows.length > 1 && rows.length <= melRows.length;
    const centers = followMel
      ? melodyRowCenters(melRows, yTop, cellH)
      : rows.map(function (_, i) { return yTop + (cellH / rows.length) * (i + 0.5); });
    // 글자 크기는 분박·글자 수와 무관하게 문서 전체 한 가지 — 율명 글자가 행 수와
    // 무관하게 고정인 것과 같은 규칙(행이 많으면 촘촘해질 뿐 줄어들지 않는다).
    // 여기에 '가사 크기' 슬라이더 배율만 곱한다(여러 글자 행의 넘침 방지 캡은 배율과 무관).
    const fs = Math.min(width * 0.86, cellH * 0.7) * lyricsScaleCur;
    rows.forEach(function (str, i) {
      if (str === "-") return;   // '-'는 자리표 — 자리(행 순서)만 차지하고 그리지는 않는다
      // 한 행에 여러 글자('더지' 등)면 옆을 침범하지 않게 맞추되, 글자 크기는 조금만
      // 줄이고 나머지는 자간 압축(textLength)으로 해결 — 등분 축소보다 글자가 훨씬 크다
      const len = Array.from(str).length;
      const rowFs = len > 1 ? Math.min(fs, (width * 1.3) / len) : fs;
      const t = el("text", { x: x + width / 2, y: centers[i] + rowFs * 0.36, "text-anchor": "middle",
        "font-size": rowFs, "font-family": family || CJK, "font-weight": 500, fill: "#000" });
      if (len > 1 && rowFs * len > width * 0.94) {
        t.setAttribute("textLength", width * 0.94);
        t.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
      t.textContent = str;
      svg.appendChild(t);
    });
  }

  // 한 칸(정간) 그리기: 공백=줄바꿈(행, 위→아래 / 2분박·3분박…), 붙임=가로 배치(왼→오른쪽)
  function drawCell(svg, x, yTop, cell, content, gakIdx, cellIdx, pageIdx) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const nRows = rows.length;
    let symK = -1;   // 이 정간 안의 기호(시김새) 순번 (원본 {…} 등장 순서)
    const rawRowToks = rows.map(tokenizeNotes);
    // 숨표(<)는 음표처럼 자리를 차지하지 않고 이 정간 오른쪽-아래 모서리에 한 번만 고정 표시된다.
    // 어느 행에 섞여 있든 상관없이 감지만 하고, 배치 계산에서는 제외한다.
    const hasBreath = rawRowToks.some(function (toks) { return toks.some(function (tk) { return tk.breath; }); });
    const rowToks = rawRowToks.map(function (toks) { return toks.filter(function (tk) { return !tk.breath; }); });
    // 붙임 시김새(음표 오른쪽에 작게 붙는 것)는 별도 칸을 차지하지 않으므로
    // 그룹핑(groupRowTokens) 후의 칸 수로 넓힘 여부를 판단한다 — 그래야 시김새가
    // 붙어도 음표 글자 자체 크기가 줄어들지 않는다.
    const maxCols = Math.max.apply(null, rowToks.map(function (t) { return groupRowTokens(t).length; }));

    // 글자 크기는 행 수와 무관하게 곡 전체가 하나의 기준(3행 기준)을 쓴다 —
    // 한 글자 정간이라고 따로 커지지 않고, '율명 크기' 슬라이더 하나로만 조절된다.
    // 한 정간에 가로로 여러 '주 글자'(붙임 시김새 제외)가 있으면 넘침 방지로만 추가 축소.
    const ROWS_REF = 3;
    let gs = (cell * 0.90) / ROWS_REF;
    if (maxCols > 1) gs = Math.min(gs, (cell * 0.86) / maxCols);
    const gsBase = gs;    // 시김새 기준 크기 — 율명 크기 배율(noteScaleCur)을 타지 않도록 배율 적용 전 값을 남겨둠
    gs *= noteScaleCur;   // 율명 크기 배율 — 이제 음표 글자(drawGlyph)에만 적용됨
    // 넘침 방지 캡은 배율 적용 뒤에도 다시 건다 — 안 걸면 배율을 키웠을 때
    // 가로 두 글자(하하배임 둘 등)가 정간 좌우 선을 침범한다(이 경우에만 글자가 줄어듦)
    if (maxCols > 1) gs = Math.min(gs, (cell * 0.86) / maxCols);

    const rowH = cell / nRows;
    // 이음(-)만 홀로 있는 분박 행은 세로 비중을 줄여(전통 정간보 관행) 낮게 눌러 그린다.
    // 그 행이 좁아진 만큼 남는 세로 공간을 음표 행들이 나눠 가져 가운데로 모인다.
    // (분박이 한 줄뿐이면 비교 대상이 없어 적용하지 않음)
    const isTieOnlyRow = function (t) { return nRows > 1 && t.length === 1 && t[0].literal === "-"; };
    const rowWeights = rowToks.map(function (t) { return isTieOnlyRow(t) ? TIE_ROW_WEIGHT : 1; });
    const hasTieRow = rowWeights.some(function (w) { return w !== 1; });
    const totalWeight = rowWeights.reduce(function (a, b) { return a + b; }, 0);
    // 가중치 기반 행 상단 위치(누적) — 이음 행이 있을 때만 이 배치를 쓴다
    const rowTops = [];
    { let acc = 0; for (let r = 0; r < nRows; r++) { rowTops.push(acc); acc += cell * rowWeights[r] / totalWeight; } }
    for (let ri = 0; ri < nRows; ri++) {
      let cyc;
      if (hasTieRow) {
        cyc = yTop + rowTops[ri] + (cell * rowWeights[ri] / totalWeight) / 2;
      } else if (nRows === 2) {
        const halfGap = (rowH / 2) * PAIR_GAP_SCALE;
        cyc = (ri === 0) ? (yTop + cell / 2 - halfGap) : (yTop + cell / 2 + halfGap);
      } else {
        cyc = yTop + rowH * (ri + 0.5);        // 행 세로 중심 (ri=0 위)
      }
      const toks = rowToks[ri];
      const tieOnly = rowWeights[ri] !== 1;   // 이 행이 이음(-) 단독 행인지

      // 토큰을 [주 글자(음표/독립기호) + 붙임 시김새] 그룹으로 묶는다
      const groups = groupRowTokens(toks);

      const n = groups.length || 1;
      const colW = cell / n;
      // 가로로 정확히 두 글자가 나란히 올 때도(분박 세로 두 줄과 같은 이유로) 간격을
      // 20% 좁힌다 — 정간 가로 중심을 기준으로 두 중심을 그만큼만 벌린다.
      const twoColHalfGap = (n === 2) ? (colW / 2) * PAIR_GAP_SCALE : null;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const cx = twoColHalfGap != null
          ? (x + cell / 2 + (gi === 0 ? -twoColHalfGap : twoColHalfGap))
          : x + colW * (gi + 0.5);
        if (g.main.sym != null) {
          symK++;
          // 음길이가 있는(독립 칸을 차지하는) 시김새는 조금 작게 그림 — 시김새(ORN_CAT에 있는 것)는
          // 율명 크기 배율을 안 타도록 gsBase(배율 적용 전) 기준으로 그린다. ORN_CAT에 없는 기호
          // (쉼 등)는 음표와 같은 취급이라 여전히 gs(배율 적용) 기준.
          const symBase = ORN_CAT[g.main.sym] ? gsBase : gs;
          const mainBox = symBase * 1.06 * (ORN_CAT[g.main.sym] === "with" ? 0.8 : 1)
            * (SYM_EXTRA_SCALE[g.main.sym] || 1);
          drawAdjSym(svg, g.main, cx, cyc, mainBox, cell, gakIdx, cellIdx, pageIdx, symK);
        }
        else drawGlyph(svg, g.main, cx, cyc, tieOnly ? gs * TIE_ROW_GLYPH : gs);
        // 붙임 시김새: 주 글자 오른쪽에 작게 (여러 개면 세로로 쌓음) —
        // 덧길이표만 예외로 왼쪽에 붙는다(정간보 관행). symK는 화면에 그리는 자리(좌/우)와
        // 무관하게 원문(글자) 등장 순서로 먼저 매겨야 시김새 미세조정(클릭 선택)이 안 어긋난다.
        // 붙임표는 전부 시김새라 크기는 항상 gsBase 기준(율명 크기 배율 미적용).
        if (g.att.length) {
          const groupRight = x + colW * (gi + 1);
          const groupLeft = x + colW * gi;
          const saBase = Math.min(gsBase * 0.55, colW * 0.34);
          const items = g.att.map(function (tk) {
            // 확대는 붙임표(wo류)에만 적용 — 퇴성·추성처럼 붙어오는 것들은 원래 크기 유지
            const scale = (ORN_CAT[tk.sym] === "wo" && !ATT_SCALE_KEEP.has(tk.sym)) ? ATT_EXTRA_SCALE : 1;
            const box = saBase * scale * (ATT_SYM_SCALE[tk.sym] || 1);
            symK++;
            return { tk: tk, box: box, k: symK, left: tk.sym === "len-double" };
          });
          [false, true].forEach(function (onLeft) {
            const list = items.filter(function (it) { return it.left === onLeft; });
            if (!list.length) return;
            const sa = Math.max.apply(null, list.map(function (it) { return it.box; }));
            // 커진 크기만큼 글자 쪽 여백을 살짝 더 줌(글자와의 간격 조정)
            const ax = onLeft
              ? Math.max(cx - gs * 0.47 - sa * 0.5, groupLeft + sa * 0.55)
              : Math.min(cx + gs * 0.47 + sa * 0.5, groupRight - sa * 0.55);
            const total = list.length;
            list.forEach(function (it, ai) {
              const ay = cyc + (ai - (total - 1) / 2) * sa * 1.08;
              drawAdjSym(svg, it.tk, ax, ay, it.box, cell, gakIdx, cellIdx, pageIdx, it.k);
            });
          });
        }
      }
    }

    // 숨표(<) — 정간을 다 채운 뒤 숨 쉬는 자리. 항상 그 정간의 오른쪽-아래 모서리에 고정.
    if (hasBreath) {
      const bs = cell * 0.32;
      const bx = x + cell + bs * 0.15, by = yTop + cell;
      const bt = el("text", { x: bx, y: by + bs * 0.32, "text-anchor": "middle",
        "font-size": bs, "font-family": NOTE_FONT, "font-weight": 700, fill: "#111" });
      bt.textContent = "<";
      svg.appendChild(bt);
    }
  }

  // 주 글자 하나(음표 / 독립 기호 / 글자)를 (cx,cyc) 중심, size 크기로 그림
  // 악보에 그려지는 율명(음이름) 글자만 표기 기본 크기보다 1.1배 키움(기호·한자 통과 문자는 그대로)
  const YUL_SCORE_SCALE = 1.15;
  // 이음(-) 표시를 가로로만 늘려서(세로는 그대로) 정간 안에서 너무 짧아 보이지 않게 함
  const TIE_STRETCH = 1.95;
  // 전통 정간보 관행: 한 분박 행에 이음(-)만 홀로 있을 때, 그 행을 한자(음표) 행보다
  // 낮게 눌러 그린다 — 세로 높이 비중(TIE_ROW_WEIGHT, 한자 행=1)을 줄이면 남는 공간을
  // 음표 행들이 나눠 가져 가운데로 모이고, 글자 자체(TIE_ROW_GLYPH)도 살짝 작게 그려
  // '-' 가 음표보다 튀지 않아 가시성이 좋아진다. (분박이 여러 줄일 때만 적용)
  const TIE_ROW_WEIGHT = 0.68;
  const TIE_ROW_GLYPH = 0.85;
  // 정간 안에 음이 정확히 둘일 때는(세로 두 줄=분박이든, 가로 두 글자든) 간격(자간)이
  // 다른 경우보다 헐렁해 보여서 정간 중심을 기준으로 살짝 좁혀 그린다(셋 이상은 균등 분할).
  // drawCell(율명)과 melodyRowCenters(가사 정렬)가 같은 값을 써야 나란히 앉는다.
  const PAIR_GAP_SCALE = 0.8;

  function drawGlyph(svg, tk, cx, cyc, size) {
    // 특수 율명(유니코드 없음, SPECIAL_NOTES) — 전용 이미지를 한자 글자와 같은 크기로.
    // 한글 표기 모드에도 이미지 그대로(하배/중청 같은 접두어 체계 밖의 음이라 글자가 없다).
    if (tk.file) { drawSymImage(svg, tk.file, cx, cyc, size * YUL_SCORE_SCALE); return; }
    let file = null;
    if (tk.sym) file = symURL(tk.sym) ? tk.sym : null;

    if (file) {
      drawSymImage(svg, file, cx, cyc, size * 1.06);
      return;
    }
    if (noteMode === "hangul" && tk.literal == null && tk.sym == null && tk.base != null) {
      const txt = octPrefix(tk.oct) + tk.base;
      // 하배/중청 등 접두어가 붙어 여러 글자면 정간 폭에 맞춰 글자 크기를 줄인다
      const fs = (txt.length >= 3 ? size * 0.5 : txt.length === 2 ? size * 0.68 : size) * YUL_SCORE_SCALE;
      const t = el("text", { x: cx, y: cyc + size * 0.34, "text-anchor": "middle",
        "font-size": fs, "font-family": NOTE_FONT, fill: "#111" });
      t.textContent = txt; svg.appendChild(t);
      return;
    }
    // 폰트 폴백: ① 옥타브 변형 한자(폰트 지원 시) ② 기본자 + 옥타브 점(변형자 없는 조합은 옅은 회색으로)
    const variant = (tk.base != null && tk.oct) ? octHanja(tk.base, tk.oct) : null;
    const noVariant = tk.oct && !variant && tk.base != null;
    const ch = tk.literal != null ? tk.literal
             : (tk.sym != null ? tk.sym : (variant || YUL[tk.base] || tk.base));
    const isNote = tk.base != null && tk.literal == null && tk.sym == null;
    const fs = isNote ? size * YUL_SCORE_SCALE : size;
    // 이음(-)은 글리프가 베이스라인 쪽에 낮게 찍혀 분박 행 안에서 살짝 아래로 보이므로
    // 기준 오프셋(0.34)보다 약간 위(0.28)에 놓아 세로 중심을 맞춘다
    const yOff = ch === "-" ? 0.28 : 0.34;
    const t = el("text", { x: cx, y: cyc + size * yOff, "text-anchor": "middle",
      "font-size": fs, "font-family": NOTE_FONT, fill: noVariant ? "#aaa" : "#111" });
    t.textContent = ch; svg.appendChild(t);
    if (ch === "-") {   // 이음(-) 표시가 짧아 보이지 않도록 가로로만 늘림(세로 굵기는 그대로)
      t.setAttribute("transform", "translate(" + cx + " 0) scale(" + TIE_STRETCH + " 1) translate(" + (-cx) + " 0)");
    }
    if (noVariant) {
      const dots = Math.abs(tk.oct), up = tk.oct > 0, r = Math.max(0.26, size * 0.07);
      for (let d = 0; d < dots; d++) {
        const dy = up ? (cyc - size * 0.52 - d * r * 3) : (cyc + size * 0.52 + d * r * 3);
        svg.appendChild(el("circle", { cx: cx, cy: dy, r: r, fill: "#aaa" }));
      }
    }
  }

  // 이미지(음표/기호) 한 개를 (cx,cyc) 중심, box 크기로 그림
  function drawSymImage(svg, key, cx, cyc, box) {
    const href = symURL(key) || (NOTE_DIR + key + ".png");
    const im = el("image", {
      x: cx - box / 2, y: cyc - box / 2, width: box, height: box,
      preserveAspectRatio: "xMidYMid meet"
    });
    im.setAttribute("href", href);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    svg.appendChild(im);
  }

  // 기호(시김새) 하나를 개별 조정값(adj) 적용해 그리고, 위치를 기록(수정 모드 히트용)
  function drawAdjSym(svg, tk, cx, cyc, baseBox, unit, gakIdx, cellIdx, pageIdx, k) {
    const adj = tk.adj || { sz: 100, dx: 0, dy: 0 };
    const box = baseBox * (adj.sz / 100);
    const px = cx + (adj.dx / 100) * unit;
    const py = cyc + (adj.dy / 100) * unit;
    if (symURL(tk.sym)) drawSymImage(svg, tk.sym, px, py, box);
    else {
      const t = el("text", { x: px, y: py + box * 0.34, "text-anchor": "middle",
        "font-size": box, "font-family": NOTE_FONT, fill: "#111" });
      t.textContent = tk.sym; svg.appendChild(t);
    }
    ornInstances.push({ gak: gakIdx, cell: cellIdx, k: k, page: pageIdx,
      x: px - box / 2, y: py - box / 2, w: box, h: box });
  }

  // ---------- 시김새 수정 모드 ----------
  // 선택된 시김새의 원본 토큰 {stem@sz,dx,dy}·[stem@sz,dx,dy]·(stem@sz,dx,dy) 정보를 찾는다
  function getOrnToken(sel) {
    if (!sel) return null;
    const parsed = parseMelodyOffsets(melodyFull);
    const c = parsed[sel.gak] && parsed[sel.gak][sel.cell];
    if (!c) return null;
    const raw = melodyFull.slice(c.start, c.end);
    const re = /\{[^}]*\}|\[[^\]]*\]|\([^)]*\)/g; let m, cnt = 0;
    while ((m = re.exec(raw))) {
      if (cnt === sel.k) {
        let inner = m[0].slice(1, -1), stem = inner, sz = 100, dx = 0, dy = 0;
        const at = inner.indexOf("@");
        if (at >= 0) {
          stem = inner.slice(0, at);
          const p = inner.slice(at + 1).split(",");
          sz = parseFloat(p[0]) || 100; dx = parseFloat(p[1]) || 0; dy = parseFloat(p[2]) || 0;
        }
        return { stem: stem, sz: sz, dx: dx, dy: dy, abs: c.start + m.index, len: m[0].length };
      }
      cnt++;
    }
    return null;
  }

  function hideOrnPanel() { $("ornPanel").classList.remove("on"); }

  function showOrnPanel() {
    const t = getOrnToken(ornSel);
    if (!t) { hideOrnPanel(); return; }
    const o = ORN_LIST.find(function (x) { return x.s === t.stem || x.k === t.stem; });
    $("ornName").textContent = (o ? o.k : t.stem) + " · " + Math.round(t.sz) + "%";
    $("ornPanel").classList.add("on");
  }

  function selectOrn(sel) { ornSel = sel; render(); showOrnPanel(); }

  function updateOrnParams(dSz, dDx, dDy, reset) {
    const t = getOrnToken(ornSel);
    if (!t) return;
    const cl = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    const sz = reset ? 100 : cl(t.sz + dSz, 40, 300);
    const dx = reset ? 0 : cl(t.dx + dDx, -90, 90);
    const dy = reset ? 0 : cl(t.dy + dDy, -90, 90);
    const inner = (sz === 100 && dx === 0 && dy === 0)
      ? t.stem : (t.stem + "@" + Math.round(sz) + "," + Math.round(dx) + "," + Math.round(dy));
    melodyFull = melodyFull.slice(0, t.abs) + "{" + inner + "}" + melodyFull.slice(t.abs + t.len);
    render();
    refreshEditorSlices();
    showOrnPanel();
  }
  // 드래그로 위치만 절대값으로 지정(크기는 그대로 유지) — 악보에서 직접 끌어서 옮길 때 씀
  function setOrnPositionAbsolute(dx, dy) {
    const t = getOrnToken(ornSel);
    if (!t) return;
    const cl = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    const sz = t.sz;
    const ndx = cl(Math.round(dx), -90, 90);
    const ndy = cl(Math.round(dy), -90, 90);
    const inner = (sz === 100 && ndx === 0 && ndy === 0)
      ? t.stem : (t.stem + "@" + Math.round(sz) + "," + ndx + "," + ndy);
    melodyFull = melodyFull.slice(0, t.abs) + "{" + inner + "}" + melodyFull.slice(t.abs + t.len);
    render();
    refreshEditorSlices();
    showOrnPanel();
  }

  // 선택된 시김새 토큰을 통째로 지운다(Backspace/Delete 키 또는 패널의 '삭제' 버튼)
  function deleteSelectedOrn() {
    const t = getOrnToken(ornSel);
    if (!t) return;
    melodyFull = melodyFull.slice(0, t.abs) + melodyFull.slice(t.abs + t.len);
    ornSel = null;
    hideOrnPanel();
    render();
    refreshEditorSlices();
  }

  // ---------- 자유 텍스트 주석(대여음 등) ----------
  function svgPointFromEvent(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }

  // 드래그: 이동 중엔 transform만 갱신(재렌더 없음, 끊김 방지) → 놓을 때 좌표를 확정하고 한 번만 render().
  // 움직이지 않고 뗀 경우(클릭)는 이동이 아니라 선택(크기·삭제 패널 토글)로 처리한다.
  function attachTextDrag(holder, t, svg) {
    let dragging = false, moved = false, startPt = null;
    holder.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (cellEditInput) commitCellEditor(false);
      dragging = true; moved = false;
      startPt = svgPointFromEvent(svg, e);
      try { holder.setPointerCapture(e.pointerId); } catch (_e) {}
    });
    holder.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      const p = svgPointFromEvent(svg, e);
      const dx = p.x - startPt.x, dy = p.y - startPt.y;
      if (!moved && (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6)) moved = true;
      if (moved) holder.setAttribute("transform", "translate(" + dx + " " + dy + ")");
    });
    function finish(e) {
      if (!dragging) return;
      dragging = false;
      try { holder.releasePointerCapture(e.pointerId); } catch (_e) {}
      if (moved) {
        const p = svgPointFromEvent(svg, e);
        const dx = p.x - startPt.x, dy = p.y - startPt.y;
        const vb = svg.viewBox.baseVal;
        t.xf = Math.max(0, Math.min(1, t.xf + dx / vb.width));
        t.yf = Math.max(0, Math.min(1, t.yf + dy / vb.height));
        render();
        syncTextPanel();
      } else {
        textSel = (textSel === t.id) ? null : t.id;
        render();
        syncTextPanel();
      }
    }
    holder.addEventListener("pointerup", finish);
    holder.addEventListener("pointercancel", finish);
  }

  function addCustomText(text) {
    text = text.trim();
    if (!text) return;
    const n = customTexts.length;
    const id = nextTextId++;
    // 새로 추가할 때마다 살짝 어긋난 자리에 놓아 겹치지 않게 함
    customTexts.push({ id: id, text: text, xf: Math.min(0.82, 0.1 + (n % 6) * 0.06),
      yf: Math.min(0.72, 0.1 + (n % 6) * 0.05), size: 6 });
    textSel = id;
    render();
    renderTextList();
    syncTextPanel();
  }

  function deleteCustomText(id) {
    customTexts = customTexts.filter(function (t) { return t.id !== id; });
    if (textSel === id) textSel = null;
    render();
    renderTextList();
    syncTextPanel();
  }

  function renderTextList() { renderTextItems(); }

  // 아래 편집 독 '텍스트' 탭 — 텍스트별 내용·방향·크기·자간 조절 목록
  function renderTextItems() {
    const list = $("textItemList");
    if (!list) return;
    list.innerHTML = "";
    if (!customTexts.length) {
      const empty = document.createElement("div");
      empty.className = "tx-empty";
      empty.textContent = "아직 추가한 텍스트가 없습니다. 위 칸에 내용을 적고 '추가'를 누르세요.";
      list.appendChild(empty);
      return;
    }
    customTexts.forEach(function (t) {
      const row = document.createElement("div");
      row.className = "tx-item";
      const txt = document.createElement("input");
      txt.type = "text"; txt.value = t.text; txt.title = "내용";
      txt.addEventListener("input", function () { t.text = txt.value; render(); });
      const dirLab = document.createElement("label");
      dirLab.appendChild(document.createTextNode("방향"));
      const dir = document.createElement("select");
      [["v", "세로"], ["h", "가로"]].forEach(function (o) {
        const op = document.createElement("option");
        op.value = o[0]; op.textContent = o[1]; dir.appendChild(op);
      });
      dir.value = t.orient === "h" ? "h" : "v";
      dir.addEventListener("change", function () { t.orient = dir.value; render(); });
      dirLab.appendChild(dir);
      const szLab = document.createElement("label");
      szLab.appendChild(document.createTextNode("크기(mm)"));
      const sz = document.createElement("input");
      sz.type = "number"; sz.min = "2"; sz.max = "30"; sz.step = "0.5"; sz.value = t.size;
      // 숫자 타이핑 칸은 [확인]/Enter로만 적용 — 다른 숫자 입력칸들과 동일한 규칙
      wireConfirm(sz, function () {
        const v = parseFloat(sz.value);
        if (!isNaN(v)) { t.size = Math.max(2, Math.min(30, v)); render(); }
      });
      szLab.appendChild(sz);
      const spLab = document.createElement("label");
      spLab.appendChild(document.createTextNode("자간(mm)"));
      const sp = document.createElement("input");
      sp.type = "number"; sp.min = "-3"; sp.max = "20"; sp.step = "0.5"; sp.value = t.spacing || 0;
      wireConfirm(sp, function () {
        const v = parseFloat(sp.value);
        if (!isNaN(v)) { t.spacing = Math.max(-3, Math.min(20, v)); render(); }
      });
      spLab.appendChild(sp);
      const colLab = document.createElement("label");
      colLab.appendChild(document.createTextNode("색"));
      const col = document.createElement("input");
      col.type = "color"; col.value = t.color || "#111111"; col.title = "글자 색";
      col.addEventListener("input", function () { t.color = col.value; render(); });
      colLab.appendChild(col);
      const del = document.createElement("button");
      del.type = "button"; del.className = "tx-del"; del.textContent = "×"; del.title = "삭제";
      del.addEventListener("click", function () { deleteCustomText(t.id); });
      row.appendChild(txt); row.appendChild(dirLab); row.appendChild(szLab);
      row.appendChild(spLab); row.appendChild(colLab); row.appendChild(del);
      list.appendChild(row);
    });
  }

  function hideTextPanel() { $("textPanel").classList.remove("on"); }

  function showTextPanel() {
    const t = customTexts.find(function (x) { return x.id === textSel; });
    if (!t) { hideTextPanel(); return; }
    $("textPanelName").textContent = t.text;
    $("textPanel").classList.add("on");
  }

  // textSel 상태에 맞춰 패널을 열고/닫음 — render() 뒤에 짝지어 부르면 항상 최신 상태를 반영한다
  function syncTextPanel() { if (textSel != null) showTextPanel(); else hideTextPanel(); }

  function updateTextSize(delta) {
    const t = customTexts.find(function (x) { return x.id === textSel; });
    if (!t) return;
    t.size = Math.max(2, Math.min(30, t.size + delta));
    render();
    showTextPanel();
  }

  function render() {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const gakPerRow = Math.max(1, parseInt($("gakPerRow").value) || 1);

    const autoStack = stackFor(beats);
    const stackAuto = $("stackAuto").checked;
    $("stackCount").disabled = stackAuto;
    if (stackAuto) $("stackCount").value = autoStack;
    const stack = stackAuto ? autoStack : Math.max(1, Math.min(12, parseInt($("stackCount").value) || autoStack));

    const titleTxt = $("title").value.trim();
    const subTxt = $("subtitle").value.trim();
    const wantHeader = $("header").checked;
    const wantFrame = $("frame").checked;
    const wantJangdan = $("wantJangdan").checked;
    document.body.classList.toggle("want-jangdan", wantJangdan);
    const wantLyrics = $("wantLyrics").checked;
    document.body.classList.toggle("want-lyrics", wantLyrics);
    const wantTempo = $("wantTempo").checked;
    const gakNumMode = $("gakNumMode").value;   // 각 번호: none | screen(화면에만) | all(출력 포함)
    document.body.classList.toggle("gaknum-screen", gakNumMode === "screen");
    const pageNumPos = $("pageNumPos").value;   // 쪽 번호 위치 — 페이지 루프 밖에서 한 번만 조회
    const tempoStr = "一分・" + numToHanja(Math.max(1, parseInt($("tempoBpm").value) || 60)) + "井";
    const dg = parseDaegang($("daegang").value, beats);
    noteMode = $("noteMode").value;   // "font" | "hangul"

    const sizeScale = Math.max(0.3, parseFloat($("sizeScale").value) || 1);
    $("sizeScaleVal").textContent = sizeScale.toFixed(1) + "×";
    noteScaleCur = Math.max(0.5, parseFloat($("noteScale").value) || 1);
    $("noteScaleVal").textContent = noteScaleCur.toFixed(2).replace(/0$/, "") + "×";
    lyricsScaleCur = Math.max(0.5, parseFloat($("lyricsScale").value) || 1);
    $("lyricsScaleVal").textContent = lyricsScaleCur.toFixed(2).replace(/0$/, "") + "×";
    const desiredCell = Math.max(2, parseFloat($("cellSize").value) || 11) * sizeScale;
    // 가사를 켜면 각 오른쪽에 가사 칸이 붙어 이미 사이가 벌어지므로, 원래 각 간격은 0.7배로 줄인다
    const desiredGap = Math.max(0, parseFloat($("gakGap").value) || 0) * sizeScale
      * (wantLyrics ? 0.7 : 1);
    const desiredBandGap = Math.max(0, parseFloat($("bandGap").value) || 0) * sizeScale;
    const desiredTitle = Math.max(1, parseFloat($("titleSize").value) || 10);
    const desiredTitleOff = parseFloat($("titleOffset").value) || 0;
    const desiredTitleOffX = parseFloat($("titleOffsetX").value) || 0;
    const desiredTitleSpacing = parseFloat($("titleSpacing").value) || 0;
    const desiredSub = Math.max(1, parseFloat($("subSize").value) || 5);
    const desiredSubOff = parseFloat($("subOffset").value) || 0;
    const desiredSubOffX = parseFloat($("subOffsetX").value) || 0;
    const desiredSubSpacing = parseFloat($("subSpacing").value) || 0;
    const titleFontFam = $("titleFont").value || CJK;
    const lyricsFontFam = $("lyricsFont").value || CJK;

    const landscape = $("orientation").value === "landscape";
    document.body.classList.toggle("landscape", landscape);
    const PW = landscape ? PAGE_H : PAGE_W;
    const PH = landscape ? PAGE_W : PAGE_H;
    const ps = $("pageStyle");
    if (ps) ps.textContent = "@page { size: A4 " + (landscape ? "landscape" : "portrait") + "; margin: 0; }";

    // 페이지 채움(0~100%) — 키울수록 페이지 여백을 줄이되, 100%여도 최소 여백(MARGIN_MIN)은 남긴다
    const pageFillPct = Math.max(0, Math.min(100, parseFloat($("pageFill").value) || 0));
    $("pageFillVal").textContent = Math.round(pageFillPct) + "%";
    const MARGIN = MARGIN_MIN + (MARGIN_BASE - MARGIN_MIN) * (1 - pageFillPct / 100);

    const frameX = MARGIN, frameY = MARGIN;
    const frameW = PW - 2 * MARGIN, frameH = PH - 2 * MARGIN;
    const availW = frameW - 2 * INNER_PAD;
    const availH = frameH - 2 * INNER_PAD;

    // 제목이 차지할 각(열) 수 — 가로(맨 위) 제목은 오른쪽 칸을 쓰지 않음
    const titleTopMode = !!titleTxt && $("titleLayout").value === "top";
    let titleGak = 0;
    if (titleTxt && !titleTopMode) {
      titleGak = gakPerRow >= 6 ? 2 : 1;
      if (gakPerRow - titleGak < 1) titleGak = Math.max(0, gakPerRow - 1);
    }

    // 멜로디(내용) 파싱 — 에디터 조각이 아니라 곡 전체 원본을 그린다
    const parsed = parseMelodyOffsets(melodyFull);
    const jdParsed = wantJangdan ? parseMelodyOffsets($("jangdan").value) : null;
    const lyParsed = wantLyrics ? parseMelodyOffsets(lyricsFull) : null;

    // 페이지 용량 + 실제로 그릴 각 수
    // 제목 칸은 첫 페이지 전체 높이를 차지하므로(한 통 상자), 첫 페이지의 모든 밴드가
    // 제목 자리만큼 각 수가 줄어든다 — 밴드끼리 폭이 같아져 좌우가 어긋나 보이지 않는다.
    const cap0 = Math.max(1, gakPerRow - titleGak);
    // 장단 줄은 악곡 맨 처음 각 옆의 '한 각 자리'를 차지한다 — 그래서 맨 처음 밴드는
    // 각이 하나 줄어들고, 대신 모든 밴드의 폭이 같아져 위아래가 어긋나지 않는다.
    const jdSlot = wantJangdan ? 1 : 0;
    const page0cap = Math.max(1, cap0 * stack - jdSlot); // 첫 페이지(제목 포함, 모든 밴드 동일 폭)
    const pageNcap = gakPerRow * stack;                 // 이후 페이지
    const wantGak = !gakUserSet ? page0cap
                                : Math.max(1, parseInt($("gakCount").value) || 1);
    if (!gakUserSet) $("gakCount").value = wantGak;

    // 각을 페이지·밴드에 분배
    const pages = [];
    let remaining = wantGak;
    while (remaining > 0 && pages.length < 300) {
      const isFirst = pages.length === 0;
      const pcap = isFirst ? page0cap : pageNcap;
      const perBand = isFirst ? cap0 : gakPerRow;
      const take = Math.min(pcap, remaining);
      const bands = [];
      let leftover = take;
      while (leftover > 0 && bands.length < stack) {
        const capThis = Math.max(1, perBand - ((isFirst && bands.length === 0) ? jdSlot : 0));
        const bn = Math.min(capThis, leftover); bands.push(bn); leftover -= bn;
      }
      pages.push({ bands: bands, hasTitle: isFirst && titleGak > 0 });
      remaining -= take;
    }

    // 텍스트 에디터 페이지 넘김용: 페이지별 각(줄) 범위 기록
    pageGakRanges = [];
    let rangeAcc = 0;
    pages.forEach(function (p) {
      const n = p.bands.reduce(function (a, b) { return a + b; }, 0);
      pageGakRanges.push({ start: rangeAcc, end: rangeAcc + n });
      rangeAcc += n;
    });
    if (edPage >= pages.length) edPage = pages.length - 1;
    updateEdPagers();

    // 가사 줄(정간 오른쪽 좁은 칸) 너비 — 켜져 있으면 각(정간)마다 매번 추가됨
    const desiredLyGap = wantLyrics ? desiredGap * 0.18 : 0;
    const desiredLyW = wantLyrics ? desiredCell * 0.4 : 0;
    const desiredLyExtra = desiredLyGap + desiredLyW;
    // 모든 페이지 공통 스케일(가장 꽉 찬 페이지 기준) → 페이지끼리 크기 일치.
    // 폭은 밴드마다 실제로 그려지는 구성(각 + 각별 가사 칸 + 장단 칸(가사 자리 포함) +
    // 제목 칸)을 그대로 합산해 가장 넓은 밴드를 기준으로 잡는다 — 예전 근사식은
    // 장단 칸이 가사 자리(lyExtra)까지 차지하는 걸 빼먹어, 장단+가사 문서에서 장단
    // 밴드가 가장 넓으면(한 줄 악보 등) 내용이 프레임 왼쪽으로 삐져나갔다.
    let maxBands = 1;
    let wCells = 1, wGaps = 0, wLys = 0;   // 가장 넓은 밴드의 (정간 칸, 간격, 가사 칸) 개수
    {
      let bestW = -1;
      pages.forEach(function (p, pi) {
        p.bands.forEach(function (m, i) {
          let cells = m, gaps = m - 1, lys = wantLyrics ? m : 0;
          if (pi === 0 && i === 0 && jdSlot) { cells += 1; gaps += 1; if (wantLyrics) lys += 1; }
          if (p.hasTitle) { cells += titleGak; gaps += titleGak; }   // 제목 칸 + titleGutter(간격 1개)
          const w = cells * desiredCell + gaps * desiredGap + lys * desiredLyExtra;
          if (w > bestW) { bestW = w; wCells = cells; wGaps = gaps; wLys = lys; }
        });
        if (p.bands.length > maxBands) maxBands = p.bands.length;
      });
    }
    const desiredJdGap = wantJangdan ? desiredGap : 0;
    const desiredJdW = wantJangdan ? desiredCell : 0;
    const headRatio = wantHeader ? 1.1 : 0;
    const wNeed = wCells * desiredCell + wGaps * desiredGap + wLys * desiredLyExtra;
    const hNeed = maxBands * (beats + headRatio) * desiredCell + (maxBands - 1) * desiredBandGap;
    const scale = Math.min(1, availW / wNeed, availH / hNeed);

    const cell = desiredCell * scale;
    const gap = desiredGap * scale;
    let bandGap = desiredBandGap * scale;
    // 템포 표시(一分・XX井) — 맨 처음 각 위, 첫 페이지에만. 세로 여유 계산에도 쓰므로 먼저 구한다.
    const tempoFont = cell * 0.42;
    const tempoLineH = tempoFont * 1.12;
    const tempoGap = tempoFont * 0.45;   // 텍스트와 격자 사이 여백
    const tempoH = wantTempo ? (Array.from(tempoStr).length * tempoLineH + tempoGap) : 0;
    // 가로 제목(맨 위 밴드 위 중앙) — 첫 페이지 위쪽에 제목(+부제) 높이를 예약한다
    const titleTopFont = desiredTitle * scale;
    const titleTopSubFont = desiredSub * scale;
    const titleTopH = titleTopMode
      ? (titleTopFont * 1.35 + (subTxt ? titleTopSubFont * 1.5 : 0)) : 0;
    // 가로(폭)는 이미 꽉 차서 더 못 키워도, 세로에 남는 여유는 '페이지 채움' 비율만큼
    // (위 여백 + 밴드 사이 간격들 + 아래 여백)에 고르게 나눠 넣는다 — 밴드 사이만
    // 무작정 벌어지지 않고 전체가 비율 있게 넓어진다. 남은 몫은 가운데 정렬 여백이 된다.
    if (maxBands > 1 && pageFillPct > 0) {
      const hUsedAtScale = maxBands * (beats + headRatio) * cell + (maxBands - 1) * bandGap;
      const leftoverH = availH - tempoH - titleTopH - hUsedAtScale;   // 템포·가로 제목 높이 제외
      if (leftoverH > 0.01) bandGap += (pageFillPct / 100) * leftoverH / (maxBands + 1);
    }
    const jdGap = desiredJdGap * scale;
    const jdW = desiredJdW * scale;
    const jdExtraFull = jdGap + jdW;   // 첫 각 옆 장단 줄이 차지하는 폭(한 각 자리와 동일)
    const lyGap = desiredLyGap * scale;
    const lyW = desiredLyW * scale;
    const lyExtraFull = lyGap + lyW;   // 각(정간)마다 오른쪽 가사 줄이 차지하는 폭(간격 포함)
    hiLyGap = lyGap; hiLyW = lyW; hiLyricsOn = wantLyrics;   // 가사 줄 하이라이트용 치수
    const headH = cell * headRatio;
    const slot = cell + gap + (wantLyrics ? lyExtraFull : 0);
    const bandH = headH + beats * cell;
    const titleGutter = gap;   // 격자 ↔ 제목 칸 사이 여유(다른 각 사이 간격과 동일)
    const gridTotalW = wCells * cell + wGaps * gap + wLys * lyExtraFull;
    const titleWidth = titleGak > 0 ? (titleGak * cell + (titleGak - 1) * gap) : 0;
    // 프레임·가운데 정렬은 '실제로 보이는' 오른쪽 끝 기준 — 맨 오른쪽 가사 자리가 모든
    // 밴드에서 비어 있으면(장단 칸 옆은 늘 빈 띠, 내용 없이 열린 가사 열) 그 폭만큼
    // 프레임을 줄이고 중앙정렬도 보이는 폭으로 잡는다. 어느 한 밴드라도 오른쪽 끝을
    // 실제로 쓰면(닫힌 가사 열·세로 제목 칸) 프레임은 전체 폭을 유지한다.
    let rightInset = Infinity;
    {
      let acc = 0;
      pages.forEach(function (p, pi) {
        p.bands.forEach(function (m, i) {
          let inset = 0;
          if (!p.hasTitle && wantLyrics) {
            if (pi === 0 && i === 0 && jdSlot) inset = lyExtraFull;
            else {
              const firstLy = lyParsed && lyParsed[acc];
              const has = !!(firstLy && firstLy.some(function (c) { return c && c.text; }));
              // 열린 가사 열(가로 제목 모드)이라도 내용이 있으면 글자가 그 자리를 차지한다
              if (!has) inset = lyExtraFull;
            }
          }
          if (inset < rightInset) rightInset = inset;
          acc += m;
        });
      });
      if (!isFinite(rightInset)) rightInset = 0;
    }
    const visibleW = gridTotalW - rightInset;

    const dgSet = new Set();
    if (dg.groups) { let a = 0; for (let k = 0; k < dg.groups.length - 1; k++) { a += dg.groups[k]; dgSet.add(a); } }

    stopPlayback();
    cellGeom = {}; jdGeom = {}; pageHi = []; playHi = []; pageSvgs = []; ornInstances = [];
    // 직접 입력 카드는 #sheet 밖(#sheetArea)에 있어 다시 그려도 살아남는다 —
    // 실시간 반영 중(keepCellEditor)이 아니면 구조가 바뀌는 것이므로 닫는다
    if (!keepCellEditor) closeCellEditor();
    const sheet = $("sheet"); sheet.innerHTML = "";
    let gakAccum = 0;

    pages.forEach(function (page, pageIdx) {
      const svg = el("svg", { viewBox: `0 0 ${PW} ${PH}`, xmlns: NS,
        "xmlns:xlink": "http://www.w3.org/1999/xlink" });
      const bgRect = rect(0, 0, PW, PH, 0, { fill: "#fff", stroke: "none" });
      // 빈 여백을 클릭하면 선택된 텍스트 주석의 크기·삭제 패널을 닫음
      bgRect.addEventListener("mousedown", function () {
        if (textSel != null) { textSel = null; hideTextPanel(); render(); }
      });
      svg.appendChild(bgRect);

      const usedBands = page.bands.length;
      const gridTotalH = usedBands * bandH + (usedBands - 1) * bandGap;
      // 격자(+제목 칸) 상자는 페이지 가로 중앙에 — 예전엔 오른쪽 여백선에 붙여 그려서
      // (오른쪽 정렬) 내용이 페이지보다 좁으면(전체 배율 축소·A4 맞춤 등) 남는 여백이
      // 전부 왼쪽으로 몰려 치우쳐 보였다. 각 진행(오른쪽→왼쪽)과 상자 위치는 별개.
      // 중앙정렬 기준은 보이는 폭(visibleW = gridTotalW - rightInset).
      const gridX = frameX + (frameW - visibleW) / 2;
      const pageTempoH = (wantTempo && pageIdx === 0) ? tempoH : 0;
      const pageTitleTopH = pageIdx === 0 ? titleTopH : 0;   // 가로 제목은 첫 페이지에만
      const pageTopExtra = pageTempoH + pageTitleTopH;
      const gridY = frameY + pageTopExtra + (frameH - pageTopExtra - gridTotalH) / 2;
      const bandRight = gridX + gridTotalW;

      // 바깥 테두리: 가로는 격자에 맞추고, 세로는 '페이지 채움' 비율에 따라
      // 0% = 정간보에 딱 붙는 상자 ~ 100% = 페이지 여백선까지 꽉 찬 상자 사이를 오간다.
      // 상자 위/아래 y는 제목 칸 세로선도 같이 쓰므로 페이지 스코프에 둔다.
      const fillT = pageFillPct / 100;
      const hugY = gridY - INNER_PAD, hugBottom = gridY + gridTotalH + INNER_PAD;
      const boxTop = hugY + (frameY - hugY) * fillT;
      const boxBottom = hugBottom + ((frameY + frameH) - hugBottom) * fillT;
      if (wantFrame) svg.appendChild(rect(gridX - INNER_PAD, boxTop,
        visibleW + 2 * INNER_PAD, boxBottom - boxTop, T_FRAME));

      // 편집 하이라이트 자리(내용 아래 레이어) — 인쇄·PNG 저장에는 나오지 않아야 하므로 no-print 표시
      const hi = rect(0, 0, 0, 0, 0, { fill: "#ffe680", "fill-opacity": "0.6", stroke: "none", class: "no-print" });
      hi.style.display = "none"; svg.appendChild(hi); pageHi.push(hi); pageSvgs.push(svg);
      // 재생 하이라이트 자리(내용 아래 레이어)
      const ph = rect(0, 0, 0, 0, 0, { fill: "#60a5fa", "fill-opacity": "0.5", stroke: "none", class: "no-print" });
      ph.style.display = "none"; svg.appendChild(ph); playHi.push(ph);

      // 정간 커스텀 테두리 — 각 칸에서 바로 그리지 않고 페이지 단위로 모아뒀다가,
      // 밴드 통줄·대강선까지 다 그려진 뒤에 한꺼번에 그린다. 그래야 '없음'(줄 숨김)의
      // 흰 마스크가 그 선들 위에 얹혀 실제로 숨겨지고, 굵은 선도 끊김 없이 이어진다.
      const cellBorderSegs = [];
      // 밴드 맨 위/아래 통줄·대강선은 악보의 뼈대라 '테두리 없음'으로도 지워지면 안 된다
      // — 마스크를 다 그린 뒤 이 목록으로 되살린다([x1,y1,x2,y2,굵기]).
      const structuralSegs = [];
      for (let b = 0; b < usedBands; b++) {
        const bandTop = gridY + b * (bandH + bandGap);
        const gridTop = bandTop + headH;
        const gridBottom = gridTop + beats * cell;
        const hasTitle = (b === 0 && page.hasTitle);
        const nMusic = page.bands[b];

        // 제목 칸은 페이지 단위로 한 통(프레임 위~아래)으로 그려지므로,
        // 자리는 그 페이지의 모든 밴드에서 똑같이 비워둔다(무조건 오른쪽 정렬).
        // 격자와 제목 칸 사이에는 넉넉한 여유(titleGutter)를 둔다.
        const musicRightEdge = page.hasTitle ? (bandRight - titleWidth - titleGutter) : bandRight;
        // 장단은 전체 악곡의 맨 처음 각(gakAccum===0) 옆에만 붙고, 한 각 자리(가사 폭 포함)를 차지함
        // — 그래야 아래 밴드들과 좌우 폭이 정확히 같아진다
        const bandJdExtra = (wantJangdan && gakAccum === 0)
          ? jdExtraFull + (wantLyrics ? lyExtraFull : 0) : 0;
        // 가사는 이 밴드의 각(정간)마다 매번 오른쪽에 붙으므로, 각 수만큼 폭이 늘어남
        const bandLyExtra = wantLyrics ? nMusic * lyExtraFull : 0;
        const musicLeft = musicRightEdge - (nMusic * cell + (nMusic - 1) * gap) - bandJdExtra - bandLyExtra;

        // 밴드 위/아래 통줄의 오른쪽 끝.
        // 제목이 있는 페이지는 모든 밴드의 통줄이 제목 칸 세로선까지 쭉 이어진다(예시 악보 방식).
        // 제목이 없으면 격자 오른쪽 끝까지 — 가사를 켰지만 맨 오른쪽 각의 가사가
        // 비어 있으면 그 빈 가사 자리는 선에서 뺀다.
        let capBase = musicRightEdge;
        let closeLyricCol = false;   // 맨 오른쪽이 내용 있는 가사 열이면 오른쪽 마감 세로선을 긋는다
        if (wantJangdan && gakAccum === 0) {
          // 맨 처음 밴드의 가장 오른쪽은 장단 칸 — 장단 칸엔 가사 자리가 없으므로
          // 통줄도 장단 칸 오른쪽 선에서 끝나야 튀어나오지 않는다
          capBase = musicRightEdge - (wantLyrics ? lyExtraFull : 0);
        } else if (wantLyrics) {
          // 가로(맨 위) 제목이면 오른쪽에 제목 칸이 없으므로, 맨 오른쪽 가사 열을
          // 상자로 감싸지 않고 열어 둔다(통줄도 각의 오른쪽 선까지만).
          const firstLy = lyParsed && lyParsed[gakAccum];
          const firstLyHasContent = firstLy && firstLy.some(function (c) { return c && c.text; });
          if (!firstLyHasContent || titleTopMode) capBase = musicRightEdge - lyExtraFull;
          else closeLyricCol = true;
        }
        const capRight = page.hasTitle ? (bandRight - titleWidth) : capBase;
        // '페이지 채움'이 켜져 있으면 구획 가로선이 왼쪽 테두리까지 닿는다(예시 악보 방식).
        // 0%(꺼짐)면 지금처럼 격자(각과 각을 잇는 범위)까지만 그린다.
        const capLeft = (wantFrame && pageFillPct > 0) ? (gridX - INNER_PAD) : musicLeft;

        if (wantHeader) svg.appendChild(line(capLeft, bandTop, capRight, bandTop, T_THICK));

        for (let m = 0; m < nMusic; m++) {
          // 장단은 맨 처음(가장 오른쪽) 자리를 차지하므로, 이 밴드의 모든 각이 그만큼 왼쪽으로 밀림.
          // 각마다 그 오른쪽에 가사 칸이 붙는 만큼도 함께 비워둠
          const x = musicRightEdge - cell - (wantLyrics ? lyExtraFull : 0) - m * slot - bandJdExtra;
          const melIdx = gakAccum + m;
          const gakCells = parsed[melIdx];

          // 이 각에 실제로 채워진 정간(|로 나뉜 칸) 수 — 글자를 그릴 범위(내용이 없으면 0).
          // 테두리·칸 구분선은 타이핑 중이라 |가 덜 채워져도 끊기지 않게 항상 beats 전체 높이로 그린다.
          const cellCount = gakCells ? gakCells.length : 0;
          const filled = cellCount > 0 ? Math.min(beats, cellCount) : 0;

          // 정간 배경색 — 글자·격자선보다 먼저 그려서 뒤에 깔리게 한다(출력에도 포함되어야 하므로 no-print 아님)
          for (let j = 0; j < beats; j++) {
            const cs = cellStyles[melIdx] && cellStyles[melIdx][j];
            if (cs && cs.fill) {
              svg.appendChild(rect(x, gridTop + j * cell, cell, cell, 0, { fill: cs.fill, stroke: "none" }));
            }
          }
          for (let j = 0; j < filled; j++) {
            const content = gakCells && gakCells[j] ? gakCells[j].text : "";
            if (content) drawCell(svg, x, gridTop + j * cell, cell, content, melIdx, j, pageIdx);
          }
          // 세로선·정간 구분 가로선 — 항상 전체 높이. 위/아래 마감은 밴드 통줄이, 대강선은 아래
          // 밴드 통줄과 같은 방식으로 각 사이 간격까지 끊기지 않게 따로 그린다(굵게, 밴드 전체 폭).
          svg.appendChild(line(x, gridTop, x, gridBottom, T_THICK));
          svg.appendChild(line(x + cell, gridTop, x + cell, gridBottom, T_THICK));
          for (let i = 1; i < beats; i++) {
            if (!dgSet.has(i)) svg.appendChild(line(x, gridTop + i * cell, x + cell, gridTop + i * cell, T_THIN));
          }
          // 정간 커스텀 테두리 — 선분만 모아두고 그리기는 밴드 루프가 끝난 뒤에(위 주석 참고)
          collectCellBorderSegs(cellBorderSegs, melIdx, x, gridTop, cell, beats);

          // 각 번호(보조) — 각 아래 옅은 회색 작은 숫자 (문서 탭 옵션, '화면에만'이면 출력에서 제외)
          if (gakNumMode !== "none") {
            const gnFont = cell * 0.26;
            const gn = el("text", { x: x + cell / 2, y: gridBottom + gnFont * 1.25,
              "text-anchor": "middle", "font-size": gnFont, fill: "#b3b3b3", "class": "gak-num" });
            gn.textContent = String(melIdx + 1);
            svg.appendChild(gn);
          }

          // 클릭·하이라이트 영역은 숨은 정간 포함 전체 beats (여전히 입력 가능)
          for (let j = 0; j < beats; j++) {
            const cyTop = gridTop + j * cell;
            (cellGeom[melIdx] = cellGeom[melIdx] || {})[j] = { page: pageIdx, x: x, y: cyTop, w: cell, h: cell };
            const hit = rect(x, cyTop, cell, cell, 0,
              { fill: "transparent", stroke: "none", "pointer-events": "all" });
            hit.style.cursor = "text";
            (function (gi, ci) {
              hit.addEventListener("mousedown", function (e) {
                e.preventDefault();
                if (ornEditMode) { ornSel = null; hideOrnPanel(); render(); return; }
                if (ornAddMode && ornAddArmed && inputMode === "direct") {
                  // 분박(스페이스로 나뉜 여러 음)이 있으면 클릭한 세로 위치로 어느 음인지 고른다
                  // (drawCell이 각 음을 위→아래 순서로 rowH씩 나눠 그리는 것과 같은 계산)
                  const content = gakCells && gakCells[ci] ? gakCells[ci].text : "";
                  const nRowsHere = Math.max(1, content.split(/\s+/).filter(Boolean).length);
                  const pt = svgPointFromEvent(svg, e);
                  const rowIdx = Math.max(0, Math.min(nRowsHere - 1, Math.floor((pt.y - cyTop) / (cell / nRowsHere))));
                  addOrnToCell(gi, ci, rowIdx);
                  return;
                }
                if (cellEditInput) commitCellEditor(false);
                // 기본 동작: 아직 클릭인지 드래그인지 모름 — mouseup에서 판가름한다
                // (다른 칸으로 번지면 드래그로 확정, 안 번기면 그냥 클릭 → 이 칸을 편집)
                melSelActive = true; melSelDidDrag = false;
                melSelStart = { gi: gi, ci: ci }; melSelEnd = { gi: gi, ci: ci };
                render();
              });
              hit.addEventListener("mouseenter", function () {
                if (!melSelActive) return;
                melSelDidDrag = true;
                melSelEnd = { gi: gi, ci: ci };
                render();
              });
            })(melIdx, j);
            svg.appendChild(hit);
          }

          // 템포 표시(一分・XX井) — 첫 페이지 맨 처음 각 위에만
          if (wantTempo && pageIdx === 0 && melIdx === 0) {
            const chars = Array.from(tempoStr);
            const frameTopY = bandTop - INNER_PAD;
            const startY = frameTopY - tempoGap - (chars.length - 1) * tempoLineH - tempoFont * 0.15;
            const tt = verticalText(x + cell / 2, startY, tempoStr, tempoFont, 600, "#000", NOTE_FONT);
            svg.appendChild(tt.g);
          }

          // 장단 줄(악곡 맨 처음 자리, 가장 오른쪽) — 켜져 있고, 악곡 맨 처음 각일 때만
          if (wantJangdan && melIdx === 0) {
            // 가사가 켜져 있으면 각들의 선 끝(가사 자리만큼 안쪽)에 맞춰 장단 칸도 같이 당김
            const jdRight = musicRightEdge - (wantLyrics ? lyExtraFull : 0), jdLeft = jdRight - jdW;
            // 장단 에디터 커서 하이라이트용 칸 좌표 (내용 유무와 무관하게 전체 박)
            for (let j = 0; j < beats; j++) {
              jdGeom[j] = { page: pageIdx, x: jdLeft, y: gridTop + j * cell, w: jdW, h: cell };
            }
            const jdCells = jdParsed && jdParsed[0];
            const jdCount = jdCells ? jdCells.length : 0;
            const jdFilled = jdCount > 0 ? Math.min(beats, jdCount) : 0;
            for (let j = 0; j < jdFilled; j++) {
              const content = jdCells[j] ? jdCells[j].text : "";
              if (content) drawJangdanCell(svg, jdLeft, gridTop + j * cell, jdW, cell, content);
            }
            // 클릭 영역 — 글자 그림(image) 위로 올려야(뒤에 appendChild) 그 위를 클릭해도 먹힌다
            for (let j = 0; j < beats; j++) {
              const jdHit = rect(jdLeft, gridTop + j * cell, jdW, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all" });
              jdHit.style.cursor = "text";
              (function (ci) {
                jdHit.addEventListener("mousedown", function (e) {
                  e.preventDefault();
                  if (ornEditMode) { ornSel = null; hideOrnPanel(); render(); return; }
                  if (cellEditInput) commitCellEditor(false);
                  if (inputMode === "editor") CELL_EDIT.jd.setCursor(0, ci, true);
                  else openCellEditor("jd", 0, ci);
                });
              })(j);
              svg.appendChild(jdHit);
            }
            // 장단 각은 선율(율명) 각과 구분되게 네 변 모두 조금 굵게 두른다
            // (1.8배는 너무 두꺼웠음 — 기본 각 선이 얇아진 만큼 1.5배로도 충분히 구분됨)
            const jdLineW = T_THICK * 1.5;
            svg.appendChild(line(jdLeft, gridTop, jdLeft, gridBottom, jdLineW));
            svg.appendChild(line(jdRight, gridTop, jdRight, gridBottom, jdLineW));
            svg.appendChild(line(jdLeft, gridTop, jdRight, gridTop, jdLineW));
            svg.appendChild(line(jdLeft, gridBottom, jdRight, gridBottom, jdLineW));
            // 다른 정간과 똑같이 박(정간) 구분선을 그림(대강은 굵게)
            for (let i = 1; i < beats; i++) {
              svg.appendChild(line(jdLeft, gridTop + i * cell, jdRight, gridTop + i * cell,
                dgSet.has(i) ? T_DAEGANG : T_THIN));
            }
          }

          // 가사(선율 오른쪽) — 켜져 있으면 각(정간)마다 매번. 별도 테두리 없이 정간 옆에 글자만 놓음
          if (wantLyrics) {
            const lyLeft = x + cell + lyGap;
            const lyCells = lyParsed && lyParsed[melIdx];
            const lyCount = lyCells ? lyCells.length : 0;
            const lyFilled = lyCount > 0 ? Math.min(beats, lyCount) : 0;
            for (let j = 0; j < lyFilled; j++) {
              const content = lyCells[j] ? lyCells[j].text : "";
              // 옆 정간의 율명 내용을 같이 넘겨 분박 행 위치에 가사를 나란히 앉힌다
              const melTxt = gakCells && gakCells[j] ? gakCells[j].text : "";
              if (content) drawLyricCell(svg, lyLeft, gridTop + j * cell, lyW, cell, content, lyricsFontFam, melTxt);
            }
            // 클릭 영역 — 숨은 정간 포함 전체 beats, 글자 위로 올려야 그 위를 클릭해도 먹힌다
            for (let j = 0; j < beats; j++) {
              const lyHit = rect(lyLeft, gridTop + j * cell, lyW, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all" });
              lyHit.style.cursor = "text";
              (function (gi, ci) {
                // 가사는 더블클릭으로만 편집 — 정간 드래그 선택과 헷갈리지 않게
                lyHit.addEventListener("mousedown", function (e) { e.preventDefault(); });
                lyHit.addEventListener("dblclick", function (e) {
                  e.preventDefault();
                  if (ornEditMode) { ornSel = null; hideOrnPanel(); render(); return; }
                  if (cellEditInput) commitCellEditor(false);
                  if (inputMode === "editor") CELL_EDIT.ly.setCursor(gi, ci, true);
                  else openCellEditor("ly", gi, ci);
                });
              })(melIdx, j);
              svg.appendChild(lyHit);
            }
          }
        }
        gakAccum += nMusic;

        // 밴드 위/아래 통줄 (전체 폭 — 각 사이 간격까지 끊기지 않게 한 줄로)
        svg.appendChild(line(capLeft, gridTop, capRight, gridTop, T_THICK));
        svg.appendChild(line(capLeft, gridBottom, capRight, gridBottom, T_THICK));
        structuralSegs.push([capLeft, gridTop, capRight, gridTop, T_THICK],
                            [capLeft, gridBottom, capRight, gridBottom, T_THICK]);
        // 맨 오른쪽이 내용 있는 가사 열이면, 통줄이 그 자리까지 덮으므로 오른쪽 끝을 세로선으로 마감.
        // 제목이 있는 페이지는 통줄이 제목 칸 세로선까지 이어져 그 선이 마감을 겸하므로 긋지 않는다.
        if (closeLyricCol && !page.hasTitle) {
          svg.appendChild(line(musicRightEdge, gridTop, musicRightEdge, gridBottom, T_THICK));
        }

        // 대강선 — 각마다 끊어 그리지 않고, 통줄처럼 밴드 폭 전체(제목 칸 앞까지)로 한 번에 그림
        const daegangRight = Math.min(capBase, musicRightEdge);
        dgSet.forEach(function (i) {
          svg.appendChild(line(musicLeft, gridTop + i * cell, daegangRight, gridTop + i * cell, T_DAEGANG));
          structuralSegs.push([musicLeft, gridTop + i * cell, daegangRight, gridTop + i * cell, T_DAEGANG]);
        });
      }

      // 정간 커스텀 테두리 — 마스크 전부를 먼저, 선 전부를 나중에(두 단계). 순서를 섞으면
      // 이웃 칸의 흰 마스크가 앞서 그린 선의 모서리를 지워 선이 끊겨 보인다.
      cellBorderSegs.forEach(function (s) { drawBorderMask(svg, s); });
      // 통줄·대강선 되살리기 — '테두리 없음' 마스크가 지운 자리라도 뼈대 선은 남아야 한다.
      // 커스텀 선(stroke)보다 먼저 그려서, 같은 자리에 일부러 친 굵은 선은 이 위에 얹힌다.
      structuralSegs.forEach(function (s) { svg.appendChild(line(s[0], s[1], s[2], s[3], s[4])); });
      cellBorderSegs.forEach(function (s) { drawBorderStroke(svg, s); });

      // 제목 칸(세로 표기) — 예시 악보처럼 프레임 위에서 아래까지 한 통짜리 세로 칸으로 그린다.
      // 왼쪽 세로선 하나만 긋고, 오른쪽 경계는 바깥 테두리가 겸한다. 밴드 통줄이 이 선까지 이어진다.
      // 바깥 테두리를 껐을 땐 기댈 프레임이 없으므로 밴드마다 그 높이만큼만 끊어 긋는다
      // (밴드 사이 빈 공간을 가로지르는 선이 남지 않게).
      if (page.hasTitle && titleGak > 0) {
        const panelRight = bandRight;
        const panelX = bandRight - titleWidth;
        if (wantFrame) {
          svg.appendChild(line(panelX, boxTop, panelX, boxBottom, T_THICK));
        } else {
          for (let b = 0; b < usedBands; b++) {
            const t = gridY + b * (bandH + bandGap) + headH;
            svg.appendChild(line(panelX, t, panelX, t + beats * cell, T_THICK));
          }
        }
        const pBottom = wantFrame ? boxBottom
          : gridY + (usedBands - 1) * (bandH + bandGap) + headH + beats * cell;
        const cx = (panelX + panelRight) / 2;
        const titleFont = Math.min(desiredTitle * scale, (panelRight - panelX) * 0.78);
        const startY = gridY + headH + titleFont * 1.05 + desiredTitleOff * scale;
        const tt = verticalText(cx + desiredTitleOffX * scale, startY, titleTxt, titleFont, 700, "#000", titleFontFam, desiredTitleSpacing * scale);
        svg.appendChild(tt.g);
        if (subTxt) {
          const subFont = Math.min(desiredSub * scale, (panelRight - panelX) * 0.72);
          const subStart = tt.endY + titleFont * 0.5 + subFont + desiredSubOff * scale;
          if (subStart < pBottom) {
            const st = verticalText(cx + desiredSubOffX * scale, subStart, subTxt, subFont, 400, "#333", titleFontFam, desiredSubSpacing * scale);
            svg.appendChild(st.g);
          }
        }
      }

      // 가로 제목 — 첫 페이지 격자 위 중앙에 가로쓰기 (부제는 그 아래 줄)
      if (titleTopMode && pageIdx === 0) {
        const cx = gridX + visibleW / 2;
        const baseBottom = gridY - INNER_PAD - pageTempoH;
        const titleBase = baseBottom - (subTxt ? titleTopSubFont * 1.5 : 0)
          - titleTopFont * 0.3 + desiredTitleOff * scale;
        const t = el("text", { x: cx + desiredTitleOffX * scale, y: titleBase, "text-anchor": "middle",
          "font-size": titleTopFont, "font-family": titleFontFam, "font-weight": 700, fill: "#000",
          "letter-spacing": desiredTitleSpacing * scale });
        t.textContent = titleTxt;
        svg.appendChild(t);
        if (subTxt) {
          const st = el("text", { x: cx + desiredSubOffX * scale,
            y: titleBase + titleTopSubFont * 1.45 + desiredSubOff * scale,
            "text-anchor": "middle", "font-size": titleTopSubFont, "font-family": titleFontFam,
            "font-weight": 400, fill: "#333", "letter-spacing": desiredSubSpacing * scale });
          st.textContent = subTxt;
          svg.appendChild(st);
        }
      }

      // 자유 텍스트 주석(대여음 등) — 첫 페이지 위에만, 내용 위에 얹어 항상 잡을 수 있게 함
      if (pageIdx === 0 && customTexts.length) {
        const textFontFam = $("titleFont").value || CJK;
        customTexts.forEach(function (t) {
          const holder = el("g", {});
          const cx = t.xf * PW, topY = t.yf * PH;
          const drawFn = t.orient === "h" ? horizontalText : verticalText;
          const vt = drawFn(cx, topY, t.text, t.size, 700, t.color || "#111", textFontFam, t.spacing || 0);
          holder.appendChild(vt.g);
          svg.appendChild(holder);   // getBBox엔 DOM에 붙어 있어야 함
          const bb = vt.g.getBBox();
          const pad = t.size * 0.28;
          const selected = textSel === t.id;
          const hit = rect(bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2, selected ? 0.3 : 0,
            { fill: selected ? "rgba(192,57,43,.08)" : "transparent",
              stroke: selected ? "#c0392b" : "none", "stroke-dasharray": "1.4,1.1", "pointer-events": "all" });
          hit.style.cursor = "move";
          holder.appendChild(hit);
          attachTextDrag(holder, t, svg);
        });
      }

      // 쪽 번호 — 페이지 아래 여백의 세로 중앙에 표시 (문서 탭 옵션)
      if (pageNumPos !== "none") {
        const pnFont = 3.4;
        const pnX = pageNumPos === "left" ? frameX
          : pageNumPos === "right" ? frameX + frameW : PW / 2;
        const anchor = pageNumPos === "left" ? "start"
          : pageNumPos === "right" ? "end" : "middle";
        const pn = el("text", { x: pnX, y: PH - MARGIN / 2 + pnFont * 0.35,
          "text-anchor": anchor, "font-size": pnFont, "font-family": CJK, fill: "#333" });
        pn.textContent = String(pageIdx + 1);
        svg.appendChild(pn);
      }

      const wrap = document.createElement("div");
      wrap.className = "page";
      wrap.appendChild(svg);
      sheet.appendChild(wrap);
    });

    // 시김새 수정 모드: 조절 가능한 시김새마다 옅은 네모(어떤 게 클릭되는지 미리 보이게) +
    // 고른 것만 진한 빨강 네모로 강조 + 클릭 히트(내용 위에 얹음)
    if (ornEditMode) {
      ornInstances.forEach(function (o) {
        const svg = pageSvgs[o.page]; if (!svg) return;
        const selected = ornSel && ornSel.gak === o.gak && ornSel.cell === o.cell && ornSel.k === o.k;
        svg.appendChild(rect(o.x - 0.6, o.y - 0.6, o.w + 1.2, o.h + 1.2, 0.4,
          selected
            ? { fill: "none", stroke: "#c0392b" }
            : { fill: "none", stroke: "#c0392b", "stroke-opacity": "0.32", "stroke-dasharray": "1.1,0.9" }));
        const hit = rect(o.x - 0.6, o.y - 0.6, o.w + 1.2, o.h + 1.2, 0,
          { fill: "transparent", stroke: "none", "pointer-events": "all" });
        hit.style.cursor = "move";
        (function (sel) {
          hit.addEventListener("mousedown", function (e) {
            e.preventDefault(); e.stopPropagation();
            selectOrn(sel);
            // 악보에서 직접 끌어서 위치를 옮긴다 — 다른 팔레트의 위치 버튼 없이도 바로 조정
            const t0 = getOrnToken(sel);
            if (!t0) return;
            const startPt = svgPointFromEvent(svg, e);
            const startDx = t0.dx, startDy = t0.dy;
            let pending = null, raf = null;
            function flush() {
              raf = null;
              if (pending) setOrnPositionAbsolute(pending.dx, pending.dy);
            }
            function onMove(e2) {
              const pt = svgPointFromEvent(svg, e2);
              pending = { dx: startDx + ((pt.x - startPt.x) / cell) * 100,
                          dy: startDy + ((pt.y - startPt.y) / cell) * 100 };
              if (raf == null) raf = requestAnimationFrame(flush);
            }
            function onUp() {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              if (raf != null) { cancelAnimationFrame(raf); flush(); }
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
        })({ gak: o.gak, cell: o.cell, k: o.k });
        svg.appendChild(hit);
      });
    }

    // 정간 구간 선택 — 드래그로 고르면(또는 고른 뒤에도 계속) 옅은 파란색으로 표시.
    // 구간 지우기·셀 서식 칠하기/지우기 버튼이 이 선택을 대상으로 즉시 적용된다.
    if (melSelStart && melSelEnd) {
      const lo = Math.min(melCellSeq(melSelStart.gi, melSelStart.ci), melCellSeq(melSelEnd.gi, melSelEnd.ci));
      const hi = Math.max(melCellSeq(melSelStart.gi, melSelStart.ci), melCellSeq(melSelEnd.gi, melSelEnd.ci));
      Object.keys(cellGeom).forEach(function (giKey) {
        const gi = parseInt(giKey, 10);
        const row = cellGeom[gi];
        Object.keys(row).forEach(function (ciKey) {
          const ci = parseInt(ciKey, 10);
          if (melCellSeq(gi, ci) < lo || melCellSeq(gi, ci) > hi) return;
          const cg = row[ci];
          const svg = pageSvgs[cg.page]; if (!svg) return;
          svg.appendChild(rect(cg.x, cg.y, cg.w, cg.h, 0,
            { fill: "#5b8def", "fill-opacity": "0.22", stroke: "#3a6fd8", "stroke-width": "0.15", class: "no-print" }));
        });
      });
    }

    updateHighlight();
    saveState();
    refreshMelSelBtns();

    // 선율·장단·가사는 구조 변경(각 추가/삭제, 종이 크기 등) 시점에만 서로 맞춰지고
    // (reconcileJangdan/reconcileLyrics) 타이핑 중엔 조용히 어긋난 채로 있을 수 있다 —
    // 다음 구조 변경 때 넘치는 내용이 말없이 잘려나가기 전에 눈에 띄게 알려준다.
    const lyGakMismatch = wantLyrics && lyParsed && parsed.length !== lyParsed.length;
    const jdBeatMismatch = wantJangdan && jdParsed && jdParsed[0] && jdParsed[0].length !== beats;
    const lyWarnEl = $("lyricsGakWarn");
    if (lyWarnEl) {
      lyWarnEl.classList.toggle("on", lyGakMismatch);
      if (lyGakMismatch) lyWarnEl.textContent =
        `⚠ 선율(${parsed.length}각)과 가사(${lyParsed.length}각)의 각 수가 달라요 — 구조를 바꾸면(각 추가/삭제 등) 넘치는 내용이 잘릴 수 있습니다.`;
    }
    const jdWarnEl = $("jangdanGakWarn");
    if (jdWarnEl) {
      jdWarnEl.classList.toggle("on", jdBeatMismatch);
      if (jdBeatMismatch) jdWarnEl.textContent =
        `⚠ 장단의 정간 수(${jdParsed[0].length})가 선율(${beats})과 달라요 — 구조를 바꾸면 넘치는 내용이 잘릴 수 있습니다.`;
    }

    $("readout").innerHTML =
      `그린 각: <b>${wantGak}</b> · 페이지 <b>${pages.length}</b>장<br>` +
      `가로 각 <b>${gakPerRow}</b> · 세로 밴드 최대 <b>${stack}</b>${stackAuto ? " (자동)" : ""} · ${landscape ? "가로" : "세로"}<br>` +
      `각 너비: <b>${cell.toFixed(1)}</b> · 각 간격: <b>${gap.toFixed(1)}</b> · 밴드 간격: <b>${bandGap.toFixed(1)}</b> mm` +
      (scale < 0.999 ? ` <span style="color:#8a6d3b">(A4 맞춤 ${Math.round(scale * 100)}%)</span>` : "") + `<br>` +
      `<span style="font-size:11px">읽는 순서: 오른쪽 → 왼쪽 (전통)</span>` +
      (dg.ok ? "" : `<div class="warn">⚠ 대강 값의 합이 정간 수(${beats})와 달라 무시했습니다.</div>`) +
      (lyGakMismatch ? `<div class="warn">⚠ 선율(${parsed.length}각)과 가사(${lyParsed.length}각)의 각 수가 달라요 — 구조를 바꾸면(각 추가/삭제 등) 넘치는 내용이 잘릴 수 있습니다.</div>` : "") +
      (jdBeatMismatch ? `<div class="warn">⚠ 장단의 정간 수(${jdParsed[0].length})가 선율(${beats})과 달라요 — 구조를 바꾸면 넘치는 내용이 잘릴 수 있습니다.</div>` : "");
  }

  function fillDaegangPreset() {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const cur = $("daegang").value.trim();
    if (cur === "" || cur === daegangAuto) {
      const preset = DAEGANG_PRESET[beats] || "";
      $("daegang").value = preset;
      daegangAuto = preset;
    }
  }

  function downloadPng() {
    const svgs = $("sheet").querySelectorAll(".page svg");
    if (!svgs.length) return;
    const base = $("title").value.trim() || "정간보";
    const multi = svgs.length > 1;
    svgs.forEach(function (svg, idx) {
      const vb = (svg.getAttribute("viewBox") || "0 0 210 297").split(/\s+/).map(Number);
      const pw = vb[2] || 210, ph = vb[3] || 297;
      // 화면 확인용 요소(편집·재생 하이라이트, '화면에만' 각 번호)는 저장본에서 뺀다
      const node = svg.cloneNode(true);
      node.querySelectorAll(".no-print").forEach(function (n) { n.remove(); });
      if ($("gakNumMode").value === "screen") {
        node.querySelectorAll(".gak-num").forEach(function (n) { n.remove(); });
      }
      const xml = new XMLSerializer().serializeToString(node);
      const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.onload = function () {
        const s = 300 / 25.4;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(pw * s);
        canvas.height = Math.round(ph * s);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = base + (multi ? "-" + (idx + 1) : "") + ".png";
          a.click();
          URL.revokeObjectURL(a.href);
        });
      };
      img.src = svg64;
    });
  }

  // ---------- 재생 (사인파 sonification) ----------
  // 규칙: 정간 1칸 = 1박. 칸 안 공백 행(분박)은 박을 등분. 빈 정간·이음(-)·시김새 단독 토큰은
  // 앞 음을 지속(새 음을 시작하지 않고 직전 이벤트 길이를 늘림). 쉼표만 실제 무음.
  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // 멜로디 텍스트 → 재생 이벤트 목록 [{ t, dur, freq, gak, cell }] (freq=null → 무음).
  function buildAudioEvents() {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const bpm = Math.max(1, parseInt($("tempoBpm").value) || 60);
    const hwangMidi = parseInt($("hwangPitch").value) || 63;
    const secPerBeat = 60 / bpm;
    const gaks = parseMelodyOffsets(melodyFull);

    const events = [];
    // marks: 오디오 이벤트와 별개로, 지속(빈 정간·이음)이어도 매 정간마다 하나씩 남겨서
    // 재생 하이라이트가 시간이 지나면 그 정간으로 계속 이동하도록 함
    const marks = [];
    let t = 0;
    let lastEvent = null;   // 지속(빈 정간/이음) 대상이 되는 마지막 유음 이벤트

    function extend(dur, gakIdx, cellIdx) {
      marks.push({ t: t, gak: gakIdx, cell: cellIdx });
      if (lastEvent) lastEvent.dur += dur;
      else events.push({ t: t, dur: dur, freq: null, gak: gakIdx, cell: cellIdx });
      t += dur;
    }
    function rest(dur, gakIdx, cellIdx) {
      marks.push({ t: t, gak: gakIdx, cell: cellIdx });
      events.push({ t: t, dur: dur, freq: null, gak: gakIdx, cell: cellIdx });
      lastEvent = null;
      t += dur;
    }
    function note(freq, dur, gakIdx, cellIdx) {
      marks.push({ t: t, gak: gakIdx, cell: cellIdx });
      const ev = { t: t, dur: dur, freq: freq, gak: gakIdx, cell: cellIdx };
      events.push(ev);
      lastEvent = ev;
      t += dur;
    }

    for (let g = 0; g < gaks.length; g++) {
      const gakCells = gaks[g];
      const filled = gakCells.length > 0 ? Math.min(beats, gakCells.length) : beats;
      for (let j = 0; j < filled; j++) {
        const text = gakCells[j] ? gakCells[j].text : "";
        const rows = text.split(/\s+/).filter(Boolean);
        if (!rows.length) { extend(secPerBeat, g, j); continue; }
        const rowDur = secPerBeat / rows.length;
        for (let r = 0; r < rows.length; r++) {
          const toks = tokenizeNotes(rows[r]).filter(function (tk) { return !tk.breath; });   // 숨표는 재생에 영향 없음
          const groups = groupRowTokens(toks);
          if (!groups.length) { extend(rowDur, g, j); continue; }
          const slotDur = rowDur / groups.length;
          for (let gi = 0; gi < groups.length; gi++) {
            const tk = groups[gi].main;
            if (tk.base) {
              const semis = SCALE.indexOf(tk.base) + tk.oct * 12;
              note(midiToFreq(hwangMidi + semis), slotDur, g, j);
            } else if (tk.sym === "pause_007") {
              rest(slotDur, g, j);
            } else {
              extend(slotDur, g, j);   // 이음(-)·시김새 단독·기타 문자 → 지속
            }
          }
        }
      }
    }
    return { events: events.filter(function (e) { return e.dur > 0; }), marks: marks };
  }

  let audioCtx = null, playTimer = null, playing = false, paused = false, playState = null;

  function highlightPlay(gak, cell) {
    playHi.forEach(function (h) { h.style.display = "none"; });
    const g = cellGeom[gak]; const cg = g && g[cell];
    if (!cg) return;
    const h = playHi[cg.page];
    if (!h) return;
    h.setAttribute("x", cg.x); h.setAttribute("y", cg.y);
    h.setAttribute("width", cg.w); h.setAttribute("height", cg.h);
    h.style.display = "";
  }

  // 재생 버튼 하나가 상태에 따라 재생↔일시정지↔이어하기를 겸한다(별도 일시정지 버튼 없음)
  function updatePlayButtons() {
    if (!$("btnPlay")) return;
    $("btnPlayIco").textContent = (!playing || paused) ? "▶" : "⏸";
    $("btnPlayLbl").textContent = !playing ? "재생" : (paused ? "이어하기" : "일시정지");
    $("btnPlay").title = !playing ? "재생 (사인파, 시김새 제외)" : (paused ? "이어 재생" : "일시정지");
    $("btnStop").disabled = !playing;
  }

  function stopPlayback() {
    if (!playing && !audioCtx) return;
    playing = false; paused = false; playState = null;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    playHi.forEach(function (h) { h.style.display = "none"; });
    updatePlayButtons();
  }

  // audioCtx.currentTime 기준으로 진행 상황을 갱신 — suspend() 동안은 currentTime이
  // 멈춰있으므로 일시정지해도 하이라이트가 어긋나지 않는다.
  function tick() {
    if (!playing || paused || !playState) return;
    const now = audioCtx.currentTime - playState.startAt;
    if (now >= playState.total) { stopPlayback(); return; }
    const marks = playState.marks;
    for (let i = marks.length - 1; i >= 0; i--) {
      if (now >= marks[i].t) { highlightPlay(marks[i].gak, marks[i].cell); break; }
    }
    playTimer = setTimeout(tick, 60);
  }

  function pausePlayback() {
    if (!playing || paused) return;
    paused = true;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    audioCtx.suspend();
    updatePlayButtons();
  }

  function resumePlayback() {
    if (!playing || !paused) return;
    paused = false;
    audioCtx.resume();
    tick();
    updatePlayButtons();
  }

  function togglePause() {
    if (paused) resumePlayback(); else pausePlayback();
  }

  function playMelody() {
    if (playing) return;
    const built = buildAudioEvents();
    const events = built.events, marks = built.marks;
    if (!events.length) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx = ctx;
    const startAt = ctx.currentTime + 0.15;
    const master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);

    events.forEach(function (e) {
      if (e.freq == null) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = e.freq;
      const on = startAt + e.t, off = on + e.dur;
      const atk = Math.min(0.02, e.dur * 0.3);
      const rel = Math.min(0.05, e.dur * 0.3);
      g.gain.setValueAtTime(0, on);
      g.gain.linearRampToValueAtTime(1, on + atk);
      g.gain.setValueAtTime(1, Math.max(on + atk, off - rel));
      g.gain.linearRampToValueAtTime(0, off);
      osc.connect(g); g.connect(master);
      osc.start(on); osc.stop(off + 0.02);
    });

    playing = true; paused = false;
    const total = events[events.length - 1].t + events[events.length - 1].dur;
    playState = { startAt: startAt, total: total, marks: marks };
    updatePlayButtons();
    tick();
  }

  // ---------- 저장 / 불러오기 ----------
  const CTRL_IDS = ["orientation", "beats", "gakPerRow", "stackCount", "stackAuto", "gakCount",
    "daegang", "noteMode", "sizeScale", "pageFill", "noteScale", "lyricsScale", "cellSize", "gakGap", "bandGap", "header", "frame",
    "title", "titleSize", "titleOffset", "titleOffsetX", "titleSpacing",
    "subtitle", "subSize", "subOffset", "subOffsetX", "subSpacing", "titleFont", "titleLayout",
    "hwangPitch", "tempoBpm", "wantJangdan", "wantLyrics", "wantTempo", "lyricsFont", "palSound", "palInsert", "joPreset", "pageNumPos", "gakNumMode"];
  const LS_KEY = "jgb_state_v1";

  function collectState() {
    const c = {};
    CTRL_IDS.forEach(function (id) {
      const el = $(id);
      c[id] = (el.type === "checkbox") ? el.checked : el.value;
    });
    const at = document.querySelector(".tab.active");
    return { v: 1, controls: c, melody: melodyFull, jangdan: $("jangdan").value,
             lyrics: lyricsFull, gakUserSet: gakUserSet,
             daegangAuto: daegangAuto, activeTab: at ? at.getAttribute("data-tab") : "input",
             customTexts: customTexts, palZoom: palZoom, ornPalZoom: ornPalZoom, edFontPx: edFontPx,
             melInput: inputMode, ornAddMap: ornAddMap, cellStyles: cellStyles };
  }

  function applyState(s) {
    if (!s || !s.controls) return;
    CTRL_IDS.forEach(function (id) {
      if (!(id in s.controls)) return;
      const el = $(id);
      if (el.type === "checkbox") el.checked = !!s.controls[id];
      else el.value = s.controls[id];
    });
    // 예전에 저장된 "이미지" 표기 옵션은 제거됐으므로 폰트(한자)로 대체
    if (!$("noteMode").value) $("noteMode").value = "font";
    if (typeof s.melody === "string") melodyFull = normalizeGakSeparators(s.melody);
    if (typeof s.jangdan === "string") $("jangdan").value = s.jangdan;
    if (typeof s.lyrics === "string") lyricsFull = normalizeGakSeparators(s.lyrics);
    edPage = 0; edRange = null; edLyRange = null;
    gakUserSet = !!s.gakUserSet;
    daegangAuto = s.daegangAuto || "";
    if (s.activeTab) applyActiveTab(s.activeTab);
    customTexts = Array.isArray(s.customTexts) ? s.customTexts : [];
    nextTextId = customTexts.reduce(function (m, t) { return Math.max(m, (t.id || 0) + 1); }, 1);
    textSel = null;
    cellStyles = (s.cellStyles && typeof s.cellStyles === "object") ? s.cellStyles : {};
    palZoom = typeof s.palZoom === "number" ? Math.max(0.6, Math.min(2, s.palZoom)) : 1;
    ornPalZoom = typeof s.ornPalZoom === "number" ? Math.max(0.6, Math.min(2, s.ornPalZoom)) : 1;
    edFontPx = typeof s.edFontPx === "number" ? Math.max(10, Math.min(26, s.edFontPx)) : 14;
    applyPalZoom(); applyOrnPalZoom(); applyEdFont();
    if (Array.isArray(s.ornAddMap) && s.ornAddMap.length === ORN_ADD_KEYS.length) {
      const validStems = new Set(ORN_ADD_ALL.map(function (o) { return o.s; }));
      ornAddMap = s.ornAddMap.map(function (stem) { return (stem && validStems.has(stem)) ? stem : null; });
    } else {
      ornAddMap = ORN_ADD_DEFAULT.slice();
    }
    rebuildOrnAddKeyMap();
    inputMode = s.melInput === "direct" ? "direct" : "editor";
    applyInputMode();
    $("pianoBase").value = $("hwangPitch").value;   // 황 음고 셀렉트는 기준음과 한 값
  }

  function applyActiveTab(name) {
    const valid = Array.from(document.querySelectorAll(".tab"))
      .some(function (b) { return b.getAttribute("data-tab") === name; });
    if (!valid) name = "doc";
    document.querySelectorAll(".tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".tabpanel").forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-tab") === name);
    });
  }

  // 되돌리기(Cmd/Ctrl+Z)는 '문서 내용' 변경만 밟는다 — 지금 보고 있는 탭, 입력 방식,
  // 팔레트 크기/글자 크기, 시김새 단축키 배정 같은 UI 상태는 스냅샷 비교·복원 양쪽에서
  // 모두 빼서, 팔레트를 열고 닫거나 모드를 바꾼 것이 되돌리기 단계로 남지 않게 한다.
  // (localStorage에는 UI 상태까지 통째로 저장한다 — 새로고침 복원용이라 목적이 다름.)
  const UNDO_UI_KEYS = ["activeTab", "palZoom", "ornPalZoom", "edFontPx", "melInput", "ornAddMap"];
  function docJsonOf(state) {
    const s = Object.assign({}, state);
    UNDO_UI_KEYS.forEach(function (k) { delete s[k]; });
    return JSON.stringify(s);
  }
  function saveState() {
    try {
      const full = collectState();
      localStorage.setItem(LS_KEY, JSON.stringify(full));
      pushUndo(docJsonOf(full));
    } catch (e) {}
  }

  // ---------- 전역 되돌리기 (Cmd/Ctrl+Z · Shift+Cmd/Ctrl+Z) ----------
  // 문서 내용 스냅샷(docJsonOf)을 스택에 쌓는다. 스택 맨 위 = 현재 상태.
  // 브라우저 내장 undo는 값을 코드로 갈아끼우는 순간 무효가 되므로 앱이 직접 관리한다.
  const UNDO_MAX = 100;
  let undoStack = [], redoStack = [];
  let undoPending = null, undoTimer = null, undoApplying = false;

  function pushUndo(json) {
    if (undoApplying) return;   // undo/redo로 복원하는 중의 저장은 새 단계가 아님
    if (undoStack.length && undoStack[undoStack.length - 1] === json && undoPending == null) return;
    // 타이핑 같은 연속 변경은 600ms 묶어서 한 단계로
    undoPending = json;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(commitUndoSnapshot, 600);
  }
  function commitUndoSnapshot() {
    clearTimeout(undoTimer); undoTimer = null;
    if (undoPending == null) return;
    if (undoStack[undoStack.length - 1] !== undoPending) {
      undoStack.push(undoPending);
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      redoStack.length = 0;   // 새 변경이 확정되면 다시하기 갈래는 사라짐
    }
    undoPending = null;
  }
  // 스냅샷을 화면 전체에 복원 (불러오기와 같은 절차)
  function restoreFromState(s) {
    applyState(s);
    buildPalette();
    render();
    refreshEditorSlices();
    syncActiveFromCursor();
    renderTextList();
    hideTextPanel();
  }
  // 스냅샷엔 UI 상태가 없으므로, 복원 직전에 '지금' UI 상태를 채워 넣어 그대로 유지시킨다
  // — 안 그러면 applyState가 빠진 필드를 기본값으로 되돌려 탭/모드/크기가 튀어버린다.
  function restoreDocJson(json) {
    const s = JSON.parse(json);
    const cur = collectState();
    UNDO_UI_KEYS.forEach(function (k) { s[k] = cur[k]; });
    undoApplying = true;
    try { restoreFromState(s); } finally { undoApplying = false; }
  }
  function undoGlobal() {
    if (cellEditInput) commitCellEditor(false);   // 정간 인라인 편집 중이면 먼저 확정
    commitUndoSnapshot();                          // 묶는 중이던 변경을 한 단계로 확정
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    restoreDocJson(undoStack[undoStack.length - 1]);
  }
  function redoGlobal() {
    if (cellEditInput) commitCellEditor(false);
    commitUndoSnapshot();
    if (!redoStack.length) return;
    const json = redoStack.pop();
    undoStack.push(json);
    restoreDocJson(json);
  }
  document.addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); if (e.shiftKey) redoGlobal(); else undoGlobal(); }
    else if (k === "y") { e.preventDefault(); redoGlobal(); }
  });

  function exportFile() {
    const blob = new Blob([JSON.stringify(collectState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ($("title").value.trim() || "정간보") + ".jgb.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFile(file) {
    const fr = new FileReader();
    fr.onload = function () {
      try {
        restoreFromState(JSON.parse(fr.result));   // 불러오기도 한 단계로 쌓여 되돌릴 수 있음
      } catch (e) { alert("불러오기 실패: 올바른 정간보 파일이 아닙니다."); }
    };
    fr.readAsText(file);
  }

  // ---------- 임시 저장 (이 컴퓨터 localStorage 슬롯) ----------
  const SNAP_KEY = "jgb_snapshots_v1";
  const SNAP_MAX = 30;
  function loadSnaps() {
    try { const a = JSON.parse(localStorage.getItem(SNAP_KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveSnaps(list) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return true; }
    catch (e) { alert("임시저장 실패: 브라우저 저장 공간이 가득 찼습니다. 오래된 임시저장을 지워주세요."); return false; }
  }
  function fmtSnapTime(iso) {
    const d = new Date(iso), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function snapSave() {
    const list = loadSnaps();
    const now = new Date().toISOString();
    const name = $("snapName").value.trim()
      || (($("title").value.trim() || "제목 없음") + " — " + fmtSnapTime(now));
    list.unshift({ id: Date.now(), name: name, time: now, state: collectState() });
    while (list.length > SNAP_MAX) list.pop();
    if (saveSnaps(list)) { $("snapName").value = ""; renderSnapList(); }
  }
  function renderSnapList() {
    const wrap = $("snapList");
    if (!wrap) return;
    wrap.innerHTML = "";
    const list = loadSnaps();
    if (!list.length) {
      const d = document.createElement("div");
      d.className = "snap-empty";
      d.textContent = "아직 임시저장이 없습니다.";
      wrap.appendChild(d);
      return;
    }
    list.forEach(function (s) {
      const row = document.createElement("div"); row.className = "snap-item";
      const nm = document.createElement("span"); nm.className = "snap-name";
      nm.textContent = s.name; nm.title = s.name;
      const tm = document.createElement("span"); tm.className = "snap-time";
      tm.textContent = fmtSnapTime(s.time);
      const load = document.createElement("button");
      load.type = "button"; load.className = "snap-load"; load.textContent = "불러오기";
      load.addEventListener("click", function () { restoreFromState(s.state); });
      const del = document.createElement("button");
      del.type = "button"; del.className = "snap-del"; del.textContent = "×"; del.title = "삭제";
      del.addEventListener("click", function () {
        if (!confirm("‘" + s.name + "’ 임시저장을 삭제할까요?")) return;
        saveSnaps(loadSnaps().filter(function (x) { return x.id !== s.id; }));
        renderSnapList();
      });
      row.appendChild(nm); row.appendChild(tm); row.appendChild(load); row.appendChild(del);
      wrap.appendChild(row);
    });
  }
  $("snapSaveBtn").addEventListener("click", snapSave);
  $("snapName").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 IME 조합 중 Enter 무시
    if (e.key === "Enter") { e.preventDefault(); snapSave(); }
  });
  renderSnapList();

  function onFormChange() {
    syncFullFromEditor();     // 에디터에 타이핑 중이던 내용을 먼저 원본에 반영
    syncLyricsFromEditor();
    reconcileMelody(); reconcileJangdan(); reconcileLyrics();
    render();
    refreshEditorSlices();
  }

  // ---------- 숫자 입력 확정([확인] 버튼 / Enter) ----------
  // 타이핑하는 숫자 칸은 값을 바꿔도 절대 바로 적용하지 않는다 — "12"를 치는 도중
  // "1"인 순간에 구조가 재계산되어 내용이 잘려나가던 문제. 값이 바뀌면 칸 옆에
  // [확인] 버튼이 떠서 그걸 누르거나 Enter를 쳐야만 적용되고, 확정 없이 칸을
  // 벗어나면(다른 곳 클릭) 원래 값으로 조용히 되돌린다. Esc = 즉시 원복.
  // 스피너(▲▼)·방향키로 바꾼 값도 같은 규칙(확정 필요)이다.
  const numConfirmBtn = (function () {
    const b = document.createElement("button");
    b.type = "button"; b.id = "numConfirmBtn"; b.textContent = "확인";
    document.body.appendChild(b);
    return b;
  })();
  let numConfirmCur = null;   // 지금 [확인]이 떠 있는 칸의 { el, commit }
  function numConfirmPlace() {
    if (!numConfirmCur) return;
    const r = numConfirmCur.el.getBoundingClientRect();
    numConfirmBtn.classList.add("on");
    const bw = numConfirmBtn.offsetWidth, bh = numConfirmBtn.offsetHeight;
    numConfirmBtn.style.left = (r.right - bw - 3) + "px";
    numConfirmBtn.style.top = (r.top + (r.height - bh) / 2) + "px";
  }
  function numConfirmHide() { numConfirmBtn.classList.remove("on"); numConfirmCur = null; }
  // pointerdown + preventDefault — 클릭으로 칸의 포커스가 빠져(blur) 원복되기 전에 적용.
  // click은 폴백(보조기기 등 pointerdown이 안 오는 경로) — commit이 상태를 비우므로 중복 없음.
  numConfirmBtn.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (numConfirmCur) numConfirmCur.commit();
  });
  numConfirmBtn.addEventListener("click", function () {
    if (numConfirmCur) numConfirmCur.commit();
  });
  // 사이드바 스크롤·창 크기 변경 때 버튼이 칸을 따라가게
  window.addEventListener("scroll", function () { numConfirmPlace(); }, true);
  window.addEventListener("resize", function () { numConfirmPlace(); });
  function wireConfirm(el, apply) {
    if (!el) return;
    let base = el.value;   // 마지막으로 적용된(확정된) 값 — 포커스 때마다 다시 잡는다
    function dirty() { return el.value !== base; }
    function commit() {
      base = el.value;
      if (numConfirmCur && numConfirmCur.el === el) numConfirmHide();
      apply();
    }
    function revert() {
      if (dirty()) el.value = base;
      if (numConfirmCur && numConfirmCur.el === el) numConfirmHide();
    }
    function refresh() {
      if (document.activeElement === el && dirty()) { numConfirmCur = { el: el, commit: commit }; numConfirmPlace(); }
      else if (numConfirmCur && numConfirmCur.el === el) numConfirmHide();
    }
    el.addEventListener("focus", function () { base = el.value; });   // 외부(자동 채움)로 바뀐 값 동기화
    el.addEventListener("input", refresh);
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); if (dirty()) commit(); }
      else if (e.key === "Escape") { e.preventDefault(); revert(); }
    });
    el.addEventListener("blur", revert);   // [확인] pointerdown은 preventDefault라 blur가 안 남
  }
  // 구조(칸 수)에 영향을 주는 숫자 칸 → 확정 시 멜로디 재구성 후 렌더
  wireConfirm($("beats"), function () { fillDaegangPreset(); onFormChange(); });
  // 총 각 수를 직접 확정하면 '페이지 꽉 채우기' 자동 추종을 멈춘다
  wireConfirm($("gakCount"), function () { gakUserSet = true; onFormChange(); });
  ["gakPerRow", "stackCount"].forEach(id => wireConfirm($(id), onFormChange));
  // 모양만 바꾸는 숫자 칸(대강 분절 포함) → 확정 시 렌더만
  ["cellSize", "gakGap", "bandGap", "daegang",
   "titleSize", "titleOffset", "titleOffsetX", "titleSpacing",
   "subSize", "subOffset", "subOffsetX", "subSpacing"].forEach(id => wireConfirm($(id), render));
  // 체크박스·셀렉트·제목 텍스트는 예전처럼 즉시 반영
  ["stackAuto", "title", "titleLayout", "wantJangdan", "wantLyrics"].forEach(id => {
    $(id).addEventListener("input", onFormChange);
    $(id).addEventListener("change", onFormChange);
  });
  ["sizeScale", "pageFill", "noteScale", "lyricsScale", "subtitle",
   "titleFont", "lyricsFont", "header", "frame", "noteMode", "orientation", "pageNumPos", "gakNumMode"].forEach(id => {
    $(id).addEventListener("input", render);
    $(id).addEventListener("change", render);
  });
  // 표기 모드가 바뀌면 팔레트도 이미지↔한자로 다시 그림
  $("noteMode").addEventListener("change", buildPalette);
  // 조(악조) 선택 → 표 팔레트를 그 조의 구성음만으로 다시 그림
  $("joPreset").addEventListener("change", function () { buildPalette(); saveState(); });
  // 팔레트 보기 전환 (율명 / 시김새)
  document.querySelectorAll(".pal-view").forEach(function (b) {
    b.addEventListener("click", function () {
      palView = b.getAttribute("data-view");
      document.querySelectorAll(".pal-view").forEach(function (x) { x.classList.toggle("active", x === b); });
      buildPalette();
    });
  });

  // 보기 확대/축소 (화면만, 출력에는 영향 없음) — 시작 배율은 150%
  let viewZoom = 1.5;
  function applyZoom() {
    $("sheet").style.transform = "scale(" + viewZoom + ")";
    $("zoomVal").textContent = Math.round(viewZoom * 100) + "%";
  }
  $("zoomIn").addEventListener("click", () => { viewZoom = Math.min(6, +(viewZoom + 0.1).toFixed(2)); applyZoom(); });
  $("zoomOut").addEventListener("click", () => { viewZoom = Math.max(0.3, +(viewZoom - 0.1).toFixed(2)); applyZoom(); });
  // 세로/가로 맞춤: 현재 페이지의 원본(100%) 크기 대비, 화면에서 실제로 쓸 수 있는 폭/높이에 맞는 배율을 계산
  function fitZoom(dim) {
    const svg = $("sheet").querySelector(".page svg");
    if (!svg) return;
    const cs = getComputedStyle(svg);
    const naturalW = parseFloat(cs.width), naturalH = parseFloat(cs.height);
    const area = $("sheetArea");
    const padX = 32, padY = 32;   // #sheetArea padding: 16px 사방
    const availW = area.clientWidth - padX, availH = area.clientHeight - padY;
    const ratio = dim === "width" ? availW / naturalW : availH / naturalH;
    viewZoom = Math.max(0.3, Math.min(6, +ratio.toFixed(2)));
    applyZoom();
  }
  $("zoomFitH").addEventListener("click", () => { fitZoom("height"); });
  $("zoomFitW").addEventListener("click", () => { fitZoom("width"); });
  applyZoom();

  // 떠 있는 창의 이동 손잡이 — 끌어서 원하는 위치에 놓기 (#main 안에서만).
  // 문서 크기·재생 바는 상단바로 옮겨 고정됐고, 직접 입력 도구창들만 이걸 쓴다.
  function attachBarDrag(bar) {
    const grip = bar.querySelector(".bar-grip"), main = $("main");
    if (!grip) return;
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    grip.addEventListener("pointerdown", function (e) {
      dragging = true; sx = e.clientX; sy = e.clientY;
      const br = bar.getBoundingClientRect(), mr = main.getBoundingClientRect();
      ox = br.left - mr.left; oy = br.top - mr.top;
      try { grip.setPointerCapture(e.pointerId); } catch (_e) {}
      e.preventDefault();
    });
    grip.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      const mr = main.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const nx = Math.max(4, Math.min(mr.width - br.width - 4, ox + e.clientX - sx));
      const ny = Math.max(4, Math.min(mr.height - br.height - 4, oy + e.clientY - sy));
      bar.style.right = "auto";   // 처음에 right 기준으로 놓인 바(재생 바)도 끌면 left 기준으로
      bar.style.left = nx + "px";
      bar.style.top = ny + "px";
    });
    const stop = function (e) { dragging = false; try { grip.releasePointerCapture(e.pointerId); } catch (_e) {} };
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  }
  // 직접 입력 모드의 도구창 6개(기본 도구바 + 5개 팔레트) 다 각자 독립적으로 뜨고
  // (그립이 그때만 보임) 따로 끌 수 있음 — 피날레 팔레트처럼.
  attachBarDrag($("melodyRibbon"));
  attachBarDrag($("paletteCol"));
  attachBarDrag($("ornWinWrap"));
  attachBarDrag($("jangdanArea"));
  attachBarDrag($("lyricsArea"));
  attachBarDrag($("textArea"));
  attachBarDrag($("cellStyleWin"));
  // 기능바(리본) 접기/펼치기 — 그립·접기 버튼만 남기고 나머지 그룹은 숨김
  $("ribbonCollapseToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    $("melodyRibbon").classList.toggle("collapsed");
  });
  // 모드 탭 전환
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyActiveTab(btn.getAttribute("data-tab"));
      saveState();
    });
  });

  // 설정 폼 접기/펼치기
  $("sidebarToggle").addEventListener("click", function () { document.body.classList.add("sidebar-collapsed"); });
  $("sidebarOpen").addEventListener("click", function () { document.body.classList.remove("sidebar-collapsed"); });

  // 텍스트 에디터 페이지 넘김 (선율/가사 헤더 공용) — 악보 미리보기도 그 페이지로 따라간다
  document.querySelectorAll(".ed-pager .ed-prev").forEach(function (b) {
    b.addEventListener("click", function () { setEdPage(edPage - 1); });
  });
  document.querySelectorAll(".ed-pager .ed-next").forEach(function (b) {
    b.addEventListener("click", function () { setEdPage(edPage + 1); });
  });

  // 선율/장단/가사/텍스트 탭(dockRail) — 에디터 모드 전용, 편집기 하나씩만 표시.
  // 직접 입력 모드에선 이 탭이 숨고 대신 아래 .win-toggle로 여러 도구창을 동시에 연다.
  document.querySelectorAll(".domain-tab").forEach(function (b) {
    b.addEventListener("click", function () {
      const panelId = b.getAttribute("data-panel");
      document.querySelectorAll(".domain-tab").forEach(function (x) {
        x.classList.toggle("active", x.getAttribute("data-panel") === panelId);
      });
      document.querySelectorAll(".dock-panel").forEach(function (p) {
        p.classList.toggle("active", p.id === panelId);
      });
    });
  });

  // 직접 입력 모드 도구창 전환 — 창 자체는 예전처럼 악보 위에 뜨지만(호버 창, CSS 참고),
  // 다른 탭을 누르면 이전에 열려 있던 창이 자동으로 닫혀 한 번에 하나만 뜬다.
  // 이미 열린 탭을 다시 누르면 그냥 닫힌다(별도 닫기 버튼 없음).
  // 에디터 모드의 .dock-panel.active 상태는 건드리지 않는다 — 뜬 창의 표시 여부는
  // .win-open 클래스만으로 결정되므로 두 모드의 상태가 서로 새지 않는다.
  function activateDirectPanel(targetId) {
    document.querySelectorAll(".win-toggle").forEach(function (b) {
      const tid = b.getAttribute("data-target");
      const t = $(tid);
      if (t) t.classList.toggle("win-open", tid === targetId);
      b.classList.toggle("on", tid === targetId);
    });
  }
  document.querySelectorAll(".win-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      const tid = b.getAttribute("data-target");
      const t = $(tid);
      activateDirectPanel(t && t.classList.contains("win-open") ? null : tid);
    });
  });
  // 직접 입력 도구창마다 오른쪽 위 닫기(X) 버튼 — 누르면 그 창을 닫는다(한 번에 하나만
  // 열리므로 activateDirectPanel(null)이 곧 지금 창 닫기). 리본의 여닫기 버튼(.on)도 같이 꺼진다.
  document.querySelectorAll(".direct-win").forEach(function (win) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "direct-win-close";
    x.title = "닫기";
    x.setAttribute("aria-label", "도구창 닫기");
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    x.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      activateDirectPanel(null);
    });
    win.appendChild(x);
  });

  // 편집창 높이 조절 (위로 드래그 → 커짐 / 아래로 → 작아짐) — 선율·장단·가사 각 탭의 편집줄에 적용
  (function () {
    const rez = $("melodyResizer");
    let startY = 0, startH = 0, dragging = false, row = null;
    rez.addEventListener("pointerdown", function (e) {
      row = document.querySelector(".dock-panel.active div[id$='Row']");
      if (!row) return;
      dragging = true; startY = e.clientY; startH = row.offsetHeight;
      rez.setPointerCapture(e.pointerId); e.preventDefault();
    });
    rez.addEventListener("pointermove", function (e) {
      if (!dragging || !row) return;
      const dy = startY - e.clientY;
      const h = Math.max(90, Math.min(window.innerHeight * 0.6, startH + dy));
      row.style.height = h + "px";
    });
    const stop = function (e) { dragging = false; try { rez.releasePointerCapture(e.pointerId); } catch (_) {} };
    rez.addEventListener("pointerup", stop);
    rez.addEventListener("pointercancel", stop);
  })();

  // 선율 팔레트 ↔ 텍스트 에디터 나눔선 (좌우 드래그로 팔레트 쪽 너비 조절)
  (function () {
    const split = $("melodySplit"), col = $("paletteCol"), row = $("melodyRow");
    let startX = 0, startW = 0, dragging = false;
    split.addEventListener("pointerdown", function (e) {
      dragging = true; startX = e.clientX; startW = col.offsetWidth;
      split.setPointerCapture(e.pointerId); e.preventDefault();
    });
    split.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      const w = Math.max(180, Math.min(row.offsetWidth * 0.6, startW + (e.clientX - startX)));
      col.style.width = w + "px";
    });
    const stop = function (e) { dragging = false; try { split.releasePointerCapture(e.pointerId); } catch (_) {} };
    split.addEventListener("pointerup", stop);
    split.addEventListener("pointercancel", stop);
  })();

  // 건반 높이를 팔레트 영역에 맞춤 — 위아래 스크롤 없이, 편집창 크기를 조절하면 따라 커지고 작아진다
  function fitPianoHeight() {
    const kb = document.querySelector("#notePalette .piano-kb");
    if (!kb) return;
    // notePalette에 zoom이 걸려 있으므로 zoom으로 나눠 계산. 18 = .palette 패딩(8×2)+테두리(1×2)
    const h = Math.max(80, $("paletteWrap").clientHeight / palZoom - 18);
    kb.style.height = h + "px";
  }
  new ResizeObserver(fitPianoHeight).observe(document.getElementById("paletteWrap"));

  // 율명 표(팔레트)·에디터 글자 크기 조절 — 값은 저장 상태에 함께 보관
  function applyPalZoom() {
    $("notePalette").style.zoom = palZoom;
    fitPianoHeight();
  }
  // 시김새 팔레트(직접 입력 도구창) 크기 — 율명과 따로 조절됨
  function applyOrnPalZoom() {
    $("directOrnPalette").style.zoom = ornPalZoom;
  }
  function applyEdFont() {
    $("melody").style.fontSize = edFontPx + "px";
    $("melodyHlBack").style.fontSize = edFontPx + "px";
    updateMelodyHl();
  }
  $("palSizeDown").addEventListener("click", function () { palZoom = Math.max(0.6, +(palZoom - 0.1).toFixed(2)); applyPalZoom(); saveState(); });
  $("palSizeUp").addEventListener("click", function () { palZoom = Math.min(2, +(palZoom + 0.1).toFixed(2)); applyPalZoom(); saveState(); });
  $("ornPalSizeDown").addEventListener("click", function () { ornPalZoom = Math.max(0.6, +(ornPalZoom - 0.1).toFixed(2)); applyOrnPalZoom(); saveState(); });
  $("ornPalSizeUp").addEventListener("click", function () { ornPalZoom = Math.min(2, +(ornPalZoom + 0.1).toFixed(2)); applyOrnPalZoom(); saveState(); });
  $("edFontDown").addEventListener("click", function () { edFontPx = Math.max(10, edFontPx - 1); applyEdFont(); saveState(); });
  $("edFontUp").addEventListener("click", function () { edFontPx = Math.min(26, edFontPx + 1); applyEdFont(); saveState(); });

  // 멜로디 편집 → 그리드 재정렬 + 렌더 + 현재 정간 하이라이트 갱신
  $("melody").addEventListener("input", function () {
    reformatMelodyEditor();
    syncFullFromEditor(); render(); syncActiveFromCursor(); updateMelodyHl();
  });
  $("melody").addEventListener("compositionstart", function () { melodyComposing = true; });
  $("melody").addEventListener("compositionend", function () {
    // 조합 확정 직전의 input 이벤트가 이미 렌더까지 마쳤으므로,
    // 미뤄뒀던 정렬이 실제로 값을 바꿨을 때만 다시 동기화·렌더한다
    melodyComposing = false;
    const before = this.value;
    reformatMelodyEditor();
    if (this.value !== before) { syncFullFromEditor(); render(); }
    syncActiveFromCursor(); updateMelodyHl();
  });
  // 그리드처럼 동작하는 키들 —
  // →: 다음 정간(다음 | 또는 줄바꿈 뒤)으로 점프. 정간 안 분박(스페이스) 입력은 그대로.
  // Backspace/Delete: 정간 구분선(|)과 정렬 탭은 지우지 않고 건너뛴다(칸 구조 유지).
  $("melody").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    // Cmd/Ctrl+Enter: 커서 각 뒤에 빈 각 삽입 (가사 동반)
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault(); insertGakBelow(false); return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    // Enter: 커서 자리에서 각 나누기 — 가사에도 같은 자리에 빈 줄을 넣어 어긋나지 않게
    if (e.key === "Enter") {
      e.preventDefault(); insertGakBelow(true); return;
    }
    const v = this.value;
    if (e.key === "ArrowRight") {
      let p = -1;
      for (let i = this.selectionEnd; i < v.length; i++) {
        if (v[i] === "|" || v[i] === "\n") { p = i + 1; break; }
      }
      if (p < 0) return;   // 마지막 정간이면 기본 동작
      e.preventDefault();
      this.setSelectionRange(p, p);
      syncActiveFromCursor();
      return;
    }
    if (e.key === "Backspace" && this.selectionStart === this.selectionEnd) {
      let p = this.selectionStart;
      if (p > 0 && (v[p - 1] === "|" || v[p - 1] === "\t")) {
        e.preventDefault();
        if (v[p - 1] === "|") p--;                       // | 하나만 건너뛰고
        while (p > 0 && v[p - 1] === "\t") p--;          // 그 앞 정렬 탭도 함께
        this.setSelectionRange(p, p);
        syncActiveFromCursor();
        return;
      }
    }
    if (e.key === "Delete" && this.selectionStart === this.selectionEnd) {
      let p = this.selectionEnd;
      if (p < v.length && (v[p] === "|" || v[p] === "\t")) {
        e.preventDefault();
        while (p < v.length && v[p] === "\t") p++;
        if (v[p] === "|") p++;
        this.setSelectionRange(p, p);
        syncActiveFromCursor();
        return;
      }
    }
  });
  $("melody").addEventListener("scroll", function () {
    $("melodyHlBack").scrollTop = this.scrollTop;
    $("melodyHlBack").scrollLeft = this.scrollLeft;
  });
  ["keyup", "click", "select", "focus"].forEach(function (ev) {
    $("melody").addEventListener(ev, syncActiveFromCursor);
  });
  $("gakInsertBtn").addEventListener("click", function () { insertGakBelow(false); });
  $("gakDeleteBtn").addEventListener("click", function () { deleteGakAtCursor(); });

  // 장단 편집 → 렌더 + 장단 칸 하이라이트 갱신
  $("jangdan").addEventListener("input", function () { render(); syncJangdanFromCursor(); });
  ["keyup", "click", "select", "focus"].forEach(function (ev) {
    $("jangdan").addEventListener(ev, syncJangdanFromCursor);
  });
  attachGakGridGuard("jangdan", syncJangdanFromCursor);
  $("jangdanReset").addEventListener("click", resetJangdan);

  // 가사 편집 → 렌더 + 가사 줄 하이라이트 갱신
  $("lyrics").addEventListener("input", function () { syncLyricsFromEditor(); render(); syncLyricsFromCursor(); });
  ["keyup", "click", "select", "focus"].forEach(function (ev) {
    $("lyrics").addEventListener(ev, syncLyricsFromCursor);
  });
  attachGakGridGuard("lyrics", syncLyricsFromCursor);
  $("lyricsReset").addEventListener("click", resetLyrics);

  // 시김새 수정 모드 토글 + 조정 패널
  $("ornEditToggle").addEventListener("click", function () {
    ornEditMode = !ornEditMode;
    $("ornEditToggle").classList.toggle("on", ornEditMode);
    if (!ornEditMode) { ornSel = null; hideOrnPanel(); }
    render();
  });
  // 시김새 숫자 단축키(1~0)는 직접 입력 모드에서 늘 살아 있다(별도 켜기 없음) —
  // 이 버튼은 번호마다 어떤 시김새를 배정할지 바꾸는 줄(#ornAddMapBar)만 열고 닫는다.
  $("ornMapToggle").addEventListener("click", function () {
    const bar = $("ornAddMapBar");
    const open = !bar.classList.contains("open");
    bar.classList.toggle("open", open);
    $("ornMapToggle").classList.toggle("on", open);
  });
  // 구간 지우기 — 토글이 아니라 즉시 실행 버튼. 지금 선택된 구간(드래그로 고른 것)이
  // 있어야 동작하고, 없으면 아무 일도 안 한다(refreshMelSelBtns가 매 렌더 disabled 처리).
  $("rangeClearToggle").addEventListener("click", function () {
    if (!hasMelSel()) return;
    clearMelodyRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci);
  });
  // 셀 서식 — 배경색/테두리 각각 칠하기·지우기 버튼 4개. 전부 '지금 선택된 구간'에 즉시
  // 적용되는 실행 버튼(토글 아님). 색은 그냥 '지금 고른 값'일 뿐이라 여러 색을 번갈아
  // 칠해도 칠하기/지우기 버튼 자체는 서로 안 헷갈리게 분리해둔다.
  $("cellFillPaintToggle").addEventListener("click", function () {
    if (!hasMelSel()) return;
    applyCellFillRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci, cellStylePendingColor);
  });
  $("cellFillEraseToggle").addEventListener("click", function () {
    if (!hasMelSel()) return;
    applyCellFillRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci, null);
  });
  function applyBorderToSelection(spec) {
    if (!hasMelSel()) return;
    applyCellBorderRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci, spec);
  }
  $("cellBorderPaintToggle").addEventListener("click", function () {
    applyBorderToSelection({ width: cellBorderWidth, style: cellBorderStyle });
  });
  $("cellBorderEraseToggle").addEventListener("click", function () {
    applyBorderToSelection(null);
  });
  $("cellStyleColorPicker").addEventListener("change", function () {
    cellStylePendingColor = $("cellStyleColorPicker").value;
  });
  // 프리셋(전체/바깥쪽/안쪽)과 변 직접 선택(위/오/아/왼)은 서로 배타 — 프리셋을 누르면
  // 그 프리셋 버튼만 켜지고 변 버튼 상태는 건드리지 않으며, 변 버튼을 누르면 프리셋이
  // 꺼지고 '직접 선택'으로 돌아간다.
  function setBorderPreset(name) {
    cellBorderPreset = name;
    $("cellBorderPresetAll").classList.toggle("on", name === "all");
    $("cellBorderPresetOuter").classList.toggle("on", name === "outer");
    $("cellBorderPresetInner").classList.toggle("on", name === "inner");
  }
  ["Top", "Right", "Bottom", "Left"].forEach(function (Side) {
    const key = Side.toLowerCase();
    $("cellBorderSide" + Side).addEventListener("click", function () {
      setBorderPreset("custom");
      cellBorderSides[key] = !cellBorderSides[key];
      $("cellBorderSide" + Side).classList.toggle("on", cellBorderSides[key]);
    });
  });
  $("cellBorderWidthSelect").addEventListener("change", function () {
    cellBorderWidth = $("cellBorderWidthSelect").value;
  });
  $("cellBorderStyleSelect").addEventListener("change", function () {
    cellBorderStyle = $("cellBorderStyleSelect").value;
  });
  // 테두리 프리셋 3개(전체/바깥쪽/안쪽) — 정간보는 열이 하나뿐인 표라고 보고, 있을 법한 조합만
  // 빠르게 고르게 함. '없음'(줄 숨김)은 프리셋이 아니라 선 종류 선택지에 있다 — 지우기(원래
  // 격자로 복귀)와 달리 그 자리 격자선 자체를 흰 마스크로 숨기는 별개 스타일이라서.
  // 프리셋도 즉시 실행(누르면 바로 지금 선택된 구간에 적용)이라, 골라만 두고 칠하기/지우기를
  // 따로 눌러도 되고, 프리셋 버튼 자체로 바로 적용해도 된다.
  // '전체'도 다른 프리셋처럼 자기 상태만 가진다 — 변 버튼 4개를 대신 켜지 않는다.
  $("cellBorderPresetAll").addEventListener("click", function () {
    setBorderPreset("all");
    applyBorderToSelection({ width: cellBorderWidth, style: cellBorderStyle });
  });
  $("cellBorderPresetOuter").addEventListener("click", function () {
    setBorderPreset("outer");
    applyBorderToSelection({ width: cellBorderWidth, style: cellBorderStyle });
  });
  $("cellBorderPresetInner").addEventListener("click", function () {
    setBorderPreset("inner");
    applyBorderToSelection({ width: cellBorderWidth, style: cellBorderStyle });
  });
  // 정간 구간 선택 — 드래그(다른 칸으로 번짐)로 확정되면 선택을 유지, 안 번지면(그냥 클릭)
  // 그 칸을 편집한다. 손을 뗀 위치가 정간 밖이어도 여기서 판가름한다.
  // 단, 셀 서식 모드(도구창/탭이 열려 있음)에서는 클릭도 '한 칸 선택'으로 유지 —
  // 내용 편집(노란 입력창)이 아니라 서식 적용 대상을 고르는 중이므로.
  document.addEventListener("mouseup", function () {
    if (!melSelActive) return;
    melSelActive = false;
    if (!melSelDidDrag && !cellStyleMode()) {
      const s = melSelStart;
      melSelStart = null; melSelEnd = null;
      render();
      if (inputMode === "editor") CELL_EDIT.mel.setCursor(s.gi, s.ci, true);
      else openCellEditor("mel", s.gi, s.ci);
    } else {
      render();
    }
  });
  $("ornClose").addEventListener("click", function () { ornSel = null; hideOrnPanel(); render(); });
  $("ornReset").addEventListener("click", function () { updateOrnParams(0, 0, 0, true); });
  $("ornDelete").addEventListener("click", deleteSelectedOrn);
  // 시김새 미세조정 모드에서 시김새를 고른 뒤 Backspace/Delete로 바로 삭제
  document.addEventListener("keydown", function (e) {
    if (!ornEditMode || !ornSel) return;
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;   // 텍스트 입력 중엔 글자 지우기로 그대로 둠
    e.preventDefault();
    deleteSelectedOrn();
  });
  document.querySelectorAll("#ornPanel .orn-row button").forEach(function (b) {
    b.addEventListener("click", function () {
      const a = b.getAttribute("data-a");
      if (a === "sz+") updateOrnParams(10, 0, 0);
      else if (a === "sz-") updateOrnParams(-10, 0, 0);
      else if (a === "x+") updateOrnParams(0, 5, 0);
      else if (a === "x-") updateOrnParams(0, -5, 0);
      else if (a === "y+") updateOrnParams(0, 0, 5);
      else if (a === "y-") updateOrnParams(0, 0, -5);
    });
  });

  // 크기·간격을 처음 값으로 초기화 (제목·선율 등 내용과 문서 구조는 그대로)
  const LAYOUT_DEFAULTS = { sizeScale: 1, pageFill: 0, noteScale: 1, lyricsScale: 1, cellSize: 11, gakGap: 7, bandGap: 10 };
  $("layoutReset").addEventListener("click", function () {
    Object.keys(LAYOUT_DEFAULTS).forEach(function (id) { $(id).value = LAYOUT_DEFAULTS[id]; });
    render();
  });

  // 텍스트 추가 팝오버 + 크기·삭제 패널
  // 아래 편집 독 '텍스트' 탭의 추가 입력줄
  $("textAddBtn").addEventListener("click", function () {
    addCustomText($("textAddInput").value);
    $("textAddInput").value = "";
    $("textAddInput").focus();
  });
  $("textAddInput").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") { e.preventDefault(); $("textAddBtn").click(); }
  });
  $("textPanelClose").addEventListener("click", function () { textSel = null; hideTextPanel(); render(); });
  $("textPanelDelete").addEventListener("click", function () { if (textSel != null) deleteCustomText(textSel); });
  document.querySelectorAll("#textPanel .orn-row button").forEach(function (b) {
    b.addEventListener("click", function () {
      const a = b.getAttribute("data-a");
      if (a === "sz+") updateTextSize(1);
      else if (a === "sz-") updateTextSize(-1);
    });
  });

  // 재생 버튼 = 상태 토글: 멈춰 있으면 재생, 재생 중이면 일시정지, 일시정지면 이어하기
  $("btnPlay").addEventListener("click", function () {
    if (!playing) playMelody(); else togglePause();
  });
  $("btnStop").addEventListener("click", stopPlayback);
  // 기준음(황 음고) 변경 → 저장 + 팔레트의 황 음고 셀렉트·피아노 건반 라벨도 따라감
  $("hwangPitch").addEventListener("change", function () {
    $("pianoBase").value = $("hwangPitch").value;
    saveState();
    if (palView === "yul" && yulMode === "piano") buildPalette();
  });
  // 입력·소리 토글 상태 저장
  $("palSound").addEventListener("change", saveState);
  $("palInsert").addEventListener("change", saveState);
  // 입력 모드 전환 (에디터 / 직접 입력) — 선율·장단·가사 전역 공통.
  // 직접 입력이면 선율만 추가로: 왼쪽 율명 팔레트 고정 + 오른쪽에 시김새 팔레트 상시 표시
  // (텍스트 에디터 대신) — 장단·가사는 팔레트 배치가 원래도 간단해 레이아웃을 바꿀 게 없다.
  const INPUT_MODE_HINT = {
    editor: "곡 전체를 텍스트로 보며 편집",
    direct: "정간 클릭 → 그 자리에서 바로 입력"
  };
  // ed-head '?' 아이콘 — 텍스트 에디터의 문법 규칙 안내. #editorCol(이 아이콘이 속한 자리)은
  // 직접 입력 모드에선 통째로 숨겨지므로(CSS의 .mel-direct #editorCol) 이 문구는 에디터
  // 모드에서만 보이면 된다.
  const ED_MODE_TIP =
    "텍스트 입력 규칙\n" +
    "· 음 = 한글 율명(황·태·협…)\n" +
    "· 줄바꿈 = 각 구분\n" +
    "· | = 정간 구분\n" +
    "· 스페이스 = 한 정간 안 분박(음 여러 개)\n" +
    "· 음 뒤 < = 숨표\n" +
    "· 시김새 = 음 뒤 괄호 {}·[]·() 중 아무거나\n" +
    "예: 황 태|협<|임  (정간 3개 — 1번째는 황·태 분박, 2번째는 협+숨표)";
  function applyInputMode() {
    document.querySelectorAll("#melInputSeg .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === inputMode);
    });
    if ($("melInputHint")) $("melInputHint").textContent = INPUT_MODE_HINT[inputMode] || "";
    const direct = inputMode === "direct";
    if (!direct && cellEditInput) commitCellEditor(false);   // 에디터 모드로 돌아가면 열린 입력창 정리
    // 선율·장단·가사 리본이 뜬 바로 바뀌는 것도 이 클래스 하나로 같이 처리(CSS 참고)
    document.body.classList.toggle("input-direct", direct);
    $("melodyArea").classList.toggle("mel-direct", direct);
    if ($("edModeTip")) $("edModeTip").setAttribute("data-tip", ED_MODE_TIP);
    // 시김새 숫자 단축키(1~0)는 직접 입력에서 항상 활성 — 칩에 번호 배지가 늘 보이고,
    // 숫자키로 고른 뒤 악보의 음을 클릭하면 붙는다. 에디터 모드로 나가면 자동으로 꺼진다.
    ornAddMode = direct;
    if (!direct) ornAddArmed = null;
    refreshOrnAddBadges();
    // 구간 지우기·셀 서식(칠하기/지우기/프리셋)은 이제 에디터·직접 입력 두 모드 모두에서 쓸 수 있다
    // — 악보를 드래그로 고르는 동작 자체는 모드와 무관하기 때문. 셀 서식 도구창을 여닫는
    // winToggleCellStyle 버튼만 '뜬 도구창' 개념이라 직접 입력 전용으로 남고(CSS에서 숨김),
    // 에디터 모드에서는 대신 레일 탭(#dockRail의 '셀 서식')으로 같은 내용을 도킹해서 본다.
    // 기능바(#melodyRibbon) 위치 — 직접 입력: 악보를 직접 만지므로 악보 바로 위(#main
    // 최상단)에 고정. 에디터: 작업 영역이 아래 독(텍스트 에디터·팔레트)이므로 독 맨 위
    // (리사이저 아래, 탭 내용 위)에 붙인다 — 어느 탭에서든 보이면서 손도 가깝게.
    const ribbon = $("melodyRibbon");
    if (direct) {
      const main = $("main");
      if (ribbon.parentNode !== main) main.insertBefore(ribbon, $("sheetArea"));
    } else {
      const dock = $("editorDock");
      const dockBody = dock.querySelector(".dock-body");
      if (ribbon.parentNode !== dock || ribbon.nextSibling !== dockBody) {
        dock.insertBefore(ribbon, dockBody);
      }
    }
    if (direct) {
      if (palView !== "yul") {   // 왼쪽 팔레트는 율명으로 고정
        palView = "yul";
        document.querySelectorAll(".pal-view").forEach(function (x) {
          x.classList.toggle("active", x.getAttribute("data-view") === "yul");
        });
        buildPalette();
      }
      buildOrnPalette($("directOrnPalette"));
      buildOrnAddMapBar();
      applyPalZoom();
      applyOrnPalZoom();
      // 에디터에서 직접 입력으로 '전환한 순간'에만 율명 창을 기본으로 열어준다.
      // - 첫 로드/새로고침(lastApplied=null)에는 열지 않는다 — 직접 입력이 기본값이 되면서
      //   매번 율명 창이 저절로 떠 있던 문제. 악보만 깨끗하게 보이는 게 맞다.
      // - 모드가 안 바뀐 재적용(예: 전역 되돌리기의 상태 복원)에서도 지금 열려 있는
      //   도구창을 그대로 둔다 — 안 그러면 Cmd+Z를 누를 때마다 열어둔 창이 율명으로 튄다.
      if (lastAppliedInputMode === "editor") activateDirectPanel("paletteCol");
    }
    lastAppliedInputMode = inputMode;
  }
  let lastAppliedInputMode = null;   // applyInputMode가 마지막으로 적용한 모드(전환 감지용)
  document.querySelectorAll("#melInputSeg .seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      inputMode = b.getAttribute("data-mode");
      applyInputMode();
      saveState();
    });
  });
  // 율명 입력 방식 전환 (표 / 건반)
  document.querySelectorAll("#yulModeSeg .seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      yulMode = b.getAttribute("data-mode");
      document.querySelectorAll("#yulModeSeg .seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      buildPalette();
    });
  });
  // 피아노 탭의 황 위치(E♭/C) = 재생 기준음과 같은 값 하나로 연동
  $("pianoBase").addEventListener("change", function () {
    $("hwangPitch").value = $("pianoBase").value;
    saveState();
    buildPalette();
  });
  // 템포(BPM)는 재생뿐 아니라 템포 표시(악보)에도 쓰이므로 바뀌면 다시 그림
  wireConfirm($("tempoBpm"), render);   // 숫자 타이핑 칸 — [확인]/Enter로만 적용
  $("wantTempo").addEventListener("change", render);
  $("wantTempo").addEventListener("input", render);
  // 재생 설정(기준음·템포) 팝오버
  $("playSettingsToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    $("playPop").classList.toggle("on");
    $("playSettingsToggle").classList.toggle("on");
  });
  document.addEventListener("click", function (e) {
    if ($("playPop").classList.contains("on") && !$("playPop").contains(e.target) && e.target !== $("playSettingsToggle")) {
      $("playPop").classList.remove("on");
      $("playSettingsToggle").classList.remove("on");
    }
  });
  $("btnPng").addEventListener("click", downloadPng);
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnExport").addEventListener("click", exportFile);
  $("btnImport").addEventListener("click", function () { $("fileImport").click(); });
  $("fileImport").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = "";
  });

  // 입력 방법 가이드(?) 팝오버
  // 안내(?) 팝오버 공통 — 버튼 클릭으로 열고 닫기, 바깥 클릭으로 닫기
  // (선율/장단/가사/텍스트 입력 방법 · 시김새 조정 설명)
  function makeGuideToggle(guideId, btnId) {
    const fn = function (show) {
      const on = typeof show === "boolean" ? show : !$(guideId).classList.contains("on");
      $(guideId).classList.toggle("on", on);
      $(btnId).classList.toggle("on", on);
      // 화면 밖 방지 — 기본(아래로 펼침)이 화면 아래로 넘치면 위로 뒤집고(.up),
      // 위도 모자라면 넓은 쪽을 골라 max-height로 눌러 패널 안에서 스크롤되게 한다.
      // (에디터 모드에선 ? 버튼이 하단 독에 있어 아래 공간이, 직접 입력 모드에선
      // 도구창이 화면 위쪽에 떠 있어 위 공간이 부족할 수 있다 — 방향 고정으론 안 됨)
      if (on) {
        const g = $(guideId);
        g.classList.remove("up"); g.style.maxHeight = ""; g.style.overflowY = "";
        const vh = document.documentElement.clientHeight, margin = 8;
        let r = g.getBoundingClientRect();
        if (r.bottom > vh) {
          const wrapR = g.parentNode.getBoundingClientRect();
          const spaceAbove = wrapR.top - margin * 2;
          const spaceBelow = vh - wrapR.bottom - margin * 2;
          if (r.height <= spaceAbove) {
            g.classList.add("up");
          } else {
            const useUp = spaceAbove > spaceBelow;
            g.classList.toggle("up", useUp);
            g.style.maxHeight = Math.max(120, useUp ? spaceAbove : spaceBelow) + "px";
            g.style.overflowY = "auto";
          }
        }
      }
    };
    $(btnId).addEventListener("click", function (e) { e.stopPropagation(); fn(); });
    document.addEventListener("click", function (e) {
      if ($(guideId).classList.contains("on") && !$(guideId).contains(e.target) && e.target !== $(btnId)) {
        fn(false);
      }
    });
    return fn;
  }
  const toggleMelodyGuide = makeGuideToggle("melodyGuide", "melodyGuideToggle");   // 처음 방문 안내에 재사용
  makeGuideToggle("inputModeGuide", "inputModeGuideToggle");
  makeGuideToggle("ornGuide", "ornGuideToggle");
  makeGuideToggle("jangdanGuide", "jangdanGuideToggle");
  makeGuideToggle("lyricsGuide", "lyricsGuideToggle");
  makeGuideToggle("textGuide", "textGuideToggle");
  makeGuideToggle("shortcutsGuide", "shortcutsGuideToggle");

  // 버튼 호버 설명(.tip + data-tip) — 모두 body 바로 아래 뜬 공유 말풍선(#ribbonTipFloat)
  // 하나로 띄운다. CSS ::after 방식은 overflow 있는 조상(리본·도구창) 안에서 잘리고,
  // 화면 가장자리 버튼(맨 왼쪽 '새 문서' + 등)에선 가운데 정렬 때문에 창 밖으로 나갔다.
  // 여기는 뷰포트 기준으로 좌우를 밀어 넣고(클램핑) 위 공간이 없으면 아래로 뒤집는다.
  (function () {
    const float = $("ribbonTipFloat");
    if (!float) return;
    let hideTimer = null;
    function showFor(btn) {
      const tipText = btn.getAttribute("data-tip");
      if (!tipText) return;
      clearTimeout(hideTimer);
      float.textContent = tipText;
      const margin = 8;
      // 문구 길이에 따라 실제 높이가 달라지므로, 일단 띄워서 크기부터 잰다(위치는 아직 미정 —
      // top/left를 안 정한 상태론 화면 밖에 안 그려지니 켜자마자 바로 재도 무해하다).
      float.classList.add("on");
      const r = btn.getBoundingClientRect();
      const fr = float.getBoundingClientRect();
      // 버튼 위에 띄울 공간이 실제로 부족하면(뷰포트 맨 위 쪽) 아래로 뒤집는다
      const openDown = r.top - fr.height - margin < 0;
      float.classList.toggle("dir-up", !openDown);
      float.classList.toggle("dir-down", openDown);
      let left = r.left + r.width / 2 - fr.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - fr.width - margin));
      const top = openDown ? r.bottom + margin : r.top - margin - fr.height;
      float.style.left = left + "px";
      float.style.top = top + "px";
    }
    function hide() { float.classList.remove("on"); }
    document.querySelectorAll(".tip").forEach(function (btn) {
      btn.addEventListener("mouseenter", function () { showFor(btn); });
      btn.addEventListener("mouseleave", function () { hideTimer = setTimeout(hide, 30); });
      btn.addEventListener("mousedown", hide);
    });
  })();

  // ---------- 도움말 센터 · 둘러보기 · 첫 방문 환영 ----------
  // 상단바 ? 버튼(#btnHelp) → 도움말 모달(4탭), 그 안의 버튼 → 둘러보기(투어),
  // 진짜 첫 방문에만 환영 카드. 세 흐름 모두 마지막엔 새 문서 마법사로 수렴한다.
  const WELCOME_LS_KEY = "jgb_welcome_v1";

  // -- 도움말 센터 --
  // onClose: 첫 방문 흐름에서 "도움말을 닫으면 마법사"를 잇기 위한 1회용 콜백
  let helpOnClose = null;
  function showHelpPane(name) {
    // #helpModal 스코프 안에서만 토글 — 전역 .tab/.tabpanel(사이드바)과 절연
    document.querySelectorAll("#helpModal .help-tab").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-help") === name);
    });
    document.querySelectorAll("#helpModal .help-pane").forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-help") === name);
    });
  }
  function openHelpModal(opts) {
    helpOnClose = (opts && opts.onClose) || null;
    $("helpModal").style.display = "flex";
  }
  function closeHelpModal() {
    $("helpModal").style.display = "none";
    const cb = helpOnClose; helpOnClose = null;
    if (cb) cb();
  }
  $("btnHelp").addEventListener("click", function () { openHelpModal(); });
  $("helpClose").addEventListener("click", closeHelpModal);
  $("helpModal").addEventListener("click", function (e) {
    if (e.target === $("helpModal")) closeHelpModal();
  });
  document.querySelectorAll("#helpModal .help-tab").forEach(function (btn) {
    btn.addEventListener("click", function () { showHelpPane(btn.getAttribute("data-help")); });
  });
  $("helpTourBtn").addEventListener("click", function () {
    // closeHelpModal()을 쓰면 onClose(마법사)가 즉시 실행돼 버림 — 콜백을 투어 끝으로 넘긴다
    const cb = helpOnClose; helpOnClose = null;
    $("helpModal").style.display = "none";
    startTour(cb);
  });

  // -- 둘러보기(투어) --
  // 대상은 두 입력 모드에 공통으로 존재(리본은 모드에 따라 위치만 이동 — 매번 셀렉터로 재탐색)
  const TOUR_STEPS = [
    { sel: ".topbar-doc-actions", title: "문서 관리",
      body: "새 문서 만들기, 실행 취소·다시 실행, 전체 초기화를 여기서 합니다." },
    { sel: "#melInputSeg", title: "입력 방식",
      body: "직접 입력은 악보의 정간을 클릭해 그 자리에서 입력하고, 에디터는 곡 전체를 텍스트로 편집합니다. 언제든 바꿀 수 있습니다." },
    { sel: "#melodyRibbon", title: "기능바",
      body: "율명·시김새 팔레트 열기, 각 추가·삭제, 셀 서식, 율명 크기 조절을 여기서 합니다." },
    { sel: "#sheetArea", title: "악보",
      body: "정간보는 전통 방식대로 오른쪽에서 왼쪽으로 읽습니다. 정간을 클릭하면 바로 입력할 수 있습니다." },
    { sel: "#sidebar", title: "설정",
      body: "문서·레이아웃·출력 탭에서 제목, 정간 수, 인쇄와 저장을 설정합니다.",
      skipIf: function () { return document.body.classList.contains("sidebar-collapsed"); } },
    { sel: "#btnHelp", title: "도움말",
      body: "궁금할 때는 언제든 이 버튼으로 도움말을 열 수 있습니다. 둘러보기도 거기서 다시 시작할 수 있습니다." }
  ];
  let tourIdx = -1, tourOnEnd = null;
  function tourRect(step) {
    const el = document.querySelector(step.sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width || r.height) ? r : null;   // rect 0 = 화면에 없음 → 그 단계는 건너뜀
  }
  function stepAvailable(i) {
    const s = TOUR_STEPS[i];
    return !(s.skipIf && s.skipIf()) && !!tourRect(s);
  }
  function positionTour() {
    if (tourIdx < 0) return;
    const r = tourRect(TOUR_STEPS[tourIdx]);
    if (!r) { endTour(); return; }
    const pad = 6;
    const hole = $("tourHole");
    hole.style.left = (r.left - pad) + "px";
    hole.style.top = (r.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    // 말풍선은 대상 아래 우선, 공간이 없으면 위, 그래도 없으면 화면 안으로 클램핑
    const card = $("tourCard");
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
    let top = r.bottom + pad + gap;
    if (top + ch > window.innerHeight - 8) top = r.top - pad - gap - ch;
    if (top < 8) top = Math.max(8, Math.min(window.innerHeight - ch - 8, r.top));
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
    card.style.left = left + "px";
    card.style.top = top + "px";
  }
  function tourGo(i, dir) {
    while (i >= 0 && i < TOUR_STEPS.length && !stepAvailable(i)) i += dir;
    if (i < 0 || i >= TOUR_STEPS.length) { endTour(); return; }
    tourIdx = i;
    const s = TOUR_STEPS[i];
    $("tourStepNum").textContent = (i + 1) + " / " + TOUR_STEPS.length;
    $("tourTitle").textContent = s.title;
    $("tourBody").textContent = s.body;
    $("tourPrev").style.display = i === 0 ? "none" : "";
    $("tourNext").textContent = i === TOUR_STEPS.length - 1 ? "완료" : "다음";
    positionTour();
  }
  function startTour(onEnd) {
    // 겹침 방지 — 모달(z 500)들이 투어(z 800) 밑에 깔린 채 남지 않게 먼저 닫는다
    $("helpModal").style.display = "none";
    $("welcomeModal").style.display = "none";
    tourOnEnd = onEnd || null;
    $("tourLayer").style.display = "block";
    tourGo(0, 1);
  }
  function endTour() {
    // 건너뛰기·Escape·완료 모두 이 경로 — onEnd(첫 방문이면 마법사)는 딱 한 번
    tourIdx = -1;
    $("tourLayer").style.display = "none";
    const cb = tourOnEnd; tourOnEnd = null;
    if (cb) cb();
  }
  $("tourNext").addEventListener("click", function () { tourGo(tourIdx + 1, 1); });
  $("tourPrev").addEventListener("click", function () { tourGo(tourIdx - 1, -1); });
  $("tourSkip").addEventListener("click", endTour);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (tourIdx >= 0) { endTour(); return; }
    if ($("helpModal").style.display !== "none") closeHelpModal();
  });
  window.addEventListener("resize", function () { if (tourIdx >= 0) positionTour(); });

  // -- 첫 방문 환영 카드 --
  function showWelcome() {
    $("welcomeModal").style.display = "flex";
    // 표시하는 순간 기록 — 어떤 버튼을 누르든, 새로고침하든 다시 뜨지 않는다
    try { localStorage.setItem(WELCOME_LS_KEY, "1"); } catch (e) {}
  }
  $("wcSkip").addEventListener("click", function () {
    $("welcomeModal").style.display = "none";
    openNewDocWizard(applyNewDocAnswers);
  });
  $("wcTour").addEventListener("click", function () {
    $("welcomeModal").style.display = "none";
    startTour(function () { openNewDocWizard(applyNewDocAnswers); });
  });
  $("wcHelp").addEventListener("click", function () {
    $("welcomeModal").style.display = "none";
    openHelpModal({ onClose: function () { openNewDocWizard(applyNewDocAnswers); } });
  });

  // 이전 작업 복구(localStorage) — 저장된 게 없어도(첫 방문) 입력 모드 힌트 문구는 채워야 한다
  let restored = false;
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { applyState(JSON.parse(raw)); restored = true; } } catch (e) {}
  if (!restored) applyInputMode();
  // 새 문서 마법사 결과 적용(방금 '새 문서'로 리로드된 직후 한 번) — 없으면 저장된 작업이
  // 아예 없는 첫 실행인지 보고, 맞으면 같은 마법사를 바로 띄운다(임시저장 물어볼 것도 없음).
  let newDocPending = null;
  try {
    const pendingRaw = localStorage.getItem(NEWDOC_PENDING_KEY);
    if (pendingRaw) { newDocPending = JSON.parse(pendingRaw); localStorage.removeItem(NEWDOC_PENDING_KEY); }
  } catch (e) {}
  // 진짜 첫 방문 판정 — 저장된 작업도, 환영 카드를 본 기록도, 옛 가이드 기록(jgb_guide_seen_v1,
  // 레거시 사용자 표식으로 읽기만 유지)도 전혀 없을 때만. 첫 방문이면 마법사 대신 환영 카드가 먼저.
  let firstVisit = false;
  try {
    firstVisit = !restored && !newDocPending
      && !localStorage.getItem(WELCOME_LS_KEY)
      && !localStorage.getItem("jgb_guide_seen_v1");
  } catch (e) {}
  if (newDocPending) applyNewDocAnswers(newDocPending);
  else if (!restored && !firstVisit) openNewDocWizard(applyNewDocAnswers);

  buildPalette();
  buildJangdanPalette();
  fillDaegangPreset();
  reconcileMelody();
  reconcileJangdan();
  reconcileLyrics();
  render();
  refreshEditorSlices();
  renderTextList();

  // 첫 방문이면 환영 카드 — 옛 "선율 가이드 자동 열기"를 대체(가이드는 ? 버튼으로 여전히 사용).
  // 둘러보기/도움말/바로 시작 중 무엇을 골라도 마지막엔 새 문서 마법사로 이어진다.
  if (firstVisit) showWelcome();
})();
