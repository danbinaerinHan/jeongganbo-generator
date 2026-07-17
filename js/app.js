(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const CJK = "'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

  // 익명 사용 통계(js/analytics.js) — 래퍼가 없거나 실패해도 앱은 그대로 돌게 안전 호출만 한다
  const track = function (name, props) {
    try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) { /* 통계는 앱 동작에 영향 주지 않음 */ }
  };

  const PAGE_W = 210, PAGE_H = 297;
  // MARGIN_BASE: '페이지 채움' 0%일 때 기본 페이지 여백 / MARGIN_MIN: 100%여도 남기는 최소 여백(mm)
  // — 예시 악보처럼 테두리가 페이지 끝에 닿지 않고 항상 여백을 조금 둔다
  const MARGIN_BASE = 12, MARGIN_MIN = 9, INNER_PAD = 5;
  const T_THIN = 0.14, T_THICK = 0.32, T_FRAME = 0.63, T_DAEGANG = 0.45;   // 정간·각 선은 아주 살짝 얇게(0.16/0.36에서)
  // 셀 서식(직접 입력)에서 사용자가 고르는 테두리 굵기 3단계.
  // 예전엔 {0.3, 0.6, 1.0}으로 '격자선보다 눈에 띄게 굵게'였는데 전반적으로 너무 굵어서
  // 한 단계씩 낮췄고, 굵게는 다시 T_THICK까지 낮췄다 — 악보에 이미 있는 굵은 가로줄
  // (밴드 위/아래 통줄)과 같은 두께라야 [굵게]가 이 악보의 선처럼 보인다.
  // **T_THICK을 넘기지 말 것**: line()이 square cap이라 선은 양 끝에서 굵기의 절반만큼 더
  // 나가는데, 각 세로선(T_THICK)의 바깥 모서리도 딱 T_THICK/2다. 즉 굵기 = T_THICK일 때
  // 캡 끝이 세로선 바깥 모서리와 정확히 맞아떨어지고, 더 굵으면 그만큼 세로선을 삐져나온다
  // (0.6일 때 0.3 − 0.16 = 0.14가 튀어나와 '살짝 벗어나 보인다'는 말이 나왔다).
  // 얇게가 격자선과 같아진 건 의도한 것(테두리가 격자에 녹아든다).
  const CELL_BORDER_WIDTH_PX = { thin: T_THIN, medium: 0.3, thick: T_THICK };

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
  let yulAutoOpened = false;                // 첫 정간 입력 때 율명 팔레트 1회 자동 열기용
  let gakNames = {};                        // 각 이름(각 위 라벨): 각 번호(0부터) → 입력 원문("1장"·"대여음" 등)
  let cellEditDomain = null;                // 카드가 선율/장단/가사 중 어디서 열렸는지("mel"/"jd"/"ly")
  let cellEditGi = -1, cellEditCi = -1;     // 카드가 열려 있는 정간 좌표 (전역 커서와 별개로 기억)
  let keepCellEditor = false;               // true면 render()가 직접 입력 카드를 닫지 않음(실시간 반영용)
  let ornEditMode = false;                  // 시김새 수정 모드
  let ornSel = null;                        // 선택된 시김새 {gak, cell, k}
  let ornInstances = [];                    // 렌더된 시김새 위치 목록(수정 모드 히트용)
  let ornAddMode = false;                   // 시김새 추가 모드(직접 입력) — 숫자키로 붙임표 시김새를 고른 뒤 음을 클릭해 붙임
  let ornAddArmed = null;                   // 지금 골라둔(armed) 붙임표 시김새의 stem
  let ornAddHeldKey = null;                 // 숫자키를 '누르고 있는 동안에만' armed — 그 키. 떼면 해제
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
  // 방향 토글(위/아래)은 뺀다 — 선택과 무관하게 미리 골라둘 수 있는 '설정'이라서.
  const MEL_SEL_BTN_IDS = ["rangeClearToggle", "cellFillPaintToggle",
    "cellMergeBtn", "cellUnmergeBtn", "cellEraseBtn", "cellStyleResetBtn",
    "cellBorderShapeThick", "cellBorderShapeDashed", "cellBorderShapeDouble"];
  function refreshMelSelBtns() {
    const on = hasMelSel();
    MEL_SEL_BTN_IDS.forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = !on;
    });
  }
  let cellStylePendingColor = "#ffe08a";     // 배경색 칠하기에 쓸 현재 색(여러 색을 번갈아 칠할 수 있음)
  // 테두리 모양을 바꿀 가로줄(위/아래) — UI에 이 둘뿐이다. 정간보는 한 칸씩 세로로 쌓인
  // '열이 하나뿐인 표'라 좌우는 각의 벽이고, 그걸 칸마다 따로 손볼 일이 없다(건드리면 각이
  // 무너진다). 데이터 모델엔 right/left가 그대로 있어 예전 파일은 계속 그려진다 — 새로
  // 만들지 못할 뿐이고, [기본]이 네 변을 다 지우므로 옛 좌우 테두리를 걷을 길은 남아 있다.
  let cellBorderSides = { top: true, bottom: false };
  // 모양별로 굵기가 정해져 있다 — 예전엔 굵기(3) × 종류(4)를 다 조합하게 뒀는데, 여러 칸을
  // 한 번에 고르는 도구에서 그만한 경우의 수를 쓸 일이 없었다. '없음'은 여기 없다: 그건
  // 모양이 아니라 '합치기'라서 제 버튼으로 뺐다.
  const CELL_BORDER_SHAPES = {
    thick:  { width: "thick",  style: "solid"  },
    dashed: { width: "medium", style: "dashed" },
    double: { width: "medium", style: "double" }
  };
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

  // 제목·부제용 세로쓰기 여러 줄 — '//'가 줄바꿈. 전통 세로쓰기 흐름대로 첫 줄이 맨
  // 오른쪽, 다음 줄이 그 왼쪽으로 나가며, 줄 묶음 전체가 cx를 중심으로 좌우 대칭이 된다.
  function verticalTextML(cx, startY, str, font, weight, color, family, spacing) {
    const parts = String(str).split("//").map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length <= 1) {
      return verticalText(cx, startY, parts[0] || "", font, weight, color, family, spacing);
    }
    const colGap = font * 1.18;
    const g = el("g", {});
    let endY = startY;
    parts.forEach(function (part, i) {
      const x = cx + ((parts.length - 1) / 2 - i) * colGap;
      const tt = verticalText(x, startY, part, font, weight, color, family, spacing);
      g.appendChild(tt.g);
      if (tt.endY > endY) endY = tt.endY;
    });
    return { g, endY: endY };
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
      // 칸 폭 옵션 — 자동(6각 이상이면 2각) / 좁게(1각)
      titleGak = $("titleGakWidth").value === "1" ? 1 : (gakPerRow >= 6 ? 2 : 1);
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
    // 각 이름도 같은 자리에서 같이 민다 — 나뉜 각의 이름은 앞쪽(g)에 남는다
    shiftGakNames(g + 1, split ? 1 : n);
    renderGakNameList();
    afterGakStructureChange(g + 1);
  }
  // 하이라이트된 각을 삭제 (마지막 남은 각이면 내용만 비움). 가사도 같은 줄을 지운다.
  function deleteGakAtCursor() {
    syncFullFromEditor(); syncLyricsFromEditor();
    const g = structureTargetGak();
    const mLines = melodyFull.split("\n");
    if (g >= mLines.length) return;
    const gakRemoved = mLines.length > 1;   // 마지막 하나면 내용만 비움(이름은 유지)
    if (!gakRemoved) mLines[0] = "";
    else mLines.splice(g, 1);
    melodyFull = mLines.join("\n");
    if (gakRemoved) { shiftGakNames(g, -1); renderGakNameList(); }
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
  // 드래그로 고른 구간에서, 정간 하나의 순서 위치(seq)에 따라 어느 변을 건드릴지 계산.
  // 모드 넷뿐이다(예전 프리셋 '전체/바깥쪽'은 좌우를 건드려서 없앴다):
  //  · "sides": 지금 켠 가로줄 토글(위/아래)만 — 모양 바꾸기용.
  //  · "inner": 고른 구간의 '안쪽' 가로줄만(첫~끝 칸 사이 경계) — 합치기/나누기용.
  //    정간보를 '열이 하나뿐인 표'로 보고 구간 전체를 한 사각형처럼 다룬 것. 칸을 하나만
  //    고르면 안쪽이 없으므로 아무 일도 안 일어난다.
  //  · "erase": 좌우 벽 + 안쪽 가로줄 — [없애기]용. 합치기(안쪽만 지움)에 좌우까지 더한 것이라
  //    구간이 각에서 통째로 도려내진 빈 자리가 된다. 구간의 바깥 가로줄(첫 칸의 위·끝 칸의
  //    아래)은 일부러 빼둔다 — 그건 위아래 이웃 정간과 공유하는 선이라, 같이 지우면 남의 칸이
  //    열려버린다. 칸 하나만 골라도 좌우는 지워지므로 [합치기]와 달리 뭔가 일어난다.
  //  · "all": 네 변 전부 — [초기화]용. 옛 파일의 좌우 테두리도 이걸로 걷는다.
  function sidesForCellInRange(seq, lo, hi, mode) {
    if (mode === "all") return ["top", "right", "bottom", "left"];
    if (mode === "inner") return seq === hi ? [] : ["bottom"];
    if (mode === "erase") return seq === hi ? ["left", "right"] : ["left", "right", "bottom"];
    return ["top", "bottom"].filter(function (s) { return cellBorderSides[s]; });
  }
  // 드래그로 고른 구간의 정간마다 테두리를 적용(또는 지움).
  // 칠하기: spec = { width, style }. 지우기: spec = null (계산된 변만 지움).
  function applyCellBorderRange(startGi, startCi, endGi, endCi, spec, mode) {
    const lo = Math.min(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    const hi = Math.max(melCellSeq(startGi, startCi), melCellSeq(endGi, endCi));
    Object.keys(cellGeom).forEach(function (giKey) {
      const gi = parseInt(giKey, 10);
      Object.keys(cellGeom[gi]).forEach(function (ciKey) {
        const ci = parseInt(ciKey, 10);
        const seq = melCellSeq(gi, ci);
        if (seq < lo || seq > hi) return;
        const sides = sidesForCellInRange(seq, lo, hi, mode);
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
  // 정간 i-1과 i 사이 가로줄이 '없애기'의 세로 마스크에 갉히는지 — 갉히면 마스크 뒤에 다시 그어야 한다.
  // 없애기의 좌우 마스크는 지운 구간의 바깥 경계 y에서 butt cap으로 끝나는데, 그 y에 놓인 가로줄은
  // 선 굵기의 '가운데'가 그 y라 아래(또는 위) 반쪽이 마스크에 물린다. 그러면 그 줄은 양 끝에서만
  // 반 굵기로 남아 '가는 줄 하나 + 가운데만 굵은 줄 하나'처럼 두 줄로 보였다.
  // 대강선·통줄은 이미 structuralSegs가 마스크 뒤에 다시 그어 멀쩡했고, 평범한 정간 가로줄(T_THIN)만
  // 한 번 그리고 마는 탓에 이 문제가 났다 — 같은 방식으로 되살린다.
  function cellBoundaryNibbled(gi, i) {
    const row = cellStyles[gi];
    if (!row) return false;
    const above = row[i - 1] && row[i - 1].border;
    const below = row[i] && row[i].border;
    // 이 줄 자체를 숨기는 중이면(합치기·없애기의 안쪽 줄) 되살리면 안 된다
    if ((above && above.bottom && above.bottom.style === "none") ||
        (below && below.top && below.top.style === "none")) return false;
    const erased = function (b) {
      return !!b && ((b.left && b.left.style === "none") || (b.right && b.right.style === "none"));
    };
    return erased(above) || erased(below);
  }
  // '없음'(줄 숨김) 마스크 폭 — 이 스타일만은 위에 선을 새로 그리지 않고 마스크만 남으므로,
  // 숨겨야 할 기존 격자선(각 세로선 T_THICK, 대강선 T_DAEGANG)보다 넉넉해야 말끔히 지워진다.
  // 다른 스타일의 마스크 폭은 drawBorderMask에서 따로 잡는다(넉넉하면 되레 해로워서).
  const BORDER_HIDE_MASK_W = (Math.max(T_THICK, T_DAEGANG) / 2 + 0.15) * 2 + 0.4;
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
    // 이중선은 격자선 자리에 바깥 줄을 덧그리고 안쪽에 한 줄을 더 긋는 방식이라
    // 밑에 깔린 격자선을 지울 일이 없다 — 마스크 없음(있으면 각 틀만 갉는다).
    if (s.style === "double") return;
    const w = CELL_BORDER_WIDTH_PX[s.width] || CELL_BORDER_WIDTH_PX.medium;
    let x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    const horiz = (y1 === y2);
    // 마스크 폭 — '밑에 깔린 선을 가리는 데 필요한 만큼'이지, 넉넉할수록 좋은 게 아니다.
    // 마스크가 선보다 넓으면 그 차이만큼(양옆으로) 옆에서 맞닿는 선을 갉아 흰 틈을 남긴다.
    //  · 가로 테두리: 옆으로 넓어져도 나란한 선(정간 가로줄·대강선)만 스치므로 넉넉해도 된다.
    //    밑에 대강선(T_DAEGANG=0.45)이 깔렸을 수도 있어 w+0.4로 넉넉히 잡는다.
    //  · 세로 테두리: 정간 가로줄들이 옆에서 직각으로 맞닿는다 — 넉넉하면 그 끝이 0.2쯤
    //    잘려 '가로줄이 테두리에 안 닿는' 흰 틈이 생겼다. 밑의 각 세로선(T_THICK)만 겨우
    //    덮을 만큼으로 줄인다(선이 이미 그보다 굵으면 마스크도 선과 같은 폭이면 충분).
    const maskW = (s.style === "none") ? BORDER_HIDE_MASK_W
                : horiz ? w + 0.4
                : Math.max(w, T_THICK + 0.06);
    // 끝 처리 — square cap이면 끝을 maskW/2만큼 지나쳐 교차하는 각 세로선을 갉는데,
    // 그 위에 그리는 선은 더 얇아 다 못 덮는다 → 세로선에 위아래로 흰 틈이 남았다
    // (예전엔 '없음'에서만 막았다). butt cap으로 끝을 정확히 맞추고, 가로 마스크는
    // 세로선 반굵기만큼 안으로 들인다 — 안 지운 가로선 토막은 세로선 밑에 정확히 숨는다.
    if (horiz) { x1 += T_THICK / 2; x2 -= T_THICK / 2; }
    svg.appendChild(el("line", { x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: "#fff", "stroke-width": maskW, "stroke-linecap": "butt" }));
  }
  function drawBorderStroke(svg, s) {
    if (s.style === "none") return;   // '없음'은 마스크만 — 그 자리 격자선을 숨긴다
    const w = CELL_BORDER_WIDTH_PX[s.width] || CELL_BORDER_WIDTH_PX.medium;
    if (s.style === "double") {
      // 이중선 — 바깥 줄 + 칸 안쪽으로 나란히 한 줄(전통 악보의 겹줄 표기).
      // 바깥 줄은 예전엔 아예 안 그리고 원래 격자선(정간 가로줄 T_THIN=0.14)에 기댔는데,
      // 안쪽 줄보다 가늘어 겹줄이 아니라 '격자선 옆에 줄 하나'로 보였다. '보통' 굵기로
      // 또렷하게 긋는다 — 고른 굵기는 안쪽 줄만 타고 바깥은 늘 보통이다.
      // 격자선 위에 덧그리는 것이라 마스크는 필요 없다(drawBorderMask가 double은 건너뜀).
      svg.appendChild(line(s.x1, s.y1, s.x2, s.y2, CELL_BORDER_WIDTH_PX.medium));
      // 안쪽 줄 — butt cap: square면 끝이 칸 밖(각 사이 여백)으로 삐져나온다.
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
    if (!confirm("선율·장단·가사·텍스트·정간 서식 등 내용을 모두 지웁니다(레이아웃은 그대로 둠). 계속할까요?")) return;
    melodyFull = ""; $("jangdan").value = ""; lyricsFull = "";
    customTexts = []; nextTextId = 1; textSel = null;
    cellStyles = {}; gakNames = {}; renderGakNameList();
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
      track("doc_new", { v: answers.beats + "beats" });
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
  $("btnNewDoc").addEventListener("click", startNewDocument);   // 지금은 파일 메뉴 안
  // 실행 취소/다시 실행 버튼은 없앴다 — ⌘/Ctrl+Z·⇧Z 단축키로만 한다(문패 옆을 비우려고).
  // 단축키 배선은 아래 '되돌리기' 절에 그대로 있고, 도움말 '단축키' 탭이 안내한다.

  // ---------- 다크 모드 (수동 토글, localStorage에 유지) ----------
  // 색은 전부 CSS 역할 변수라 body.dark 클래스 하나로 UI 전체가 어두워진다.
  // 악보(종이)는 별도 흰색 SVG라 그대로 흰 종이로 남는다(인쇄·PNG도 안 바뀜).
  const DARK_LS_KEY = "jgb_dark_v1";
  function applyDark(on) {
    document.body.classList.toggle("dark", !!on);
    if ($("darkToggle")) $("darkToggle").setAttribute("data-tip",
      (on ? "밝은 화면으로 전환" : "어두운 화면으로 전환") + "\n· 악보(종이)는 늘 흰색으로 유지됩니다");
    if ($("darkToggleLbl")) $("darkToggleLbl").textContent = on ? "라이트" : "다크";
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
  // 악보가 화면보다 좁아 가로 스크롤 여지가 없을 땐 시트 자체를 옆으로 밀어(translate) 둘 수
  // 있게 한다 — 팔레트 창에 가리는 악보를 옆에 치워두는 용도. 줌이 바뀌면 범위 안으로 되돌림.
  // translate는 transform(scale)과 별개 속성이라 줌과 안 겹치고, #sheet의 transform 트랜지션도 안 탄다.
  let sheetShiftX = 0;
  function clampSheetShift() {
    const area = $("sheetArea"), sheet = $("sheet");
    if (!area || !sheet) return;
    // 폭은 rect 대신 레이아웃 폭×배율로 — 줌 트랜지션(.08s) 중간 값에 흔들리지 않게
    const scaledW = sheet.offsetWidth * viewZoom;
    const half = Math.max(0, (area.clientWidth - scaledW) / 2);
    sheetShiftX = Math.max(-half, Math.min(half, sheetShiftX));
    sheet.style.translate = sheetShiftX + "px 0px";
  }
  (function () {
    const area = $("sheetArea");
    if (!area) return;
    let panning = false, sx = 0, sy = 0, sl = 0, st = 0, baseShift = 0;
    area.addEventListener("pointerdown", function (e) {
      if (!document.body.classList.contains("pan-mode")) return;
      if (e.button !== undefined && e.button !== 0) return;
      // 악보 위에 떠 있는 컨트롤(줌·재생 바, 시김새·텍스트 조정 패널, 입력 카드)은 팬 대상에서 제외
      if (e.target.closest(".float-bar, .orn-panel, .cell-editor, #playPop")) return;
      panning = true;
      document.body.classList.add("panning");
      sx = e.clientX; sy = e.clientY; sl = area.scrollLeft; st = area.scrollTop;
      baseShift = sheetShiftX;
      try { area.setPointerCapture(e.pointerId); } catch (_e) {}
      e.preventDefault();
    });
    area.addEventListener("pointermove", function (e) {
      if (!panning) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      area.scrollTop = st - dy;
      // 가로: 스크롤 여지가 있으면 스크롤, 없으면 시트를 민다(둘 다일 일은 없음)
      if (area.scrollWidth > area.clientWidth) {
        area.scrollLeft = sl - dx;
      } else {
        sheetShiftX = baseShift + dx;
        clampSheetShift();
      }
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
    // 선율 정간을 클릭해 입력을 '맨 처음' 시작할 때 한 번만 율명 팔레트를 자동으로
    // 열어준다(새로고침 기준 1회, 다른 도구창이 이미 열려 있으면 건드리지 않음).
    // 그 뒤로는 사용자의 선택 존중 — 닫으면(X) 닫힌 대로, 시김새를 열면 연 대로.
    if (domain === "mel" && !yulAutoOpened) {
      yulAutoOpened = true;
      if (!document.querySelector(".direct-win.win-open")) activateDirectPanel("paletteCol");
    }
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
    // 이름 미상 추가 시김새(assets/symbol_svgs/symbols/sigimsae-XX) — 정식 이름을 알 때까지
    // 파일 번호 그대로 s01·s10 꼴로 부른다(토큰도 {s10} 꼴). 이름이 정해지면 k만 바꾸면 됨
    // (예: sigimsae-00=뜰). 순서는 파일 번호 순으로 유지.
    { s: "sigimsae-00", k: "뜰", c: "wo" },
    // 모지 — 가사 기호(special/모지.svg)와 같은 그림을 선율 시김새로도 쓴다(토큰 {모지})
    { s: "모지", k: "모지", c: "wo" },
    { s: "sigimsae-01", k: "s01", c: "wo" },
    { s: "sigimsae-02", k: "s02", c: "wo" }, { s: "sigimsae-03", k: "s03", c: "wo" },
    { s: "sigimsae-04", k: "s04", c: "wo" }, { s: "sigimsae-05", k: "s05", c: "wo" },
    { s: "sigimsae-06", k: "s06", c: "wo" }, { s: "sigimsae-07", k: "s07", c: "wo" },
    { s: "sigimsae-08", k: "s08", c: "wo" }, { s: "sigimsae-10", k: "十", c: "wo" },
    { s: "sigimsae-11", k: "文", c: "wo" },
    { s: "sigimsae-12", k: "s12", c: "wo" },
    { s: "sigimsae-13", k: "s13", c: "wo" }, { s: "sigimsae-14", k: "s14", c: "wo" },
    { s: "sigimsae-15", k: "s15", c: "wo" }, { s: "sigimsae-16", k: "s16", c: "wo" },
    { s: "sigimsae-17", k: "小", c: "wo" }, { s: "sigimsae-18", k: "左", c: "wo" },
    { s: "sigimsae-20", k: "s20", c: "wo" }, { s: "sigimsae-21", k: "s21", c: "wo" },
    { s: "sigimsae-22", k: "s22", c: "wo" }, { s: "sigimsae-23", k: "s23", c: "wo" },
    { s: "sigimsae-24", k: "s24", c: "wo" }, { s: "sigimsae-25", k: "s25", c: "wo" },
    { s: "no", k: "노", c: "with" }, { s: "ni", k: "니", c: "with" },
    { s: "ro", k: "로", c: "with" }, { s: "ri", k: "리", c: "with" },
    { s: "nina-dur", k: "니나", c: "with" }, { s: "neuna", k: "느나", c: "with" },
    { s: "nora", k: "노라", c: "with" }, { s: "neuni", k: "느니", c: "with" },
    { s: "noraneuni", k: "노라느니", c: "with" }, { s: "nirena", k: "니레나", c: "with" },
    { s: "nerona", k: "네로나", c: "with" }, { s: "nirona", k: "니로나", c: "with" },
    { s: "nineurani", k: "니느라니", c: "with" }, { s: "neunanina", k: "느나니나", c: "with" },
    { s: "neunareunani", k: "느나르나니", c: "with" }, { s: "shake", k: "요성표", c: "with" },
    { s: "shake-rep", k: "겹요성표", c: "with" }, { s: "repeat", k: "같은음표", c: "with" },
    { s: "bend-down", k: "퇴성", c: "both" }, { s: "bend-up", k: "추성", c: "both" },
    // 빠르기(tempo) — 정간에 넣으면 칸 안이 아니라 정간 오른쪽(가사 바깥)에 세로로 표시된다.
    // 토큰에 공백이 들어가면 drawCell이 분박으로 쪼개므로 k(표시명)도 공백 없는 파일 stem 그대로 쓴다.
    { s: "본래속도로", k: "본래속도로", c: "tempo" },
    { s: "점점느리게", k: "점점느리게", c: "tempo" },
    { s: "점점속하게", k: "점점속하게", c: "tempo" },
    { s: "조금느리게", k: "조금느리게", c: "tempo" },
    { s: "조금속하게", k: "조금속하게", c: "tempo" }
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
  const ATT_SYM_SCALE = { vib: 2.5, "vib-long": 2.5, splash: 2.5, "len-half": 0.5,
    // 싸랭·슬기둥1~3은 130%로 키우고, s00(sigimsae-00)은 80%로 줄임(팔레트·악보 공통)
    "diff-str-fast": 1.3, "diff-str-1": 1.3, "diff-str-2": 1.3, "diff-str-3": 1.3,
    // 추성(bend-up)은 기본이 작아 보여 120%로
    "bend-up": 1.2,
    "sigimsae-00": 0.8 };
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
  // 악기별 배정 번들 — 악기(및 "all")마다 자기 배정표를 기억한다. 수동으로 고친 배정은
  // 지금 악기 번들에 저장되고, 악기를 바꿨다 돌아와도 그대로다. 아직 안 가 본 악기만
  // 그 악기 우선순위 기본값(ornAddDefault)으로 시작한다.
  let ornAddMaps = {};
  // 지금 악기(ornInstrument) 우선순위로 팔레트 위쪽에 올라온 붙임표 시김새 앞 10개
  // ("all"이면 원래 순서 = ORN_ADD_DEFAULT와 동일).
  function ornAddDefault() {
    return sortByInstrument(ORN_ADD_ALL, function (o) { return o.k; })
      .slice(0, ORN_ADD_KEYS.length)
      .map(function (o) { return o.s; });
  }
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
        ornAddMaps[ornInstrument] = ornAddMap.slice();   // 수동 수정은 지금 악기 번들에 저장
        rebuildOrnAddKeyMap();
        buildOrnAddMapBar();   // 중복 정리로 다른 슬롯이 비워졌을 수 있어 전체 다시 그림
        buildOrnPalette($("directOrnPalette"));   // 새로 배정된 시김새가 팔레트 위쪽으로 올라오게
        if (palView === "orn") buildPalette();
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
    if (o.c === "tempo") return 0.7;   // 빠르기 — 팔레트 아이콘은 중간 크기로 통일
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
    exitOrnEditMode();   // 팔레트로 뭔가를 넣는 건 '다른 입력' — 미세조정 모드를 끈다
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

  // 가사 커서/편집 중인 칸에 기호 토큰({뜰} 등) 삽입 — insertToken(선율)과 같은 방식.
  function insertLyricToken(txt) {
    if (cellEditInput && cellEditDomain === "ly") {   // 직접 입력 — 지금 열린 가사 정간 카드에 삽입
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
    const ta = $("lyrics");
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(txt, s, e, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  // ---------- 가사 기호 팔레트 (special SVG) ----------
  // 클릭하면 편집 중인 가사 칸/커서에 {기호} 토큰이 들어가고, 악보엔 이미지로 표시된다.
  // stem = symbols-data.js(SYM_DATA)의 키(= assets/symbol_svgs/special 파일명).
  const LYRIC_SYMS = ["가로표", "세로표", "늘임표", "뜰", "모지", "장지", "튕김", "연튕김",
                      "전성", "퇴성", "추성"];
  // 시김새에서 빌려 쓰는 기호 — 가사 토큰은 한글 이름({전성} 꼴)을 쓰고,
  // 그림은 시김새 SVG(영문 stem)를 그대로 재사용한다.
  // 가로막대·세로막대는 가로표·세로표로 개명된 옛 토큰 호환용 별칭.
  const LYRIC_SYM_ALIAS = { "전성": "roll-str", "퇴성": "bend-down", "추성": "bend-up",
                            "가로막대": "가로표", "세로막대": "세로표" };
  function lyricSymStem(name) { return LYRIC_SYM_ALIAS[name] || name; }
  // 기호 SVG의 세로/가로 비율(viewBox에서) — 쌓을 때 실제 잉크 높이를 추정하는 용도.
  // data URL(base64)을 한 번만 풀어 보고 stem별로 캐시한다. 못 읽으면 정사각형(1) 간주.
  const symAspectCache = {};
  function symAspect(stem) {
    if (stem in symAspectCache) return symAspectCache[stem];
    let a = 1;
    try {
      const m = /base64,(.+)$/.exec(symURL(stem) || "");
      const vb = m ? /viewBox="([\d.\s-]+)"/.exec(atob(m[1])) : null;
      if (vb) {
        const p = vb[1].trim().split(/\s+/).map(Number);
        if (p[2] > 0 && p[3] > 0) a = p[3] / p[2];
      }
    } catch (e) { /* 비율을 모르면 1로 둔다 */ }
    symAspectCache[stem] = a;
    return a;
  }
  // 가사 칸 이미지 크기 배율 — 막대류는 0.8, 나머지(가야금주법·늘임표)는 0.4로 줄여 그린다.
  // 옛 이름(가로막대·세로막대)도 기존 문서 토큰 호환을 위해 같이 둔다.
  const LYRIC_SYM_SCALE = { "가로표": 0.8, "세로표": 0.8, "가로막대": 0.8, "세로막대": 0.8 };
  const LYRIC_SYM_SCALE_DEFAULT = 0.4;
  function buildLyricSymPal() {
    const wrap = $("lyricsSymRow");
    if (!wrap) return;
    wrap.innerHTML = "";
    // 가로표·세로표는 늘 맨 앞 — 악기 우선순위(해금 목록이 "늘임표, 가로표, 세로표" 순인 등)가
    // 늘임표를 앞세워도, 막대 둘은 가장 기본 기호라 순서 고정(늘임표보다 항상 앞).
    const pinned = ["가로표", "세로표"];
    const sorted = sortByInstrument(LYRIC_SYMS.slice(), function (n) { return n; })
      .filter(function (n) { return pinned.indexOf(n) === -1; });
    pinned.concat(sorted).forEach(function (stem) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lsp-btn";
      item.title = stem;
      item.dataset.sym = stem;
      const url = symURL(lyricSymStem(stem));
      if (url) {
        const img = document.createElement("img");
        img.src = url; img.alt = stem;
        item.appendChild(img);
      }
      const cap = document.createElement("span");
      cap.className = "lsp-cap"; cap.textContent = stem;
      item.appendChild(cap);
      item.addEventListener("mousedown", function (e) { e.preventDefault(); });
      item.addEventListener("click", function () { insertLyricToken("{" + stem + "}"); });
      wrap.appendChild(item);
    });
  }

  // ---------- 악기별 시김새 우선순위 ----------
  // 악기를 고르면 그 악기에서 자주 쓰는 기호가 '각 그룹 안에서' 맨 앞으로 올라온다
  // (붙임표/독립/운지 그룹 구분은 유지 — 그룹마다 입력 동작이 달라 섞지 않는다).
  // 이름은 표시 이름(시김새 k·가사 기호 이름) 기준이고, 시김새·가사 팔레트가 각자
  // 자기한테 있는 이름만 골라 쓴다 — 팔레트에 없는 이름은 조용히 무시된다.
  // 요성표·겹요성표는 농음표를 뜻하므로 농음표로 적음(사용자 확인).
  const INSTRUMENT_PRIORITY = {
    "가야금": ["모지", "장지", "튕김", "연튕김", "뜰", "싸랭", "슬기둥1", "슬기둥2", "슬기둥3",
              "전성", "퇴성", "흘림표", "추성", "미는표"],
    "거문고": ["슬기둥1", "슬기둥2", "슬기둥3", "싸랭", "뜰", "자출", "추성", "퇴성", "전성",
              "s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08",
              "s12", "s13", "s14", "s15", "s16"],
    "대금": ["미는표", "흘림표", "니레", "니라", "니로", "노네", "너녜", "노니로", "노리노",
            "네로네", "느네느", "나니로", "로니로", "느로니르", "느니르", "니루니",
            "나니르노니르", "노", "니", "로", "리", "니나", "느나", "노라", "느니",
            "나니나", "나느나", "니레나", "네로나", "니로나", "니느라니", "느나니나",
            "느나르나니", "농음표", "풀어내림표", "떠이어표", "같은음표"],
    "피리": ["미는표", "흘림표", "서침표", "시루표", "루러표", "농음표", "덧길이표", "반길이표",
            "늘임표", "니레", "니라", "노니노", "나니르", "나니나니르", "느로니르", "로", "니",
            "니나", "느라", "느니", "니레나", "느나", "나니나", "나느나", "낮게", "니로나",
            "느니라", "s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"],
    "해금": ["미는표", "흘림표", "노", "나", "니나", "노라", "느니", "니레나", "느나", "나니나",
            "루러표", "낮게", "니레", "니라", "나니로", "농음표", "노네", "덧길이표", "반길이표",
            "늘임표", "가로표", "세로표"],
    "아쟁": ["미는표", "흘림표", "니레", "농음표", "늘임표"]
  };
  let ornInstrument = "all";   // "all" | INSTRUMENT_PRIORITY의 키
  function ornInstrumentRank() {
    const rank = new Map();
    (INSTRUMENT_PRIORITY[ornInstrument] || []).forEach(function (name) {
      if (!rank.has(name)) rank.set(name, rank.size);
    });
    return rank;
  }
  // 우선순위로 안정 정렬 — 목록에 없는 항목은 원래 순서 그대로 뒤에 온다
  function sortByInstrument(items, nameOf) {
    const rank = ornInstrumentRank();
    return items
      .map(function (it, i) {
        const r = rank.has(nameOf(it)) ? rank.get(nameOf(it)) : Infinity;
        return { it: it, i: i, r: r };
      })
      .sort(function (a, b) { return (a.r - b.r) || (a.i - b.i); })
      .map(function (x) { return x.it; });
  }
  // 시김새 팔레트 전용 정렬 — 숫자 단축키(1~0)에 배정된 시김새가 번호 순으로 그룹 맨
  // 앞에 오고, 나머지는 악기 우선순위 → 원래 순서. 배정 줄에서 단축키를 바꾸면 그
  // 시김새가 곧바로 위쪽으로 올라온다. 악기 기본 배정과도 자연히 맞는다 — 기본 배정
  // 자체가 우선순위 앞 10개라 그 악기에선 두 기준이 같은 순서를 내서.
  function sortOrnChips(items) {
    const rank = ornInstrumentRank();
    return items
      .map(function (o, i) {
        const ki = ornAddMap.indexOf(o.s);
        return { o: o, i: i, k: ki === -1 ? Infinity : ki,
                 r: rank.has(o.k) ? rank.get(o.k) : Infinity };
      })
      .sort(function (a, b) { return (a.k - b.k) || (a.r - b.r) || (a.i - b.i); })
      .map(function (x) { return x.o; });
  }
  function setOrnInstrument(v, opts) {
    const next = INSTRUMENT_PRIORITY[v] ? v : "all";
    if (next !== ornInstrument) {
      // 숫자 단축키(1~0)는 악기별 번들 — 떠나는 악기 번들에 지금 배정을 저장하고,
      // 가는 악기는 자기 번들이 있으면 그대로, 처음이면 그 악기 우선순위 기본값.
      // 그래서 수동으로 고친 배정이 악기를 오가도 안 날아간다.
      ornAddMaps[ornInstrument] = ornAddMap.slice();
      ornInstrument = next;
      ornAddMap = ornAddMaps[next] ? ornAddMaps[next].slice() : ornAddDefault();
      rebuildOrnAddKeyMap();
      buildOrnAddMapBar();
    }
    document.querySelectorAll(".orn-instrument").forEach(function (s) { s.value = ornInstrument; });
    buildOrnPalette($("directOrnPalette"));
    if (palView === "orn") buildPalette();
    buildLyricSymPal();
    if (!opts || !opts.silent) saveState();
  }

  // ---------- 각 이름 (각 위 라벨: 대여음·중여음·1장 등) ----------
  // 각 번호(0부터)에 소속되어 각 삽입/삭제·페이지 이동을 따라다닌다. 입력은 한글 원문
  // 그대로 저장하고, 악보 '표기'만 한자로 바꾼다 — 모르는 단어는 쓴 그대로 표시.
  const GAK_NAME_HANJA = { "대여음": "大餘音", "중여음": "中餘音", "여음": "餘音",
                           "환입": "還入", "초장": "初章", "종장": "終章" };
  function gakNameDisplay(raw) {
    raw = String(raw).trim();
    // 한자 표시 옵션(장 이름 창 머리줄) — 끄면 쓴 그대로
    const hanja = $("gakNameHanja");
    if (hanja && !hanja.checked) return raw;
    if (GAK_NAME_HANJA[raw]) return GAK_NAME_HANJA[raw];
    const m = /^(\d+)장$/.exec(raw);
    if (m) return numToHanja(parseInt(m[1])) + "章";
    return raw;
  }
  // 각 삽입/삭제 때 이름이 같은 각에 붙어 있게 민다. delta<0이면 [from, from-delta) 구간의 이름은 버림
  function shiftGakNames(from, delta) {
    const next = {};
    Object.keys(gakNames).forEach(function (k) {
      const gi = +k;
      if (delta < 0 && gi >= from && gi < from - delta) return;
      next[gi >= from ? gi + delta : gi] = gakNames[k];
    });
    gakNames = next;
  }
  function setGakName(gi, raw) {
    raw = String(raw || "").trim();
    if (raw) gakNames[gi] = raw; else delete gakNames[gi];
    renderGakNameList();
    render();
    saveState();
  }
  // 도구창의 이름 목록 — 타이핑 중 포커스를 잃지 않게 render()에서는 부르지 않고,
  // 값이 확정될 때(setGakName·상태 복원)만 다시 그린다.
  function renderGakNameList() {
    const list = $("gakNameList");
    if (!list) return;
    list.innerHTML = "";
    const keys = Object.keys(gakNames).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) {
      const empty = document.createElement("div");
      empty.className = "tx-empty";
      empty.textContent = "아직 없습니다. 악보에서 각 위 빈 곳을 클릭하거나, 위 칸에 각 번호와 이름을 적고 '추가'를 누르세요.";
      list.appendChild(empty);
      return;
    }
    keys.forEach(function (gi) {
      const row = document.createElement("div");
      row.className = "tx-item";
      const lab = document.createElement("span");
      lab.className = "gn-gak";
      lab.textContent = (gi + 1) + "번 각";
      const txt = document.createElement("input");
      txt.type = "text"; txt.value = gakNames[gi]; txt.title = "이름 (예: 1장, 대여음)";
      txt.addEventListener("change", function () { setGakName(gi, txt.value); });
      const del = document.createElement("button");
      del.type = "button"; del.className = "mel-btn"; del.textContent = "✕"; del.title = "이 이름 삭제";
      del.addEventListener("click", function () { setGakName(gi, ""); });
      row.appendChild(lab); row.appendChild(txt); row.appendChild(del);
      list.appendChild(row);
    });
  }
  // 악보에서 각 위 빈 곳을 클릭하면 그 자리에 뜨는 작은 입력 카드 (Enter/바깥 클릭=확정, Esc=취소)
  let gakNameCard = null;
  function closeGakNameCard() {
    if (gakNameCard) { gakNameCard.remove(); gakNameCard = null; }
  }
  function openGakNameCard(gi, pageIdx, cx, topY) {
    closeGakNameCard();
    const svg = pageSvgs[pageIdx]; if (!svg) return;
    const area = $("sheetArea");
    const sr = svg.getBoundingClientRect(), ar = area.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const px = sr.left - ar.left + area.scrollLeft + cx * (sr.width / vb.width);
    const py = sr.top - ar.top + area.scrollTop + topY * (sr.height / vb.height);
    const card = document.createElement("div");
    card.className = "cell-editor";
    card.style.cssText = "position:absolute;left:" + Math.max(2, px - 60) + "px;top:" + Math.max(2, py - 40) + "px;z-index:7;";
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = gakNames[gi] || "";
    inp.placeholder = "예: 1장, 대여음";
    inp.style.cssText = "width:120px;font-size:13px;padding:5px 7px;font-family:inherit;border:1px solid var(--accent);border-radius:6px;";
    card.appendChild(inp);
    area.appendChild(card);
    gakNameCard = card;
    let done = false;
    function commit() { if (done) return; done = true; const v = inp.value; closeGakNameCard(); setGakName(gi, v); }
    function cancel() { if (done) return; done = true; closeGakNameCard(); }
    inp.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    inp.addEventListener("blur", commit);
    inp.focus(); inp.select();
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
    // 퇴성·추성(both)은 음표에 붙여 쓰는 게 기본이라 붙임표 그룹에 함께 담는다.
    // 이름 미정 시김새 s01~s25(sigimsae-01~25)는 동작은 붙임표(wo)지만 팔레트에선
    // '운지'라는 별도 그룹으로 독립 기호와 빠르기 사이에 모아 보여준다.
    // 뜰(sigimsae-00)은 이름이 정해졌으니 운지에서 빼고 붙임표에 그대로 둔다.
    const isUnji = function (o) { return o.s.indexOf("sigimsae-") === 0 && o.s !== "sigimsae-00"; };
    const groups = [
      { title: "붙임표", sub: "음표 오른쪽에 작게",
        match: function (o) { return (o.c === "wo" || o.c === "both") && !isUnji(o); } },
      { title: "독립 기호", sub: "한 칸 차지",
        match: function (o) { return o.c === "with"; } },
      { title: "운지", sub: "음표 오른쪽에 작게 붙음",
        match: isUnji },
      { title: "빠르기", sub: "정간 오른쪽에 세로로 표시",
        match: function (o) { return o.c === "tempo"; } }
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
      sortOrnChips(ORN_LIST.filter(grp.match)).forEach(function (o) {
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
          // 추가 모드에선(지금 이 시김새에 숫자가 배정돼 있으면) 칩 클릭으로 골라둔다 —
          // 마우스엔 '누르고 있기'가 없어 클릭은 켜고, 같은 칩을 다시 누르면 끄는 토글로 둔다
          // (안 그러면 마우스로 고른 건 해제할 길이 없다). ORN_ADD_KEY_BY_STEM은 매번 다시
          // 조회해야 배정을 바꾼 뒤에도 안 어긋난다.
          if (ornAddMode && ORN_ADD_KEY_BY_STEM[o.s]) {
            if (ornAddArmed === o.s) disarmOrnAdd(); else armOrnAdd(o.s);
            return;
          }
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
  // 숫자키는 '누르고 있는 동안에만' 붙임표를 골라둔다(keydown=고름 / keyup=해제) — 한 번
  // 눌러 계속 붙던 예전 방식은 해제할 길이 없어 불편했다. 키를 누른 채 악보의 음을 클릭하면
  // 붙고, 키를 떼면 곧바로 풀린다.
  function disarmOrnAdd() {
    if (!ornAddArmed && !ornAddHeldKey) return;
    ornAddHeldKey = null; ornAddArmed = null;
    refreshOrnAddBadges();
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
    ornAddHeldKey = e.key;
    armOrnAdd(stem);
  });
  document.addEventListener("keyup", function (e) {
    if (ornAddHeldKey && e.key === ornAddHeldKey) disarmOrnAdd();
  });
  // 키를 누른 채 창을 벗어나면 keyup을 놓쳐 armed가 남을 수 있다 — 안전하게 해제
  window.addEventListener("blur", disarmOrnAdd);

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
    // 기호 크기는 분박(행) 수와 무관하게 한 가지로 고정 — 율명(drawCell)·가사(drawLyricCell)가
    // 행 수와 무관하게 같은 크기를 쓰는 것과 같은 규칙(행이 많아지면 촘촘해질 뿐 줄어들지 않는다).
    // 예전엔 rowH(=cellH/행수)에 비례해 분박이 생기면 확 작아졌다.
    const box0 = Math.min(width * 0.6, cellH * 0.46);
    rows.forEach(function (name, i) {
      const cy = yTop + rowH * (i + 0.5);
      // 이음(-)은 장구 기호가 아니라 앞 박을 이어가는 표시 — 예전엔 data["-"]가 없어 그냥
      // 사라졌다. 선율(drawGlyph)처럼 가로로 늘인 대시(-)로 보이게 그린다.
      if (name === "-") {
        const cx = x + width / 2, fs = box0;
        const t = el("text", { x: cx, y: cy + fs * 0.28, "text-anchor": "middle",
          "font-size": fs, "font-family": NOTE_FONT, fill: "#111" });
        t.textContent = "-";
        t.setAttribute("transform", "translate(" + cx + " 0) scale(" + TIE_STRETCH + " 1) translate(" + (-cx) + " 0)");
        svg.appendChild(t);
        return;
      }
      const href = data[name];
      if (!href) return;
      const box = box0 * (JANGGU_DRAW_SCALE[name] || 1);
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
    const rowH = cellH / rows.length;
    rows.forEach(function (str, i) {
      if (str === "-") return;   // '-'는 자리표 — 자리(행 순서)만 차지하고 그리지는 않는다
      // {기호} 토큰이면 글자 대신 이미지를 한 글자처럼 그린다(원본 비율 유지).
      // 한글 별칭(전성·퇴성·추성)은 시김새 SVG stem으로 바꿔서 찾는다.
      // 한 행에 토큰이 여럿({모지}{퇴성})이면 옆이 아니라 위아래로 쌓고, 각각의
      // 크기는 단독일 때와 똑같이 유지한다. 간격은 그리기 박스가 아니라 '실제 잉크
      // 높이'(viewBox 비율로 추정) 기준으로 바짝 붙인다 — 박스엔 meet 정렬 여백이
      // 커서 박스 간격으로 쌓으면 실제 기호끼리는 멀어 보인다.
      const symTokens = str.match(/\{[^}]+\}/g);
      if (symTokens && symTokens.join("") === str) {
        const names = symTokens.map(function (t) { return t.slice(1, -1); });
        if (names.every(function (nm) { return symURL(lyricSymStem(nm)); })) {
          const items = names.map(function (nm) {
            const sc = (nm in LYRIC_SYM_SCALE) ? LYRIC_SYM_SCALE[nm] : LYRIC_SYM_SCALE_DEFAULT;
            const stem = lyricSymStem(nm);
            // 세로 박스는 행 높이가 아니라 '정간 높이' 기준 — 글자 크기가 분박 수와
            // 무관하게 고정인 것과 같은 규칙. 행이 많으면 촘촘해질 뿐 안 줄어든다.
            const bw = width * 0.95 * sc, bh = cellH * 0.95 * sc;
            return { stem: stem, bw: bw, bh: bh, ink: Math.min(bh, bw * symAspect(stem)) };
          });
          const gapY = width * 0.18;   // 기호(잉크) 사이 틈 — 빡붙지 않게 아주 약간만
          const total = items.reduce(function (a, it) { return a + it.ink; }, 0)
            + gapY * (items.length - 1);
          let yCur = centers[i] - total / 2;
          items.forEach(function (it) {
            const inkCy = yCur + it.ink / 2;   // 잉크는 박스 세로 중앙에 그려진다(meet)
            drawSymImageRect(svg, it.stem, x + width / 2 - it.bw / 2, inkCy - it.bh / 2, it.bw, it.bh);
            yCur += it.ink + gapY;
          });
          return;
        }
      }
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
  function drawCell(svg, x, yTop, cell, content, gakIdx, cellIdx, pageIdx, lyPad) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const nRows = rows.length;
    let symK = -1;   // 이 정간 안의 기호(시김새) 순번 (원본 {…} 등장 순서)
    const rawRowToks = rows.map(tokenizeNotes);
    // 숨표(<)는 음표처럼 자리를 차지하지 않고 이 정간 오른쪽-아래 모서리에 한 번만 고정 표시된다.
    // 어느 행에 섞여 있든 상관없이 감지만 하고, 배치 계산에서는 제외한다.
    const hasBreath = rawRowToks.some(function (toks) { return toks.some(function (tk) { return tk.breath; }); });
    // 빠르기(tempo) 시김새도 칸 안 자리를 차지하지 않고 정간 오른쪽(가사 바깥)에 세로로 표시된다.
    // 숨표와 같은 방식으로 감지만 하고 배치 계산(분박·칸 수)에서는 제외한다.
    const tempoSyms = [];
    rawRowToks.forEach(function (toks) {
      toks.forEach(function (tk) { if (tk.sym && ORN_CAT[tk.sym] === "tempo") tempoSyms.push(tk.sym); });
    });
    const rowToks = rawRowToks.map(function (toks) {
      return toks.filter(function (tk) { return !tk.breath && !(tk.sym && ORN_CAT[tk.sym] === "tempo"); });
    });
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

    // 빠르기(tempo) — 정간 오른쪽(가사가 켜져 있으면 가사 줄 바깥)에 세로로 꽉 차게.
    // 세로 긴 이미지라 정사각 drawSymImage 대신 세로 박스(drawSymImageRect)로 그린다.
    if (tempoSyms.length) {
      const tmH = cell * 0.92;               // 정간 높이 대비 세로 크기
      const tmW = cell * 0.4;                // 세로 이미지라 가로는 좁게(meet로 원본 비율 유지)
      const tmLeft = x + cell + (lyPad || 0) + cell * 0.08;   // 정간(+가사) 바깥 오른쪽
      // 여러 개면 세로로 나눠 배치(보통 1개)
      tempoSyms.forEach(function (sym, ti) {
        const h = tmH / tempoSyms.length;
        const yT = yTop + cell / 2 - tmH / 2 + h * ti;
        drawSymImageRect(svg, sym, tmLeft, yT, tmW, h);
      });
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
  // 잉크가 viewBox 안에서 한쪽으로 치우친 기호의 가로 보정(그리는 폭 대비 비율).
  // 퇴성(bend-down)은 단독으로 쓰든 음에 붙든 살짝 왼쪽으로 보여 오른쪽으로 민다.
  const SYM_X_NUDGE = { "bend-down": 0.15 };
  function drawSymImage(svg, key, cx, cyc, box) {
    const href = symURL(key) || (NOTE_DIR + key + ".png");
    const im = el("image", {
      x: cx - box / 2 + box * (SYM_X_NUDGE[key] || 0), y: cyc - box / 2, width: box, height: box,
      preserveAspectRatio: "xMidYMid meet"
    });
    im.setAttribute("href", href);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    svg.appendChild(im);
  }

  // 이미지 한 개를 (x,y) 좌상단 · w×h 박스 안에 원본 비율 유지(meet)로 그림.
  // 세로로 긴 빠르기·가사 기호처럼 정사각이 아닌 이미지를 위한 헬퍼.
  function drawSymImageRect(svg, key, x, y, w, h) {
    const href = symURL(key) || (NOTE_DIR + key + ".png");
    const im = el("image", { x: x + w * (SYM_X_NUDGE[key] || 0), y: y, width: w, height: h,
      preserveAspectRatio: "xMidYMid meet" });
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
    // '//' = 줄바꿈 — 세로 칸 제목은 새 세로줄(오른쪽→왼쪽), 가로 제목은 아랫줄
    const titleParts = titleTxt ? titleTxt.split("//").map(function (s) { return s.trim(); }).filter(Boolean) : [];
    const subParts = subTxt ? subTxt.split("//").map(function (s) { return s.trim(); }).filter(Boolean) : [];
    const wantHeader = $("header").checked;
    const wantFrame = $("frame").checked;
    const wantJangdan = $("wantJangdan").checked;
    document.body.classList.toggle("want-jangdan", wantJangdan);
    const wantLyrics = $("wantLyrics").checked;
    document.body.classList.toggle("want-lyrics", wantLyrics);
    // 텍스트(자유 주석)는 켜짐 스위치가 없어 '하나라도 있음'을 레이어 사용 표시(초록 점)에 쓴다
    document.body.classList.toggle("has-texts", customTexts.length > 0);
    document.body.classList.toggle("has-gaknames", Object.keys(gakNames).length > 0);
    const wantTempo = $("wantTempo").checked;
    const gakNumMode = $("gakNumMode").value;   // 각 번호: none | screen(화면에만) | all(출력 포함)
    document.body.classList.toggle("gaknum-screen", gakNumMode === "screen");
    const pageNumPos = $("pageNumPos").value;   // 쪽 번호 위치 — 페이지 루프 밖에서 한 번만 조회
    const tempoStr = "一分・" + numToHanja(Math.max(1, parseInt($("tempoBpm").value) || 60)) + "井";
    // 각/장 창의 템포 항목 — 켜져 있을 때만 보이고(CSS), 미리보기는 지금 BPM으로 만든 실물 그대로
    document.body.classList.toggle("want-tempo", wantTempo);
    if ($("tempoPreview")) $("tempoPreview").textContent = tempoStr;
    // 템포 글자 크기 배율 — 각/장 이름(gakNameSize)과 따로 논다. 아래 높이 예약과 실제
    // 그리기가 같은 값을 써야 키운 만큼 진짜로 커진다(예약을 안 늘리면 avail에 걸려 잘린다).
    const tempoMul = Math.max(0.3, parseFloat($("tempoSize").value) || 1);
    const dg = parseDaegang($("daegang").value, beats);
    noteMode = $("noteMode").value;   // "font" | "hangul"

    const sizeScale = Math.max(0.3, parseFloat($("sizeScale").value) || 1);
    $("sizeScaleVal").textContent = sizeScale.toFixed(1) + "×";
    noteScaleCur = Math.max(0.5, parseFloat($("noteScale").value) || 1);
    $("noteScaleVal").textContent = noteScaleCur.toFixed(2).replace(/0$/, "") + "×";
    lyricsScaleCur = Math.max(0.5, parseFloat($("lyricsScale").value) || 1);
    $("lyricsScaleVal").textContent = lyricsScaleCur.toFixed(2).replace(/0$/, "") + "×";
    const desiredCell = Math.max(2, parseFloat($("cellSize").value) || 11) * sizeScale;
    // 각 사이 간격의 '총량' — 가사를 켜면 가사 줄이 이 간격 안에 들어가고(아래 desiredGap
    // 계산에서 가사 줄 폭만큼 상쇄), 각 기둥 사이 거리는 가사 여부와 무관하게 유지된다
    const desiredGapBase = Math.max(0, parseFloat($("gakGap").value) || 0) * sizeScale;
    const desiredBandGap = Math.max(0, parseFloat($("bandGap").value) || 0) * sizeScale;
    const desiredTitle = Math.max(1, parseFloat($("titleSize").value) || 10);
    // 상하는 직관대로 '양수 = 위로' — 렌더 좌표는 아래가 +라서 여기서 부호를 뒤집는다
    const desiredTitleOff = -(parseFloat($("titleOffset").value) || 0);
    const desiredTitleOffX = parseFloat($("titleOffsetX").value) || 0;
    const desiredTitleSpacing = parseFloat($("titleSpacing").value) || 0;
    const desiredSub = Math.max(1, parseFloat($("subSize").value) || 5);
    const desiredSubOff = -(parseFloat($("subOffset").value) || 0);
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
      // 칸 폭 옵션 — 자동(6각 이상이면 2각) / 좁게(1각). formStructure()와 같은 규칙
      titleGak = $("titleGakWidth").value === "1" ? 1 : (gakPerRow >= 6 ? 2 : 1);
      if (gakPerRow - titleGak < 1) titleGak = Math.max(0, gakPerRow - 1);
    }
    // 칸 폭 옵션은 세로 칸 제목에만 의미 — '가로 위'를 고르면 컨트롤을 숨긴다
    if ($("titleGakWidthWrap")) {
      $("titleGakWidthWrap").style.display = $("titleLayout").value === "top" ? "none" : "";
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

    // 가사 줄(정간 오른쪽 좁은 칸) 너비 — 켜져 있으면 각(정간)마다 매번 추가됨.
    // 가사 칸은 정간(각) 오른쪽에 딱 붙인다(간격 0) — 남는 간격은 전부 다음 각과의 사이로
    const desiredLyGap = 0;
    const desiredLyW = wantLyrics ? desiredCell * 0.4 : 0;
    const desiredLyExtra = desiredLyGap + desiredLyW;
    // 가사 줄은 각 사이 간격 '안'에 들어간다 — 가사를 켜도 (남는 간격 + 가사 줄) 합이
    // 원래 간격과 같아 각 기둥 위치·전체 폭이 안 바뀐다. 간격이 가사 줄보다 좁으면
    // 겹치지 않게 0까지만 줄인다(그때만 전체가 가사 줄 몫만큼 넓어짐).
    const desiredGap = wantLyrics ? Math.max(0, desiredGapBase - desiredLyExtra) : desiredGapBase;
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
    // tempoMul을 곱해야 크기를 키운 만큼 위 공간도 같이 늘어난다(안 그러면 그리기가 avail에 걸려 잘림).
    const tempoFont = cell * 0.42 * tempoMul;
    const tempoLineH = tempoFont * 1.12;
    // 격자와 템포 글자 사이 여백 — 각/장 이름(#gakNameGap)과 따로 노는 제 값(#tempoGap).
    // 예약과 그리기(drawTempoLabel)가 이 한 값을 같이 쓴다: 예전엔 예약은 tempoFont*0.45,
    // 그리기는 gakNameGap이라 서로 어긋나 있었다.
    const tempoGap = Math.max(0, parseFloat($("tempoGap").value) || 0) * scale;
    const tempoH = wantTempo ? (Array.from(tempoStr).length * tempoLineH + tempoGap) : 0;
    // 가로 제목(맨 위 밴드 위 중앙) — 첫 페이지 위쪽에 제목(+부제) 높이를 예약한다
    const titleTopFont = desiredTitle * scale;
    const titleTopSubFont = desiredSub * scale;
    // '//' 줄바꿈으로 늘어난 줄 수만큼 예약 높이도 같이 늘린다 — 안 그러면 격자와 겹침
    const titleTopExtraH = Math.max(0, titleParts.length - 1) * titleTopFont * 1.15
      + Math.max(0, subParts.length - 1) * titleTopSubFont * 1.2;
    const titleTopH = titleTopMode
      ? (titleTopFont * 1.35 + (subTxt ? titleTopSubFont * 1.5 : 0) + titleTopExtraH) : 0;
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
            // 빠르기 기호는 정간 오른쪽에 그려지므로, 가사가 켜져 있으면 가사 줄 폭만큼 더 바깥에 놓는다.
            if (content) drawCell(svg, x, gridTop + j * cell, cell, content, melIdx, j, pageIdx,
              wantLyrics ? (lyGap + lyW) : 0);
          }
          // 세로선·정간 구분 가로선 — 항상 전체 높이. 위/아래 마감은 밴드 통줄이, 대강선은 아래
          // 밴드 통줄과 같은 방식으로 각 사이 간격까지 끊기지 않게 따로 그린다(굵게, 밴드 전체 폭).
          svg.appendChild(line(x, gridTop, x, gridBottom, T_THICK));
          svg.appendChild(line(x + cell, gridTop, x + cell, gridBottom, T_THICK));
          for (let i = 1; i < beats; i++) {
            if (dgSet.has(i)) continue;          // 대강선은 아래에서 밴드 폭으로 따로(구조선이라 마스크 뒤에 다시 그림)
            const cy = gridTop + i * cell;
            svg.appendChild(line(x, cy, x + cell, cy, T_THIN));
            // 없애기의 세로 마스크가 이 줄의 반쪽을 갉는 자리면 구조선에 얹어 마스크 뒤에 다시 긋는다
            if (cellBoundaryNibbled(melIdx, i)) structuralSegs.push([x, cy, x + cell, cy, T_THIN]);
          }
          // 정간 커스텀 테두리 — 선분만 모아두고 그리기는 밴드 루프가 끝난 뒤에(위 주석 참고)
          collectCellBorderSegs(cellBorderSegs, melIdx, x, gridTop, cell, beats);

          // 각 번호(보조) — 각 아래 옅은 회색 작은 숫자 (문서 탭 옵션, '화면에만'이면 출력에서 제외)
          if (gakNumMode !== "none") {
            const gnFont = cell * 0.26;
            const gn = el("text", { x: x + cell / 2, y: gridBottom + gnFont * 1.25,
              "text-anchor": "middle", "font-size": gnFont, fill: "#c9c9c9", "class": "gak-num" });
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

          // 템포 표기(一分・N井) — 각/장 라벨과 같은 규칙(맨 아래 글자 기준으로 위로 자람)이지만
          // **크기·간격 모두 제 것(tempoSize·tempoGap)**을 쓴다: 각/장 이름은 여러 개를 머리줄
          // 값으로 한꺼번에 맞추는 반면 템포는 곡에 하나뿐이라 따로 조절한다(각/장 창의 템포 항목).
          // 장단이 있으면 장단 칸 위에서 그리므로 여기(첫 각 위)는 장단이 없을 때만.
          function drawTempoLabel(cx, topY) {
            const chars = Array.from(tempoStr);
            const mul = tempoMul;
            const gap = tempoGap;   // 위 예약(tempoH)과 같은 값 — 어긋나면 잘리거나 뜬다
            const avail = (b === 0 ? Math.max(2, topY - 1) : Math.max(2, bandGap * 0.9)) - gap;
            const need = 0.85 + 1.12 * (chars.length - 1);
            const f = Math.min(cell * 0.38 * mul, Math.max(1, avail) / need);
            const startY = topY - gap + f * 0.06 - (chars.length - 1) * f * 1.12;
            svg.appendChild(verticalText(cx, startY, tempoStr, f, 400, "#000", NOTE_FONT).g);
          }
          if (wantTempo && pageIdx === 0 && melIdx === 0 && !wantJangdan) {
            drawTempoLabel(x + cell / 2, bandTop);
          }

          // 각 이름(대여음·一章 등) — 그 각 위 여백에 세로쓰기. 첫 각의 템포 표시와
          // 겹칠 수 있는 유일한 자리(첫 각)에서만 왼쪽으로 반 칸 비킨다.
          {
            // 간격의 기준은 각의 '실제 윗선'(bandTop) — 예전엔 테두리 여백선(-INNER_PAD)
            // 기준이라 간격 0mm여도 5mm쯤 떠 보였다
            const gnTop = bandTop;
            const gnRaw = gakNames[melIdx];
            if (gnRaw) {
              const disp = gakNameDisplay(gnRaw);
              const gnChars = Array.from(disp);
              // 일괄 조절(도구창 머리줄): 크기 배율 ×, 간격 mm — 기준은 '맨 아래 글자'라
              // 간격이 각 위쪽 선과 마지막 글자 사이를 정하고, 크기를 키우면 위로만 자란다
              const gnMul = Math.max(0.3, parseFloat($("gakNameSize").value) || 1);
              const gnGap = Math.max(0, parseFloat($("gakNameGap").value) || 0) * scale;
              // 위로 쓸 수 있는 공간에 맞춰 글자를 줄인다 — 맨 위 밴드는 페이지 위
              // 가장자리(1mm 여유)까지, 아래 밴드는 밴드 사이 간격 안. 안 줄이면
              // 긴 이름(大餘音 등)의 첫 글자가 페이지/윗 밴드에 잘린다.
              const gnAvail = (b === 0 ? Math.max(2, gnTop - 1) : Math.max(2, bandGap * 0.9)) - gnGap;
              // 글자 크기 1당 마지막 글자 기준선 위로 필요한 높이(첫 글자 ascent≈0.85 포함)
              const gnNeed = 0.85 + 1.12 * (gnChars.length - 1);
              const gnFont = Math.min(cell * 0.38 * gnMul, Math.max(1, gnAvail) / gnNeed);
              const gnLineH = gnFont * 1.12;
              const gnX = x + cell / 2
                - ((wantTempo && pageIdx === 0 && melIdx === 0 && !wantJangdan) ? cell * 0.75 : 0);
              // 마지막 글자 기준선 — 한자·한글 잉크가 기준선 위에서 끝나는 몫(≈0.06)을
              // 보태 간격 0mm이면 잉크 밑이 각 위쪽 선에 딱 닿는다
              const gnStartY = gnTop - gnGap + gnFont * 0.06 - (gnChars.length - 1) * gnLineH;
              svg.appendChild(verticalText(gnX, gnStartY, disp, gnFont, 400, "#000", titleFontFam).g);
            }
            // 각 위 클릭 영역(투명) — 누르면 그 자리에서 이름 입력 카드가 열린다
            const gnZoneH = cell * 1.4;
            const gnHit = rect(x, gnTop - gnZoneH, cell, gnZoneH, 0,
              { fill: "transparent", stroke: "none", "pointer-events": "all" });
            gnHit.style.cursor = "text";
            (function (gi, cxv, topv, pg) {
              gnHit.addEventListener("mousedown", function (e) {
                e.preventDefault();
                if (cellEditInput) commitCellEditor(false);
                openGakNameCard(gi, pg, cxv, topv);
              });
            })(melIdx, x + cell / 2, gnTop - gnZoneH, pageIdx);
            svg.appendChild(gnHit);
          }

          // 장단 줄(악곡 맨 처음 자리, 가장 오른쪽) — 켜져 있고, 악곡 맨 처음 각일 때만
          if (wantJangdan && melIdx === 0) {
            // 가사가 켜져 있으면 각들의 선 끝(가사 자리만큼 안쪽)에 맞춰 장단 칸도 같이 당김
            const jdRight = musicRightEdge - (wantLyrics ? lyExtraFull : 0), jdLeft = jdRight - jdW;
            // 템포 표기 — 장단이 있으면 첫 각 대신 장단 칸 위에(같은 각/장 규칙)
            if (wantTempo && pageIdx === 0) drawTempoLabel((jdLeft + jdRight) / 2, bandTop);
            // 어느 칸이 장단인지 알려주는 회색 '장단' 라벨 — 각 번호와 한 세트:
            // 같은 자리(각 아래)·같은 회색·같은 표시 설정(각 번호를 끄면 같이 꺼지고,
            // '화면에만'이면 gak-num 클래스로 인쇄·PNG에서도 각 번호와 같이 빠진다)
            if (gakNumMode !== "none") {
              const jdLabelFont = cell * 0.26;
              const jdLabel = el("text", { x: (jdLeft + jdRight) / 2, y: gridBottom + jdLabelFont * 1.25,
                "text-anchor": "middle", "font-size": jdLabelFont, "font-family": CJK,
                fill: "#c9c9c9", "class": "gak-num" });
              jdLabel.textContent = "장단";
              svg.appendChild(jdLabel);
            }
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
        const panelW = panelRight - panelX;
        // '//'로 여러 세로줄이면 줄 묶음 전체가 제목 칸 폭에 들어가게 글자를 줄인다
        const titleCols = Math.max(1, titleParts.length);
        const titleFont = Math.min(desiredTitle * scale,
          titleCols > 1 ? panelW * 0.92 / (1.18 * titleCols) : panelW * 0.78);
        const startY = gridY + headH + titleFont * 1.05 + desiredTitleOff * scale;
        const tt = verticalTextML(cx + desiredTitleOffX * scale, startY, titleTxt, titleFont, 700, "#000", titleFontFam, desiredTitleSpacing * scale);
        svg.appendChild(tt.g);
        if (subTxt) {
          const subCols = Math.max(1, subParts.length);
          const subFont = Math.min(desiredSub * scale,
            subCols > 1 ? panelW * 0.92 / (1.18 * subCols) : panelW * 0.72);
          // 부제 기준점은 '상황에 맞게' — 제목이 부제 쪽(아래)으로 내려오면 겹치지 않게
          // 따라 밀리고, 위로 올라가면 따라가지 않고 제자리(따로 조절 유지).
          // tt.endY에는 제목 상하 이동이 포함돼 있으므로 위로 간 만큼만 되돌린다.
          const subStart = tt.endY - Math.min(desiredTitleOff * scale, 0) + titleFont * 0.5 + subFont + desiredSubOff * scale;
          if (subStart < pBottom) {
            const st = verticalTextML(cx + desiredSubOffX * scale, subStart, subTxt, subFont, 400, "#333", titleFontFam, desiredSubSpacing * scale);
            svg.appendChild(st.g);
          }
        }
      }

      // 가로 제목 — 첫 페이지 격자 위 중앙에 가로쓰기 (부제는 그 아래 줄)
      if (titleTopMode && pageIdx === 0) {
        const cx = gridX + visibleW / 2;
        const baseBottom = gridY - INNER_PAD - pageTempoH;
        // '//' 줄바꿈 — 제목·부제 각각 여러 가로줄로 쌓는다(첫 줄이 맨 위).
        // 격자 위 공간에 아래 기준으로 붙이므로 줄 수만큼 시작점을 위로 올린다.
        const titleLineH = titleTopFont * 1.15;
        const subLineH = titleTopSubFont * 1.2;
        const subBlockH = subParts.length
          ? titleTopSubFont * 1.5 + (subParts.length - 1) * subLineH : 0;
        const titleBase = baseBottom - subBlockH
          - (Math.max(1, titleParts.length) - 1) * titleLineH
          - titleTopFont * 0.3 + desiredTitleOff * scale;
        titleParts.forEach(function (ln, i) {
          const t = el("text", { x: cx + desiredTitleOffX * scale, y: titleBase + i * titleLineH,
            "text-anchor": "middle", "font-size": titleTopFont, "font-family": titleFontFam,
            "font-weight": 700, fill: "#000", "letter-spacing": desiredTitleSpacing * scale });
          t.textContent = ln;
          svg.appendChild(t);
        });
        if (subParts.length) {
          // 부제 기준점은 '상황에 맞게' — 제목이 아래(부제 쪽)로 내려오면 겹치지 않게
          // 따라 밀리고, 위로 올라가면 따라가지 않는다(부제 상하는 부제만 움직임).
          const titleLastY = titleBase + (Math.max(1, titleParts.length) - 1) * titleLineH;
          const subFirstY = titleLastY - Math.min(desiredTitleOff * scale, 0)
            + titleTopSubFont * 1.45 + desiredSubOff * scale;
          subParts.forEach(function (ln, i) {
            const st = el("text", { x: cx + desiredSubOffX * scale, y: subFirstY + i * subLineH,
              "text-anchor": "middle", "font-size": titleTopSubFont, "font-family": titleFontFam,
              "font-weight": 400, fill: "#333", "letter-spacing": desiredSubSpacing * scale });
            st.textContent = ln;
            svg.appendChild(st);
          });
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

    // 요약은 '설정의 결과'만 — 가로 각·줄 수처럼 바로 아래 입력값을 되풀이하던 줄은 뺐다
    // (전문용어 나열이라 읽히지도 않았고, 진짜 파생값은 페이지 수·실제 칸 크기·A4 축소율뿐).
    // 경고(대강 합·가사/장단 각 수 불일치)는 이 상자가 사는 이유이니 그대로 둔다.
    $("readout").innerHTML =
      `이 설정이면 <b>페이지 ${pages.length}장</b> · 정간 한 칸 <b>${cell.toFixed(1)}mm</b>` +
      (scale < 0.999 ? ` · <span style="color:#8a6d3b">A4에 맞춰 <b>${Math.round(scale * 100)}%</b>로 줄여 그립니다</span>` : "") +
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
    track("export_png", { v: svgs.length + "p" });
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
          // 숨표(<)·빠르기(tempo) 기호는 재생에 영향 없음 — 배치·소리 계산에서 제외
          const toks = tokenizeNotes(rows[r]).filter(function (tk) {
            return !tk.breath && !(tk.sym && ORN_CAT[tk.sym] === "tempo");
          });
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
    track("play");
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
    "subtitle", "subSize", "subOffset", "subOffsetX", "subSpacing", "titleFont", "titleLayout", "titleGakWidth",
    "hwangPitch", "tempoBpm", "wantJangdan", "wantLyrics", "wantTempo", "lyricsFont", "palSound", "palInsert", "joPreset", "pageNumPos", "gakNumMode",
    "gakNameSize", "gakNameGap", "gakNameHanja", "tempoSize", "tempoGap"];
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
             melInput: inputMode, ribbonPos: ribbonPos, ornAddMap: ornAddMap, ornAddMaps: ornAddMaps,
             cellStyles: cellStyles, gakNames: gakNames, leftDockW: leftDockW, ornInstrument: ornInstrument };
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
    gakNames = (s.gakNames && typeof s.gakNames === "object") ? s.gakNames : {};
    renderGakNameList();
    ornInstrument = (typeof s.ornInstrument === "string" && INSTRUMENT_PRIORITY[s.ornInstrument])
      ? s.ornInstrument : "all";
    document.querySelectorAll(".orn-instrument").forEach(function (el2) { el2.value = ornInstrument; });
    buildLyricSymPal();
    palZoom = typeof s.palZoom === "number" ? Math.max(0.6, Math.min(2, s.palZoom)) : 1;
    ornPalZoom = typeof s.ornPalZoom === "number" ? Math.max(0.6, Math.min(2, s.ornPalZoom)) : 1;
    edFontPx = typeof s.edFontPx === "number" ? Math.max(10, Math.min(26, s.edFontPx)) : 14;
    applyPalZoom(); applyOrnPalZoom(); applyEdFont();
    const validStems = new Set(ORN_ADD_ALL.map(function (o) { return o.s; }));
    function sanitizeAddMap(arr) {
      if (!Array.isArray(arr) || arr.length !== ORN_ADD_KEYS.length) return null;
      return arr.map(function (stem) { return (stem && validStems.has(stem)) ? stem : null; });
    }
    // 악기별 번들 복원 — 모르는 악기 키·깨진 배열은 조용히 버린다.
    ornAddMaps = {};
    if (s.ornAddMaps && typeof s.ornAddMaps === "object") {
      Object.keys(s.ornAddMaps).forEach(function (inst) {
        if (inst !== "all" && !INSTRUMENT_PRIORITY[inst]) return;
        const arr = sanitizeAddMap(s.ornAddMaps[inst]);
        if (arr) ornAddMaps[inst] = arr;
      });
    }
    // 옛 저장분(번들 없이 단일 ornAddMap)은 그때 보던 악기 번들로 승계
    if (!ornAddMaps[ornInstrument]) {
      const legacy = sanitizeAddMap(s.ornAddMap);
      if (legacy) ornAddMaps[ornInstrument] = legacy;
    }
    ornAddMap = ornAddMaps[ornInstrument] ? ornAddMaps[ornInstrument].slice() : ornAddDefault();
    rebuildOrnAddKeyMap();
    // 에디터 모드 임시 비활성화 — 상단바 #modeBox도 숨겨져 있어(index.html) 저장 상태가
    // editor여도 직접 입력으로 연다. 되살릴 때 아래 원래 줄로 복원:
    // inputMode = s.melInput === "direct" ? "direct" : "editor";
    inputMode = "direct";
    ribbonPos = s.ribbonPos === "left" ? "left" : "top";
    leftDockW = typeof s.leftDockW === "number" ? Math.max(LEFTDOCK_MIN, s.leftDockW) : null;
    applyLeftDockW();
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
  const UNDO_UI_KEYS = ["activeTab", "palZoom", "ornPalZoom", "edFontPx", "melInput", "ribbonPos", "ornAddMap", "ornAddMaps"];
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
    track("export_file");
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
        track("import_file");
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
    track("save_snapshot");
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
    // 칸 오른쪽 '바깥'에 띄운다 — 예전처럼 칸 안 오른쪽에 겹치면 스피너(▲▼)를 가려서
    // 화살표를 누르려다 [확인]이 눌리는(두 번 눌러야 하는) 문제가 있었다.
    let left = r.right + 4;
    if (left + bw > window.innerWidth - 4) left = r.left - bw - 4;   // 화면 밖이면 왼쪽 바깥으로
    numConfirmBtn.style.left = left + "px";
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
   "subSize", "subOffset", "subOffsetX", "subSpacing",
   "gakNameSize", "gakNameGap", "tempoSize", "tempoGap"].forEach(id => wireConfirm($(id), render));
  // 체크박스·셀렉트·제목 텍스트는 예전처럼 즉시 반영
  ["stackAuto", "title", "titleLayout", "titleGakWidth", "wantJangdan", "wantLyrics"].forEach(id => {
    $(id).addEventListener("input", onFormChange);
    $(id).addEventListener("change", onFormChange);
  });
  ["sizeScale", "pageFill", "noteScale", "lyricsScale", "subtitle",
   "titleFont", "lyricsFont", "header", "frame", "noteMode", "orientation", "pageNumPos", "gakNumMode",
   "gakNameHanja"].forEach(id => {
    $(id).addEventListener("input", render);
    $(id).addEventListener("change", render);
  });
  // 표기 모드가 바뀌면 팔레트도 이미지↔한자로 다시 그림
  $("noteMode").addEventListener("change", buildPalette);
  // 조(악조) 선택 → 표 팔레트를 그 조의 구성음만으로 다시 그림
  $("joPreset").addEventListener("change", function () { buildPalette(); saveState(); });
  // 악기 선택(시김새·가사 기호 팔레트 우선순위) — 두 군데(직접 입력 창·에디터 팔레트) 셀렉트 동기화
  document.querySelectorAll(".orn-instrument").forEach(function (sel) {
    sel.addEventListener("change", function () { setOrnInstrument(sel.value); });
  });
  // 팔레트 보기 전환 (율명 / 시김새)
  document.querySelectorAll(".pal-view").forEach(function (b) {
    b.addEventListener("click", function () {
      exitOrnEditMode();   // 율명/시김새 보기를 바꾸는 것도 '다른 조작' — 미세조정 끔
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
    // 이동(팬)으로 밀어둔 시트를 새 배율의 여유 범위 안으로 — 커져서 여유가 없어지면 0으로 복귀
    clampSheetShift();
  }
  function setZoom(v) { viewZoom = Math.max(0.3, Math.min(6, +v.toFixed(2))); applyZoom(); }
  $("zoomIn").addEventListener("click", () => setZoom(viewZoom + 0.1));
  $("zoomOut").addEventListener("click", () => setZoom(viewZoom - 0.1));
  // Ctrl/⌘ + − / ＋ 를 브라우저 확대 대신 '보기 배율'(악보 줌)에 연결한다. 종이(SVG)는 높이가
  // 뷰포트(100vh) 기준이라 브라우저 줌을 하면 종이와 고정 px UI가 서로 반대로 어긋난다 —
  // 여기서 가로채(preventDefault) −/＋ 버튼처럼 악보만 매끄럽게 확대·축소한다.
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key;
    if (k === "-" || k === "Subtract") { e.preventDefault(); setZoom(viewZoom - 0.1); }
    else if (k === "=" || k === "+" || k === "Add") { e.preventDefault(); setZoom(viewZoom + 0.1); }
  });
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
  $("zoom100").addEventListener("click", () => setZoom(1));
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
  // 모드 탭 전환
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyActiveTab(btn.getAttribute("data-tab"));
      saveState();
    });
  });

  // 설정 폼 접기/펼치기
  // 설정 패널 — 상단바 버튼은 늘 보이는 토글(열려 있으면 .on), 사이드바 안 ✕는 닫기 전용.
  function applySidebarBtn() {
    $("sidebarOpen").classList.toggle("on", !document.body.classList.contains("sidebar-collapsed"));
  }
  $("sidebarToggle").addEventListener("click", function () {
    document.body.classList.add("sidebar-collapsed");
    applySidebarBtn();
  });
  $("sidebarOpen").addEventListener("click", function () {
    document.body.classList.toggle("sidebar-collapsed");
    applySidebarBtn();
  });
  applySidebarBtn();

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
      exitOrnEditMode();   // 선율/장단/가사/… 탭 전환 시 미세조정 끔
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
    dockDirectWins();   // 기능바 왼쪽 도킹이면 열린 창을 #leftDock 안으로 (아니면 원위치)
  }
  document.querySelectorAll(".win-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      exitOrnEditMode();   // 도구창(율명/시김새/장단/…) 전환 시 미세조정 끔
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

  // 시김새 크기/위치 미세조정 모드 — 직접 입력 모드(#ornEditToggle)와 에디터 모드
  // (#ornEditToggleEd) 두 버튼이 같은 ornEditMode를 공유한다. 어느 쪽을 눌러도 두 버튼의
  // 켜짐 표시(.on)를 함께 맞춘다.
  function setOrnEditMode(on) {
    ornEditMode = on;
    document.querySelectorAll(".orn-edit-toggle").forEach(function (b) {
      b.classList.toggle("on", on);
    });
    if (!ornEditMode) { ornSel = null; hideOrnPanel(); }
    render();
  }
  // 다른 입력 동작(팔레트 클릭·탭 전환 등)을 하면 미세조정 모드를 저절로 끈다 —
  // 켜둔 걸 깜빡하고 엉뚱한 데를 만지는 실수를 막는다. 켜져 있지 않으면 아무 일도 안 함.
  function exitOrnEditMode() { if (ornEditMode) setOrnEditMode(false); }
  document.querySelectorAll(".orn-edit-toggle").forEach(function (b) {
    b.addEventListener("click", function () { setOrnEditMode(!ornEditMode); });
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
  // 버튼은 전부 '즉시 실행' — 악보에서 정간을 먼저 드래그로 고른 뒤 누르면 바로 적용된다.
  function applyBorderToSelection(spec, mode) {
    if (!hasMelSel()) return;
    applyCellBorderRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci, spec, mode);
  }
  $("cellStyleColorPicker").addEventListener("change", function () {
    cellStylePendingColor = $("cellStyleColorPicker").value;
  });
  // 합치기 — 고른 칸들 '사이'의 가로줄만 style:"none"으로 덮어 한 칸처럼 보이게 한다.
  // 바깥(고르지 않은 칸과 맞닿은) 줄은 mode "inner"가 애초에 안 고르므로 그대로 남는다.
  // 나누기는 그 자리를 지워(spec=null) 원래 격자선으로 되돌린다.
  $("cellMergeBtn").addEventListener("click", function () {
    applyBorderToSelection({ width: "medium", style: "none" }, "inner");
  });
  $("cellUnmergeBtn").addEventListener("click", function () {
    applyBorderToSelection(null, "inner");
  });
  // 없애기 — 좌우 벽과 사이 줄을 style:"none"으로 덮어 고른 구간을 각에서 도려낸 빈 자리로.
  // 위아래 이웃과 맞닿는 가로줄은 mode "erase"가 안 고르므로 남는다(그 줄은 이웃 칸의 벽이기도
  // 해서 같이 지우면 남의 칸이 열린다). 되돌리는 길은 [초기화](네 변을 다 지움).
  $("cellEraseBtn").addEventListener("click", function () {
    applyBorderToSelection({ width: "medium", style: "none" }, "erase");
  });
  // 가로줄 방향 토글(위/아래) — 둘 다 끄면 모양 버튼이 할 일이 없으므로, 마지막 하나는
  // 꺼지지 않게 막는다(끄고서 왜 아무 일도 안 일어나는지 헤매지 않도록).
  ["Top", "Bottom"].forEach(function (Side) {
    const key = Side.toLowerCase();
    $("cellBorderSide" + Side).addEventListener("click", function () {
      const other = key === "top" ? "bottom" : "top";
      if (cellBorderSides[key] && !cellBorderSides[other]) return;   // 마지막 하나는 유지
      cellBorderSides[key] = !cellBorderSides[key];
      $("cellBorderSide" + Side).classList.toggle("on", cellBorderSides[key]);
    });
  });
  // 모양 버튼이 곧 실행 버튼 — 고른 정간의 위/아래(토글) 가로줄을 그 모양으로.
  Object.keys(CELL_BORDER_SHAPES).forEach(function (key) {
    const id = "cellBorderShape" + key.charAt(0).toUpperCase() + key.slice(1);
    $(id).addEventListener("click", function () {
      applyBorderToSelection(CELL_BORDER_SHAPES[key], "sides");
    });
  });
  // 초기화 — 고른 정간에 해둔 걸 전부 물린다: 배경색 + 네 변의 테두리(합치기·없애기가 씌운
  // style:"none"까지). 예전엔 '색 지우기'와 '기본'(테두리 지우기) 두 버튼이었는데, '이 칸에
  // 해둔 걸 물리고 싶다'는 하나의 마음에 버튼이 둘이라 매번 어느 쪽인지 생각해야 했다.
  // 네 변을 다 지우는 건(위/아래 토글 무시) 의도한 것 — UI가 좌우를 못 만드는 만큼, 옛 파일이
  // 물고 있는 좌우 테두리를 걷어낼 유일한 길이라 일부러 'all'이다.
  $("cellStyleResetBtn").addEventListener("click", function () {
    if (!hasMelSel()) return;
    applyCellFillRange(melSelStart.gi, melSelStart.ci, melSelEnd.gi, melSelEnd.ci, null);
    applyBorderToSelection(null, "all");
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
  // pageFill 50 = index.html 슬라이더 초깃값과 한 쌍 — 새 문서가 페이지를 어느 정도 채운
  // 상태로 시작하게 한 값이라 초기화도 같은 곳으로 돌아와야 한다.
  const LAYOUT_DEFAULTS = { sizeScale: 1, pageFill: 50, noteScale: 1, lyricsScale: 1, cellSize: 11, gakGap: 7, bandGap: 10 };
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
  // 각 이름 도구창 — 각 번호(1부터)와 이름으로 추가 (악보에서 각 위를 직접 클릭해도 됨)
  $("gakNameAddBtn").addEventListener("click", function () {
    const num = parseInt($("gakNameAddGak").value);
    if (!num || num < 1) { $("gakNameAddGak").focus(); return; }
    setGakName(num - 1, $("gakNameAddInput").value);
    $("gakNameAddInput").value = "";
    $("gakNameAddInput").focus();
  });
  $("gakNameAddInput").addEventListener("keydown", function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") { e.preventDefault(); $("gakNameAddBtn").click(); }
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
    const direct = inputMode === "direct";
    // 상단바 버튼 글씨는 배율의 '100%'처럼 지금 값을 보여준다(기호는 body.input-direct로 CSS가 바꿈)
    if ($("modeToggleLbl")) $("modeToggleLbl").textContent = direct ? "직접 입력" : "에디터";
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
      // #leftDock은 위쪽 배치에선 display:contents(없는 셈), 왼쪽 도킹에선 세로 열이 된다
      const ld = $("leftDock");
      if (ribbon.parentNode !== ld) ld.appendChild(ribbon);
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
    applyRibbonPos();   // 기능바 도킹 위치(위/왼쪽)는 직접 입력에서만 유효 — 모드 바뀔 때 재적용
    lastAppliedInputMode = inputMode;
  }
  let lastAppliedInputMode = null;   // applyInputMode가 마지막으로 적용한 모드(전환 감지용)
  // 입력 방식 메뉴(#modePop) — 예전엔 <select>의 change였다. 메뉴 여닫기는 wireTopMenu가 맡고
  // (아래 상단바 드롭다운 절), 여기선 두 항목이 각자 모드를 고른다.
  function setInputMode(mode) {
    const next = mode === "editor" ? "editor" : "direct";
    if (next === inputMode) return;   // 같은 걸 다시 고르면 아무 일도 없어야 한다(분석 이벤트도 안 남김)
    exitOrnEditMode();   // 입력 방식(에디터↔직접) 전환 시 미세조정 끔
    inputMode = next;
    track("input_mode", { v: inputMode });
    applyInputMode();
    saveState();
  }
  $("modeDirect").addEventListener("click", function () { setInputMode("direct"); });
  $("modeEditor").addEventListener("click", function () { setInputMode("editor"); });

  // ---------- 기능바 도킹 위치 (위쪽 가로 / 왼쪽 세로, 직접 입력 전용) ----------
  // body.ribbon-left 클래스 하나로 CSS가 갈라진다(#main 가로 배치·#leftDock 세로 열).
  // 왼쪽 도킹에선 도구창(.direct-win)도 악보 위에 띄우는 대신 #leftDock 안(기능바 아래)에
  // 도킹한다 — dockDirectWins()가 열린 창을 옮기고, 닫히거나 위쪽 배치로 돌아가면
  // 원래 자리(placeholder 주석 노드)로 되돌린다.
  let ribbonPos = "left";   // "top" | "left" — 직접 입력 기본은 왼쪽 세로 도킹(저장된 문서는 저장값 따름)
  // 왼쪽 도킹 열의 사용자 지정 폭(px). null = 자동(내용 폭 450px 기준).
  // 손잡이(#leftDockResizer)를 끌면 정해지고, 더블클릭하면 자동으로 돌아간다.
  let leftDockW = null;
  const LEFTDOCK_MIN = 240;   // 최소 가로폭 보장
  function applyLeftDockW() {
    const ld = $("leftDock");
    if (!ld) return;
    if (typeof leftDockW === "number") {
      document.body.classList.add("leftdock-custom");
      ld.style.width = leftDockW + "px";
    } else {
      document.body.classList.remove("leftdock-custom");
      ld.style.width = "";
    }
  }
  (function () {
    const rz = $("leftDockResizer");
    if (!rz) return;
    rz.addEventListener("mousedown", function (e) {
      e.preventDefault();
      rz.classList.add("dragging");
      const startX = e.clientX;
      const startW = $("leftDock").getBoundingClientRect().width;
      function move(ev) {
        const maxW = Math.max(LEFTDOCK_MIN, window.innerWidth * 0.6);
        leftDockW = Math.round(Math.max(LEFTDOCK_MIN, Math.min(maxW, startW + (ev.clientX - startX))));
        applyLeftDockW();
      }
      function up() {
        rz.classList.remove("dragging");
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        saveState();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    rz.addEventListener("dblclick", function () { leftDockW = null; applyLeftDockW(); saveState(); });
  })();
  const DIRECT_WIN_HOME = new Map();   // 창 → 원래 자리 표시용 주석 노드
  document.querySelectorAll(".direct-win").forEach(function (w) {
    const ph = document.createComment("win-home:" + w.id);
    w.parentNode.insertBefore(ph, w);
    DIRECT_WIN_HOME.set(w, ph);
  });
  function dockDirectWins() {
    const leftMode = document.body.classList.contains("ribbon-left");
    document.querySelectorAll(".direct-win").forEach(function (w) {
      if (leftMode && w.classList.contains("win-open")) {
        // 기능바 안으로 넣는다 — 실제 위치(입력 그룹 바로 아래)는 CSS flex order가 잡는다.
        if (w.parentNode !== $("melodyRibbon")) $("melodyRibbon").appendChild(w);
        // 떠 있을 때 끌어둔 인라인 좌표는 도킹(position:relative)에서 어긋남 유발 — 지운다
        w.style.top = ""; w.style.left = "";
      } else {
        const ph = DIRECT_WIN_HOME.get(w);
        if (ph && w.previousSibling !== ph) ph.parentNode.insertBefore(w, ph.nextSibling);
      }
    });
  }
  function applyRibbonPos() {
    const left = inputMode === "direct" && ribbonPos === "left";
    document.body.classList.toggle("ribbon-left", left);
    const btn = $("ribbonPosToggle");
    if (btn) btn.setAttribute("data-tip",
      left ? "기능바를 위쪽에 가로로 되돌립니다" : "기능바를 왼쪽에 세로로 붙입니다");
    dockDirectWins();
  }
  $("ribbonPosToggle").addEventListener("click", function () {
    ribbonPos = ribbonPos === "left" ? "top" : "left";
    applyRibbonPos();
    saveState();
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
  // 상단바 드롭다운(배율 ▾·파일 ⋯) — 재생 설정 팝오버와 같은 열고닫기 문법.
  // 차이 하나: 메뉴는 항목을 고르면 할 일이 끝나므로 안을 클릭해도 닫는다.
  function wireTopMenu(btnId, popId) {
    $(btnId).addEventListener("click", function (e) {
      e.stopPropagation();
      $(popId).classList.toggle("on");
      $(btnId).classList.toggle("on");
    });
    $(popId).addEventListener("click", function () {
      $(popId).classList.remove("on");
      $(btnId).classList.remove("on");
    });
    document.addEventListener("click", function (e) {
      if ($(popId).classList.contains("on") && !$(popId).contains(e.target) && !$(btnId).contains(e.target)) {
        $(popId).classList.remove("on");
        $(btnId).classList.remove("on");
      }
    });
  }
  wireTopMenu("zoomVal", "zoomPop");
  wireTopMenu("fileToggle", "filePop");
  wireTopMenu("modeToggle", "modePop");
  // btnPrint(상단바 1급 버튼)·btnPng/btnExport/btnImport(파일 메뉴)는 이제 상단바에 살고
  // 여기가 유일한 배선이다. 예전엔 사이드바 '출력' 탭에 진짜 버튼이 있고 상단바 더보기의
  // m* 항목이 그걸 대신 눌러주는 위임 구조였는데, 같은 명령이 두 군데 있는 게 헷갈려
  // 상단바로 일원화했다(사이드바 '보관' 탭엔 임시 저장만 남음).
  $("btnPng").addEventListener("click", downloadPng);
  $("btnPrint").addEventListener("click", () => { track("export_print"); window.print(); });
  // 인쇄 → 'PDF로 저장'의 기본 파일명은 탭 제목(document.title)에서 오므로, 인쇄하는
  // 동안만 곡 제목으로 바꿨다가 되돌린다. beforeprint/afterprint 이벤트를 쓰므로
  // 인쇄 버튼뿐 아니라 브라우저 메뉴·Cmd/Ctrl+P로 인쇄할 때도 똑같이 적용된다.
  const APP_DOC_TITLE = document.title;
  window.addEventListener("beforeprint", function () {
    const t = $("title").value.trim();
    if (t) document.title = t;
  });
  window.addEventListener("afterprint", function () { document.title = APP_DOC_TITLE; });
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
  makeGuideToggle("gakNameGuide", "gakNameGuideToggle");
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
    track("help_open");
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
  // 도해 2(정간 해부)의 시김새 표식 — 손그림 곡선 대신 실제 시김새 이미지(흘림표)를 끼운다.
  (function () {
    const fig = $("helpFigSigim"), url = symURL("flow");
    if (fig && url) {
      fig.setAttribute("href", url);
      fig.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
    }
  })();
  $("helpTourBtn").addEventListener("click", function () {
    // closeHelpModal()을 쓰면 onClose(마법사)가 즉시 실행돼 버림 — 콜백을 투어 끝으로 넘긴다
    const cb = helpOnClose; helpOnClose = null;
    $("helpModal").style.display = "none";
    startTour(cb);
  });

  // -- 둘러보기(투어) --
  // 대상은 두 입력 모드에 공통으로 존재(리본은 모드에 따라 위치만 이동 — 매번 셀렉터로 재탐색)
  // 본문은 줄글 대신 • 글머리표 한 줄씩(\n 줄바꿈 — #tourCard p의 white-space:pre-line이 받는다).
  // 한 줄 = 한 정보. '여기서/거기서' 같은 가리키는 말 대신 대상 이름을 그대로 쓴다.
  // '정간에 쓰기' 단계의 예시 이미지 — 앱이 실제 그린 정간의 캡처(PNG 데이터 URL).
  // 재캡처 방법은 TOUR_STEPS 해당 단계 주석 참고.
  const TOUR_CELL_IMGS = {
    one: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALYAAAC2CAYAAAB08HcEAAAQAElEQVR4AeydBbBVRRjHv3mKyOgodozxjDHGwm4UaxTEwe4O7C7slrE7sBW7FbADux0TW+zOESwQ328v575zbp5z88SfYe/2nt3//u/ePd/37b6OSfonBFKIQIfpnxBIIQIidgonVUMy6xg1apR5bsSIETZs2LAi5+XL78ZKWLQPi1IcHT9+fOD73DFgwADz3MCBA23w4MFFzsuX342VsGgfFqU4Onz48CCxAzFFEoiAulwKAe2xS6GitMQjIGInfgo1gFIIiNilUFFa4hFAQWNd8nnnxowZUzSgnj17ujyvjPxJwmNSezGAk4VE7du3byBJK3YADkXSgkCiiJ0W0DWO5iMgYjcfYz2hDQiI2G0AXY9sPgIidvMx1hPagICI3QbQ9cjmIyBiNx9jPaEbgZaFROyWQa0HtRIBEbuVaOtZLUNAxG4Z1HpQKxEQsVuJtp7VMgRE7JZBrQe1EgERu1loq922IiBitxV+PbxZCIjYzUJW7bYVARG7rfDr4c1CQMRuFrJqt60IiNhthV8PbxYCjSB2s/qmdoVAzQiI2DVDp4pxRkDEjvPsqG81IyBi1wydKsYZARE7zrOjvtWMgIhdM3Rpqpi+sYjY6ZtTjagLARG7CwT9Tx8CInb65lQj6kJAxO4CQf/Th4CInb451Yi6EMgcsbvGrP8ZQEDEzsAkZ3GIInYWZz0DYxaxMzDJWRyiiJ3FWc/AmEXsDExyyoYYajgidiiYVChpCIjYSZsx9TcUAiJ2KJhUKGkIiNhJmzH1NxQCInYomFQoaQiI2HGeMfWtZgRE7JqhU8U4IyBix3l21LeaERCxa4ZOFeOMgIgd59lR32pGQMSuGTpVjDMCcSF2nDFS3xKIgIidwElTl6sjIGJXx0glEoiAiJ3ASVOXqyMgYlfHSCUSiICIncBJi2eX49UrETte86HeNAgBEbtBQKqZeCEgYrdpPl566SW78cYb7YMPPmhTD9L9WBG7TfN7/PHH23777WcrrbSS7bDDDvbRRx+1qSfpfKyI3aZ5XXHFFfNPHjFihK2wwgp255135tMUqA8BEbsG/BpRZbvttitqZvfdd7c333yzKF0J0REQsaNjFqjx8ccf2wYbbGCbbbaZnXzyyXb//ffbuHHjAmVKRRZccEFbYIEFirLeeuutojQlREdAxI6OWaDGpEmT7MUXX7THH3/czj33XNtxxx1t7rnnttNPPz1QrlSEcoXpfEkK0xSPjoCIHR2zQA1W3j322COQRuTMM8+0N954g2BZ98cffwTyBg8ebDPOOGMgTZHaEBCxa8MtUAsJR2dnZyCNyDTTTINX1n322WeBPKQkJPzzzz/23nvv2ejRo+2dd94hSS4iAiJ2RMBKFe/Vq5ddcsklRVmlyO4VGj9+vP3www9e1PmXXnqprbfeejb77LPbKqusYhtvvLGtvvrqtswyy9gNN9zgyugjHAJViB2uEZUyJ49ebLHF8lDMMsssNuWUU+bjEyZMsE8++cQeffRRu+yyy+zggw/O53mBiy++2F555RUvmvfHjh1rBxxwgD344IP5NAUqIyBiV8YnUu5GG22UL89qfMYZZ9huu+1mK6+8ss0666y23HLL2RZbbGFHHXWU3XbbbfmyYQPTTTdd2KKZLydiR6TAv//+a19++aW9/fbb9thjj9l1111np5xyiiPwhRdeGGht6NChdtddd9n7778fSC8VWWqppWzDDTe0XXbZxY444gjj5ZOVffjw4fbwww8bYkW2J6XqKq0YARG7GJOKKYsvvrgtueSS1rdvX9t8883toIMOsnPOOccRuFDKQUPTTjutW6m33HJLR9iLLrrI7rvvPiOdfNyRRx5pTzzxhF1//fV21llnuXK77rqrW9379+/v6s8wwwwUlQuJgIgdEiiv2IEHHhggpZeOv/DCC+Pl3TPPPGOff/65W3F5MWQl3mabbdx+3P8lWGeddfJ1FGgMAiJ2RBz32msv9xL47LPP2pVXXmnXXnutPfnkk/bFF1/Y888/71ZXr0kkH17Y7/sNnuacc05beuml/dmNDWe0tY6MjruuYSPtWHTRRW2TTTYxXhjZmngy6/nnn9+8f999950XdP7ff/9tzz33nB133HEuzsfvv/9uP/74I0G5BiIgYjcQTJry23/cfffd7iVw3333tX79+tkcc8zhXhAR+VEWx5bk1FNPJSjXQARE7AaCSVOLLLIInnNIRLAZuemmmyqq11nxXQV9NAwBEbthUOYawq46F8p9on3E9hpR3s4772yHH364Id9Gjv3yyy/b999/70R8udLdn4gVUbmzdeGkzYknnugOJKy99trGSyoaSnzaxAiru6ZCICBig0ID3Wyz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",
    split: "data:image/png;base64,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",
    joined: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALYAAAC2CAYAAAB08HcEAAAQAElEQVR4AeydB5AURRSG3x0gYs5iBswJzGJCMBUKKmZES8tYmDGfGUyooGIu8xnAnBWzHuYcyoBZMGcpI0HB/UZ66ZmNt7c72z3zqG2mp7tnpvvvv7tfv/dmrnGG9W/8+PEzRCQUOnbsaJXQqCJQfwTgZJSncNeuWWOmgP4UgcQhoMROXJdqg0BAiQ0KGhKHgBI7cV2qDQKBksSeNm2a9OvXT4OzGKSvb+Ak5C0WShJ7+vTpMnbsWA2KgTMcgJPFSE1eSWK3a9dOmpqaNCgGznAATkLeYqEksdu3by/Dhw/XoBg4wwE4WYzU5JUkNoU0KAK+IaDE9q3HtL5lIeAVsctqkRZSBDIIKLEzIOgveQgosZPXp9qiDAJK7AwI+kseAkrs5PWptiiDgBI7A4L+YkMgtgcpsWODWh8UJwJK7DjR1mfFhoASOzao9UFxIqDEjhNtfVZsCCixY4NaHxQnAkrsWqGt960rAkrsusKvD68VAkrsWiGr960rAkrsusKvD68VAkrsWiGr960rAkrsusKvD68VAtUgdq3qpvdVBCpGQIldMXR6ocsIKLFd7h2tW8UIKLErhk4vdBkBJbbLvaN1qxgBJXbF0CXpwuS1RYmdvD7VFmUQUGJnQNBf8hBQYievT7VFGQSU2BkQ9Jc8BJTYyetTbVEGgdQRO9Nm/aUAASV2Cjo5jU1UYqex11PQZiV2Cjo5jU1UYqex11PQZiV2Cjo5YU0sqzlK7LJg0kK+IaDE9q3HtL5lIaDELgsmLeQbAkps33pM61sWAkrssmDSQr4hoMR2uce0bhUjoMSuGDq90GUElNgu947WrWIElNgVQ6cXuoyAEtvl3tG6VYyAErti6PRClxBoaGgIVccVYocqpSeKQFsRUGK3FUG93kkElNhOdotWqq0IKLHbiqBe7yQCSmwnu0Ur1VYElNhtRVCvn4mAWwcltlv9obWpEgJK7CoBqbdxC4HUEXvChAly0003ycsvvyz//vuvW71Ro9rcfffd0qdPH9lxxx3lvPPOk88//7xGT3Lntqkj9q233ipHHHGEbL311tK7d28ZN26cO71Ro5q888478vbbb0tLS4ucc845svbaa8ugQYPk008/rdET63/b1BF7rbXWyqL+3nvvyQ477CCnnXaaTJs2LZuetMgee+yR06RHHnlE1l13XRkzZkxOXhISGpPQiNa0YbPNNpOFF144dMkll1wizc3NobRiJ77lLbfccoEIkq/eTU1N8scff+TL8jqt0dfa//PPPzJw4MBApDj++OODmee7774r2Zz27dvLgAEDcsq98cYbOWlJSgCrfO2B1GCZL8/nNG+J3dDQIG+++WawCbz66qvl0EMPlVVWWUX22WcfmTRpUtE+6dy5c07+zjvvnJOWpIS55ppLVlxxxZwm9e3bV+abb76cdN8TvCV2u3btZOTIkTn433fffcIGMSfDSpg8ebJ1JkGH98loDUKJCTzp2rVrTqu23HLLnLQkJHhLbMDfdtttZddddyUaCsxOoYTIyVdffRVKQc5sbGyU6dOny8SJE+XZZ5+Vl156KXEbysUWWyzUbk5WX311DokLXhOb3jj77LMlSuQVVliBrILh448/DuW99dZbgijSpUsXWXPNNWX77beXbbbZRpZddtlAYzJlypRQeV9POnXqlFN12piTmICEEsR2v4ULLLCA7LXXXqGKLrLIItnzGTNmCJvK559/Xm688UY56aST5LXXXsvmE7nooovkqaeeytEOsLFCY3LmmWdSzPsw22yzhdrAhDD//POH0pJy4j2x6QiMLRxNGDVqlBx++OGy1VZbyYILLhhsKhFbhgwZIldccYUpVvaRwVN2YYcLRi2tyy+/vMO1bVvVvCE28u8PP/wgH3zwQSADs0HEPIw25NRTTw2hwMx8880358zMoUIzT9AUbLHFFrLnnnvKUUcdJYg2l19+udxwww1y//33y7vvvisMiJnFvT78+uuvofp3zbOZDBXw+MQbYmMGX2mllWTDDTcMZOCDDz5YMA9jOUPtl68PVl11VWGm5trzzz9f7rjjDunfv3+26AYbbCAvvvii3H777XLxxRfLySefLIMHDw7041y38cYby+KLLy4NDeEXRbM38CwSVYMus8wynrWg/Op6Q2yzucvXNMiHvGjyIPEvv/wSzOzMvJjM0W9vvvnmMnXqVFMs2CBmT1IQ+fnnn0OtXHrppUPnSTrxhtibbrqpYB1Eg4GYceWVVwr+Dh999FEgLhx00EHZfmHTlz2xImwkX3jhhWwKmo/sSVIjVrsY7NapLLnkkvZpouLeENugziwDIXfZZRdZb731ZKGFFgqyllpqqeDIf2hBOJoA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",
    orn: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALYAAAC2CAYAAAB08HcEAAAQAElEQVR4AeydBZAcRRSG3x3ECgqCSyGHFFJYcA8XrCBI4YEEd9cET7gjQQp3dwnBLcEhBHcqQRI8aHArQoAY+82l92bn9lbn9kb+1Pa1THdPz//+7e1573Wnfqbv3/jx42eaWU7o1q2br4aSQqDzEYCTQZ5OmDAhZ2D1mQr6CIHEIVA/fPhwc2HkyJFtHnDGjBnZ666e4lbMhEXtsYCTQaLC3UmTJmWL6wcMGGAuDBo0KHvBJaZOnZq97uopbsVMWNQeCzjp+OnigQMH2ujRo13WtBTJQqFEkhAQsWMvTT1APgRE7HyoqCz2CIjYsRehHiAfAiJ2PlRUFnsEROzYi1APkA+B+ilTppgLY8eObVMnY+XJXnf1FLdiJixqjwWcDBJ13Lhx1r9//2xxfffu3c2Frl27Zi/4E+56Z8e6f6us0oyFn5suHeSuliIOGcWJQkDETpQ49TAOARHbIaE4UQiI2IkSpx7GISBiOyQU1wKBmt1DxK4Z1LpRLREQsWuJtu5VMwRE7JpBrRvVEgERu5Zo6141Q0DErhnUulEtERCxOwpt9dupCIjYnQq/bt5RCIjYHYWs+u1UBETsToVfN+8oBETsjkJW/XYqAiJ2p8Kvm3cUAmEQu6PGpn6FQMUIiNgVQ6eGUUZAxI6ydDS2ihEQsSuGTg2jjICIHWXpaGwVIyBiVwxdkhom71lE7OTJVE+UQUDEzoCgT/IQELGTJ1M9UQYBETsDgj7JQ0DETp5M9UQZBFJH7Mwz65MCBETsFAg5jY8oYqdR6il4ZhE7BUJO4yOK2GmUegqeWcROgZAT9oglPY6IXRJMqhQ3BETsuElM4y0JARG7JJhUKW4IiNhxk5jGWxICInZJMKlS3BAQsaMsMY2tYgRE7IqhU8MoIyBiR1k6GlvFCIjYFUOnhlFGQMSOsnQ0tooRELErhk4No4xAVIgdZYw0thgiIGLHUGgacnEEROziGKlGDBEQsWMoNA25OAIidnGMVCOGCIjYMRRaNIccrVGJ2NGSh0YTEgIidkhAqptoISBid5I83njjDbvzzjvt448/7qQRJPu2InYnyfeMM86wo446ytZbbz3be++97dNPP+2kkSTztiJ2J8l13XXXzd555MiRts4669j999+fLVOiOgRE7ArwC6PJnnvu2aabgw46yMaNG9emXAXlIyBil49ZTovPPvvMtt56a9tll11s6NCh9uijj9rkyZNz6uTLLLvssrbMMsu0ufTee++1KVNB+QiI2OVjltNi5syZ9vrrr9tzzz1nF198se2zzz62+OKL2znnnJNTL1+GesFyviTBMuXLR0DELh+znBbMvAcffHBOGZnzzz/fxo4dS7Ld8Ndff+VcO+SQQ2zeeefNKVOmMgRE7Mpwy2mFhqOhoSGnjMwcc8xB1G748ssvc66hJaHgv//+swkTJtiYMWPsgw8+oEihTARE7DIBy1e9R48edtVVV7W5lI/srtLff/9tP/30k8t68dVXX21bbrmlLbzwwrbBBhvYjjvuaBtvvLGtscYadvvtt3t19Kc0BIoQu7ROVMs8ffRKK62UhWKBBRaw2WefPZufNm2aff755/bMM8/YNddcY8cff3z2mktceeWV9tZbb7lsNp44caIdc8wx9sQTT2TLlCiMgIhdGJ+yrm6//fbZ+szG5513nh144IG2/vrr24ILLmhrrbWW7bbbbnbqqafaPffck61bamKuueYqtWrq64nYZVJg6tSp9s0339j7779vzz77rN166602bNgwj8CXX355Tm/nnnuuPfDAA/bRRx/llOfLrLbaarbtttva/vvvbyeddJLx8snMfscdd9hTTz1lqBVZnuRrq7K2CIjYbTEpWLLyyivbqquuar1797Zdd93VjjvuOLvooos8Age1HHQ055xzejN1v379PMJeccUV9sgjjxjlXCecfPLJNnr0aLvtttvsggsu8OodcMAB3uzet29fr/0888xDVYUSERCxSwTKVTv22GNzSOnKiZdffnmibHjppZfsq6++8mZcXgyZifv37++tx/1fgs033zzbJuzEiy++6BmQzj777LC7jnR/InaZ4jnssMO8l8CXX37ZbrjhBrvlllvs+eeft6+//tpeffVVb3Z1XaL5cGl/7Hd4WnTRRW311Vf3Xw4t3dzcbL0zvyy8dJ522mlGPrTOI95RfcTHF8nhoe1YccUVbaeddjJeGFmaOJ310ksvbe7fDz/84JJe/O+//9orr7xiQ4YM8fL8+fPPP+3nn38m2eGBL2CH3yQiNxCxQxaE3//jwQcf9F4CjzzySOvTp48tssgi3gsiKj93W5YkZ511lsuGGjc1NeX019jYmJNPckbEDlm6K6ywQrZHNCL4jAwfPrygeZ0ZP9sopESaZud8kInY+VCpogy/an9zrI/4XqPK22+//ezEE0809Nvosd9880378ccfPRWfvw1p1IqY3Fm6sNOG9TEbEjbbbDPjJRULJTF94oRFG4VWBETsVixCSS200EKGPhtCv/baa/bOO+/Y448/7qnyLrzwQkO1h9GGL8D06dONl1CIC9mPPvpo22GHHQyVIv3wUskXAh+SSy+91NiQ8O6773qmeCyUGIEefvhhT+uBI9aUKVOyzzBmzJhs2iU22WQTl0x8nCRiR0JYuLGie2b5MWnSJBsxYoSn5z7hhBNs991396yQePBBfLaF4Q8CcTHmYIx54YUX7Lvvviv7We677z7P7F52w4Q2ELFLFCyE/f333729iczEGFmuv/56O/PMMw0VIDMtzkrzzTeft4EAKyGkPfzwwz3L5M033+zps0uxQpY4pDbV/JsU0jQ7twEiU1CfCfpkEGCdys99c0b3iyEFsuLXwZqWpQGERZXHEoIZed999/UshJdccondfffdxkw7ceLETE/FPzhLbbrppoY1EuKj/uPeWB75wtAXvtw4TbEG//XXX41A+osvvvBcWflysQy58cYb7emnn7Z7773Xs2gWv3s6aojYs+TMzAupIRgzMWRFLceatpSlAYaWjTbayCMrnnio8CBdY2PjrDu0RHxZsAaydMAaiZ8J1sy99trLUwXSB18kdtf07Nkzx0MQ/fncc8/tqQ2XW245z6WVX4U111zT+ALiUdhyF/0VsWdxAIcjvPBmZfNGvMyhheBLgPMT28HYEMBLHE5RzLaQlY0HzPiQjg26/s6WXHJJfzYnjUGHLxK/Hui3cy6GkMn3QhlCt5HsQsSeJRZmyFGjRtnbb7/tOSLtsccehqYBHwt+6r///nvPmw/NBgaX7bbbznr16uW5o84222yzemkbBWfRtdde27A2sjMGLQf7JFHjobrDmsnMy77HJZZYwjOBt2eWb3un4iXR120Xf4ZSa4jYAaSWWmopT6+M0z+aikMPPdT4qe/atWugZvtZZttPPvnE89jjS+GvyVKkoaHBW0ZAaHa2Q3BmfX890iyLeAnED4V8OSG4BKKtiA0KCnkRQA/dJ2Mex0sPxyIsi6jyyLONi5mWgFFm55139kzqeTsqsRA/bLz/vv322xJbtFZLM7k1Y7fyoKTUhx9+6JnH8ZhjPc2GAFR55FleMFsX6ogZ+tprr/X025xBwmYFZlLSHN2Qry2zOYacfNcKlbHWD17nBTlYlsS8iF2mVJml8zVh2xeH5rCXEcvjY489ZuPHjzdiV5/NBUcccYS3QQGT+IYbbui5rOIrQpr1vKvrj1mnb7HFFv6iktLM2AR/Zb5EaSC3iO2Xeglplhjon/1VUe+xfeu6666z008/3QYMGOBtJsAsPmPGjGxV8tlMngRurXmKvR3qle6gCRKb/puamgyCk05qELErkCxaEX8zliD+vD+NM5PLs15mpmYNTthmm22MXwBnjcQo4+q6GH04RiGXLzdmOdLY2NimWdJnbRG7jciLF2A5RKftajpCsmGAtfJll13mmdl5mUSX7eoR47zEOpzAjhvW6W6ZQZ46LrAECerB3bVyYsgdrM+MnWRyi9hBiZeYZ+eMq8rLHSZvNuryAshPPZbLQjM5bfmCcOoqSxjyQQMKSxysjVyrJjBjM6ZgH5QlldwidlDaJeaDVkr01ixRBg4caDhE4W6KztrfHWo7zsDGCITfB6Z1ZvetttrKfvnlF+9wS399jET+fDVpZm2IHOyDsiSSW8QOSrrEPOeA+KtiWp9//vm9w3Buuukmz/8aMz2WRVcPN1V04BiBgjMx6kJXj5gvQaUvjLTPFwqRu66uzlie5GsXxzIRu0KpdevWzRobG7OtUe1lM74ER5u5bM+ePV3SM6tz8M5vv/1maENYxmQvZhL+pU4mG9qnPXJzA750SZm9a0BsIEtmwBPPPZnfF9qV/fHHH8ZmA5dnmYIfiNtogP6azb9s8nWaEVcX11iXDjuG3BzQ4/9iunuwNKmrq/P8VFxZHGMRuwqp4V7qmqPRwPiCkQZtCOo8lhycEuXqEOO5R1wocLoU5C9Up9prkBpyQ+R8fVFeVxdfgovY+aRaYhkzrr/qXXfd5f3PBmhDUOf5rwXTWCFR5+Urx+U1WN5ReWZvdgdB5Hz3oLyuLn4EF7HzSbPEMs6xxhLpqqO+Q1uCloPDJQcPHuwdGczuFrz82JXO/+uI3zVHn7H8QDvin9U5B5uXUNdnrWJHcAxCBJ6BQ4Bc6NKlS62GEsp9ROwqYUTzccoppxjrZ14UOb4Mv2qWEwRUfvhY4/rKehrSQhIskpjf8fnGnxutCMYb3FSrHFJVzTnimMDOen51XKCsqo5r3FjErhJwdsQMGjTI+J92mYEx1qDiW2WVVQyvv/a6h8x49j300EPe7nJmSDwFS1mDt9dnh5XHsGMROwShsfOGDbjBrvh5ZxYPlpOvr6831uT+dTbWSrQmGHjYIkY9hcoQELErwy3bCrdUNuJmC3wJyoOGGN9lYycN7f3k5jpfEpYv/BKg46ZMoTwEROzy8MqpzYsevh45hZkML5AsTXgJy2QLflh3M+MHyU0jdrkze//zzz9kFcpAQMQuAyxXFYshW8FwUnJlLuYli/M++P8fXVmxmLrtkZs1N2eXFOtD13MRELFz8SiYY72MFgT9NVoMf2V2mXMcA9qRQssPfxt/uhC5OdePne3++koXRkDEzsWn3Rw+1/hNMyMHK3FyFA5EvXr1Cl4qKw+586256QTvQWKF0hAQsYvgNHnyZEO7gYMQ5PZX53gynJ8gNk5R/muVpllzo0MOrrlLPT6t0vsmrZ2IXUCi+FJw0CSbc101CIe2gt3qHE9WbB+ja1dOzBmB6LghuWvXo0cPl1RcAgIidgGQ0HpgcGloaPDO5ONIYPxAsDRiTi/QtOpLiy22mD355JPGmdl4EWK5rLrTFHUgYhcQNv8rGAdScng7exPZiFvJi2GBWxS8hIcfTkicCdgRvwwFbx7ziyJ2AQFiHezevXuBGroUPQRaRiRit+CgvwlDQMROmED1OC0IiNgtOOhvwhAQsRMmUD1O3ITpZgAAAmhJREFUCwIidgsO+pswBETsGAtUQ28fARG7fWx0JcYIiNgxFp6G3j4CInb72OhKjBEQsWMsPA29fQRE7Pax0ZUYIxATYscYYQ29JghwmpX/RiK2Hw2lE4OAiJ0YUepB/AiI2H40lE4MAiJ2YkSpB/EjIGL70VC64xCocc8ido0B1+1qg4CIXRucdZcaIyBi1xhw3a42CIjYtcFZd6kxAiJ2jQHX7WqDgIgdPs7qMQIIiNgREIKGED4CInb4mKrHCCAgYkdACBpC+AiI2OFjqh4jgICIHQEhaAjhI1AdscMfj3oUAqEgIGKHAqM6iRoCInbUJKLxhIKAiB0KjOokagiI2FGTiMYTCgIidigwxreTpI5cxE6qZFP+XCJ2ygmQ1McXsZMq2ZQ/l4idcgIk9fFF7KRKNuXPlSJip1zSKXt8ETtlAk/L44rYaZF0yp5TxE6ZwNPyuCJ2WiSdsucUsVMm8Fg/bhmDF7HLAEtV44OAiB0fWWmkZSAgYpcBlqrGBwEROz6y0kjLQEDELgMsVY0PAiJ2NGWlUVWJgIhdJYBqHk0EROxoykWjqhIBEbtKANU8mgiI2NGUi0ZVJQIidpUAqnk0EShK7GnTptngwYM7LnRy301NTdakUDUGQ4YMsbBCMb7ByWJfp6LEnj59ug0bNiyxobm52RSqx2Do0KEWVijGNzhZNbHr6+utX79+2dC3b18rFPx1lW7FTViEhwWcrJrYXbp0sREjRmTDqFGjrFDw11W6FTdhER4WcLJqYhfrQNeFQBQRKLrGjuKgNaZoIRDF0YjYUZSKxlQ1AiJ21RCqgygi8D8AAAD//6rUY6YAAAAGSURBVAMA8Da0zuyXYOAAAAAASUVORK5CYII="
  };
  TOUR_CELL_IMGS.tie = "data:image/png;base64,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";
  // '장단 쓰기'·'가사 쓰기' 단계의 예시 이미지 — 위와 같은 방법으로 뜬 캡처.
  // 재캡처: 선율 "황 | 태 | 중" + 장단 "덩 | 기덕 | 더러러러" + 가사 "달 | 아 | 라"를 넣고
  // 해당 칸을 클릭해 편집 하이라이트 rect(#ffe680)로 칸 좌표를 얻어 viewBox 크롭
  // (가사는 선율 정간 + 오른쪽 가사 줄까지 폭 16.3mm). 이하 데이터 URL은 16px/mm 렌더.
  const TOUR_JD_IMGS = {
    deong: "data:image/png;base64,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",
    gideok: "data:image/png;base64,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",
    deureo: "data:image/png;base64,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"
  };
  const TOUR_LY_IMGS = {
    dal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARAAAAC0CAYAAABc8HNZAAAQAElEQVR4AeydBbwVRRTGz30K2B3YLRb6s+MHCqiIigomNqgotiIqNoiKLQYGoGJiCyiCYvDs7sQCu8XArvdf3MfefXvz3bt1P37s293ZmdmZ7+z99sw5Z2br/tU/ISAEhECZCNSZ/gkBISAEykRABFImcComBISAWV0mk7FMRlsmIwwyGWGQyRSPQSajvNJA9BoRAkKgbAREIGVDp4JCQAiIQPQMCAEhUDYCIpCyoavtguq9EACBuvHjx5u7tWrVirSsbdiwYY3X3Xzaz8RMWISHxZgxY7KeTfdk1KhRekY9v+Mwn8m6Ll26mLvV1TVVSNq3b9943c2n/UzMhEV4WHTu3NnljKx9p06d9Ix6fsdhPpNNGSNLNDoRAkJACORGQASSG5ucV3RBCAiBGQiIQGbgoL9CQAiUgYAIpAzQVEQICIEZCIhAZuCgv0JACJSBQMkEUsY9VEQICIGUIiACSalg1S0hEAYCIpAwUNY9hEBKERCBpFSw6lYMEUhhk0QgKRSquiQEwkJABBIW0rqPEEghAiKQFApVXRICYSEgAgkL6Vq/j/qfSgREIKkUqzolBMJBQAQSDs66ixBIJQIikFSKVZ0SAuEgIAIJA2fdQwikFAERSEoFq24JgTAQEIGEgbLuIQRSioAIJKWCVbeEQBgIVJ9AwuiF7iEEhEAkCIhAIoFdNxUC6UBABJIOOaoXQiASBEQgkcCumwqBYhCIfx4RSPxlpBYKgdgiIAKJrWjUMCEQfwREIPGXkVooBGKLgAgktqKp9Yap/0lAQASSBCmpjUIgpgiIQGIqGDVLCCQBARFIEqSkNgqBmCIgAomlYNQoIZAMBEQgyZCTWikEYomACCSWYlGjhEAyEBCBJENOaqUQiCUCMSSQWOKkRgkBIRCAgAgkABQlCQEhUBwCIpDicFIuISAEAhAQgQSAoiQhkFAEQm+2CCR0yHVDIZAeBEQg6ZGleiIEQkdABBI65LqhEEgPAiKQ9Miy1nui/keAgAgkAtB1SyGQFgREIGmRpPohBCJAQAQSAei6pRBICwIikHRIUr0QApEgIAKJBHbdVAikAwERSDrkqF4IgUgQEIFEArtuKgTSgUAaCCQdklAvhEACERCBJFBoarIQiAsCIpC4SELtEAIJREAEEoHQvvjiC5s8ebJNnTo1grvrlkJgJgLNPRKBNBfBMspfeumlttFGG9naa69te+yxh7399ttl1KIiQiB6BEQgEcigbdu2jXedMGGCbbLJJnbttdc2pulACCQFARFIBJLq2rWrzTXXXFl3PuaYY2zs2LFZaToRAnFHQATSDAn99ddfdvjhh9t+++1nF154oT344IP266+/FqwR8thmm22a5Kuvr2+SpoTqIaCam4+ACKQZGP7zzz82ZswYGz16tJ1xxhm266672hJLLGEnnXSS/fbbb3lrJp8/w/bbb+9P0nmCEJg+fboNGjTIeamcffbZdvvtt9tnn32WoB6U3lQRSOmYNZZo2bKlDRgwoPHcPbjiiivszjvvdE8D97///ntW+uqrr26bbrppVppOkoXAo48+aqeeeqpddtlldsIJJzS+UDp37mw33nij+WWerN4Ft1YEEoxL0am9evWyTp06Nck/yyyzNEnzJnz66afeUzvuuOMsk8k4aT/88IO98cYb9v777zvn+pMMBDbeeGNbcsklmzR24sSJtvfee9uKK67oaKxNMiQ4QQTSTOFlMhkbMmRIk1pWXnnlJmnehPfee897alOmTLEDDzzQ1lhjDVtuueWsffv2tv766zvb8OHDjeFSVoFmnqh45RGYb7757JFHHrG55547sPJPPvnEunXr5tjLAjMkMFEEUgGh8dbZa6+9smpafPHFs84xrqJV4Gm54IILHA3Dm+G0006zO+64o8mYGS3k+OOPtyuvvNKbXccxRQAt45lnnrFFFlkkZwvxuE2bNi3n9SRdEIFUSFrbbrttVk3XX3+9DRw40Hr06OFoFRhN0Sp69uxpZ555ZlbeYk6kgRSDUjzyrLrqqoY9JB+JfPnll/FobDNbIQIpEUAMYYSiv/7660YQ2IgRIwztAcOptyqs8BdffLE98MADTbQKbz6OF154YScqlfgQbCpoHJAM5SGiJ554wg455BCyaksIAm3atDHklms4k49cEtJFp5k1SSBOz8v4g+q52GKL2WqrreZ4TAhDx/hJaDpvnKAqIYd27doZQ5xTTjnFIBxC2N28HTp0sHfeecceeughgywY3kAgBx98sGN4g1R4o9XVSVQuZlHsGX5effXVNnToUHv88cft33//LdgMhjOXX355YL75558/MD1piXoqS5AYblaCwIKK+NPPPfdc+/zzzx1ywO5xySWX2NFHH2077rhjlpEtKKAsqH6lhYsAQ8aXXnrJkCPeFYzbBxxwgB122GGOgXvDDTc0vyE8qIXrrbdeUHJq0kQgJYhyhx12cB6aSZMmGVoHD9dtt91mzz//vOFF8Q4zMpmMtWrVqkntf//9tzM+di9svfXW7qH2ISJAFDEEgCxvuukmO//88w0NEy8JMTm44ddZZx1DG3z66aebtOy5556zrbbaqihNpEnhFCXUpagvoXSF4LE111zT9txzT+ONtMUWW9jyyy9vDDGWXnrpxjagfTSe/H8wdepUO+ecc/4/m7EjenHGkf6GgcDo0aONIWWLFi1spZVWso4dOzrDy2OPPdZxrxJZ/OabbxbVlA8++MCwhxWVOS2ZfP0QgfgAac4pROKWf+qpp2zkyJFOaDP2D1RgbB+86dw87A866CB22kJC4NZbb3WMm5W4He77RRddtBJVJbYOEUgFRccbza0OAunbt69ddNFFdt999+X0xHjLuGW1rx4CGKkJ0GvOHfCg9OzZ0yEiNM/m1JX0snVJ70Cc2r/MMssYXhe3TRhWl112WcPgtt122zmzdvv37+/MlcAFTJDYsGHD3OxZ+59++slZaOj+++83LPmMz3v06OGo3LgIGZ8zC1gzeLNgK3hCgN+kBhtWnz59cuaFIIjZ2X///R0NkrVamGnNwk8MOYnhIM07ZM1ZWcoviEAqLGAiRiER9h999JG9+OKLNn78eLvuuuscQx1uX4iAcPWPP/7YIBLcgwSdEcq++eabGw8mZMRCQ7vvvrudfPLJxgNLTMkrr7xiX3/9tWO0ZTzfvXt3Z9LW999/X+GepLe6OeaYw4jbQSbeXh5xxBHmEgRueVzuYI+2gVzatGljlPWWqfVjEUiFnwDeXDx8aAloD9hBBg8e7Lj/unXrZmgOCy20kHG9Q4cOzpKGGPAIGiOUHdfhzz//XFKreDviHi4mNqGkilOeeZ999jEM4m43F1hgARGEC0aRexFIkUDhfuXNjxoLQbDWA9O2WfuDoQTuWEgB9ZfAL6z7aA/YQc477zy7+eabHfct7t4ib1lSNjSTUomnpBukNHOhdVua2+20k7oIpOEJweV6ww03OAbPs846y1kQqE/DGHnnnXdutDkwLIEgGFagSeA9Ye0HVGGGEkyggmAaqsv7nzE43hjWiCCS9cgjj3TmzBBXQhvuvfdee+yxxwxCwE1I27766itjOPTWW28Z8QfM+CT+BAIjFgVVG6NtrrDpvA2q8YvgW00IMpkZSzRU8x5R1i0CaUCfsTA/ZFaTws0KKfADffjhh50fcjHEALkQE4LLFjsH1v5evXo11D7zPwZV5tAQtn7LLbc4xlTm0bAsInElTMiDoAhkWmqppYzp4QSjzTrrrM4aqrgMV1hhBVtrrbWMe0FAxKIwfOH+M+9UhaMUVvnHH38YxupqdA3NA+JH3tWoPy511sWlIVG2g3knaBv52oDmwLwUiAZ7xd13321EKDIk+e677wwNANIhZB1PC+TB8MVbJ8ZR77n3mOn+eGVefvnlqj3U3vvp2ByZeXHgR+89L3TMkJGgM4zkGM2RO88RBI97F8LfZZddclZDNCwapbscJs/XkCFDnGjnnIVidkEE0iCQeeed13Cn8rZgKMFDwPqmEABL0THZjWtMdkNjYHWpzTbbzFg0aJ555mmoIfg/xlLvFbQLHhoWlmGmJpoPBlQMr0z3Jz6B1c3wwOAR+Pbbb73FdVxhBDBwe6v85ZdfGk8hB0LdGU4SfMai2bjSeS422GADQ+4MGdEWmc/ES4goY5ayfPXVVxvryXXAMBijLXUxyRKb2rhx45z5UsQG8aIqldBy3aua6SIQD7poGQwlIBPeKLjweDiwf3iy5T3E2Ep4M+5bXLTezEzxx8iK5Z+4ECbX4cJlpqc3H8cQF7YSNBLOtVUWAYynfgLB2M0QMZPJOBMe+SEzgRK3O+QBifBDR2to7tCHkPl8daDJvvDCC5XtdBVqE4EUA+r/ebBbsHI6dg7IBXWT+I1DDz3USCdcHbJhuj82CoYx/xcta8dbEI0kCQ9SWR2MsNDkyZMD747hOvBCBInECUVw25JuKQIpAS68IKwFQWg60aGnn366YQ8ZNWqUs0ZEoSX8iWzESIvWARnhvUHTwJ7CrM9cTSFfrmtKjw8CaJd8spTgPmZm83JhKoO/heTh2dl3332dT5wyFPLnoa4tt9zSnxy7cxFICSLB40F4ur8Iai9u2d69ezuhz8R8YGD1v80Y1xIzwgNGftRjhkjYUyAQ6vHXzTk2GfbaKocA2mLQDzffHbBRMZzBWMoQF5c7Q1VeHH/++acR4o4x/a677nIWHsLNf9RRRzVZHxU7G3YPhlDk//HHH41IYuriZUGcEav2Bz1r+doXxTURSAmo41rlofAWYZ4LY2I0CoxoDGe6dOniGFhxv3rzYnjznvuPsZ/404jzwKrvT9d58xDAS0KgX1AtEAsucuwQzJuBIFhg6NlnnzW0TSKLiQPC7Y6dilXq/LL21ostxT1nDZGgRYZw2VMXa85gVM9Xn1tXHPaFCSQOrYxRG7B/eN8MBJDlspbjcfE2He2DUHbcuUSu8iajPHm++eYbmzJlCoeNG/EdaD2NCTqoKAIQPh41CIONIQMvAtzyLDJEfA7aIQSRyZQfEOb1xg0YMKCifYi6MhFIiRKYbbbZnLVKvcVQN1lsub6+3lBL+SoZRlW8Ld58BKZBEhhHIQ68PRAJ0ZBoMd68HKftYaNPcdp46+OaZwjBxmTF3XbbzSr99p999tmdbhPdjP3DOUnJHxFIGYLkR+8t9u677zqrr2PbIHbkqquucoyqEIU3n/cYlzGBQ7wFMZgRF+K9TpwAC9Z403ScLASIK0GjYaPlRCizT9MmAilDmuuuu25WKSbYYRQlyIwxLC5c4jy84eWEsRM4hoEM95wbmIbhlfU38ex4KyXde67jaBAgVgMbCAZShpkYO/n06LRp0xzDJ9McCAwk6IyZ1ExTQKshELB169bmtbOgfWBcj6Yn1bmrCKQMXFFJWanbLUogGHNW8LKwbgch7ZAFc2rcPKussopBKlj/55xzTjfZ2RO5yNDGOWn4g42FCMWGQ/2PEAFcJK42GAAACHtJREFU7hi+iRJu3bq1s1gU0aMMffgsA8dojxjXMZRi3+LlgXsWTwvk420+c2N4bohu9aYn+VgEUqb0cMG6RSEQ99i7x3LvnvOwucfYS4hW5W1GHi/RkIf5E2glHGuLDgG/DatSLWEJiErVFXU9IpAyJYA66hZl6r3f4wJJYFx18xAbwjwKhjVY9YlWJe4DCz1zLdx87DHksdcWLQIMS9EO/TavXK2CcBh64l1jghyRymgo/vxoK/60pJ6LQMqUHATgLYqFHRcvD51LEqiy3jysHMaY2ZvmP0azScfwxd+zZJ63bdvWWRSbIC9k7O0FRm4iSrFr4cXhRYJnjTgRtAyGtN6V+t2yeOnc46TvRSBlSpA5L3hS3OJEH2II5SNThUiCMtg52Ps3f6Ca/7rOo0GAIC+GmkScMoUfzxvf+SGilMAv4kiKaRnTGfjkZTF5k5BHBNIMKWGrcItDJkQYYkQjipHQdFRYhi4Qy5NPPmk8eAxrCFRihTGm62NwhYyoh7cZhjiOtcUTAWJEWLISEiCatdRWEkxYapk45xeBNEM6TPFmWUHmReDqw52LtZ7V1SEQFu0lrB17CV4YruHB4ZaouQxxWGuEpQwJMuO7q1zTlkwEsHshT9b1wAtDJKvfwI4XLpm9C261CCQYl6JSGYagbbiT5ggcY3Zthw4dDALxG1a9laKJMBkLFRiSYS1WNJV8ZbzldRweAgxdWJqBqQVEGBMAiMz41AMxQRjDcfcSpcyLguvEgfBy8btyiRUKr+XVv5MIpJkYf/jhh8aEN381w4cPbzK3xZuHxYWYiOemYWDFCEucAAsR5Zpf4+bXPhwEGGYyNX/kyJHGsgv33HOPoWHwyQ60RoyrvED8RJGrdQxrc11LYroIpBlSY8jCmyioChYCwi4SdI00tBfctxjnOHc31kVFq9lpp52MyEc3XftoEFhwwQWdxa8rdXe+BVSpuuJQjwikTCkwGQ6Xrd/jQsj62LFjjY9EFfqKGWov3hs/idCkSZMmGQ8bYdKca4sOAZZoeO2118zvus/VImI/yIt3hqkNPXv2NOZIsRQAWkyucklMrwKBJBGG4tuMnQMfP8FFHHtLEijGD79du3be5LzHLOici0QwzPLg5a1AF0NBAOMn64GwBoj3hsSAMA+GFwlGVIaezJvBeMo1FghiegOf+WAxIsLgveWTfiwCKUGC2CYwmmFU8xZjOMLcF7wxaBXea8UcQyKs5h2kiWAbIbakmHqUp7oIMIcJ25X3LkSfYkQlorhly5beSzVxLAIpQsys14HLFdsEbxpvEWZbMguTiXLe9FKPeTOh3noNq24dxI+4x9pHiwCf8oi2BfG6uwgkjzxwqV5zzTXGtz+wvnuz4tIjOGzo0KGGoc17rdxjtBcCy/wkgpW/3DpVrrII+IPHsI0E3YHhDEs24NYnpB1je8eOHQM9dp7yiTsUgeQQGT9ajGD9+vXLykEkIcQxYsQIw+efdbECJ4REM5zBQOtWV8gY6+bTvvoIEInKsMW9E4tis/gTcSJsLIDNXChiQphHw5KJrK2K2xf7GPFB2Ezc8knfi0BySBBhE1VImDmBQdg98IiwRkQ1iMPbDAiD6FSCy4gLYSFe73UdR4uA15BK/AcfiSJOhA3yz/XNGbfVyNc9TvpeBJJDgmgarNkBibDCFFPswxR8ixYtjNmfBC1pVfYcQooo+cQTTzSvFlJKM5g/lS8+qJS64pBXBJJHCrVoVc8DR7UvJaZ+vG4Qe9BU/XydYKY1kyvz5UnaNRFI0iSm9sYCAdYCwUg6cODAwPYQTMZnIgiDJw6E1efIiw0lsEBCE0UgCRWcmh09AsysRqtgjRBWLps4caIRQDZ9+nTnK3V8JgIvHZGouOmjb3HlWyACqTymqrHGEECrwOPCWjCEsIdpK4saahFI1BKYcX/9FQKJREAEkkixqdFCIB4IiEDiIQe1QggkEgERSCLFpkYLgXggEAcCiQcSaoUQEAIlIyACKRkyFRACQsBFQATiIqG9EBACJSMgAikZMhUQAvFBIOqWiECiloDuLwQSjIAIJMHCU9OFQNQIiECiloDuLwQSjIAIJMHCq/Wmq//RIyACiV4GaoEQSCwCIpDEik4NFwLRIyACiV4GaoEQSCwCIpCEik7NFgJxQEAEEgcpqA1CIKEIiEASKjg1WwjEAQERSBykoDYIgYQikEgCSSjWarYQSB0CIpDUiVQdEgLhISACCQ9r3UkIpA4BEUjqRKoOCYE8CFT4kgikwoCqOiFQSwiIQGpJ2uqrEKgwAiKQCgOq6oRALSEgAqkladd6X9X/iiMgAqk4pKpQCNQOAiKQ2pG1eioEKo6ACKTikKpCIVA7CIhAakXW6qcQqAICIpAqgKoqhUCtICACqRVJq59CoAoIiECqAKqqFAK1gkBtEEitSFP9FAIhIyACCRlw3U4IpAkBEUiapKm+CIGQERCBhAy4bicEkoVA/taKQPLjo6tCQAjkQUAEkgccXRICQiA/AiKQ/PjoqhAQAnkQEIHkAUeXah0B9b8QAiKQQgjpuhAQAjkREIHkhEYXhIAQKISACKQQQrouBIRATgREIDmhqfUL6r8QKIyACKQwRsohBIRADgREIDmAUbIQEAKFERCBFMZIOYSAEMiBgAgkEBglCgEhUAwCIpBiUFIeISAEAhEQgQTCokQhIASKQUAEUgxKyiMEhEAgAgEEkp2vT58+1rVrV23CIPJnoHv37tkPp84iR6AggdTX19u4ceO0CYPIn4EJEyZE/oNRA7IRKEggvXv3tv79+2sTBpE/A/369ct+enUWOQIFCaRv3742ePBgbcIg8mdg0KBBkf9gCjSg5i4XJJCaQ0QdFgJCoGgERCBFQ6WMQkAI+BEQgfgR0bkQEAJFI/AfAAAA//8DkfocAAAABklEQVQDADz0s55mDbRDAAAAAElFTkSuQmCC",
    a: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARAAAAC0CAYAAABc8HNZAAAQAElEQVR4AeydZ5AU1RqGv+WaEHMuc8asZVkiQVlMYEABc14QFcyKwioG0FXXXBhRCrXMEYFCwVSu6Yc5YWEWc85hzVze3pq1u6d7wu5Mp3koeqdP6BOer+ed0yd1l3muf127dp1nZp5jzpw5rhicQiA+Aq2trZ57M3evfvnll/EVqsZz7jLfCPyHAAQg0CECCEiHsHERBCAgAgiIKHBAoAMEuMSsqIBMmDDBzjzzTA4YxH4PjB8/nu9swggUFZCJEydaU1MTBwxivweam5sT9vWhOEUFpE+fPta/f38OGMR+D+y00058YxNGoKiATJo0yWbNmsUBA889EMc9MX369IR9fShOUQEBEQQgAIEwAghIGBn8IQCBogQQkKKIiAABCIQRQEDCyBTwJwgCEGgjgIC0ceAvBCDQAQIISAegcQkEINBGAAFp48BfCECgAwTKFpAO5MElEIBARgkgIBk1LNWCQBQEEJAoKJMHBDJKAAHJqGGpVgIJZLBICEgGjUqVIBAVAQQkKtLkA4EMEkBAMmhUqgSBqAggIFGRrvV8qH8mCSAgmTQrlYJANAQQkGg4kwsEMkkAAcmkWakUBKIhgIBEwZk8IJBRAghIRg1LtSAQBQEEJArK5AGBjBJAQDJqWKoFgSgIVF9AoqgFeUAAArEQQEBiwU6mEMgGAQQkG3akFhCIhQACEgt2MoVAKQSSHwcBSb6NKCEEEksAAUmsaSgYBJJPAAFJvo0oIQQSSwABSaxpar1g1D8NBBCQNFiJMkIgoQQQkIQahmJBIA0EEJA0WIkyQiChBBCQRBqGQkEgHQQQkHTYiVJCIJEEEJBEmoVCQSAdBBCQdNiJUkIgkQQSKCCJ5EShIACBAAIISAAUvCAAgdIIICClcSIWBCAQQAABCYCCFwRSSiDyYiMgkSMnQwhkhwACkh1bUhMIRE4AAYkcORlCIDsEEJDs2LLWa0L9YyCAgMQAnSwhkBUCCEhWLEk9IBADAQQkBuhkCYGsEEBAsmFJagGBWAggILFgJ1MIZIMAApINO1ILCMRCAAGJBTuZQiAbBLIgINmwBLWAQAoJICApNBpFhkBSCCAgSbEE5YBACgkgIFUy2jvvvGNDhw61YcOG2VVXXWUfffRRlXIiWQh0nEBnr0RAOksw5PrXX3/dpk2bZlOnTrWzzjrLtthiCzvwwANtzpw5IVfgDYH0EUBAqmSznXfe2ZZffnlP6rNmzbLevXvbFVdc4fHHAYG0EkBAqmS5xRZbzK6//vrA1MeNG2dvv/12YBieEEgTAQSkitbq27evrbPOOoE5fP7554H+eEZHgJw6TwAB6TzDgin07NkzL1ytk2222SbPH490E3jiiSfslFNOsVGjRtl1111njz/+uP3xxx/prlSR0iMgRQB1Nnj11VfPS2K33XazhRdeOM8fj3QTOPnkk+3SSy+1yy67zEaMGGHbb7+90w92+umn27vvvpvuyoWUHgEJAVMp7xVXXDEvqc033zzPD4/0E9h7773zKvHzzz/bBRdcYOutt56NHTvWWltbLUv/EJAqW7Nbt255OXTv3j3PL2oP8qs8gVNPPdUaGhpCEz7//PNNw/mfffZZaJy0BSAgVbbYggsumJfDGmuskeeHR/oJLLDAAjZ58mQ78cQTQyuj0bf9998/NDxtAQhIlS3277//5uWwyiqr5PnhkQ0CXbp0scsvv9zGjx8fWqGnnnrKsjIKh4CEmrkyAT/99JMnIU0uowPVgySTDs0+1mhMWOV++eWXsKBU+dekgERpoe+//96THf0fHhyZdlx00UW2yy67BNZxmWWWCfRPmycCUmWL/fDDD54c6P/w4Mi0Q48zWkgZVMkll1wyyDt1fghIlU3mb4EEzQupchFIPkYCa665ZmDudXV1gf5p80RAqmyxclogb775prN+ZsyYMbbvvvvaoEGDnAlJTU1N9txzz1lQh2yVi0/yEPAS8LkQEB+QSju//fZbT5Jrr712u1uTjDT9+YwzzrBNNtnEevXqZY2NjTZp0iR79NFH7cknn7S7777bmdk4YMAAZyXva6+91n49J5UngEiXxxQBKY9X2bG//vprzzUvvfSSMyOxX79+pv6QwYMH2zXXXGOlTC566623nD1F/v77b0+aODpOQBs/XXzxxXbQQQeZOrj/97//WV1dnbMIUqKtPowPPvig4xlk/EoEpMIG/ueff+yTTz4xjfXffPPN9umnn3pyUAvj2muvtVdffdXjX6pDw8J//fVXqdGJF0Lgt99+c+ZqrL/++jZ69Gi7/fbbPVssvP/++/bQQw/ZcccdZ2o1ap2L/3E0JOma8kZASjS3xu3nzp1rs2fPtmeffdYee+wxmzJlil155ZXOY8fBBx9s2267rbN4arPNNrM999zTmZGo60rMwhNN80W0ZkYbE2kns6OOOsqam5tt5syZ1rVrV09cHOURePHFF23TTTc17ctS6pWaHNajR4/MTAArtd7F4iEgxQjND9ejg0ZPttxyS9tuu+2csf199tnHhg8fbmeffbbT8fnggw/aG2+8MT92af+1T4iayEceeaSde+65duONN9rDDz/stEw0S1F5ajn4nXfe6eypqgVZirvxxhuXlgGxAglob9pdd93V1MIIjFDAU9PQ6+vr7ddffy0Qq7aCEJAS7K0m7O67715CzP+iaM+P/1xtZxpd0UiLOlaff/55p9msVsUxxxzjtFi22morW2211Vjq34ar4n/VGhw4cKB99dVXgWlr+b1+GBoaGpwO66BIEhH1WQWF1aIfAlKC1bUgTv0Zt9xyi+mxwn+JHjc07Hreeec5Gymr9aBfOr/oqPWwwgorOJ10/jRwV5+A+jmCRrHUz/HFF184j6Ua9VJr8Omnn3b6smRXf8nUYqQ/pI0KAtLGoaS/2ghIjxVqPehGmzFjhmn3dQnGxIkTbeTIke39IH/++acp3J2wNptJbQeouyIpPb/33nvzSn7//fc7m1wH7duiRY933XWXnXPOOZ7rNPzOxthtSBCQNg5l/VX/xY477ujM29BNFnTxyy+/nOetkRcNC+YF4FF1ApoR/Mgjj3jyufDCC53Jeh7PAMdpp51m/i0o77vvvoCYteeFgFTJ5pogFpS0mr+8GyaITHX9Pv7447wMNHKW5xngoX0+jj32WE+IHoXmzZvn8atFBwJSJatrDoE7aQ3H5txHH320MRksRyOaz6Ave9BjS1hpNtpoo7wg9ZvkedaYBwJSisHLjKPmsv8RRrt05zpg9Sij+SNlJkv0ThBYaaWV8q5WKyLPM8RDE/j8QcxQNUNA/HdFBdyahepOpr6+3rR8W3M5cv48yuRIRPOpkbLFF1/ck5kmh5W69mX69Omea+X48ccf9VHTBwJSYfPrhtSN6U52jz32cJzqiNMKW8cx/8+wYcOYlDSfQxT/tTfH4Ycf7slKw/KNjY0evyCHVkLrVQ3+sFyL0u9fS24EpMLWnjp1qjOb1J3soEGD2p2auZpzaPhXnXNBz+e5OHxWjoBm8vpT00K6IUOGmCb4+cPkfuaZZ0yTz3TuPjS5cOWVV3Z7lX2uiW2afaxRngEDBlifPn2cF1NpaNm/CLPsxCO6oLiARFSQLGSjt5BpL0x3XbSOZamllmr30gpcvb0s5zFt2jRnHkLOzWf1CGy44YYWtP5FX1iFHXrooc7KaH2p77nnHjv++OOdL3XQzNX99tuvUwXVIj49UvXv3980G1md7hIrzRWSoGmqQEtLS6fyiOJiBKSClDVb1b8sv6GhIS8HzXzUM3kuQDt4a4Jazs1n9QjoLXFBLQrlqEcaLSvQl1ozUMM6uvUo6m5J6tpyj2JrcTRZTfvElJtu1PERkAoRV4eaOkbdyalZqvUtbj+d65fHf3MedthhRq++6FT30LIELVAM2+y4WO5aiqBJZFHsrK+9SoqVJ+5wBKRCFrj66qtNz7Tu5Ar9gmheiB5vcvF1rX71tBI358dndQgsuuii9sADDzgvgZKYl5qLWh56rCi97yM8Zd0b+tEIml+Su0qbHOXOk/qJgFTAMq+88opdcsklnpSGDh1qhW4ORdZep+5Hmffee8+03kYbEimco3oE6urqTKNgmhWsvVuK5aQWoxbYqa+kWNxSwtVavemmm5wtIH7//Xen412PULonTjrpJGcrS/ewfylpxhEHAekkdc1G9HeoqQPMvwArKBt1rk6YMMETNHfuXNOjz4cffujxx1EdAlrLpJEzjXporYze5aJXT6p1qB8F7U373XffmUbLtN1hNUqhxyFtQqWp9WPHjnX2wNW2AvKvRn6VTBMB6QTN1tZWO+CAA0w3nzuZpZde2vRropaJtjh0h/nPJRZ+AVJHrB5xinW0+dPC3XECyy23nGmBpF6Qfccdd9htt91merPcDjvsYLJnx1POv7Kcx6b8q5Plg4B00B6a2qwvvqalu5Po2bOnvfDCC6befm1Qo8lGamVoD053PPe59hFxP8ooTKJUX1/v7Mspd/oOShxGIEtbUiIgYVYu4K8vt56b9UzsjqbeeT3Xuv3UmtAwbd++fZ0NatxhuXO95lAik3PnPtWxqhaOdjLTc3LOn890E9Cja7pr8F/pEZD/WJR0pqE1zRPwtzw0Iaxfv37OpspBW96pg9Q9gcyfmR5ljjjiCL+349Z7YpS2OvwcD/6kmoC/tZnmyiAgZVhPz8U9evQwdXS6L9NO6dqRPeenTjj39PWcv2Y4arZqzu3/HDdunPNuEr+/3Jr23rt3b+edMuq4lR9HOgmoxZnOkueXGgHJZ5Lno/0vNeSnGaTuQLUa1FEqUXH7m5nTkx40X6DQPiB6NtZ+nP603G69U0bDw3os+uabb9xBnCeQQF1dXV6pll122Ty/tHogIAUspy+7RlM0xKahvlxUNUFvvfVWZ1d1ve4h5+/+1HOu9k11+2mndomE289/vsEGGzivtvT7+93qM9F6Cs0b8LeI/HFxx0egri5fQMrZyCi+kpeWMwISwkkLm9TvcMIJJ3hmmMqt11Pq3SIhl7Z7q6WgvhEJhzwPOeQQ07JynRc69tprLwtaORp0jZaZ6301WoClvOhsDaIUr59/2FbzhOItUeVyR0B8LDVvY8SIEc4S7tyLoiQAjY2NpiXfWkTVrVs331XhTvWNqONVgqTh2vCY3hDNVNS8BK9vuKulpcU0+1WtEk1GUlnDYxMSJQF/q3OttdaKMvuq5lUFAalqeaueuGYdagMZZaTJXJMnTzYJwOjRo00LqeRf7qEZheVOgdairxtuuME0r6Sc/DT0q36SXr16OW+6K+da4laHgH6A3Cl3797d7Uz1OQLiM5/6NyQg2gNCqzYHDx4c25vidONNmTLF9M4ZvaQqqFNWxVc8HSq7msdaAaz4Yf0zuoYjOgLa1T2X26qrruq8fTDnTvsnAhJgQRlcR0BQ5F5qvWiVrvYamT17tqmFpIlsej2mznXoLXg6NNSrl15puFjx1SEbeYHJ1d3kgwAAA2xJREFUMI/AIoss0u6nOUTtjgycICApNKIWddXV5ffup7AqNVFk94+RXs5eoNKpC0JAUmcyCpw2AgsttFB7kdU31e7IwAkCkgEjUoVkE1CLUSVUJ/y6666r08wcCEhmTElFkkogN/dHfVlJLWNHy4WAdJQc11WaQGbTy3WiakQva5VEQLJmUeqTOAJLLLGEafhWWzpYxv4hIBkzKNVJHgFNQtS7Z3J9IckrYcdLhIB0nB1XQqAkAltvvbVpcl9JkVMWCQFJhsEoBQRSSQABSaXZKDQEkkEAAUmGHSgFBFJJAAFJpdkoNASSQSAJApIMEpQCAhAomwACUjYyLoAABHIEEJAcCT4hAIGyCSAgZSPjAggkh0DcJUFA4rYA+UMgxQQQkBQbj6JDIG4CCEjcFiB/CKSYAAKSYuPVetGpf/wEEJD4bUAJIJBaAghIak1HwSEQPwEEJH4bUAIIpJYAApJS01FsCCSBAAKSBCtQBgiklAACklLDUWwIJIEAApIEK1AGCKSUQCoFJKWsKTYEMkcAAcmcSakQBKIjgIBEx5qcIJA5AghI5kxKhSBQgECFgxCQCgMlOQjUEgEEpJasTV0hUGECCEiFgZIcBGqJAAJSS9au9bpS/4oTQEAqjpQEIVA7BBCQ2rE1NYVAxQkgIBVHSoIQqB0CCEit2Jp6QqAKBBCQKkAlSQjUCgEEpFYsTT0hUAUCCEgVoJIkBGqFQG0ISK1Yk3pCIGICCEjEwMkOAlkigIBkyZrUBQIRE0BAIgZOdhBIF4HCpUVACvMhFAIQKEAAASkAhyAIQKAwAQSkMB9CIQCBAgQQkAJwCKp1AtS/GAEEpBghwiEAgVACCEgoGgIgAIFiBBCQYoQIhwAEQgkgIKFoaj2A+kOgOAEEpDgjYkAAAiEEEJAQMHhDAALFCSAgxRkRAwIQCCGAgASCwRMCECiFAAJSCiXiQAACgQQQkEAseEIAAqUQQEBKoUQcCEAgkECAgHjjjRw50gYOHMgBg9jvgSFDhnhvTlyxEygqIC0tLTZjxgwOGMR+D8ycOTP2LwwF8BIoKiDDhw+3MWPGcMAg9ntg1KhR3rsXV+wEigqIjNbc3GwcMIj7Hmhqaor9C1OkADUXXFRAao4IFYYABEomgICUjIqIEICAnwAC4ieCGwIQKJnA/wEAAP//CnvSnwAAAAZJREFUAwCkXzGAOG4IIwAAAABJRU5ErkJggg=="
  };
  const TOUR_STEPS = [
    // 에디터 모드 임시 비활성화 — #modeBox가 display:none이라 어차피 자동 건너뛰지만,
    // 그러면 단계 수(N / length)가 헛돌아서 배열에서 아예 뺀다. 되살릴 때 주석 해제:
    // { sel: "#modeBox", title: "입력 방식",
    //   body: "• 직접 입력 — 악보의 정간을 클릭해 그 자리에서 씁니다 (기본)\n• 에디터 — 곡 전체를 텍스트로 한 번에 고칩니다\n• 언제든 서로 바꿀 수 있습니다" },
    { sel: "#melodyRibbon", title: "기능바",
      body: "• **입력** 그룹 — **율명·시김새·장단·가사/활**·텍스트·빠르기/각/장 도구창을 열 수 있습니다\n• **각(마디) 삽입/삭제**·내용 지우기·**정간 서식**을 할 수 있습니다\n• 율명·가사 **글자 크기**를 조절할 수 있습니다" },
    { sel: "#sheetArea", title: "악보",
      body: "• 전통 정간보처럼 **오른쪽에서 왼쪽**으로 읽습니다\n• **정간(칸)을 클릭**해 그 자리에서 바로 쓸 수 있습니다\n• **⌘/Ctrl+Z**로 되돌릴 수 있습니다" },
    // 레이아웃 — 정간 입력법보다 먼저. 악보의 짜임(정간·각 수·배치)을 어디서 바꾸는지부터
    // 알아야 내용을 채울 판이 선다. prep이 사이드바를 '레이아웃' 탭으로 돌려 보여준다.
    { sel: "#sidebar", title: "레이아웃 잡기", prep: tourEnsureLayoutTab,
      body: "• 오른쪽 **설정 › 레이아웃** 탭에서 악보의 짜임을 정할 수 있습니다\n• **한 각의 정간 수**·**총 각 수** — 새 문서에서 정한 값을 언제든 바꿀 수 있습니다\n• **한 줄에 놓을 각 수**·**페이지 채움**으로 종이에 어떻게 얹을지 정합니다\n• 맨 위 요약에서 **각 너비·페이지 수**를 바로 확인할 수 있습니다",
      skipIf: function () { return document.body.classList.contains("sidebar-collapsed"); } },
    // 정간 입력 예시 — '무엇을 치면 무엇이 그려지는지'를 그림(fig)으로. 첫 방문자가 투어만
    // 보고 바로 써 볼 수 있게 악보 단계 바로 다음. 이미지는 손그림이 아니라 **앱이 실제로
    // 그린 악보**의 캡처다: 에디터에 "황 | 황 태 | 황태 | 황{미는표} | 황태 -황"을 넣고
    // 렌더된 페이지 SVG를 정간별로 viewBox 크롭 → canvas로 PNG 데이터 URL화(16px/mm,
    // 흰 배경, 편집 하이라이트 rect 제거). 렌더 모양이 바뀌면 같은 방법으로 다시 떠서 교체할 것.
    { sel: "#sheetArea", title: "정간 입력 방법",
      body: "## 한글로 쓰기\n• 한글로 적으면 자동으로 **한자**로 바뀌어 표시됩니다 (예: 황 → 黃)\n• 옥타브는 앞에 **중청/청/배/하배**를 붙여 입력합니다 — 청황→潢, 배황→僙\n## 입력 방법\n• **스페이스**로 나누면 **분박** — 한 박을 위→아래로 나눌 수 있습니다\n• **붙여 쓰면** 한 줄에 나란히 넣을 수 있습니다(붙임)\n• 앞 음을 끌어 이을 자리엔 **-** 를 적습니다(이음)\n• 시김새는 음 뒤에 **괄호**로 넣을 수 있습니다 (예: 황{미는표})",
      fig: [
        { t: "황", cap: "한 음", img: TOUR_CELL_IMGS.one },
        { t: "황 태", cap: "분박", img: TOUR_CELL_IMGS.split },
        { t: "황태", cap: "붙임", img: TOUR_CELL_IMGS.joined },
        { t: "황{미는표}", cap: "시김새", img: TOUR_CELL_IMGS.orn },
        { t: "황태 -황", cap: "이음(-)", img: TOUR_CELL_IMGS.tie }
      ] },
    // 시김새 3단계 — 팔레트(악기 선택)·숫자 단축키·미세 조정. 정간 입력 바로 다음인 건
    // 시김새가 선율에 붙는 것이라 '음을 넣었으면 꾸민다'는 차례라서. 캡처 없이 글로만 —
    // 셋 다 악보 그림이 아니라 조작(어디를 눌러 어떻게 쓰나)에 대한 안내라서.
    // prep(tourEnsureOrnWin)이 시김새 창을 열어 두므로 also의 버튼들이 실제로 보인다.
    // 대상은 팔레트 머리줄(.pal-top) — 악기·크기 컨트롤이 다 이 줄에 있어 구멍 하나로 다
    // 밝아진다. 기능바의 여는 버튼은 also 링으로.
    { sel: "#ornWinWrap .pal-top", title: "시김새 팔레트", prep: tourEnsureOrnWin,
      also: ["#winToggleOrn", "#ornWinWrap .orn-instrument", "#ornWinWrap .size-ctl"],
      body: "• 기능바 **입력** 그룹의 **시김새**에서 팔레트를 열 수 있습니다\n• 칩을 클릭하면 지금 열린 정간에 바로 들어갑니다\n• **악기**(가야금·거문고·대금·피리·해금·아쟁)를 고르면 그 악기에서 자주 쓰는 시김새가 맨 앞으로 올라옵니다\n• **크기 ±**로 팔레트 기호를 키워 볼 수 있습니다" },
    { sel: "#ornWinWrap", title: "시김새 숫자 단축키", prep: tourEnsureOrnWin,
      also: ["#ornMapToggle"],
      body: "• 붙임표 시김새 칩에는 숫자 **1~0** 배지가 항상 붙어 있습니다\n• **숫자키**를 누르면 그 시김새가 골라집니다\n• 이어서 악보에서 **붙일 음을 클릭**하면 그 옆에 바로 붙습니다\n• 번호 배정은 팔레트의 **단축키 변환 ①**에서 바꿀 수 있습니다\n!! **Tip!** 꾸밈음 시김새는 율명을 먼저 다 적어 두고, 나중에 단축키로 한 번에 붙이는 게 편합니다" },
    { sel: "#ornEditToggle", title: "시김새 미세 조정", prep: tourEnsureOrnWin,
      body: "• 팔레트의 **크기/위치 미세조정 ⌖**을 켭니다\n• 악보에서 **시김새를 클릭**해 고르면(옅은 네모 표시) 크기와 위치를 조절할 수 있습니다\n• **Backspace/Delete**로 고른 시김새를 지울 수 있습니다\n• 글자로도 됩니다 — 괄호 안에 **@크기,좌우,상하**를 덧붙입니다\n• 예: **황{미는표@120,5,-5}** = 120% 크기, 오른쪽 5·위 5" },
    // 장단·가사 — '켜면 이렇게 되고 이렇게 쓴다'를 실제 렌더 캡처와 함께.
    // 정간 입력 다음 순서인 건 실제 작성 차례(선율 → 장단·가사)를 따라가는 것.
    // 구멍은 켜는 곳(기능바 버튼)에 — 예전엔 악보 전체였는데, 빈 문서 투어에선 장단·가사
    // 줄이 아직 없어 '어딜 누르라는 건지'가 안 보였다. 결과 모습은 fig 캡처가 보여준다.
    { sel: "#winToggleJangdan", title: "장단 쓰기",
      body: "• 기능바 **입력** 그룹의 **장단**에서 켤 수 있습니다 — 맨 처음 각 옆에 장단 줄이 생깁니다\n• 정간마다 **덩·기덕·더러러러** 같은 장구 구음을 적으면 **장구 부호**로 그려집니다",
      fig: [
        { t: "덩", img: TOUR_JD_IMGS.deong },
        { t: "기덕", img: TOUR_JD_IMGS.gideok },
        { t: "더러러러", img: TOUR_JD_IMGS.deureo }
      ] },
    { sel: "#winToggleLyrics", title: "가사 쓰기",
      body: "• 기능바 **입력** 그룹의 **가사/활**에서 켤 수 있습니다 — 각(세로줄)마다 오른쪽에 가사 줄이 생깁니다\n• 정간마다 노랫말을 **한 글자씩** 적을 수 있습니다 — 그 정간 오른쪽에 표시됩니다\n• **활 기호**(뜰·튕김 등)도 기호 팔레트에서 같은 줄에 넣을 수 있습니다",
      fig: [
        { t: "달", cap: "황 옆에 '달'", img: TOUR_LY_IMGS.dal },
        { t: "아", cap: "태 옆에 '아'", img: TOUR_LY_IMGS.a }
      ] },
    // 듣기 — 상단바 1급 버튼 셋(재생·정지·재생 설정)인데 예전 투어엔 통째로 빠져 있었다.
    // 악보 다음에 두는 건 '써 넣었으면 들어본다'는 차례라서(설정·인쇄보다 앞).
    { sel: "#playBar", title: "들어보기",
      body: "• **재생**을 누르면 써 넣은 선율을 소리로 들어볼 수 있습니다 (사인파 · 시김새 제외)\n• **재생 설정 ⚙**에서 기준음(황)과 빠르기를 바꿀 수 있습니다" },
    // '설정' 단계는 뺐다(2026-07-17) — '레이아웃 잡기'가 이미 사이드바를 통째로 비춰
    // 겹쳤고, 문서 탭(제목·종이 방향)은 따로 가르칠 만큼 헷갈리지 않다. 보관 탭의
    // 임시 저장만 아래 '인쇄 · 파일' 단계에 한 줄로 흡수.
    { sel: "#outBox", title: "인쇄 · 파일",
      body: "• **인쇄** — 완성한 악보를 종이나 **PDF**로 출력할 수 있습니다\n• **⋯ 파일** 메뉴 — 새 문서 · **PNG** 다운로드 · 파일 저장·불러오기를 할 수 있습니다\n• 여러 버전을 남기고 싶으면 사이드바 **보관** 탭에 이름 붙여 저장할 수 있습니다" },
    { sel: "#btnHelp", title: "도움말",
      body: "• 궁금할 때 언제든 이 버튼으로 **도움말**을 열 수 있습니다\n• 이 둘러보기도 도움말 창에서 **다시 시작**할 수 있습니다" }
  ];
  let tourIdx = -1, tourOnEnd = null;
  function tourRect(step) {
    const el = document.querySelector(step.sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width || r.height) ? r : null;   // rect 0 = 화면에 없음 → 그 단계는 건너뜀
  }
  // 단계 준비(prep) — 시김새 3단계처럼 '눌러야 하는 버튼'이 접힌 도구창 안에 있으면
  // 창을 먼저 열어 보여준다. 뭘 열었는지 기억해 뒀다가 endTour에서 원래 창으로 복원.
  let tourPrevWin = null, tourTouchedWin = false;
  function tourEnsureOrnWin() {
    const w = $("ornWinWrap");
    if (!w || w.classList.contains("win-open")) return;
    if (!tourTouchedWin) {
      const open = document.querySelector(".direct-win.win-open");
      tourPrevWin = open ? open.id : null;
      tourTouchedWin = true;
    }
    $("winToggleOrn").click();
  }
  // '레이아웃 잡기' 단계용 — 사이드바를 레이아웃 탭으로 돌려 본문이 가리키는 컨트롤이
  // 실제로 보이게 한다. 시김새 창과 같은 규칙으로 endTour에서 원래 탭 복원.
  let tourPrevTab = null, tourTouchedTab = false;
  function tourEnsureLayoutTab() {
    const btn = document.querySelector('.tab[data-tab="layout"]');
    if (!btn || btn.classList.contains("active")) return;
    if (!tourTouchedTab) {
      const cur = document.querySelector(".tab.active");
      tourPrevTab = cur ? cur.dataset.tab : null;
      tourTouchedTab = true;
    }
    btn.click();
  }
  function stepAvailable(i) {
    const s = TOUR_STEPS[i];
    if (s.prep) { try { s.prep(); } catch (_e) {} }   // 대상 rect 재기 전에 — 닫힌 창이면 rect 0이라 건너뛰어버림
    return !(s.skipIf && s.skipIf()) && !!tourRect(s);
  }
  // 보조 하이라이트 링(step.also) — 컷아웃 구멍은 하나뿐이라, 본문이 가리키는 나머지
  // '실제 누를 버튼'들엔 살짝 테두리만 두른다(pointer-events 없음, positionTour마다 재계산).
  function positionTourRings(step) {
    document.querySelectorAll(".tour-ring").forEach(function (n) { n.remove(); });
    (step.also || []).forEach(function (sel) {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const d = document.createElement("div");
      d.className = "tour-ring";
      d.style.left = (r.left - 4) + "px";
      d.style.top = (r.top - 4) + "px";
      d.style.width = (r.width + 8) + "px";
      d.style.height = (r.height + 8) + "px";
      // 카드보다 '앞'에 끼워야(z 순서) 링이 말풍선 위로 그려지지 않는다
      $("tourLayer").insertBefore(d, $("tourCard"));
    });
  }
  function positionTour() {
    if (tourIdx < 0) return;
    const r = tourRect(TOUR_STEPS[tourIdx]);
    if (!r) { endTour(); return; }
    positionTourRings(TOUR_STEPS[tourIdx]);
    const pad = 6;
    const hole = $("tourHole");
    hole.style.left = (r.left - pad) + "px";
    hole.style.top = (r.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    // 말풍선은 대상 아래 우선 → 위 → 옆(오른쪽 우선) → 화면 안으로 클램핑.
    // '옆'은 대상이 화면 높이를 거의 다 쓰는 경우(시김새 팔레트 전체 등) 위아래 어디에도
    // 안 들어가서 — 그때 대상을 덮고 앉는 것보단 옆이 낫다.
    const card = $("tourCard");
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
    let top = r.bottom + pad + gap;
    if (top + ch > window.innerHeight - 8) top = r.top - pad - gap - ch;
    if (top < 8) {
      const rightX = r.right + pad + gap, leftX = r.left - pad - gap - cw;
      const sideLeft = (rightX + cw <= window.innerWidth - 8) ? rightX : (leftX >= 8 ? leftX : null);
      if (sideLeft !== null) {
        card.style.left = sideLeft + "px";
        card.style.top = Math.max(8, Math.min(window.innerHeight - ch - 8,
          r.top + r.height / 2 - ch / 2)) + "px";
        return;
      }
      top = Math.max(8, Math.min(window.innerHeight - ch - 8, r.top));
    }
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
    // 본문은 \n마다 줄(div) 하나 — 통짜 textContent + pre-line이 아니라 줄 단위 블록이라야
    // 긴 글머리표가 접힐 때 둘째 줄이 • 밑이 아니라 글자 밑에 맞는다(내어쓰기, CSS #tourBody div).
    // 미니 문법 셋: **굵게**(짝수 번째 ** 사이만 <b>), 줄 앞 "## "은 소제목(.tour-sub —
    // 한 단계 안에서 글머리표 묶음이 둘일 때 나눔), 줄 앞 "!! "은 팁(.tour-tip — 기능 안내가
    // 아니라 권장 사용법, 연한 강조 배경 상자). innerHTML 대신 노드 조립 —
    // 본문에 황{미는표}·< 같은 문자가 그대로 들어가 이스케이프 사고를 피하려고.
    const bodyEl = $("tourBody");
    bodyEl.textContent = "";
    s.body.split("\n").forEach(function (ln) {
      const d = document.createElement("div");
      if (ln.slice(0, 3) === "## ") { d.className = "tour-sub"; ln = ln.slice(3); }
      else if (ln.slice(0, 3) === "!! ") { d.className = "tour-tip"; ln = ln.slice(3); }
      ln.split("**").forEach(function (seg, k) {
        if (!seg) return;
        if (k % 2) { const b = document.createElement("b"); b.textContent = seg; d.appendChild(b); }
        else d.appendChild(document.createTextNode(seg));
      });
      bodyEl.appendChild(d);
    });
    // 예시 그림(fig 있는 단계만) — {t:입력, cap:설명, img:캡처 데이터 URL} 배열을
    // '입력 칩 ↓ 캡처 이미지 / 설명' 세로 묶음의 가로 그리드(.tf-grid)로 그린다.
    // positionTour보다 먼저 넣어야 카드 높이에 반영된다.
    const figEl = $("tourFig");
    figEl.textContent = "";
    if (s.fig) {
      const grid = document.createElement("div");
      grid.className = "tf-grid";
      s.fig.forEach(function (ex) {
        const item = document.createElement("div");
        const t = document.createElement("span"); t.className = "tf-in"; t.textContent = ex.t;
        const a = document.createElement("span"); a.className = "tf-arrow"; a.textContent = "↓";
        const im = document.createElement("img"); im.src = ex.img; im.alt = ex.t + " 입력 결과";
        item.appendChild(t); item.appendChild(a); item.appendChild(im);
        if (ex.cap) {   // 캡션은 있을 때만 — 입력 칩만으로 설명이 끝나는 예시(장단 등)는 생략
          const c = document.createElement("span"); c.className = "tf-cap"; c.textContent = ex.cap;
          item.appendChild(c);
        }
        grid.appendChild(item);
      });
      figEl.appendChild(grid);
    }
    figEl.style.display = s.fig ? "" : "none";
    $("tourPrev").style.display = i === 0 ? "none" : "";
    $("tourNext").textContent = i === TOUR_STEPS.length - 1 ? "완료" : "다음";
    positionTour();
    // prep이 방금 도구창을 열었다면 이 시점 레이아웃이 아직 낡았을 수 있다(특히 프리뷰
    // 환경) — 한 틱 뒤 같은 단계면 한 번 더 자리 잡기. rAF는 프리뷰에서 안 돌아 setTimeout.
    const my = tourIdx;
    setTimeout(function () { if (tourIdx === my) positionTour(); }, 60);
  }
  function startTour(onEnd) {
    // 겹침 방지 — 모달(z 500)들이 투어(z 800) 밑에 깔린 채 남지 않게 먼저 닫는다
    $("helpModal").style.display = "none";
    $("welcomeModal").style.display = "none";
    tourOnEnd = onEnd || null;
    track("tour_start");
    $("tourLayer").style.display = "block";
    tourGo(0, 1);
  }
  function endTour() {
    // 건너뛰기·Escape·완료 모두 이 경로 — onEnd(첫 방문이면 마법사)는 딱 한 번
    tourIdx = -1;
    document.querySelectorAll(".tour-ring").forEach(function (n) { n.remove(); });
    // prep이 시김새 창을 열었었다면 투어 전에 열려 있던 창으로 되돌린다(작업 공간 존중)
    if (tourTouchedWin) {
      const w = $("ornWinWrap");
      if (w && w.classList.contains("win-open") && tourPrevWin !== "ornWinWrap") $("winToggleOrn").click();
      if (tourPrevWin && tourPrevWin !== "ornWinWrap") {
        const btn = document.querySelector('.win-toggle[data-target="' + tourPrevWin + '"]');
        const pw = $(tourPrevWin);
        if (btn && pw && !pw.classList.contains("win-open")) btn.click();
      }
      tourTouchedWin = false; tourPrevWin = null;
    }
    // prep이 사이드바 탭을 돌렸었다면 원래 탭으로
    if (tourTouchedTab) {
      if (tourPrevTab) {
        const b = document.querySelector('.tab[data-tab="' + tourPrevTab + '"]');
        if (b && !b.classList.contains("active")) b.click();
      }
      tourTouchedTab = false; tourPrevTab = null;
    }
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

  // ?first=1 — 온보딩(환영 카드 → 둘러보기)을 '처음 접속한 사람'처럼 다시 보기 위한 뒷문.
  // Cmd+Shift+R은 HTTP 캐시만 비우고 localStorage는 그대로 두므로 아무리 새로고침해도 첫 방문이
  // 될 수 없다(브라우저가 '지금 강력 새로고침'인지 JS에 알려주지도 않아 그 동작을 훅으로 잡을 수도
  // 없다). 진짜 첫 방문과 100% 같은 건 시크릿 창이고, 이건 '지금 창에서 빠르게 확인'용이다.
  //  · 보관(jgb_snapshots_v1)과 다크(jgb_dark_v1)는 **일부러 남긴다** — 온보딩과 무관한데
  //    지우면 남의 자료·설정이 날아간다. 그래서 localStorage.clear()를 쓰지 않는다.
  //  · 지금 편집 중인 곡(LS_KEY)은 지울 수밖에 없다(남아 있으면 restored라 환영 카드가 안 뜬다)
  //    → confirm()으로 한 번 묻는다.
  //  · 파라미터는 쓰자마자 주소에서 뗀다 — 안 그러면 이 주소를 북마크·공유해 두고 새로고침할
  //    때마다 작업이 날아간다.
  function consumeFirstVisitParam() {
    let on = false;
    try { on = new URLSearchParams(location.search).has("first"); } catch (e) { return; }
    if (!on) return;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    if (!confirm("처음 접속한 것처럼 환영 카드와 둘러보기를 다시 봅니다.\n\n" +
                 "• 지금 편집 중인 곡은 지워집니다\n" +
                 "• 보관함의 임시 저장과 다크 설정은 그대로 둡니다\n\n계속할까요?")) return;
    try {
      [LS_KEY, NEWDOC_PENDING_KEY, WELCOME_LS_KEY, "jgb_guide_seen_v1"]
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }
  consumeFirstVisitParam();

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
  buildLyricSymPal();
  renderGakNameList();
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
