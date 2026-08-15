(function () {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const CJK = "'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

  // 익명 사용 통계(js/analytics.js) — 래퍼가 없거나 실패해도 앱은 그대로 돌게 안전 호출만 한다
  const track = function (name, props) {
    try { if (window.jgbTrack) window.jgbTrack(name, props); } catch (e) { /* 통계는 앱 동작에 영향 주지 않음 */ }
  };

  // 종이 크기(mm) — 사이드바 '종이 크기'가 고르는 값. A4가 기본이고, 여기 없는 비율은
  // '사용자 지정'으로 폭·높이를 직접 적는다.
  // `css`는 @page에 넘길 이름 — 표준 규격은 **이름 그대로** 넘겨야 인쇄 대화상자가 그 용지를
  // 고른다(mm로 넘기면 브라우저가 맞는 용지를 못 찾아 A4에 축소해 앉히는 일이 생긴다).
  // 사용자 지정만 mm 두 값으로 넘긴다.
  const PAPERS = {
    A4:     { w: 210, h: 297, css: "A4" },
    A5:     { w: 148, h: 210, css: "A5" },
    B5:     { w: 176, h: 250, css: "B5" },
    letter: { w: 216, h: 279, css: "letter" },
    square: { w: 210, h: 210, css: null },
  };
  const PAGE_W = 210, PAGE_H = 297;   // 기본값(A4) — 옛 저장분에 종이 크기가 없을 때 쓰인다
  // 지금 고른 종이의 세로 기준 크기. 방향(가로/세로)은 부르는 쪽에서 뒤집는다.
  function paperSize() {
    const key = $("paperSize") ? $("paperSize").value : "A4";
    if (key === "custom") {
      const w = parseFloat($("paperW").value), h = parseFloat($("paperH").value);
      // 치는 도중의 값(빈 칸·한 자리 수)으로 종이를 만들면 배치가 터진다 — 범위 밖은 기본값
      const ok = function (v) { return isFinite(v) && v >= 60 && v <= 600; };
      return { w: ok(w) ? w : PAGE_W, h: ok(h) ? h : PAGE_H, css: null };
    }
    return PAPERS[key] || PAPERS.A4;
  }
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

  const DAEGANG_PRESET = { 8: "", 10: "3 2 2 3", 12: "3 3 3 3", 16: "11 5", 20: "6 4 4 6" };
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
  let gakNameOffs = {};                     // 각 이름 위치 오프셋: 각 번호 → {dx,dy}(mm) — 악보에서 드래그로 조절
  let cellEditDomain = null;                // 카드가 선율/장단/가사 중 어디서 열렸는지("mel"/"jd"/"ly")
  let cellEditGi = -1, cellEditCi = -1;     // 카드가 열려 있는 정간 좌표 (전역 커서와 별개로 기억)
  let keepCellEditor = false;               // true면 render()가 직접 입력 카드를 닫지 않음(실시간 반영용)
  let ornEditMode = false;                  // 시김새 수정 모드
  let ornSel = null;                        // 선택된 시김새 {gak, cell, k}
  let ornInstances = [];                    // 렌더된 시김새 위치 목록(수정 모드 히트용)
  // 총보에서 비활성 파트 열을 그릴 땐 끈다 — 인스턴스의 gak/cell/k는 '활성 파트의 원문'
  // 기준이라, 남의 파트 기호가 목록에 들어가면 수정 모드가 엉뚱한 토큰을 집는다.
  let ornCollect = true;
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

  // ---------- 각별 정간 수 ----------
  // 곡 안에서 각 길이가 바뀌는 악보가 있다 — 가곡은 곡이 각의 한가운데에서 시작해 한 바퀴
  // 돌아 끝나서 첫·끝 각이 짧고(5 + 16×14 + 11), 수제천·취타는 장이 바뀌는 자리에 짧은 각이
  // 낀다. 기본은 #beats 하나이고 **다른 각만** #gakBeats에 '각 번호:정간 수'로 적는다 —
  // 각마다 칸을 만들면 50각짜리 곡에서 목록만 50줄이 된다(사용자 확정, 2026-08-14).
  // 각 번호는 사람이 세는 1부터. 그리기·재생·오선보가 모두 beatsAt(gi) 하나를 본다.
  function defBeats() { return Math.max(1, parseInt($("beats").value) || 1); }
  function parseGakBeats(str) {
    const m = new Map();
    String(str || "").split(/[,;\n]/).forEach(function (s) {
      const t = s.split(":");
      if (t.length !== 2) return;
      const gi = parseInt(t[0], 10) - 1, n = parseInt(t[1], 10);
      if (gi >= 0 && n >= 1 && n <= 64) m.set(gi, n);
    });
    return m;
  }
  // 캐시는 함수 자신에 붙인다 — 바깥 let에 두면 tools/lib/app-sandbox.mjs가 함수만 떼어
  // 올 때 그 변수가 안 따라와 검사에서 터진다(실제로 그랬다).
  function gakBeatsMap() {
    const src = $("gakBeats") ? $("gakBeats").value : "";
    if (src !== gakBeatsMap.src) { gakBeatsMap.src = src; gakBeatsMap.map = parseGakBeats(src); }
    return gakBeatsMap.map;
  }
  // 각 gi(0부터)의 정간 수
  function beatsAt(gi) { return gakBeatsMap().get(gi) || defBeats(); }
  // 예외 목록을 글로 되쓴다 — 각을 넣고 뺄 때 번호가 밀리므로(shiftGakNames와 짝)
  function writeGakBeats(map) {
    if (!$("gakBeats")) return;
    const txt = [...map.keys()].sort(function (a, b) { return a - b; })
      .map(function (gi) { return (gi + 1) + ":" + map.get(gi); }).join(", ");
    $("gakBeats").value = txt;
    gakBeatsMap.src = txt; gakBeatsMap.map = map;
  }
  // 대강은 '각 번호'가 아니라 **각 길이**가 정한다 — 같은 길이의 각은 저절로 같은 대강을 쓴다.
  // 문법: 앞머리(길이 없는 것)가 기본 각의 분절이고, `N: …`이 N정간 각의 분절이다.
  //   `3 3 3 3, 5: 3 2`  →  기본 12정간은 3·3·3·3, 5정간 각만 3·2
  // '숫자:'로 안 읽히는 조각은 전부 기본 분절로 본다 — 옛 문서의 `3,3,3,3`(쉼표로 나눈 숫자)이
  // 그대로 읽혀야 하기 때문이다. 안 적은 길이는 DAEGANG_PRESET의 대표 패턴을 쓴다.
  function daegangTextFor(n) {
    const src = $("daegang").value;
    const defParts = []; const by = {};
    src.split(",").forEach(function (s) {
      const m = s.match(/^\s*(\d+)\s*:\s*(.+)$/);
      if (m) by[parseInt(m[1], 10)] = m[2].trim();
      else defParts.push(s);
    });
    if (by[n] != null) return by[n];
    if (n === defBeats()) return defParts.join(" ");
    return DAEGANG_PRESET[n] || "";
  }

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    // null·undefined는 건너뛴다 — 안 그러면 class: null이 class="null"로 박혀
    // 엉뚱한 선택자에 걸린다(조건부로 클래스를 주는 호출부가 있다).
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function rect(x, y, w, h, sw, extra) {
    return el("rect", Object.assign({ x, y, width: w, height: h, fill: "none",
      stroke: "#000", "stroke-width": sw }, extra || {}));
  }
  function line(x1, y1, x2, y2, sw) {
    return el("line", { x1, y1, x2, y2, stroke: "#000", "stroke-width": sw, "stroke-linecap": "square" });
  }
  // 세로쓰기에서 90° 눕혀 그리는 글자 — 전통 세로 조판 규칙. 괄호를 가로쓰기 모양 그대로
  // 세우면 글줄을 가로막는 막대처럼 보이고, 눕혀야 위/아래를 감싸는 ︵︶ 꼴이 된다.
  // ASCII '<'·'>'는 일부러 뺐다 — 이 앱에선 '<'가 숨표 토큰이라 괄호로 단정할 수 없다.
  const VERT_ROTATE = new Set(Array.from("()[]{}（）［］｛｝〈〉《》「」『』【】〔〕〖〗"));
  // 눕히는 축 — 글자의 눈대중 세로 중심(밑선에서 0.28em 위). 0.28은 이 앱이 글자 중심을
  // 잡을 때 쓰는 값과 같다(제목·부제 드래그 히트 패딩 titleFont*0.28).
  const VERT_ROTATE_AXIS = 0.28;
  function verticalText(cx, startY, str, font, weight, color, family, spacing) {
    const g = el("g", {});
    const lineH = font * 1.12 + (spacing || 0);
    let y = startY;
    for (const ch of Array.from(str)) {
      if (ch === " ") { y += lineH * 0.55; continue; }
      const t = el("text", { x: cx, y: y, "text-anchor": "middle",
        "font-size": font, "font-family": family || CJK, "font-weight": weight, fill: color });
      t.textContent = ch;
      // 시계방향 90° — '('는 오른쪽으로 열린 게 아래로 열린 ︵가 되고, ')'는 ︶가 된다.
      // 세로 자리(lineH)는 그대로 한 글자만큼 차지한다 — 세로 격자와 줄 간격을 맞추려고.
      if (VERT_ROTATE.has(ch)) {
        t.setAttribute("transform", "rotate(90 " + cx + " " + (y - font * VERT_ROTATE_AXIS) + ")");
      }
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

  // 정간을 고르면 커서를 **그 칸 글자의 맨 끝**에 둔다(에디터 모드). 예전엔 칸 내용을 통째로
  // 골라 뒀는데(바로 덮어쓰라고), 그러면 이미 적은 율명에 시김새 하나를 덧붙이려 해도 첫 자를
  // 치는 순간 다 지워졌다. 정간은 '율명 + 시김새'로 자라는 칸이라 **고쳐 쓰는 일이 덮어쓰는
  // 일보다 잦다**(2026-08-10 사용자 확정). 직접 입력 카드(openCellEditor)와 같은 규칙이고,
  // 통째로 지우려면 ⌘A가 있다. 선율·장단·곁줄 세 줄이 이 함수 하나를 나눠 쓴다.
  function caretAtCellEnd(ta, c) {
    const p = c ? c.start + c.text.length : ta.value.length;
    ta.setSelectionRange(p, p);
  }

  // 세로 칸 제목이 첫 줄에서 먹는 '각 자리' 수. 이 값이 곧 첫 페이지에 들어가는 각 수를
  // 정하고(capacity), 각 너비는 페이지 폭에 맞춰 자동으로 다시 계산된다 — 그래서 '제목 칸을
  // 얼마나 넓게 쓸까'만 정하면 나머지가 따라온다.
  //  · "auto" = 한 줄에 각이 6개 이상이면 2각, 아니면 1각
  //  · 숫자   = 그 각 수로 고정(사용자가 정함)
  // 가로(맨 위) 제목은 오른쪽 제목 칸을 안 쓰므로 0. 음악 각이 하나도 못 들어가면 안 되니
  // 마지막에 gakPerRow-1로 자른다.
  // formStructure(용량 계산)와 render(그리기)가 **같은 값**을 써야 페이지가 어긋나지 않아
  // 한 함수로 모았다(예전엔 같은 식이 두 곳에 복사돼 있었다).
  function titleGakFor(gakPerRow) {
    if (!$("title").value.trim() || $("titleLayout").value === "top") return 0;
    const raw = $("titleGakWidth").value;
    const n = /^\d+$/.test(raw) ? Math.max(1, parseInt(raw, 10)) : (gakPerRow >= 6 ? 2 : 1);
    return gakPerRow - n < 1 ? Math.max(0, gakPerRow - 1) : n;
  }

  // 현재 폼의 구조(정간수, 총 각 수 등). reconcile/render 매핑 공용.
  function formStructure() {
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const gakPerRow = Math.max(1, parseInt($("gakPerRow").value) || 1);
    const autoStack = stackFor(beats);
    const stack = $("stackAuto").checked ? autoStack
      : Math.max(1, Math.min(12, parseInt($("stackCount").value) || autoStack));
    const titleGak = titleGakFor(gakPerRow);
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
      // 각마다 정간 수가 다를 수 있다 — 그 각의 수만큼만 칸을 만든다(beatsAt)
      const nb = beatsAt(g);
      for (let c = 0; c < nb; c++) cells.push((parsed[g] && parsed[g][c]) ? parsed[g][c].text : "");
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

  // 곁줄(정간 오른쪽 줄)이 악보에 자리를 차지하는지 — 켜고 끄는 스위치가 아니라 상태다.
  //  · 내용이 있으면 늘 나온다(인쇄·PNG 포함).
  //  · 내용이 없어도 곁줄 창이 열려 있으면 화면에 빈 줄이 보인다 — 그래야 더블클릭해
  //    첫 글자를 넣을 자리가 생긴다(章 이름이 章 창 열림에만 반응하는 것과 같은 규칙).
  // 예전엔 머리줄 체크박스로 켜고 껐는데, '쓸까 말까'를 미리 정하게 하는 물음이라 없앴다.
  // 장단은 각 하나를 통째로 차지해 정말로 정할 일이 있으므로 스위치를 그대로 둔다.
  function lyricsHasContent() {
    return lyricsFull.replace(/[|\s]/g, "") !== "";
  }
  function lyricsWinOpen() {
    const el = $("lyricsArea");
    // 직접 입력은 떠 있는 도구창(.win-open), 에디터는 레일로 고른 패널(.active)
    return !!el && (el.classList.contains("win-open") || el.classList.contains("active"));
  }
  function lyricsLaneOn() { return lyricsHasContent() || lyricsWinOpen(); }

  // 가사는 매 각(정간)마다 붙으므로, 선율과 같은 구조(각 수·정간 수)로 맞춤(내용 보존).
  function reconcileLyrics() {
    const { beats, capacity } = formStructure();
    const target = !gakUserSet ? capacity
                               : Math.max(1, parseInt($("gakCount").value) || 1);
    const parsed = parseMelodyOffsets(lyricsFull);
    const lines = [];
    for (let g = 0; g < target; g++) {
      const cells = [];
      const nb = beatsAt(g);   // 가사는 선율과 1:1이라 같은 각별 정간 수를 쓴다
      for (let c = 0; c < nb; c++) cells.push((parsed[g] && parsed[g][c]) ? parsed[g][c].text : "");
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
  function melCellSeq(gi, ci) { return gakCellOffset(gi) + ci; }
  // 각 gi 앞에 놓인 정간의 수 — 각마다 길이가 달라도 '한 줄로 편 번호'가 어긋나지 않는다
  function gakCellOffset(gi) {
    let acc = 0;
    for (let g = 0; g < gi; g++) acc += beatsAt(g);
    return acc;
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

  // ---------- 정간 구간 복사 / 오려두기 / 붙여넣기 ----------
  // 드래그로 고른 정간 구간을 통째로 옮긴다. 담는 것은 **그 정간에 보이는 것 전부** —
  // 선율(율명·시김새)·곁줄·정간 서식(배경색·가로줄). 장단은 곡에 한 줄뿐이라(gi가 늘 0)
  // 정간 구간의 일부가 아니므로 제외한다.
  // 조작은 **단축키뿐**(⌘/Ctrl+C·X·V) — 기능바에 버튼을 두지 않기로 했다.
  let melClip = null;   // [{mel, ly, style}] — melCellSeq 순서로 편 배열

  function melSelRange() {
    if (!hasMelSel()) return null;
    const a = melCellSeq(melSelStart.gi, melSelStart.ci);
    const b = melCellSeq(melSelEnd.gi, melSelEnd.ci);
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  function seqToCell(seq) {
    let gi = 0;
    while (gi < 5000 && seq >= beatsAt(gi)) { seq -= beatsAt(gi); gi += 1; }
    return { gi: gi, ci: seq };
  }
  // 서식은 얕게 담으면 안 된다 — border는 변마다 객체라 그대로 두면 붙여넣은 칸과 원본이
  // 같은 객체를 가리켜, 한쪽 모양을 고치면 다른 쪽도 따라 바뀐다.
  function cloneCellStyle(st) {
    if (!st) return null;
    const out = {};
    if (st.fill) out.fill = st.fill;
    if (st.border) {
      out.border = {};
      Object.keys(st.border).forEach(function (side) {
        out.border[side] = Object.assign({}, st.border[side]);
      });
    }
    return (out.fill || out.border) ? out : null;
  }
  function cellTextRows(src) {
    return parseMelodyOffsets(src).map(function (g) { return g.map(function (c) { return c.text; }); });
  }
  // start 자리부터 cells를 차례로 덮어쓴다. 악보 끝을 넘는 몫은 조용히 버린다 — 각을 새로
  // 만들며 늘리면 붙여넣기가 '구조를 바꾸는 일'이 되어 페이지 배치까지 흔들린다.
  function pasteMelCells(start, cells) {
    const melRows = cellTextRows(melodyFull);
    const lyRows = cellTextRows(lyricsFull);
    let touchedLy = false;
    cells.forEach(function (cell, k) {
      const p = seqToCell(start + k);
      if (p.gi >= melRows.length) return;               // 악보 끝을 넘는 몫
      while (melRows[p.gi].length < beatsAt(p.gi)) melRows[p.gi].push("");
      melRows[p.gi][p.ci] = cell.mel;
      // 곁줄은 줄이 아직 없을 수도 있다(내용 없이 시작한 악보) — 넣을 게 있거나 이미 있을 때만 만든다
      if (cell.ly || (lyRows[p.gi] && lyRows[p.gi][p.ci])) {
        while (lyRows.length <= p.gi) lyRows.push([]);
        while (lyRows[p.gi].length < beatsAt(p.gi)) lyRows[p.gi].push("");
        lyRows[p.gi][p.ci] = cell.ly;
        touchedLy = true;
      }
      // 서식은 '덮어쓰기' — 붙여넣은 자리의 옛 서식을 먼저 걷어야 원본과 같은 모습이 된다
      if (cellStyles[p.gi] && cellStyles[p.gi][p.ci]) {
        delete cellStyles[p.gi][p.ci];
        pruneCellStyleEntry(p.gi, p.ci);
      }
      const st = cloneCellStyle(cell.style);   // 붙일 때도 새로 떠야 여러 번 붙여도 안 얽힌다
      if (st) {
        cellStyles[p.gi] = cellStyles[p.gi] || {};
        cellStyles[p.gi][p.ci] = st;
      }
    });
    melodyFull = melRows.map(function (g) { return g.join(" | "); }).join("\n");
    if (touchedLy) lyricsFull = lyRows.map(function (g) { return g.join(" | "); }).join("\n");
    render();
    refreshEditorSlices();
  }
  function copyMelRange(cut) {
    const r = melSelRange();
    if (!r) return false;
    const mel = cellTextRows(melodyFull), ly = cellTextRows(lyricsFull);
    const cells = [];
    for (let seq = r.lo; seq <= r.hi; seq++) {
      const p = seqToCell(seq);
      cells.push({
        mel: (mel[p.gi] && mel[p.gi][p.ci]) || "",
        ly: (ly[p.gi] && ly[p.gi][p.ci]) || "",
        style: cloneCellStyle(cellStyles[p.gi] && cellStyles[p.gi][p.ci])
      });
    }
    melClip = cells;
    // 오려두기 = 복사 + 그 자리를 빈 칸으로 덮기(같은 길에 빈 것을 붙이는 셈)
    if (cut) pasteMelCells(r.lo, cells.map(function () { return { mel: "", ly: "", style: null }; }));
    return true;
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
  function cellBoundaryNibbled(gi, i, styles) {
    const row = (styles || cellStyles)[gi];   // styles = 파트별 서식표(총보에서 비활성 파트)
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
  function collectCellBorderSegs(segs, gi, x, gridTop, cell, beats, styles) {
    const row = (styles || cellStyles)[gi];   // styles = 파트별 서식표(총보에서 비활성 파트)
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
    if (!confirm("선율·장단·곁줄·텍스트·정간 서식 등 내용을 모두 지웁니다(레이아웃은 그대로 둠). 계속할까요?")) return;
    // 모든 파트의 내용을 지운다(악기 편성 자체는 레이아웃처럼 남긴다) — 전역 작업 사본은
    // hydrate가 빈 활성 파트를 따라간다. 먼저 stash: 지우지 않는 것(악기)까지 낡은 값으로
    // 되돌리지 않게 사본을 목록에 한 번 맞춰 두고 지운다.
    stashActivePart();
    parts.forEach(function (p) { p.melody = ""; p.lyrics = ""; p.cellStyles = {}; });
    hydrateActivePart();
    $("jangdan").value = "";
    customTexts = []; nextTextId = 1; textSel = null;
    gakNames = {}; gakNameOffs = {}; renderGakNameList();
    // 내용이 통째로 사라진 문서는 더 이상 그 게시물이 아니다 — 여기서 손을 떼지 않으면
    // 백지가 된 악보로 남들이 보고 있는 게시물을 덮어쓸 수 있다(되돌리기로 같이 살아난다).
    pubId = null;
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
    $("ndGakCount").value = "";   // 비워두면 기본 8각 = 한 줄 (placeholder로 안내)
    $("ndTitle").value = "";      // 비워두면 제목 없음
    $("ndTitleLayout").value = "side";
    $("ndSubtitle").value = "";
    $("ndWantJangdan").checked = false;
    // 악기 편성(선택) — 행마다 악기 고르기 + 이름 칸. 비워 두면 악기 구분 없이 시작.
    const ndList = $("ndParts");
    ndList.innerHTML = "";
    function ndAddPartRow() {
      const row = document.createElement("div");
      row.className = "tx-item";
      const sel = document.createElement("select");
      [["all", "악기 선택"]].concat(Object.keys(INSTRUMENT_PRIORITY).map(function (k) { return [k, k]; }))
        .forEach(function (pair) {
          const o = document.createElement("option");
          o.value = pair[0]; o.textContent = pair[1]; sel.appendChild(o);
        });
      const nm = document.createElement("input");
      nm.type = "text"; nm.placeholder = "이름 (선택 — 예: 노래)";
      nm.title = "총보에서 열 위에 붙는 이름 — 비우면 악기 이름으로 부릅니다";
      const del = document.createElement("button");
      del.type = "button"; del.className = "tx-del"; del.textContent = "✕"; del.title = "이 악기 빼기";
      del.addEventListener("click", function () { row.remove(); });
      row.appendChild(sel); row.appendChild(nm); row.appendChild(del);
      ndList.appendChild(row);
    }
    $("ndPartAdd").onclick = ndAddPartRow;
    modal.style.display = "flex";
    $("ndCreate").onclick = function () {
      const answers = {
        beats: Math.max(1, parseInt($("ndBeats").value) || 12),
        daegang: $("ndDaegang").value.trim(),
        gakCount: Math.max(1, parseInt($("ndGakCount").value) || 8),
        title: $("ndTitle").value.trim(),
        titleLayout: $("ndTitleLayout").value,
        subtitle: $("ndSubtitle").value.trim(),
        wantJangdan: $("ndWantJangdan").checked,
        // 악기 편성 — 리로드를 건너 applyNewDocAnswers에 닿아야 하므로 값만 담는다
        parts: Array.from(ndList.children).map(function (row) {
          return { instrument: row.querySelector("select").value,
                   name: row.querySelector("input").value.trim() };
        })
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
    // 마법사에서 정한(또는 기본 8) 각 수를 '사용자가 정한 값'으로 취급해야 페이지 채움
    // (capacity)으로 덮이지 않고 그대로 유지된다
    gakUserSet = true;
    $("title").value = a.title;
    $("titleLayout").value = a.titleLayout || "side";
    $("subtitle").value = a.subtitle;
    $("wantJangdan").checked = a.wantJangdan;
    // 악기 편성 — 마법사에서 고른 악기들로 파트를 짠다. 안 골랐으면 지금처럼 파트 1개.
    // 둘 이상이면 총보 보기로 시작 — 여러 악기를 골랐다는 건 총보를 원한다는 뜻이라서.
    if (Array.isArray(a.parts) && a.parts.length) {
      parts = a.parts.map(function (sp) {
        const p = newPart(typeof sp.name === "string" ? sp.name : "");
        p.instrument = (sp.instrument && (sp.instrument === "all" || INSTRUMENT_PRIORITY[sp.instrument]))
          ? sp.instrument : "all";
        return p;
      });
      activePart = 0;
      hydrateActivePart();
      $("scoreView").checked = parts.length > 1;
      renderPartsList();
    }
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

  // ---------- 색상 (색상 테마 + 다크 모드, 상단바 #screenPop 메뉴) ----------
  // 색은 전부 CSS 역할 변수라 body 클래스 하나로 UI 전체가 갈아입는다: 밝은 테마는
  // body.theme-*(미색은 클래스 없음 = :root 기본), 다크는 body.dark. 다크 규칙이 CSS에서
  // 테마보다 뒤라 늘 이기므로 테마는 밝은 화면의 색조만 정한다(다크를 꺼야 보인다).
  // 둘 다 앱 설정(localStorage)이고 문서 상태(collectState)에는 넣지 않는다 — 곡을
  // 바꾸거나 남의 파일을 열어도 내 화면 설정은 그대로여야 해서(다크가 원래 그랬다).
  // 악보(종이)는 별도 흰색 SVG라 어느 테마·모드에서든 흰 종이(인쇄·PNG도 안 바뀜).
  const DARK_LS_KEY = "jgb_dark_v1";
  const THEME_LS_KEY = "jgb_theme_v1";
  // 키 = localStorage 값, cls = body 클래스(미색은 없음 = :root 기본), btn = 메뉴 항목 id.
  // 표시 이름(미색·은청색·옥색)은 index.html 메뉴 항목에만 있다 — 버튼 글씨는 '색상' 고정이라
  // JS가 이름을 쓸 일이 없다(지금 테마는 메뉴 안 .sel 표시가 말한다). 키·클래스는 옛 물건
  // 이름(hanji/crystal/celadon) 그대로 — 저장값 호환 때문이니 표시 이름에 맞춰 갈지 말 것.
  // 테마를 늘릴 땐 여기 + styles.css body.theme-* + index.html 항목 세 곳을 함께.
  const THEMES = {
    hanji:   { cls: "",              btn: "themeHanji" },
    crystal: { cls: "theme-crystal", btn: "themeCrystal" },
    celadon: { cls: "theme-celadon", btn: "themeCeladon" },
  };
  function applyTheme(name) {
    if (!THEMES[name]) name = "hanji";
    Object.keys(THEMES).forEach(function (k) {
      if (THEMES[k].cls) document.body.classList.toggle(THEMES[k].cls, k === name);
      const b = $(THEMES[k].btn);
      if (b) b.classList.toggle("sel", k === name);   // 메뉴에서 지금 테마 표시
    });
    return name;
  }
  function applyDark(on) {
    document.body.classList.toggle("dark", !!on);
    // 메뉴 항목 글씨가 '누르면 갈 모드'를 말한다(아이콘 해/달은 지금 모드 — CSS가 전환)
    if ($("darkModeItem")) $("darkModeItem").textContent = on ? "밝은 화면으로" : "어두운 화면으로";
  }
  try { applyTheme(localStorage.getItem(THEME_LS_KEY) || "hanji"); } catch (e) { applyTheme("hanji"); }
  try { applyDark(localStorage.getItem(DARK_LS_KEY) === "1"); } catch (e) {}
  Object.keys(THEMES).forEach(function (k) {
    const b = $(THEMES[k].btn);
    if (b) b.addEventListener("click", function () {
      const name = applyTheme(k);
      try { localStorage.setItem(THEME_LS_KEY, name); } catch (e) {}
      track("theme", { v: name });
    });
  });
  if ($("darkModeItem")) $("darkModeItem").addEventListener("click", function () {
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
    while (rows.length <= gi) rows.push([]);
    while (rows[gi].length <= ci) rows[gi].push("");
    rows[gi][ci] = val;
    while (rows[gi].length < beatsAt(gi)) rows[gi].push("");   // 편집한 각은 그 각의 정간 수만큼 칸 채움
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
    caretAtCellEnd(ta, c);
  }

  // ---------- 정간 위 인라인 입력(장단) — 장단은 맨 처음 각 옆 한 줄뿐이라 gi는 늘 0 ----------
  function currentJangdanText(gi, ci) {
    const p = parseMelodyOffsets($("jangdan").value)[0] || [];
    return p[ci] ? p[ci].text : "";
  }
  function setJangdanText(gi, ci, val) {
    val = String(val).replace(/[|\n]+/g, " ").replace(/\s+/g, " ").trim();
    const beats = defBeats();   // 장단 줄은 곡의 장단 — 첫 각이 짧아도 온전한 한 각이다
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
    caretAtCellEnd(ta, c);
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
    while (rows.length <= gi) rows.push([]);
    while (rows[gi].length <= ci) rows[gi].push("");
    rows[gi][ci] = val;
    while (rows[gi].length < beatsAt(gi)) rows[gi].push("");
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
    caretAtCellEnd(ta, c);
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
        let ng = gi, ni = ci + 1;
        if (ni >= beatsAt(gi)) { ni = 0; ng = gi + 1; }
        return this.geom(ng, ni) ? { gi: ng, ci: ni } : null;
      },
      move: function (gi, ci, key) { return gridMove(this, gi, ci, key); }
    },
    jd: {
      geom: function (gi, ci) { return jdGeom[ci] || null; },
      getText: currentJangdanText, setText: setJangdanText, setCursor: setJangdanCursor,
      label: function (gi, ci) { return (ci + 1) + "정간 · 장단"; },
      next: function (gi, ci) {
        const beats = defBeats();   // 장단은 곡의 장단이라 늘 표준 정간 수
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
      label: function (gi, ci) { return (gi + 1) + "각 · " + (ci + 1) + "정간 곁줄"; },
      next: function (gi, ci) {
        let ng = gi, ni = ci + 1;
        if (ni >= beatsAt(gi)) { ni = 0; ng = gi + 1; }
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

  // 도구창마다 '어느 줄에 넣는' 팔레트인지. 율명·시김새는 이제 #paletteCol 한 창이 보기 전환
  // (palView)으로 함께 맡으므로 항목도 하나다.
  // (章·텍스트·정간 서식은 칸에 기호를 넣는 창이 아니라 여기 없다 — 열려 있어도 안 건드린다.)
  const PANEL_DOMAIN = { paletteCol: "mel", lyricsArea: "ly", jangdanArea: "jd" };
  const DOMAIN_PANEL = { mel: "paletteCol", ly: "lyricsArea", jd: "jangdanArea" };

  // 지금 열린 팔레트가 이 칸에 넣을 수 없는 것이면(곁줄 창을 열어둔 채 선율 정간을 누른 등)
  // 이 줄의 팔레트로 바꾼다. 넣을 수 있는 팔레트가 열려 있으면 그대로 둔다 — 선율을 치면서
  // 시김새 창을 열어두는 흐름을 깨지 않으려고(맨 처음 한 번만 율명을 열어주는 yulAutoOpened와 별개).
  function focusDomainPanel(domain) {
    const want = DOMAIN_PANEL[domain];
    if (!want) return;
    const open = document.querySelector(".direct-win.win-open");
    if (open && PANEL_DOMAIN[open.id] === domain) return;   // 이미 맞는 팔레트
    if (open && !(open.id in PANEL_DOMAIN)) return;          // 기호를 넣는 창이 아니면 놔둔다
    activateDirectPanel(want);
  }

  function openCellEditor(domain, gi, ci) {
    // 팔레트 전환이 악보를 다시 그릴 수 있으므로 좌표를 재기 **전에** 해야 한다
    focusDomainPanel(domain);
    // 새 칸을 여는 순간 '검색칸 때문에 닫혔던 자리' 기억은 낡은 것이 된다(아래 기호 팔레트 절)
    symSearchReturn = null;
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
    inp.focus();
    // 커서는 **글자 맨 끝**에 둔다. 예전엔 select()로 내용을 통째로 골라 뒀는데(바로 덮어쓰라고),
    // 그러면 이미 적은 율명에 시김새 하나를 덧붙이려 해도 첫 자를 치는 순간 다 지워졌다.
    // 정간은 '율명 + 시김새'로 자라는 칸이라 **고쳐 쓰는 일이 덮어쓰는 일보다 잦다**
    // (2026-08-10 사용자 확정). 통째로 지우려면 ⌘A가 있다.
    inp.setSelectionRange(inp.value.length, inp.value.length);

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
  // 악보에 적는 빠르기 표기. 실제 악보는 '一分・六十~八十井'처럼 **범위**로 적는 일이 흔해
  // 최소·최대 두 값을 받는다. 최대를 비우면 예전처럼 한 값만 적는다(옛 문서가 그대로 나온다).
  // 표기의 정본은 章 창의 두 칸이고, 재생 BPM(#tempoBpm)은 아래 규칙으로 따로 논다.
  function tempoRange() {
    const lo = Math.max(1, parseInt($("tempoBpmGak").value) || 60);
    const raw = ($("tempoBpmGakMax") && $("tempoBpmGakMax").value || "").trim();
    const hi = raw === "" ? null : Math.max(1, parseInt(raw) || 0);
    // 최대가 최소보다 작으면 범위가 아니므로 없는 셈 친다(타이핑 도중에도 안 깨지게)
    return { lo: lo, hi: (hi && hi > lo) ? hi : null };
  }
  function tempoLabelText() {
    const r = tempoRange();
    // 물결표는 전각(～) — 반각 ~는 세로쓰기에서 글자 높이의 한가운데 가는 획으로만 남아
    // 앞뒤 한자 사이에 묻힌다. 전각이라야 한 글자 자리를 제대로 차지한다.
    return "一分・" + numToHanjaTempo(r.lo) + (r.hi ? "～" + numToHanjaTempo(r.hi) : "") + "井";
  }
  // 재생 빠르기는 '악보에 적은 최소값'에서 시작하고, 재생 설정(⚙)에서 한 번이라도 직접
  // 바꾸면 그때부터 따로 논다 — 악보 표기를 고쳐도 안 끌려간다. 예전엔 둘이 늘 같은 값이라
  // 표기를 범위로 적는 순간 '재생은 어느 쪽 값인가'가 답이 없었다.
  let tempoBpmUserSet = false;
  function syncPlayBpmFromLabel() {
    if (tempoBpmUserSet) return;
    const el = $("tempoBpm");
    if (el && document.activeElement !== el) el.value = String(tempoRange().lo);
  }

  // 빠르기 표기 전용 한자 수사 — 국악보 관행은 백의 자리를 '百' 없이 숫자만 적는다
  // (가야금정악보 '一分 : 一六十~一八十井' → 160·180). 각/장 이름의 한자 변환(N장→N章)은
  // 표준 표기를 그대로 써야 하므로 numToHanja는 건드리지 않고 여기서만 갈라 쓴다.
  // 딱 떨어지는 백(100·200)만 예외로 百을 남긴다 — 안 그러면 '一'·'二'만 남아 1·2로 읽힌다.
  function numToHanjaTempo(n) {
    n = Math.round(n);
    if (n < 100) return numToHanja(n);
    const baek = Math.floor(n / 100), rest = n % 100;
    if (rest === 0) return HANJA_DIGIT[baek] + "百";
    return HANJA_DIGIT[baek] + numToHanja(rest);
  }

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
  // 기호 토큰 한 개 = 중괄호·대괄호·소괄호 중 하나로 감싼 것. 셋 다 같은 뜻이다 —
  // 키보드·자판에 따라 치기 쉬운 괄호가 달라서 셋을 다 받는다(넣을 땐 {}로 통일).
  // 짝이 맞는 것만 잡는다: `{덩)` 같은 어긋난 짝은 토큰으로 치지 않는다.
  const SYM_TOKEN_RE = /\{[^{}]*\}|\[[^\[\]]*\]|\([^()]*\)/g;
  // 통째로 괄호에 싸여 있으면 알맹이만 돌려준다(아니면 그대로) — 장단처럼 괄호가
  // 필수가 아닌 줄에서 '써도 되게' 하는 용도.
  function stripSymBracket(str) {
    const close = ORN_BRACKET_CLOSE[str.charAt(0)];
    return (close && str.length >= 2 && str.charAt(str.length - 1) === close)
      ? str.slice(1, -1) : str;
  }

  // ---------- 시김새(장식음) 매핑 ----------
  // 목록·이름·크기는 전부 js/symbols-registry.js(기호 사전)에서 온다. 시김새·가사 기호·
  // 장구 구음이 한 사전에 모여 있어야 '같은 기호를 저 줄에도'가 한 줄로 끝난다 —
  // 예전엔 팔레트마다 목록이 따로라 그때마다 표와 별칭이 한 겹씩 늘었다.
  // 여기 있는 건 그 사전을 예전 이름으로 받아 쓰는 얇은 층뿐이니, 기호를 더하거나
  // 크기를 손볼 땐 이 파일이 아니라 사전을 고칠 것.
  // c: "wo"=음길이 없음(음표 오른쪽에 작게 붙임) / "with"=음길이 있음(독립 칸) / "both"=둘 다
  //    — 각각 사전의 at.att / at.cell / 둘 다에 해당하고, "tempo"는 at.tempo다.
  const SYM_REG = window.JGB_SYM;
  if (!SYM_REG) throw new Error("기호 사전(js/symbols-registry.js)이 app.js보다 먼저 로드돼야 합니다");
  const ORN_LIST = SYM_REG.ornList;
  const ORN_CAT = {};
  ORN_LIST.forEach(function (o) { ORN_CAT[o.s] = o.c; });
  // 유독 크게 느껴지는 일부 독립 기호(노·니·로·리·니나·느나)만 추가로 축소 — 사전 at.cell
  const SYM_EXTRA_SCALE = SYM_REG.cellScale;
  // 붙임표(음표 오른쪽에 붙는 시김새) 일괄 확대 — 미는표·흘림표·니레·니라·니로·끊는표·
  // 특강표만 원래 크기 유지(사전의 attKeep). 기호별 미세 조정은 사전 at.att.
  const ATT_EXTRA_SCALE = 1.2;
  const ATT_SCALE_KEEP = SYM_REG.attKeep;
  const ATT_SYM_SCALE = SYM_REG.attScale;
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

  // 기호 이미지 dataURL (없으면 null). 그림이 세 파일에 나뉘어 있는 건 만들어지는 경로가
  // 달라서일 뿐, 쓰는 쪽에선 하나로 보여야 한다 — 장구 구음을 가사줄에 넣는 것처럼 기호가
  // 제 본디 자리를 벗어나는 순간 여기서 못 찾으면 그림이 사라진다.
  function symURL(key) {
    if (window.SYM_DATA && window.SYM_DATA[key]) return window.SYM_DATA[key];
    if (window.NOTE_DATA && window.NOTE_DATA[key]) return window.NOTE_DATA[key];
    if (window.JANGGU_DATA && window.JANGGU_DATA[key]) return window.JANGGU_DATA[key];
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
  // 목록·이름·크기는 js/symbols-registry.js(기호 사전)에서 온다 — 가사줄에 놓이는 기호는
  // 사전에서 at.lyric을 가진 것들이고, 차례는 사전의 lyricOrder가 정한다.
  // 시김새에서 빌려 쓰는 기호(전성·퇴성·추성·운지 s01~s10)는 토큰에 표시 이름을 쓰고
  // 그림은 시김새 stem을 그대로 재사용한다 — 그 '표시 이름 → stem' 표가 LYRIC_SYM_ALIAS다.
  // 가로막대·세로막대는 가로표·세로표로 개명되기 전 옛 토큰 호환용 별칭.
  // (s09는 원본 SVG가 없어 건너뜀 — 시김새 쪽과 동일.)
  const LYRIC_SYMS = SYM_REG.lyricNames;
  const LYRIC_SYM_ALIAS = SYM_REG.lyricAlias;
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
  // 가사 칸 이미지 크기 배율 — 사전의 at.lyric(막대류 0.8, 나머지 0.4). 옛 이름
  // (가로막대·세로막대)도 같은 값으로 들어 있어 기존 문서가 그대로 그려진다.
  const LYRIC_SYM_SCALE = SYM_REG.lyricScale;
  const LYRIC_SYM_SCALE_DEFAULT = 0.4;   // 사전에 없는 낯선 토큰용 안전값
  // 그리는 일은 세 줄이 함께 쓰는 buildSymPalette가 맡는다(아래 '기호 팔레트' 절).
  function buildLyricSymPal() { buildSymPalette($("lyricsSymRow"), "lyric"); }

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
  // (팔레트 칩 정렬은 sortSymChips로 옮겼다 — 아래 '기호 팔레트' 절. 숫자 단축키에 배정된
  //  시김새가 그룹 맨 앞에 오는 규칙은 그대로이고, 이제 세 줄이 그 한 함수를 같이 쓴다.)
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
    // 드래그 오프셋도 이름과 같은 각에 붙어 다닌다
    const nextO = {};
    Object.keys(gakNameOffs).forEach(function (k) {
      const gi = +k;
      if (delta < 0 && gi >= from && gi < from - delta) return;
      nextO[gi >= from ? gi + delta : gi] = gakNameOffs[k];
    });
    gakNameOffs = nextO;
    // 각별 정간 수 예외도 같은 각에 붙어 다닌다 — 각을 끼우면 뒤 번호가 한 칸씩 밀린다
    const map = gakBeatsMap(); const nextB = new Map();
    map.forEach(function (n, gi) {
      if (delta < 0 && gi >= from && gi < from - delta) return;
      nextB.set(gi >= from ? gi + delta : gi, n);
    });
    if (nextB.size !== map.size || [...nextB].some(function (e, i) { return e[0] !== [...map][i][0]; }))
      writeGakBeats(nextB);
  }
  function setGakName(gi, raw) {
    raw = String(raw || "").trim();
    if (raw) gakNames[gi] = raw; else { delete gakNames[gi]; delete gakNameOffs[gi]; }
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
  // 이름 목록은 js/symbols-registry.js(기호 사전)에서 at.jd를 가진 항목들. 장단 텍스트는
  // 스페이스를 분박 구분자로 쓰므로, 타이핑/저장/화면 표기 모두 공백 없는 이름으로
  // 통일한다(예: '작은덩').
  const JANGGU_NAMES = SYM_REG.jangguNames;
  // 그리는 일은 세 줄이 함께 쓰는 buildSymPalette가 맡는다(아래 '기호 팔레트' 절).
  // 7개뿐이라 검색·최근·제목줄 없이 칩만 한 격자로 나온다(SYM_RICH_MIN 참고).
  function buildJangdanPalette() { buildSymPalette($("jangdanPalette"), "jd"); }

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

  // 기호/특수음처럼 음계 매트릭스 밖의 칩을 한 줄(plabel + 칩들)로 붙인다. list가 비면 아무것도 안 함.
  function appendSymRow(wrap, labelText, list) {
    if (!list.length) return;
    const rowEl = document.createElement("div");
    rowEl.className = "prow symrow";
    const lab = document.createElement("span");
    lab.className = "plabel";
    lab.textContent = labelText;
    rowEl.appendChild(lab);
    list.forEach(function (s) {
      const chip = paletteChip(s.label, s.file, s.ins, s.fallback, false, s.cap, s.semis);
      // 캡션이 '입력 글자'만 지고 있으므로 뜻·쓰는 법은 툴팁이 진다(s.tip). paletteChip에
      // 인자를 하나 더 붙이는 대신 여기서 갈아끼운다 — 이 줄 칩만 쓰는 규칙이라서.
      if (s.tip) chip.title = s.tip;
      rowEl.appendChild(chip);
    });
    wrap.appendChild(rowEl);
  }

  // ---------- 기호 팔레트 (선율·가사·장단 공용) ----------
  // 세 줄의 팔레트가 이 빌더 하나를 쓴다. 예전엔 시김새·가사·장단이 제각기 다른 함수에
  // 다른 칩 모양이어서 같은 '전성'이 창마다 다르게 생겼고, 검색 같은 걸 붙이려면 세 번
  // 붙여야 했다. 사전이 하나로 합쳐졌으니(js/symbols-registry.js) 보여주는 쪽도 하나면 된다.
  // 줄마다 다른 건 셋뿐이라 그것만 SYM_LANES에 적는다:
  // 어떤 기호를 보여주나 · 어떤 묶음으로 나누나 · 누르면 무엇을 넣나.

  // 칩이 이만큼 넘는 줄에만 검색·최근을 붙인다. 장단(7개)처럼 한눈에 들어오는 줄에
  // 검색칸을 얹으면 자리만 먹고 방해가 된다.
  const SYM_RICH_MIN = 12;
  const SYM_RECENT_MAX = 10;

  // 한글 초성 — 'ㅁㅈ'로 모지를 찾게. 89개를 눈으로 훑는 게 한계라 넣은 길이니 좁히지 말 것.
  const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
                    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  function toChoseong(str) {
    return Array.from(str).map(function (ch) {
      const i = ch.charCodeAt(0) - 0xAC00;
      return (i >= 0 && i < 11172) ? CHOSEONG[Math.floor(i / 588)] : ch;
    }).join("");
  }
  // 기호 → 그 기호를 쓰는 악기들(악기 우선순위 표를 뒤집은 것). '가야금'으로도 찾게.
  const SYM_INSTRUMENTS = {};
  Object.keys(INSTRUMENT_PRIORITY).forEach(function (inst) {
    INSTRUMENT_PRIORITY[inst].forEach(function (name) {
      SYM_INSTRUMENTS[name] = (SYM_INSTRUMENTS[name] || []).concat(inst);
    });
  });
  function symSearchHay(ch) {
    return [ch.ko, ch.id, toChoseong(ch.ko), (SYM_INSTRUMENTS[ch.ko] || []).join(" ")]
      .join(" ").toLowerCase();
  }

  // 최근 쓴 기호 — 줄마다 따로. 곡 하나에 실제로 쓰는 기호는 열 남짓이라, 매번 목록을
  // 훑지 않게 위에 모아 준다. 상태에 저장돼 다음에 열어도 남아 있다.
  let symRecent = { mel: [], lyric: [], jd: [] };
  function pushSymRecent(laneKey, id) {
    const kept = (symRecent[laneKey] || []).filter(function (x) { return x !== id; });
    const one = {};
    one[laneKey] = [id].concat(kept).slice(0, SYM_RECENT_MAX);
    symRecent = Object.assign({}, symRecent, one);
    // 팔레트 전체가 아니라 '최근' 줄만 다시 그린다 — 통째로 새로 그리면 연달아 고를 때
    // 칩이 발밑에서 출렁여 엉뚱한 걸 누르게 된다.
    document.querySelectorAll(".sym-pal").forEach(function (w) {
      if (w.dataset.lane === laneKey) renderSymRecent(w, laneKey);
    });
    saveState();
  }

  // 검색어는 팔레트를 다시 그려도(악기 변경 등) 유지된다 — 팔레트 id별로 기억.
  const symQuery = {};
  // 검색칸을 누르는 순간 열려 있던 정간 입력 카드가 닫힌다(포커스가 옮겨가서). 어느 칸을
  // 편집 중이었는지 적어 뒀다가 기호를 고를 때 그 칸을 다시 열어 넣는다 — 안 그러면
  // 텍스트 에디터의 엉뚱한 커서 자리에 들어간다.
  let symSearchReturn = null;
  // 기억한 자리는 '딱 한 번'만 쓴다 — 쓰고 나면 지우고, 그 사이 다른 정간을 열었으면
  // openCellEditor가 지운다. 그래서 옛 자리가 나중까지 남아 엉뚱하게 되살아나지 않는다.
  // 줄이 다르면(장단 칸을 편집하다 시김새를 고른 경우 등) 되돌리지 않는다 — 그 칸에
  // 넣을 수 없는 기호라, 되살리면 오히려 엉뚱한 데 들어간다.
  function restoreCellFromSearch(domain) {
    if (cellEditInput || !symSearchReturn || symSearchReturn.d !== domain) return;
    const back = symSearchReturn;
    symSearchReturn = null;
    openCellEditor(back.d, back.gi, back.ci);
  }

  // 퇴성·추성(both)은 음표에 붙여 쓰는 게 기본이라 붙임표 그룹에 함께 담는다.
  // 이름 미정 시김새 s01~s25(sigimsae-01~25)는 동작은 붙임표(wo)지만 팔레트에선 '운지'라는
  // 별도 그룹으로 독립 기호와 빠르기 사이에 모아 보여준다. 뜰(sigimsae-00)은 이름이
  // 정해졌으니 운지에서 빼고 붙임표에 그대로 둔다.
  const isUnjiId = function (id) { return id.indexOf("sigimsae-") === 0 && id !== "sigimsae-00"; };
  const SYM_LANES = {
    mel: {
      domain: "mel",   // 정간 입력 카드(CELL_EDIT)에서 이 줄에 해당하는 이름
      token: function (ch) { return "{" + ch.ko + "}"; },
      syntax: { how: "음 뒤 괄호 안에 넣어 입력", ex: ["황(미는표)", "황{미는표}", "황[미는표]"] },
      badges: true,    // 숫자 단축키 배지는 선율 줄에만 (붙임표 추가 모드용)
      chips: function () {
        return ORN_LIST.map(function (o) {
          return { id: o.s, ko: o.k, c: o.c, url: symURL(o.s), px: ornIconPx(o) };
        });
      },
      groups: [
        { title: "붙임표", sub: "음표 오른쪽에 작게",
          match: function (ch) { return (ch.c === "wo" || ch.c === "both") && !isUnjiId(ch.id); } },
        { title: "독립 기호", sub: "한 칸 차지",
          match: function (ch) { return ch.c === "with"; } },
        { title: "운지", sub: "음표 오른쪽에 작게 붙음",
          match: function (ch) { return isUnjiId(ch.id); } },
        { title: "빠르기", sub: "정간 오른쪽에 세로로 표시",
          match: function (ch) { return ch.c === "tempo"; } }
      ],
      insert: function (ch) {
        // 정간 입력 카드를 열어 둔 채 칩을 누르면 **그 칸에 넣겠다는 뜻**이다 — 추가 모드보다
        // 삽입이 우선(2026-07-27). 예전엔 아래 추가 모드 가지가 먼저라, 숫자가 배정된 칩만
        // 클릭이 '골라두기'가 되어 편집 중인 칸에 아무것도 안 들어갔다(배정 없는 칩과 동작이
        // 갈려 고장처럼 보였다). 카드가 닫혀 있을 때만 추가 모드로 흐른다.
        // 추가 모드에선(지금 이 시김새에 숫자가 배정돼 있으면) 칩 클릭으로 골라둔다 —
        // 마우스엔 '누르고 있기'가 없어 클릭은 켜고, 같은 칩을 다시 누르면 끄는 토글로 둔다
        // (안 그러면 마우스로 고른 건 해제할 길이 없다). ORN_ADD_KEY_BY_STEM은 매번 다시
        // 조회해야 배정을 바꾼 뒤에도 안 어긋난다.
        const editingMel = cellEditInput && cellEditDomain === "mel";
        if (ornAddMode && ORN_ADD_KEY_BY_STEM[ch.id] && !editingMel) {
          if (ornAddArmed === ch.id) disarmOrnAdd(); else armOrnAdd(ch.id);
          return false;   // 넣은 게 아니라 골라둔 것이니 '최근'에 안 쌓는다
        }
        insertToken(this.token(ch));
        return true;
      }
    },
    lyric: {
      domain: "ly",
      token: function (ch) { return "{" + ch.ko + "}"; },
      // 가사 줄은 '글자를 적는 자리'라 괄호가 있어야 기호로 읽힌다 — 괄호 없이 덩이라 쓰면
      // 그냥 '덩' 글자다. 장단 줄과 갈리는 지점이라 안내에 그 까닭까지 적는다.
      syntax: { how: "괄호 안에 넣어 표시", ex: ["(덩)", "{덩}", "[덩]"] },
      // 가로표·세로표는 늘 맨 앞 — 악기 우선순위(해금 목록이 "늘임표, 가로표, 세로표" 순인 등)가
      // 늘임표를 앞세워도, 막대 둘은 가장 기본 기호라 순서 고정(늘임표보다 항상 앞).
      pinned: ["가로표", "세로표"],
      chips: function () {
        return LYRIC_SYMS.map(function (name) {
          const stem = lyricSymStem(name);
          const e = SYM_REG.byId[stem];
          return { id: stem, ko: name, url: symURL(stem),
                   cat: e && e.cat, chip: e && e.chip };
        });
      },
      // 장구 구음은 성격이 달라(가락 기호가 아니라 북 소리) 같은 격자에 섞지 않고 따로 묶는다
      groups: [
        { title: "기호", match: function (ch) { return ch.cat !== "장구"; } },
        { title: "장구", match: function (ch) { return ch.cat === "장구"; } }
      ],
      insert: function (ch) { insertLyricToken(this.token(ch)); return true; }
    },
    jd: {
      domain: "jd",
      token: function (ch) { return ch.ko; },
      // 장단 줄은 전부 구음이라 괄호가 필요 없다. 다른 줄 버릇대로 괄호를 씌워도 읽어 준다.
      syntax: { how: "글자 그대로/괄호 안에 넣어 입력 가능", ex: ["덩", "{덩}"] },
      chips: function () {
        const data = window.JANGGU_DATA || {};
        return JANGGU_NAMES.map(function (name) {
          const e = SYM_REG.byId[name];
          return { id: name, ko: name, url: data[name], chip: e && e.chip };
        });
      },
      groups: [{ title: "구음", sub: "장단 줄에 한 분박" }],
      // 장단 토큰만 중괄호가 없다(옛 문법) — 사전이 합쳐져도 이건 그대로 두었다
      insert: function (ch) { insertJangdanToken(this.token(ch)); return true; }
    }
  };

  // 차례: 고정 기호 → 숫자 배정 순(선율) → 악기 우선순위 → 원래 순서.
  // 어느 기준에도 안 걸리면 사전에 적힌 차례 그대로 뒤에 온다(안정 정렬).
  function sortSymChips(chips, lane) {
    const rank = ornInstrumentRank();
    const pin = lane.pinned || [];
    return chips
      .map(function (ch, i) {
        const ki = lane.badges ? ornAddMap.indexOf(ch.id) : -1;
        return { ch: ch, i: i,
                 p: pin.indexOf(ch.ko) === -1 ? 1 : 0,
                 k: ki === -1 ? Infinity : ki,
                 r: rank.has(ch.ko) ? rank.get(ch.ko) : Infinity };
      })
      .sort(function (a, b) { return (a.p - b.p) || (a.k - b.k) || (a.r - b.r) || (a.i - b.i); })
      .map(function (x) { return x.ch; });
  }

  function symChip(ch, lane, laneKey) {
    const item = document.createElement("div");
    item.className = "pi ornchip";
    // 툴팁은 '이 줄에서 실제로 들어가는 글자'를 그대로 보여 준다 — 가사 줄의 {덩}과
    // 장단 줄의 덩이 왜 다른지, 규칙을 설명하지 않아도 눈으로 알게.
    item.title = ch.ko + (ch.ko === ch.id ? "" : " (" + ch.id + ")")
      + "\n→ " + lane.token(ch);
    if (lane.badges) {
      // data-stem이 붙은 칩만 refreshOrnAddBadges()의 대상 — 가사·장단 칩에 숫자가
      // 잘못 붙지 않게 하는 표식이기도 하다.
      item.dataset.stem = ch.id;
      // 배지는 늘 만들어두고(숫자 배정이 바뀌어도 새로 만들 필요 없이) 내용/보임만
      // refreshOrnAddBadges()가 그때그때 최신 배정으로 갱신한다.
      const badge = document.createElement("span");
      badge.className = "orn-key-badge";
      item.appendChild(badge);
    }
    if (ch.url) {
      const img = document.createElement("img");
      img.src = ch.url; img.alt = ch.ko;
      if (ch.px) { img.style.width = ch.px + "px"; img.style.height = ch.px + "px"; }
      // 사전의 chip = 이 기호만 팔레트에서 더 작게(장구 '다'처럼 실물이 작은 점인 것).
      // CSS 기본 상한 30px에 곱한다. 어느 창에 나오든 같은 크기라야 해서 사전에 둔 값이다.
      else if (ch.chip) {
        const cap = Math.round(30 * ch.chip);
        img.style.maxWidth = cap + "px"; img.style.maxHeight = cap + "px";
      }
      item.appendChild(img);
    }
    const cap = document.createElement("span");
    cap.className = "ocap"; cap.textContent = ch.ko;
    item.appendChild(cap);
    item.addEventListener("mousedown", function (e) { e.preventDefault(); });   // 편집 중인 칸의 포커스 유지
    item.addEventListener("click", function () {
      restoreCellFromSearch(lane.domain);
      if (lane.insert(ch)) pushSymRecent(laneKey, ch.id);
    });
    return item;
  }

  // 제목줄 + 칩 격자 한 묶음. withHead가 거짓이면 칩만(장단처럼 한 묶음뿐인 짧은 줄).
  function symSection(title, sub, chips, lane, laneKey, withHead) {
    const frag = document.createDocumentFragment();
    if (withHead) {
      const head = document.createElement("div");
      head.className = "orn-sec";
      const tb = document.createElement("b"); tb.textContent = title;
      const ts = document.createElement("span"); ts.textContent = sub || "";
      head.appendChild(tb); head.appendChild(ts);
      frag.appendChild(head);
    }
    const row = document.createElement("div");
    row.className = "ornrow";
    chips.forEach(function (ch) { row.appendChild(symChip(ch, lane, laneKey)); });
    frag.appendChild(row);
    return frag;
  }

  function renderSymRecent(wrap, laneKey) {
    const box = wrap.querySelector(".sym-recent");
    if (!box) return;
    box.innerHTML = "";
    const lane = SYM_LANES[laneKey];
    const all = lane.chips();
    if (all.length < SYM_RICH_MIN) return;                 // 짧은 줄엔 안 붙인다
    if ((symQuery[wrap.id] || "").trim()) return;          // 검색 중엔 결과만 보여준다
    const byId = {};
    all.forEach(function (ch) { byId[ch.id] = ch; });
    const list = (symRecent[laneKey] || [])
      .map(function (id) { return byId[id]; })
      .filter(Boolean);
    if (!list.length) return;
    box.appendChild(symSection("최근", "방금 쓴 기호", list, lane, laneKey, true));
  }

  // 괄호 문법 안내 — 줄마다 '넣으면 어떤 글자가 되는지'가 다르고(가사는 {덩}, 장단은 덩),
  // 그 차이가 자의적으로 보이면 안 되므로 팔레트 바로 위에 늘 띄운다. 도움말 속에만 있으면
  // 모르는 채 지나친다. 세 창이 같은 빌더를 쓰니 생김새도 저절로 같다.
  function makeSymHint(lane) {
    const row = document.createElement("div");
    row.className = "orn-syntax-hint sym-hint";
    // 개조식 — 서술어 없이 '무엇을 어떻게' + 보기. 팔레트 위에 늘 떠 있는 한 줄이라
    // 짧을수록 읽힌다(긴 설명은 머리줄의 ? 안내가 진다).
    row.appendChild(document.createTextNode("✎ " + lane.syntax.how + " ex) "));
    lane.syntax.ex.forEach(function (ex, i) {
      if (i) row.appendChild(document.createTextNode(" · "));
      const m = document.createElement("span");
      m.className = "mono"; m.textContent = ex;
      row.appendChild(m);
    });
    return row;
  }

  // 검색줄은 한 번 만들면 다시 만들지 않는다 — 다시 만들면 타이핑 중 포커스와 커서가 날아간다.
  function makeSymSearch(wrap, laneKey) {
    const row = document.createElement("div");
    row.className = "sym-search";
    const inp = document.createElement("input");
    inp.type = "text";   // "search"로 두면 브라우저 기본 지우개가 우리 ×와 겹친다
    inp.className = "sym-search-input";
    inp.placeholder = "이름·초성·악기로 찾기 ex) 모지, ㅁㅈ, 가야금";
    inp.value = symQuery[wrap.id] || "";
    // blur보다 먼저 오는 이벤트라 '편집 중이던 칸'은 여기서 붙잡아야 한다
    inp.addEventListener("mousedown", function () {
      symSearchReturn = (cellEditDomain && cellEditGi >= 0)
        ? { d: cellEditDomain, gi: cellEditGi, ci: cellEditCi } : null;
    });
    const apply = function () { symQuery[wrap.id] = inp.value; buildSymPalette(wrap, laneKey); };
    inp.addEventListener("input", apply);
    inp.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중엔 건드리지 않는다
      if (e.key !== "Escape") return;
      e.preventDefault();
      inp.value = ""; apply();
    });
    const clr = document.createElement("button");
    clr.type = "button"; clr.className = "sym-search-x"; clr.textContent = "×";
    clr.title = "검색 지우기 (Esc)";
    clr.addEventListener("mousedown", function (e) { e.preventDefault(); });
    clr.addEventListener("click", function () { inp.value = ""; apply(); inp.focus(); });
    row.appendChild(inp); row.appendChild(clr);
    return row;
  }

  function buildSymPalette(wrap, laneKey) {
    const lane = SYM_LANES[laneKey];
    if (!wrap || !lane) return;
    wrap.classList.add("sym-pal");
    wrap.dataset.lane = laneKey;
    const all = lane.chips();
    const rich = all.length >= SYM_RICH_MIN;
    // 머리(문법 안내 + 검색줄)는 한 번만 만들고 그대로 둔다 — 검색칸을 다시 만들면
    // 타이핑 중 포커스와 커서가 날아간다. 몸통(.sym-body)만 매번 새로 그린다.
    let head = wrap.querySelector(".sym-head");
    if (!head) {
      wrap.innerHTML = "";
      head = document.createElement("div");
      head.className = "sym-head";
      head.appendChild(makeSymHint(lane));
      wrap.appendChild(head);
    }
    let search = head.querySelector(".sym-search");
    if (search && !rich) { search.remove(); search = null; }
    if (!search && rich) head.appendChild(makeSymSearch(wrap, laneKey));
    let body = wrap.querySelector(".sym-body");
    if (!body) {
      body = document.createElement("div");
      body.className = "sym-body";
      wrap.appendChild(body);
    }
    body.innerHTML = "";
    const recent = document.createElement("div"); recent.className = "sym-recent";
    const groups = document.createElement("div"); groups.className = "sym-groups";
    body.appendChild(recent); body.appendChild(groups);

    const q = (rich ? (symQuery[wrap.id] || "") : "").trim().toLowerCase();
    if (q) {
      // 검색 중엔 묶음을 접고 한 줄로 — 어느 묶음에 있는지가 아니라 '있나 없나'가 궁금할 때다
      const hit = all.filter(function (ch) { return symSearchHay(ch).indexOf(q) >= 0; });
      if (hit.length) {
        groups.appendChild(symSection("찾음", hit.length + "개", sortSymChips(hit, lane), lane, laneKey, true));
      } else {
        const msg = document.createElement("div");
        msg.className = "sym-empty";
        msg.textContent = "‘" + inpText(q) + "’에 맞는 기호가 없습니다.";
        groups.appendChild(msg);
      }
      refreshOrnAddBadges();
      return;
    }
    renderSymRecent(wrap, laneKey);
    const withHead = rich || lane.groups.length > 1;
    lane.groups.forEach(function (grp) {
      const list = grp.match ? all.filter(grp.match) : all.slice();
      if (!list.length) return;
      groups.appendChild(symSection(grp.title, grp.sub, sortSymChips(list, lane), lane, laneKey, withHead));
    });
    refreshOrnAddBadges();
  }
  // 검색어를 안내문에 그대로 보여주기 위한 다듬기(길면 자른다)
  function inpText(q) { return q.length > 20 ? q.slice(0, 20) + "…" : q; }

  // 시김새(선율) 팔레트 — 에디터/직접 입력 양쪽에서 이 함수로 들어온다
  function buildOrnPalette(wrap) {
    wrap.classList.add("orn-view");
    buildSymPalette(wrap, "mel");
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
    // data-stem이 붙은 칩 = 선율 줄 칩만. 가사·장단 칩에 숫자 배지가 잘못 붙지 않게.
    document.querySelectorAll(".ornchip[data-stem]").forEach(function (el) {
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
    const data = window.NOTE_DATA || {};

    // '특수' 줄 — 12율×5옥타브 표에 자리가 없는 것들을 한 줄에 모은다. 쉼표·이음·숨표는 자주
    // 쓰지만 음이 아니라 표 맨 아래에 묻히면 눈에 안 띄어 매트릭스 **위**에 세우고, 표 밖의
    // 특수 율명(거문고 하하배임 등)도 예전엔 표 아래 별도 '특수' 줄이었으나 성격이 같은
    // '표에 없는 것들'이 위아래로 갈리길래 이 줄 끝에 합쳤다 — 도로 두 줄로 나누지 말 것.
    // 칩 공식은 12율 표와 **같다**: 위(글리프)=악보에 찍히는 모양, 아래(캡션)=타이핑할 글자.
    // 표 칩의 潢/청황과 같은 꼴이라 팔레트 전체가 한 규칙으로 읽힌다. 이음·숨표는 악보 모양이
    // 곧 입력 글자라 캡션이 글리프와 겹치는데, 그 겹침 자체가 '보이는 대로 치면 된다'는 표시다
    // — 캡션에 뜻을 적어 공식을 깨지 말 것(뜻·쓰는 법은 tip으로 내린다).
    const markList = [];
    if (data["pause_007"]) markList.push({ file: "pause_007", label: "쉼표", ins: "쉼", cap: "쉼",
                                           tip: "‘쉼’ 또는 ‘쉼표’ — 쉼표(무음)" });
    markList.push({ file: null, label: "이음", ins: "-", fallback: "-", cap: "-",
                    tip: "‘-’ — 이음(앞 음을 지속)" });
    markList.push({ file: null, label: "숨표", ins: "<", fallback: "<", cap: "<",
                    tip: "‘<’ — 숨표(음 뒤에 공백 없이 붙여 씀)" });
    Object.keys(SPECIAL_NOTES).forEach(function (nm) {
      const sp = SPECIAL_NOTES[nm];
      if (data[sp.file]) markList.push({ file: sp.file, label: nm, ins: nm, cap: nm,
                                        tip: "‘" + nm + "’ — " + octPrefix(sp.oct + 1) + sp.base +
                                             "보다 한 옥타브 낮은 음(표 밖)",
                                        semis: SCALE.indexOf(sp.base) + sp.oct * 12 });
    });
    appendSymRow(wrap, "특수", markList);

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
  }

  // 장단 칸 하나 그리기: 정간 옆 좁은 줄에 구음 기호(들)를 세로로 배치(분박과 동일한 공백 규칙)
  // '다'는 원본 svg가 거의 정사각형(작은 점 하나)이라 contain 상자를 꽉 채워 세로로 긴
  // 다른 기호들보다 유독 커 보인다 — 팔레트(styles.css의 img[alt="다"])와 같은 이유로
  // 악보에서도 따로 줄여 그린다.
  // 기호별 배율은 사전(js/symbols-registry.js)의 at.jd — '다'가 0.15인 사연도 거기 적혀 있다.
  const JANGGU_DRAW_SCALE = SYM_REG.jangguScale;
  function drawJangdanCell(svg, x, yTop, width, cellH, content) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const data = window.JANGGU_DATA || {};
    const rowH = cellH / rows.length;
    // 기호 크기는 분박(행) 수와 무관하게 한 가지로 고정 — 율명(drawCell)·가사(drawLyricCell)가
    // 행 수와 무관하게 같은 크기를 쓰는 것과 같은 규칙(행이 많아지면 촘촘해질 뿐 줄어들지 않는다).
    // 예전엔 rowH(=cellH/행수)에 비례해 분박이 생기면 확 작아졌다.
    const box0 = Math.min(width * 0.6, cellH * 0.46);
    rows.forEach(function (raw, i) {
      // 장단 줄은 전부 구음이라 괄호가 필요 없지만, 다른 줄 버릇대로 {덩}이라 쳐도 읽어 준다
      const name = stripSymBracket(raw);
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
      const symTokens = str.match(SYM_TOKEN_RE);
      if (symTokens && symTokens.join("") === str) {
        const names = symTokens.map(function (t) { return t.slice(1, -1); });
        if (names.every(function (nm) { return symURL(lyricSymStem(nm)); })) {
          const items = names.map(function (nm) {
            const sc = (nm in LYRIC_SYM_SCALE) ? LYRIC_SYM_SCALE[nm] : LYRIC_SYM_SCALE_DEFAULT;
            const stem = lyricSymStem(nm);
            const e = SYM_REG.byId[stem];
            // 세로 박스는 행 높이가 아니라 '정간 높이' 기준 — 글자 크기가 분박 수와
            // 무관하게 고정인 것과 같은 규칙. 행이 많으면 촘촘해질 뿐 안 줄어든다.
            const bw = width * 0.95 * sc;
            // 상자가 세로로 길면(폭의 2.5배쯤) 세로로 긴 기호만 높이를 꽉 채워 둥근 기호보다
            // 훨씬 커진다. '표'류(세로표 등)는 칸을 가로지르는 게 제 노릇이라 그게 맞지만,
            // 구음처럼 한 글자로 읽히는 기호는 서로 키가 같아야 한다 — box:"square"를 단
            // 기호는 장단 줄과 같은 정사각 상자에 넣어, 둥글든 길쭉하든 키를 맞춘다.
            const bh = (e && e.box === "square") ? bw : cellH * 0.95 * sc;
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
  function drawCell(svg, x, yTop, cell, content, gakIdx, cellIdx, pageIdx) {
    const rows = content.split(/\s+/).filter(Boolean);
    if (!rows.length) return;
    const nRows = rows.length;
    // 기호 순번(k)은 **원문 등장 순서**로 미리 매긴다 — getOrnToken이 원문의 괄호 토큰을
    // 앞에서부터 세어 k번째를 고르므로, 그리는 차례(좌/우 배치, 행 순서)로 매기면 어긋난다.
    // 예전엔 그리는 루프에서 세었는데, 배치에서 빠지는 빠르기 기호가 번호를 안 먹어
    // 그 뒤 기호들이 한 칸씩 밀렸다(빠르기와 시김새가 한 정간에 같이 있을 때).
    let symSeq = -1;
    const rawRowToks = rows.map(function (row) {
      return tokenizeNotes(row).map(function (tk) {
        return tk.sym != null ? Object.assign({}, tk, { k: ++symSeq }) : tk;
      });
    });
    // 숨표(<)는 음표처럼 자리를 차지하지 않고 이 정간 오른쪽-아래 모서리에 한 번만 고정 표시된다.
    // 어느 행에 섞여 있든 상관없이 감지만 하고, 배치 계산에서는 제외한다.
    const hasBreath = rawRowToks.some(function (toks) { return toks.some(function (tk) { return tk.breath; }); });
    // 빠르기(tempo) 시김새도 칸 안 자리를 차지하지 않고 정간 오른쪽(가사 바깥)에 세로로 표시된다.
    // 숨표와 같은 방식으로 감지만 하고 배치 계산(분박·칸 수)에서는 제외한다.
    // 토큰을 통째로 담는다 — 개별 조정값(tk.adj)과 순번(tk.k)이 있어야 끌어서 옮길 수 있다.
    const tempoToks = [];
    rawRowToks.forEach(function (toks) {
      toks.forEach(function (tk) { if (tk.sym && ORN_CAT[tk.sym] === "tempo") tempoToks.push(tk); });
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
          // 음길이가 있는(독립 칸을 차지하는) 시김새는 조금 작게 그림 — 시김새(ORN_CAT에 있는 것)는
          // 율명 크기 배율을 안 타도록 gsBase(배율 적용 전) 기준으로 그린다. ORN_CAT에 없는 기호
          // (쉼 등)는 음표와 같은 취급이라 여전히 gs(배율 적용) 기준.
          const symBase = ORN_CAT[g.main.sym] ? gsBase : gs;
          const mainBox = symBase * 1.06 * (ORN_CAT[g.main.sym] === "with" ? 0.8 : 1)
            * (SYM_EXTRA_SCALE[g.main.sym] || 1);
          drawAdjSym(svg, g.main, cx, cyc, mainBox, cell, gakIdx, cellIdx, pageIdx, g.main.k);
        }
        else drawGlyph(svg, g.main, cx, cyc, tieOnly ? gs * TIE_ROW_GLYPH : gs);
        // 붙임 시김새: 주 글자 오른쪽에 작게 (여러 개면 세로로 쌓음) —
        // 덧길이표만 예외로 왼쪽에 붙는다(정간보 관행). 순번(tk.k)은 화면에 그리는 자리(좌/우)와
        // 무관하게 원문(글자) 등장 순서라 시김새 미세조정(클릭 선택)이 안 어긋난다.
        // 붙임표는 전부 시김새라 크기는 항상 gsBase 기준(율명 크기 배율 미적용).
        if (g.att.length) {
          const groupRight = x + colW * (gi + 1);
          const groupLeft = x + colW * gi;
          const saBase = Math.min(gsBase * 0.55, colW * 0.34);
          const items = g.att.map(function (tk) {
            // 확대는 붙임표(wo류)에만 적용 — 퇴성·추성처럼 붙어오는 것들은 원래 크기 유지
            const scale = (ORN_CAT[tk.sym] === "wo" && !ATT_SCALE_KEEP.has(tk.sym)) ? ATT_EXTRA_SCALE : 1;
            const box = saBase * scale * (ATT_SYM_SCALE[tk.sym] || 1);
            return { tk: tk, box: box, k: tk.k, left: tk.sym === "len-double" };
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
    if (tempoToks.length) {
      const tmH = cell * 0.92;               // 정간 높이 대비 세로 크기
      const tmW = cell * 0.4;                // 세로 이미지라 가로는 좁게(meet로 원본 비율 유지)
      // 정간 **바로 옆**에 붙인다. 예전엔 곁줄 폭만큼 더 바깥에 놓았는데, 그러면
      // 곁줄을 켰을 때 각 사이 간격을 넘어 옆 각에 닿았다(간격은 각 폭의 2/3뿐이라 곁줄 폭을
      // 더하면 남는 자리가 없다). 곁줄과 겹칠 수 있지만 그건 시김새 편집 모드에서 끌어 옮겨 푼다 —
      // 자리를 벌리려고 옆 각을 침범하는 것보다 낫다.
      const tmLeft = x + cell + cell * 0.08;
      // 여러 개면 세로로 나눠 배치(보통 1개)
      tempoToks.forEach(function (tk, ti) {
        const h = tmH / tempoToks.length;
        const yT = yTop + cell / 2 - tmH / 2 + h * ti;
        // 개별 조정값(@크기,좌우,상하)을 다른 시김새와 **같은 규칙**으로 적용한다:
        // 크기는 박스 가운데를 잡고 늘이거나 줄이고, 좌우·상하는 정간 크기(cell) 대비 %.
        // drawAdjSym과 단위가 같아야 끌어 옮길 때(setOrnPositionAbsolute) 손끝과 그림이 붙어 간다.
        const adj = tk.adj || { sz: 100, dx: 0, dy: 0 };
        const w = tmW * (adj.sz / 100), hh = h * (adj.sz / 100);
        const bx = tmLeft + (tmW - w) / 2 + (adj.dx / 100) * cell;
        const by = yT + (h - hh) / 2 + (adj.dy / 100) * cell;
        drawSymImageRect(svg, tk.sym, bx, by, w, hh);
        // 시김새 수정 모드의 하이라이트·클릭·드래그는 ornInstances 하나만 본다 —
        // 여기 담기면 점선 상자와 끌기가 다른 시김새와 똑같이 따라온다(따로 배선하지 말 것).
        if (ornCollect) ornInstances.push({ gak: gakIdx, cell: cellIdx, k: tk.k, page: pageIdx,
          x: bx, y: by, w: w, h: hh });
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

  // 특수 율명 이미지 보정 — 글자와 이미지는 '크기'의 기준이 달라서 같은 값을 줘도 이미지가 더
  // 크게 보인다. 한자는 잉크가 글자 크기의 0.86배만 채우는데(측정: 林 0.857·黃 0.872),
  // 특수 율명 PNG는 잉크 경계로 잘려 있어 상자를 0.96배까지 꽉 채운다. 그 차이를 걷어내는 값.
  // 새 특수 율명을 넣을 때도 같은 방식(잉크 크롭)이면 이 값이 그대로 맞는다.
  const SPECIAL_NOTE_SCALE = 0.9;

  function drawGlyph(svg, tk, cx, cyc, size) {
    // 특수 율명(유니코드 없음, SPECIAL_NOTES) — 전용 이미지를 한자 글자와 같은 크기로.
    // 한글 표기 모드에도 이미지 그대로(하배/중청 같은 접두어 체계 밖의 음이라 글자가 없다).
    if (tk.file) {
      drawSymImage(svg, tk.file, cx, cyc, size * YUL_SCORE_SCALE * SPECIAL_NOTE_SCALE);
      return;
    }
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
    if (ornCollect) ornInstances.push({ gak: gakIdx, cell: cellIdx, k: k, page: pageIdx,
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

  function hideOrnPanel() {
    const p = $("ornPanel");
    p.classList.remove("on");
    p.style.left = ""; p.style.top = ""; p.style.right = "";   // CSS 기본 자리로 되돌림
  }

  function showOrnPanel() {
    const t = getOrnToken(ornSel);
    if (!t) { hideOrnPanel(); return; }
    const o = ORN_LIST.find(function (x) { return x.s === t.stem || x.k === t.stem; });
    $("ornName").textContent = (o ? o.k : t.stem) + " · " + Math.round(t.sz) + "%";
    $("ornPanel").classList.add("on");
  }

  // 패널을 **고른 기호 옆**에 띄운다. 예전엔 늘 악보 오른쪽 위 구석이라, 눈은 기호를 보고
  // 손은 화면 끝으로 가야 했다(고른 게 뭔지도 그 먼 상자에서 확인해야 했다).
  // 자리는 고를 때 한 번만 잡는다 — 크기 조절이나 끌기마다 다시 잡으면 손 밑에서 상자가
  // 달아나서, 한 기호를 만지는 동안엔 가만히 있는 편이 낫다.
  const ORN_PANEL_GAP = 14;
  function placeOrnPanelNearSel() {
    const p = $("ornPanel"), area = $("sheetArea");
    const o = ornSel && ornInstances.find(function (v) {
      return v.gak === ornSel.gak && v.cell === ornSel.cell && v.k === ornSel.k;
    });
    const svg = o && pageSvgs[o.page];
    const ctm = svg && svg.getScreenCTM();
    if (!ctm) return;                       // 자리를 못 잡으면 CSS 기본 자리(오른쪽 위)에 그대로 둔다
    // 기호 상자(SVG 좌표) → 화면 좌표 → #sheetArea 안 좌표(패널의 기준점이 #sheetArea라
    // 스크롤량을 더해야 종이에 붙어 함께 스크롤된다)
    const pt = svg.createSVGPoint();
    pt.x = o.x; pt.y = o.y; const a1 = pt.matrixTransform(ctm);
    pt.x = o.x + o.w; pt.y = o.y + o.h; const a2 = pt.matrixTransform(ctm);
    const ar = area.getBoundingClientRect();
    const toLeft = function (clientX) { return clientX - ar.left + area.scrollLeft; };
    const toTop = function (clientY) { return clientY - ar.top + area.scrollTop; };
    const pw = p.offsetWidth, ph = p.offsetHeight;
    // 보이는 범위(스크롤 창) — 여기를 벗어나면 패널이 화면 밖에 떠서 못 쓴다
    const visL = area.scrollLeft + 8, visT = area.scrollTop + 8;
    const visR = area.scrollLeft + area.clientWidth - 8;
    const visB = area.scrollTop + area.clientHeight - 8;
    // 정간보는 오른쪽→왼쪽으로 읽으니 기호 **왼쪽**이 아직 안 읽은 쪽이라 덜 가린다.
    // 왼쪽이 좁으면 오른쪽으로 넘긴다.
    let left = toLeft(a1.x) - ORN_PANEL_GAP - pw;
    if (left < visL) left = toLeft(a2.x) + ORN_PANEL_GAP;
    let top = toTop((a1.y + a2.y) / 2) - ph / 2;
    p.style.right = "auto";
    p.style.left = Math.max(visL, Math.min(left, visR - pw)) + "px";
    p.style.top = Math.max(visT, Math.min(top, visB - ph)) + "px";
  }

  function selectOrn(sel) { ornSel = sel; render(); showOrnPanel(); placeOrnPanelNearSel(); }

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

  // 제목·부제 드래그 — 자유 텍스트(attachTextDrag)와 같은 조작감으로, 끌면 상하/좌우
  // 오프셋 입력(titleOffset/X·subOffset/X — 텍스트 창에 숨겨 둔 칸)에 값을 써넣고 렌더한다.
  // 상하는 양수=위(그리기가 -값을 쓰므로 dy를 빼고), 좌우는 양수=오른쪽. scale로 나눠 mm로.
  // inner(글자 g)의 getBBox로 여유 잡힌 투명 히트 상자를 깔아 글자 사이도 잡힌다.
  function attachTitleDrag(holder, inner, padPx, svg, scale, offId, offXId, active) {
    if (!active) return;   // 텍스트 창이 닫혀 있으면 정적 표시만 — 하이라이트·드래그 없음
    const bb = inner.getBBox();   // holder가 이미 svg에 붙어 있어야 함
    // 章 이름과 같은 점선 하이라이트(no-print) — '이 창(텍스트)이 다루는 것'임을 보인다
    const hit = rect(bb.x - padPx, bb.y - padPx, bb.width + padPx * 2, bb.height + padPx * 2, 0.2,
      { fill: "rgba(138,109,59,.08)", stroke: "#8a6d3b", "stroke-dasharray": "1.4,1.1",
        "pointer-events": "all", class: "no-print" });
    hit.classList.add("hit-fit"); hit.dataset.pad = padPx;   // SVG 삽입 뒤 fitDragHits가 실제 글자에 맞춰 다시 잡음
    hit.style.cursor = "move";
    holder.appendChild(hit);
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
      if (!moved) return;
      const p = svgPointFromEvent(svg, e);
      const dx = p.x - startPt.x, dy = p.y - startPt.y;
      const o = $(offId), ox = $(offXId);
      o.value = Math.round(((parseFloat(o.value) || 0) - dy / scale) * 10) / 10;
      ox.value = Math.round(((parseFloat(ox.value) || 0) + dx / scale) * 10) / 10;
      render();
    }
    holder.addEventListener("pointerup", finish);
    holder.addEventListener("pointercancel", finish);
  }

  // 렌더 중엔 SVG가 아직 DOM에 없어 getBBox가 0을 준다(상자가 원점 근처 점이 됨) — SVG를 화면에
  // 붙인 뒤 .hit-fit 상자(제목·부제·자유텍스트의 하이라이트 겸 드래그 히트)를 실제 글자 크기에
  // 맞춰 다시 잡는다. 자기 자신(hit)을 잠깐 떼고 홀더 bbox를 재야 텍스트만 측정된다.
  function fitDragHits(container) {
    container.querySelectorAll("rect.hit-fit").forEach(function (hit) {
      const holder = hit.parentNode; if (!holder) return;
      const pad = parseFloat(hit.dataset.pad) || 0;
      holder.removeChild(hit);
      let bb; try { bb = holder.getBBox(); } catch (e) { holder.appendChild(hit); return; }
      hit.setAttribute("x", bb.x - pad); hit.setAttribute("y", bb.y - pad);
      hit.setAttribute("width", bb.width + pad * 2); hit.setAttribute("height", bb.height + pad * 2);
      holder.appendChild(hit);
    });
  }

  // 각/장 이름·빠르기 표기 드래그(공통 뼈대) — 끌면 dx·dy(뷰박스 단위)를 onDrop에 넘기고,
  // 움직임 없이 떼면 onClick(있으면)을 부른다 — 이름 카드 열기 같은 기존 클릭 동작 유지용.
  // attachTitleDrag와 달리 커밋을 콜백에 맡겨, 대상마다 다른 저장처(오프셋 맵·입력 칸)를 쓴다.
  function attachLabelDrag(holder, svg, onDrop, onClick) {
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
      const p = svgPointFromEvent(svg, e);
      if (moved) onDrop(p.x - startPt.x, p.y - startPt.y);
      else if (onClick) onClick();
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

  // 제목·부제 내용 미러(#titleMirror·#subMirror) — 정본은 설정 › 문서 탭의 #title·#subtitle이고
  // 목록 칸은 거기에 써넣기만 한다(#tempoBpmGak ↔ #tempoBpm과 같은 규칙).
  // 지금 타이핑 중인 칸은 건너뛴다 — 값을 덮으면 커서가 끝으로 튀고 조합 중인 한글이 끊긴다.
  function syncTextMirror(mirrorId, value) {
    const el = $(mirrorId);
    if (!el || el === document.activeElement) return;
    if (el.value !== value) el.value = value;
  }

  // 목록 칸 → 정본. 정본에 'input'을 되쏘아 render·자동 저장이 평소 경로를 그대로 타게 한다.
  function wireTextMirror(mirrorId, srcId) {
    const el = $(mirrorId);
    if (!el) return;
    el.addEventListener("input", function () {
      const src = $(srcId);
      src.value = el.value;
      src.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

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
      // 크기·자간은 눈으로 보며 맞추는 값이라 치는 대로 바로 반영(wireLive)
      wireLive(sz, function () {
        const v = parseFloat(sz.value);
        if (!isNaN(v)) { t.size = Math.max(2, Math.min(30, v)); render(); }
      });
      szLab.appendChild(sz);
      const spLab = document.createElement("label");
      spLab.appendChild(document.createTextNode("자간(mm)"));
      const sp = document.createElement("input");
      sp.type = "number"; sp.min = "-3"; sp.max = "20"; sp.step = "0.5"; sp.value = t.spacing || 0;
      wireLive(sp, function () {
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
    // 보기(총보/파트보)에 맞는 레이아웃 프로필을 **가장 먼저** 입힌다 — 아래의 모든 컨트롤
    // 읽기(한 줄 각 수·배율·종이…)보다 앞서야 바뀐 보기의 값으로 셈이 시작된다.
    syncViewLayout(scoreViewOn());
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
    const wantLyrics = lyricsLaneOn();
    document.body.classList.toggle("want-lyrics", wantLyrics);
    // 초록 점(레이어 사용 표시)은 '내용이 있음'만 뜻한다 — 창을 열었다고 켜지면 안 된다
    document.body.classList.toggle("has-lyrics", lyricsHasContent());

    // ---------- 총보 보기 ----------
    // 파트가 여럿이고 악기 관리 창의 [총보]가 켜져 있으면 모든 파트를 한 각 안에 나란히
    // 그린다(한 각 = 파트 열 묶음, 목록 위 파트가 오른쪽 — 읽는 방향이 오른쪽→왼쪽이라).
    // 파트보(기본)는 P=1로 아래 전부가 예전과 완전히 같은 경로를 탄다.
    stashActivePart();   // 비활성 파트 내용도 그리므로 parts[]를 먼저 최신으로
    const scoreMode = scoreViewOn();
    const partList = scoreMode ? parts : [parts[activePart]];
    const P = partList.length;
    const activeCol = scoreMode ? activePart : 0;   // partList 안에서 활성 파트의 자리
    document.body.classList.toggle("score-view", scoreMode);
    // 파트별 곁줄 — 내용이 있는 파트만 제 열 옆에 나온다(총보라고 남의 곁줄 자리를 만들어
    // 두지 않는다 — 사용자 확정). 활성 파트만 '창 열림'(빈 줄 보이기)도 켬으로 친다.
    const partLyOn = partList.map(function (p, i) {
      if (i === activeCol) return wantLyrics;
      return String(p.lyrics || "").replace(/[|\s]/g, "") !== "";
    });
    const lyOnCount = partLyOn.filter(Boolean).length;
    // 텍스트(자유 주석)는 켜짐 스위치가 없어 '하나라도 있음'을 레이어 사용 표시(초록 점)에 쓴다
    // — 제목·부제 서식도 텍스트 창 소관(2026-07-24 분리)이라 함께 센다
    document.body.classList.toggle("has-texts",
      customTexts.length > 0 || !!titleTxt || !!subTxt);
    // 제목/부제 항목(텍스트 창 목록 맨 위) — 내용이 있을 때만 나타난다(문서 탭에 적으면 자동 등장)
    if ($("txTitleItem")) $("txTitleItem").style.display = titleTxt ? "" : "none";
    if ($("txSubItem")) $("txSubItem").style.display = subTxt ? "" : "none";
    // 내용 미러 — 정본(#title·#subtitle)이 바뀌면 목록 칸을 맞춘다. 타이핑 중인 칸은
    // 건드리지 않는다(커서가 끝으로 튀고 조합 중인 한글이 끊긴다).
    syncTextMirror("titleMirror", titleTxt);
    syncTextMirror("subMirror", subTxt);
    document.body.classList.toggle("has-gaknames", Object.keys(gakNames).length > 0);
    // 章(빠르기/각/장) 창이 열려 있으면 '이 창이 다루는 것'(각/장 이름·빠르기 표기)에
    // 하이라이트 상자를 씌운다 — 어떤 것들이 여기 소관인지 한눈에 보이게(no-print라 출력 제외)
    const gakWinOpen = !!document.querySelector("#gakNameArea.win-open");
    // 텍스트(文) 창이 열려 있을 때만 제목·부제·자유텍스트가 하이라이트되고 끌린다(章과 같은 규칙)
    const textWinOpen = !!document.querySelector("#textArea.win-open");
    const wantTempo = $("wantTempo").checked;
    const gakNumMode = $("gakNumMode").value;   // 각 번호: none | screen(화면에만) | all(출력 포함)
    document.body.classList.toggle("gaknum-screen", gakNumMode === "screen");
    const pageNumPos = $("pageNumPos").value;   // 쪽 번호 위치 — 페이지 루프 밖에서 한 번만 조회
    const tempoStr = tempoLabelText();
    // 각/장 창의 템포 항목 — 켜져 있을 때만 보이고(CSS), 미리보기는 지금 값으로 만든 실물 그대로
    document.body.classList.toggle("want-tempo", wantTempo);
    if ($("tempoPreview")) $("tempoPreview").textContent = tempoStr;
    // 템포 글자 크기 배율 — 각/장 이름(gakNameSize)과 따로 논다. 아래 높이 예약과 실제
    // 그리기가 같은 값을 써야 키운 만큼 진짜로 커진다(예약을 안 늘리면 avail에 걸려 잘린다).
    const tempoMul = Math.max(0.3, parseFloat($("tempoSize").value) || 1);
    const dg = parseDaegang(daegangTextFor(beats), beats);   // 기본 각의 대강(경고문·둘러보기용)
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
    const paper = paperSize();
    const PW = landscape ? paper.h : paper.w;
    const PH = landscape ? paper.w : paper.h;
    // '사용자 지정'일 때만 폭·높이 칸을 내놓는다
    if ($("paperCustomWrap"))
      $("paperCustomWrap").style.display = ($("paperSize").value === "custom") ? "" : "none";
    // 인쇄 크기는 여기 한 곳에서 정한다 — @page(용지)와 종이 요소의 실제 크기가 어긋나면
    // 잘리거나 빈 장이 딸려 나온다. 예전엔 styles.css의 @media print가 210/297mm를 박아
    // 두고 있어서 종이 크기를 바꿔도 인쇄만 A4로 나왔다.
    const ps = $("pageStyle");
    if (ps) ps.textContent =
      "@page { size: " + (paper.css ? paper.css + " " + (landscape ? "landscape" : "portrait")
                                    : PW + "mm " + PH + "mm") + "; margin: 0; }\n" +
      // 직계(>)여야 한다 — 오선보 인쇄 종이는 안에 <svg>를 한 겹 더 품고 있어(줄을 오려
      // 내는 상자) `.page svg`로 걸면 그 속엣것까지 종이 크기로 부풀어 그림이 터진다.
      "@media print { .page > svg { width: " + PW + "mm !important; height: " + PH + "mm !important; } }";

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
    const titleGak = titleGakFor(gakPerRow);
    // 칸 폭 옵션은 세로 칸 제목에만 의미 — '가로 위'를 고르면 컨트롤을 숨긴다
    if ($("titleGakWidthWrap")) {
      $("titleGakWidthWrap").style.display = $("titleLayout").value === "top" ? "none" : "";
    }

    // 멜로디(내용) 파싱 — 에디터 조각이 아니라 곡 전체 원본을 그린다. 총보면 파트마다.
    // 활성 파트는 전역 작업 사본(melodyFull·lyricsFull)이 정본이라 그쪽을 파싱한다.
    const parsedBy = partList.map(function (p, i) {
      return parseMelodyOffsets(i === activeCol ? melodyFull : p.melody);
    });
    const parsed = parsedBy[activeCol];
    const jdParsed = wantJangdan ? parseMelodyOffsets($("jangdan").value) : null;
    const lyParsedBy = partList.map(function (p, i) {
      if (!partLyOn[i]) return null;
      return parseMelodyOffsets(i === activeCol ? lyricsFull : p.lyrics);
    });
    const lyParsed = lyParsedBy[activeCol];
    const stylesBy = partList.map(function (p, i) { return i === activeCol ? cellStyles : p.cellStyles; });

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
      const bands = [], bandStart = [];
      let leftover = take;
      while (leftover > 0 && bands.length < stack) {
        const capThis = Math.max(1, perBand - ((isFirst && bands.length === 0) ? jdSlot : 0));
        const bn = Math.min(capThis, leftover);
        bandStart.push(wantGak - remaining + (take - leftover));   // 이 밴드 첫 각의 번호(0부터)
        bands.push(bn); leftover -= bn;
      }
      pages.push({ bands: bands, bandStart: bandStart, hasTitle: isFirst && titleGak > 0 });
      remaining -= take;
    }
    // 밴드 높이는 그 밴드에서 **가장 긴 각**이 정한다(각 길이가 섞이면 아래끝이 들쭉날쭉해진다 —
    // 정간 크기를 고정하고 각 길이를 다르게 두는 쪽이 실제 악보의 모습이다).
    // 맨 처음 밴드의 장단 줄은 곡의 장단이라 표준 정간 수를 쓰므로 그것도 함께 센다.
    function bandBeatsOf(p, i) {
      let mx = (wantJangdan && p.bandStart[i] === 0) ? defBeats() : 1;
      for (let g = p.bandStart[i]; g < p.bandStart[i] + p.bands[i]; g++) mx = Math.max(mx, beatsAt(g));
      return mx;
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
    const desiredLyW = desiredCell * 0.4;   // 곁줄 한 줄의 폭 — 켜진 파트마다 하나씩 늘어난다
    const desiredLyExtra = desiredLyGap + desiredLyW;
    // 가사 줄은 각 사이 간격 '안'에 들어간다 — 가사를 켜도 (남는 간격 + 가사 줄) 합이
    // 원래 간격과 같아 각 기둥 위치·전체 폭이 안 바뀐다. 간격이 가사 줄보다 좁으면
    // 겹치지 않게 0까지만 줄인다(그때만 전체가 가사 줄 몫만큼 넓어짐).
    // 간격을 파고드는 건 **맨 오른쪽 파트의 곁줄**뿐이다 — 안쪽 파트의 곁줄은 묶음 안에
    // 있어 옆 파트 열을 밀어내므로 묶음 폭(gakW)에 그대로 더해진다.
    const desiredGap = partLyOn[0] ? Math.max(0, desiredGapBase - desiredLyExtra) : desiredGapBase;
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
          // 총보에선 각 하나가 파트 수(P)만큼의 정간 열 + 켜진 곁줄들(lyOnCount)이다.
          // 장단 자리는 한 각(묶음) 자리와 같은 폭으로 잡아 아래 밴드들과 열이 맞는다.
          let cells = m * P, gaps = m - 1, lys = m * lyOnCount;
          if (pi === 0 && i === 0 && jdSlot) { cells += P; gaps += 1; lys += lyOnCount; }
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
    // 세로 예산 — 각 길이가 섞이면 페이지마다 높이가 달라지므로 가장 높은 페이지를 기준으로
    // 정간 크기(cell)를 정한다. 모든 각이 같은 길이면 예전 식(maxBands×(beats+머리단))과 같다.
    let hNeed = 1;
    pages.forEach(function (p) {
      const units = p.bands.reduce(function (a, _, i) { return a + bandBeatsOf(p, i) + headRatio; }, 0);
      hNeed = Math.max(hNeed, units * desiredCell + (p.bands.length - 1) * desiredBandGap);
    });
    const scale = Math.min(1, availW / wNeed, availH / hNeed);

    const cell = desiredCell * scale;
    const gap = desiredGap * scale;
    let bandGap = desiredBandGap * scale;
    // 템포 표시(一分・XX井) — 맨 처음 각 위, 첫 페이지에만. 세로 여유 계산에도 쓰므로 먼저 구한다.
    // tempoMul을 곱해야 크기를 키운 만큼 위 공간도 같이 늘어난다(안 그러면 그리기가 avail에 걸려 잘림).
    const tempoFont = cell * 0.42 * tempoMul;
    // 자간(#tempoSpacing, mm) — verticalText가 한 글자 자리를 `font*1.12 + spacing`으로 잡으므로
    // 예약도 같은 셈을 써야 한다. 어긋나면 자간을 벌린 만큼 글자가 위로 삐져나가 잘린다.
    const tempoSpacing = (parseFloat($("tempoSpacing").value) || 0) * scale;
    const tempoLineH = tempoFont * 1.12 + tempoSpacing;
    // 격자와 템포 글자 사이 여백 — 각/장 이름(#gakNameGap)과 따로 노는 제 값(#tempoGap).
    // 예약과 그리기(drawTempoLabel)가 이 한 값을 같이 쓴다: 예전엔 예약은 tempoFont*0.45,
    // 그리기는 gakNameGap이라 서로 어긋나 있었다. 지금은 숨은 칸이고 드래그(상하)가 써 준다.
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
      const hUsedAtScale = hNeed * scale;   // hNeed는 desired 단위라 배율만 곱하면 실제 높이
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
    // 한 각(묶음)의 폭 — 파트 정간 열 P개 + 켜진 곁줄들. 파트보(P=1)면 예전 그대로.
    const gakW = P * cell + lyOnCount * lyExtraFull;
    const slot = gakW + gap;
    // 밴드 높이는 이제 밴드마다 다르다(각 길이가 섞이면) — 페이지 루프에서 bandBeatsOf로 잡는다
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
          if (!p.hasTitle && partLyOn[0]) {   // 맨 오른쪽 끝은 늘 맨 오른쪽 파트의 곁줄 자리
            if (pi === 0 && i === 0 && jdSlot) inset = lyExtraFull;
            else {
              const firstLy = lyParsedBy[0] && lyParsedBy[0][acc];
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

    // 대강 자리(정간 수별) — 각 길이가 다르면 대강도 다르므로 길이로 캐시해 둔다.
    const dgCache = {};
    function dgSetFor(n) {
      if (dgCache[n]) return dgCache[n];
      const set = new Set();
      const g = parseDaegang(daegangTextFor(n), n).groups;
      if (g) { let a = 0; for (let k = 0; k < g.length - 1; k++) { a += g[k]; set.add(a); } }
      dgCache[n] = set;
      return set;
    }
    // 둘러보기 '악보' 단계가 정간·대강·각을 상자로 짚어 준다. 대강은 **두 번째** 묶음을 가리킨다 —
    // 첫 대강은 각과 같은 줄 맨 위에서 시작해 두 상자가 겹쳐 보인다.
    const tourDg = (dg.groups && dg.groups.length > 1)
      ? { from: dg.groups[0], to: dg.groups[0] + dg.groups[1] } : null;

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
      // 밴드마다 높이가 다를 수 있다(각 길이가 섞이면) — 미리 재어 두고 위치는 누적으로 잡는다
      const bandHs = page.bands.map(function (_, i) { return headH + bandBeatsOf(page, i) * cell; });
      const bandTops = []; { let acc = 0; bandHs.forEach(function (h) { bandTops.push(acc); acc += h + bandGap; }); }
      const gridTotalH = bandHs.reduce(function (a, h) { return a + h; }, 0) + (usedBands - 1) * bandGap;
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
      // 각/장 이름·빠르기 표기 홀더 — 페이지의 '각 위 클릭존'을 전부 그린 뒤 한꺼번에 맨 위로
      // 올린다(cellBorderSegs와 같은 수집 패턴). 각 단위로 바로 올리면 부족하다: 빠르기 표기
      // 옆으로 비켜 그려진 라벨이 '옆 각'의 클릭존과 겹치는데, 옆 각 존은 더 나중에 그려져
      // 라벨 위에 얹히는 바람에 마우스(드래그·클릭)를 다 가로챘다.
      const gnRaiseEls = [];
      for (let b = 0; b < usedBands; b++) {
        const bandTop = gridY + bandTops[b];
        const gridTop = bandTop + headH;
        // 밴드 상자의 아래끝 = 이 밴드에서 가장 긴 각의 끝. 각 하나하나의 아래끝(gBottom)은
        // 아래 각 루프에서 제 정간 수로 따로 잡는다 — 길이가 섞이면 서로 다르다.
        const bandBeats = bandBeatsOf(page, b);
        const gridBottom = gridTop + bandBeats * cell;
        const hasTitle = (b === 0 && page.hasTitle);
        const nMusic = page.bands[b];
        // 이 밴드의 각들이 다 같은 길이인가 — 그러면 밴드 아래 통줄·대강선을 예전처럼
        // 밴드 폭 전체에 한 줄로 긋는다(각 사이 간격에서 끊기지 않게). 섞여 있을 때만 각별로 끊는다.
        let bandUniform = true;
        for (let g = gakAccum; g < gakAccum + nMusic; g++) if (beatsAt(g) !== bandBeats) bandUniform = false;

        // 제목 칸은 페이지 단위로 한 통(프레임 위~아래)으로 그려지므로,
        // 자리는 그 페이지의 모든 밴드에서 똑같이 비워둔다(무조건 오른쪽 정렬).
        // 격자와 제목 칸 사이에는 넉넉한 여유(titleGutter)를 둔다.
        const musicRightEdge = page.hasTitle ? (bandRight - titleWidth - titleGutter) : bandRight;
        // 장단은 전체 악곡의 맨 처음 각(gakAccum===0) 옆에만 붙고, 한 각 자리(가사 폭 포함)를 차지함
        // — 그래야 아래 밴드들과 좌우 폭이 정확히 같아진다
        const bandJdExtra = (wantJangdan && gakAccum === 0)
          ? jdExtraFull + (gakW - cell) : 0;   // 장단 자리 = 한 각(묶음) 자리와 같은 폭
        const musicLeft = musicRightEdge - (nMusic * gakW + (nMusic - 1) * gap) - bandJdExtra;

        // 밴드 위/아래 통줄의 오른쪽 끝.
        // 제목이 있는 페이지는 모든 밴드의 통줄이 제목 칸 세로선까지 쭉 이어진다(예시 악보 방식).
        // 제목이 없으면 격자 오른쪽 끝까지 — 가사를 켰지만 맨 오른쪽 각의 가사가
        // 비어 있으면 그 빈 가사 자리는 선에서 뺀다.
        let capBase = musicRightEdge;
        let closeLyricCol = false;   // 맨 오른쪽이 내용 있는 가사 열이면 오른쪽 마감 세로선을 긋는다
        if (wantJangdan && gakAccum === 0) {
          // 맨 처음 밴드의 가장 오른쪽은 장단 칸 — 장단 칸엔 가사 자리가 없으므로
          // 통줄도 장단 칸 오른쪽 선에서 끝나야 튀어나오지 않는다
          capBase = musicRightEdge - (gakW - cell);
        } else if (partLyOn[0]) {
          // 가로(맨 위) 제목이면 오른쪽에 제목 칸이 없으므로, 맨 오른쪽 가사 열을
          // 상자로 감싸지 않고 열어 둔다(통줄도 각의 오른쪽 선까지만).
          const firstLy = lyParsedBy[0] && lyParsedBy[0][gakAccum];
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
          const gakRight = musicRightEdge - m * slot - bandJdExtra;   // 이 각(묶음)의 오른쪽 끝
          const gakLeft = gakRight - gakW;
          const melIdx = gakAccum + m;
          // 이 각의 정간 수·아래끝·대강 자리 — 각 길이가 섞이면 각마다 다르다
          const gBeats = beatsAt(melIdx);
          const gBottom = gridTop + gBeats * cell;
          const gDg = dgSetFor(gBeats);
          // 묶음 가운데 — 각 번호·각/장 이름이 여기 온다(파트보에선 정간 열 가운데 그대로)
          const gakCx = scoreMode ? (gakLeft + gakRight) / 2
                                  : gakRight - (partLyOn[0] ? lyExtraFull : 0) - cell / 2;
          // 파트 열 묶음 — 오른쪽에서 왼쪽으로 [파트0 곁줄][파트0 정간][파트1 곁줄][파트1 정간]…
          // (곁줄은 제 정간의 오른쪽에 붙는다 — 파트보와 같은 규칙). 파트보면 한 번만 돈다.
          let colAcc = 0;
          for (let pi = 0; pi < P; pi++) {
          const lyOnP = partLyOn[pi];
          const x = gakRight - colAcc - (lyOnP ? lyExtraFull : 0) - cell;
          colAcc += cell + (lyOnP ? lyExtraFull : 0);
          const isActiveCol = pi === activeCol;
          const styles = stylesBy[pi];
          const gakCells = parsedBy[pi][melIdx];

          // 이 각에 실제로 채워진 정간(|로 나뉜 칸) 수 — 글자를 그릴 범위(내용이 없으면 0).
          // 테두리·칸 구분선은 타이핑 중이라 |가 덜 채워져도 끊기지 않게 항상 그 각의 정간 수(gBeats) 전체 높이로 그린다.
          const cellCount = gakCells ? gakCells.length : 0;
          const filled = cellCount > 0 ? Math.min(gBeats, cellCount) : 0;

          // 정간 배경색 — 글자·격자선보다 먼저 그려서 뒤에 깔리게 한다(출력에도 포함되어야 하므로 no-print 아님)
          for (let j = 0; j < gBeats; j++) {
            const cs = styles[melIdx] && styles[melIdx][j];
            if (cs && cs.fill) {
              svg.appendChild(rect(x, gridTop + j * cell, cell, cell, 0, { fill: cs.fill, stroke: "none" }));
            }
          }
          // 비활성 파트 열의 시김새는 인스턴스 목록에 담지 않는다(수정 모드가 활성 파트
          // 원문 기준으로 토큰을 집으므로) — drawCell 안의 push가 이 빗장을 본다.
          ornCollect = isActiveCol;
          for (let j = 0; j < filled; j++) {
            const content = gakCells && gakCells[j] ? gakCells[j].text : "";
            if (content) drawCell(svg, x, gridTop + j * cell, cell, content, melIdx, j, pageIdx);
          }
          ornCollect = true;
          // 세로선·정간 구분 가로선 — 항상 전체 높이. 위/아래 마감은 밴드 통줄이, 대강선은 아래
          // 밴드 통줄과 같은 방식으로 각 사이 간격까지 끊기지 않게 따로 그린다(굵게, 밴드 전체 폭).
          // 총보에선 묶음 안 열 사이는 가는 선, 묶음의 양쪽 벽만 굵은 선 — '이 열들이 같은 각'
          // 으로 읽히게(사용자 확정). 파트보(P=1)는 양쪽 다 굵은 선 그대로.
          svg.appendChild(line(x, gridTop, x, gBottom, pi === P - 1 ? T_THICK : T_THIN));
          svg.appendChild(line(x + cell, gridTop, x + cell, gBottom, pi === 0 ? T_THICK : T_THIN));
          for (let i = 1; i < gBeats; i++) {
            if (gDg.has(i)) continue;          // 대강선은 아래에서 밴드 폭으로 따로(구조선이라 마스크 뒤에 다시 그림)
            const cy = gridTop + i * cell;
            svg.appendChild(line(x, cy, x + cell, cy, T_THIN));
            // 없애기의 세로 마스크가 이 줄의 반쪽을 갉는 자리면 구조선에 얹어 마스크 뒤에 다시 긋는다
            if (cellBoundaryNibbled(melIdx, i, styles)) structuralSegs.push([x, cy, x + cell, cy, T_THIN]);
          }
          // 정간 커스텀 테두리 — 선분만 모아두고 그리기는 밴드 루프가 끝난 뒤에(위 주석 참고)
          collectCellBorderSegs(cellBorderSegs, melIdx, x, gridTop, cell, gBeats, styles);

          // 각 번호(보조) — 각 아래 옅은 회색 작은 숫자 (문서 탭 옵션, '화면에만'이면 출력에서 제외)
          // 묶음에 하나(가운데) — 파트 열마다 달면 같은 번호가 P번 반복된다
          if (gakNumMode !== "none" && pi === 0) {
            const gnFont = cell * 0.26;
            const gn = el("text", { x: gakCx, y: gBottom + gnFont * 1.25,
              "text-anchor": "middle", "font-size": gnFont, fill: "#c9c9c9", "class": "gak-num" });
            gn.textContent = String(melIdx + 1);
            svg.appendChild(gn);
          }

          // 악기 이름 — 총보에서만, 밴드마다 맨 오른쪽 각 위에 한 번. 곡 머리(첫 페이지 첫
          // 밴드)는 파트의 온 이름, 그 다음 밴드부터는 약어(비워 두면 붙이지 않는다 — 피날레의
          // Full/Abbreviated Name 구분과 같다). 악보 내용이므로 인쇄·PNG에 포함(no-print 아님).
          if (scoreMode && m === 0) {
            const pp = partList[pi];
            const firstBand = pageIdx === 0 && b === 0;
            const lbl = firstBand ? partLabel(pp, pi) : (pp.abbr || "").trim();
            if (lbl) {
              const chars = Array.from(lbl);
              const lf = Math.min(cell * 0.3, (cell * 0.94) / Math.max(1, chars.length));
              // 머리단이 있으면 그 띠 안 가운데, 없으면 각 윗선 위에 살짝 띄워서
              const lyY = wantHeader ? (bandTop + headH / 2 + lf * 0.35) : (bandTop - lf * 0.45);
              const lt = el("text", { x: x + cell / 2, y: lyY, "text-anchor": "middle",
                "font-size": lf, "font-family": CJK, fill: "#333" });
              lt.textContent = lbl;
              svg.appendChild(lt);
            }
          }

          // 클릭·하이라이트 영역은 숨은 정간 포함 그 각의 정간 전부 (여전히 입력 가능)
          // — 활성 파트 열에만 단다(총보에서 남의 열을 누르는 라우팅은 다음 단계).
          if (isActiveCol) for (let j = 0; j < gBeats; j++) {
            const cyTop = gridTop + j * cell;
            (cellGeom[melIdx] = cellGeom[melIdx] || {})[j] = { page: pageIdx, x: x, y: cyTop, w: cell, h: cell };
            // 둘러보기가 '여기가 정간입니다'를 가리킬 수 있게 **첫 각(맨 오른쪽)만** 표시해 둔다.
            // 전부 표시하면 하이라이트가 격자 전체가 되어 어느 줄을 말하는지 되레 안 보인다.
            // 둘러보기 첫 장이 정간·대강·각을 짚는 표적. **각기 다른 각**에 둔다 —
            // 한 각에 포개 놓으면 큰 상자 안에 작은 상자가 들어가 어느 게 무엇인지 헷갈린다.
            // 각0=각 한 줄 · 각1=대강 한 묶음 · 각2=정간 한 칸.
            const tourCls = [
              melIdx === 0 ? "tour-lane-mel" : "",
              (melIdx === 1 && tourDg && j >= tourDg.from && j < tourDg.to) ? "tour-lane-dg" : "",
              (melIdx === 2 && j === 0) ? "tour-lane-cell" : ""
            ].filter(Boolean).join(" ") || null;
            const hit = rect(x, cyTop, cell, cell, 0,
              { fill: "transparent", stroke: "none", "pointer-events": "all", class: tourCls });
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
          // 총보에서 남의 파트 열을 누르면 그 파트로 갈아타고 누른 칸을 곧장 연다 —
          // 눌리는 곳이 곧 편집 대상(피날레와 같은 감각). 드래그 선택·시김새 추가 같은
          // 나머지 동작은 갈아탄 다음부터 활성 열에서 그대로 된다.
          else if (scoreMode) for (let j = 0; j < gBeats; j++) {
            const hit = rect(x, gridTop + j * cell, cell, cell, 0,
              { fill: "transparent", stroke: "none", "pointer-events": "all", class: "no-print" });
            hit.style.cursor = "text";
            (function (pIdx, gi, ci) {
              hit.addEventListener("mousedown", function (e) {
                e.preventDefault();
                if (ornEditMode) { ornSel = null; hideOrnPanel(); render(); return; }
                switchPart(pIdx);   // stash→전환→render까지 — 좌표가 새로 잡힌 뒤에 연다
                if (inputMode === "editor") CELL_EDIT.mel.setCursor(gi, ci, true);
                else openCellEditor("mel", gi, ci);
              });
            })(pi, melIdx, j);
            svg.appendChild(hit);
          }

          // 템포 표기(一分・N井) — 각/장 라벨과 같은 규칙(맨 아래 글자 기준으로 위로 자람)이지만
          // **크기·자간 모두 제 것(tempoSize·tempoSpacing)**을 쓴다: 각/장 이름은 여러 개를 머리줄
          // 값으로 한꺼번에 맞추는 반면 템포는 곡에 하나뿐이라 따로 조절한다(각/장 창의 템포 항목).
          // 장단이 있으면 장단 칸 위에서 그리므로 여기(첫 각 위)는 장단이 없을 때만.
          function drawTempoLabel(cx, topY) {
            const chars = Array.from(tempoStr);
            const mul = tempoMul;
            const gap = tempoGap;   // 위 예약(tempoH)과 같은 값 — 어긋나면 잘리거나 뜬다
            const avail = (b === 0 ? Math.max(2, topY - 1) : Math.max(2, bandGap * 0.9)) - gap;
            const nGaps = chars.length - 1;
            const perF = 0.85 + 1.12 * nGaps;               // f에 비례하는 몫(자간 0일 때 총 높이)
            const f = Math.min(cell * 0.38 * mul, Math.max(1, avail) / perF);
            // 자간(#tempoSpacing)은 글자 크기와 무관한 고정 mm라, 글자를 놓고 **남는 높이까지만**
            // 벌어진다. 안 막으면 표기가 각 위 여백을 넘어 종이 밖으로 올라가 잘린다(높이 예약
            // tempoH는 밴드 사이 간격을 나눌 때만 쓰여 여기를 지켜주지 못한다).
            // 좁히는 쪽(음수)은 넘칠 일이 없으니 그대로 통과시킨다.
            const spMax = nGaps > 0 ? Math.max(0, (avail - perF * f) / nGaps) : 0;
            const sp = Math.min(tempoSpacing, spMax);
            const lineH = f * 1.12 + sp;                     // verticalText의 한 글자 자리와 같은 셈
            const startY = topY - gap + f * 0.06 - nGaps * lineH;
            // 좌우 오프셋(숨은 #tempoOffX, mm) — 드래그가 써 주는 값. 상하는 숨은 #tempoGap이
            // 담당(높이 예약과 한 값이라야 잘리지 않으므로 별도 dy를 두지 않는다).
            const tOffX = (parseFloat($("tempoOffX") && $("tempoOffX").value) || 0) * scale;
            const tG = verticalText(cx + tOffX, startY, tempoStr, f, 400, "#000", NOTE_FONT, sp).g;
            const tHolder = el("g", {});
            tHolder.appendChild(tG);
            svg.appendChild(tHolder);
            gnRaiseEls.push(tHolder);   // 클릭존들이 다 그려진 뒤 맨 위로
            // 상자는 좌표로 계산 — 이 시점엔 svg가 DOM에 없어 getBBox가 0을 돌려준다(각 이름과 동일)
            const tHl = rect(cx + tOffX - f * 0.68, startY - f * 0.95,
              f * 1.36, nGaps * lineH + f * 1.2,
              gakWinOpen ? 0.2 : 0,
              { fill: gakWinOpen ? "rgba(138,109,59,.08)" : "transparent",
                stroke: gakWinOpen ? "#8a6d3b" : "none", "stroke-dasharray": "1.4,1.1",
                "pointer-events": "all", class: "no-print" });
            tHl.style.cursor = "move";
            tHolder.appendChild(tHl);
            attachLabelDrag(tHolder, svg, function (dx, dy) {
              const ox = $("tempoOffX");
              if (ox) ox.value = Math.round(((parseFloat(ox.value) || 0) + dx / scale) * 10) / 10;
              // 위로 끌면(dy<0) 간격이 는다 — 간격은 '각 윗선에서 위로'라 부호를 뒤집는다
              const g0 = parseFloat($("tempoGap").value) || 0;
              $("tempoGap").value = Math.max(0, Math.round((g0 - dy / scale) * 10) / 10);
              render();
            });
          }
          if (wantTempo && pageIdx === 0 && melIdx === 0 && !wantJangdan && pi === 0) {
            drawTempoLabel(x + cell / 2, bandTop);
          }

          // 각 이름(대여음·一章 등) — 그 각 위 여백에 세로쓰기. 첫 각의 템포 표시와
          // 겹칠 수 있는 유일한 자리(첫 각)에서만 왼쪽으로 반 칸 비킨다.
          // 이름은 각(묶음)의 것이라 파트 열마다가 아니라 묶음에 한 번(가운데).
          if (pi === 0) {
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
              const gnX = gakCx
                - ((wantTempo && pageIdx === 0 && melIdx === 0 && !wantJangdan) ? cell * 0.75 : 0);
              // 마지막 글자 기준선 — 한자·한글 잉크가 기준선 위에서 끝나는 몫(≈0.06)을
              // 보태 간격 0mm이면 잉크 밑이 각 위쪽 선에 딱 닿는다
              const gnStartY = gnTop - gnGap + gnFont * 0.06 - (gnChars.length - 1) * gnLineH;
              // 드래그 오프셋(mm) — 章 창 하이라이트 상태에서 끌어 조절한 값
              const gnOff = gakNameOffs[melIdx] || {};
              const gnDrawX = gnX + (gnOff.dx || 0) * scale;
              const gnDrawY = gnStartY + (gnOff.dy || 0) * scale;
              const gnG = verticalText(gnDrawX, gnDrawY, disp, gnFont, 400, "#000", titleFontFam).g;
              const gnHolder = el("g", {});
              gnHolder.appendChild(gnG);
              svg.appendChild(gnHolder);
              gnRaiseEls.push(gnHolder);   // 클릭존들이 다 그려진 뒤 맨 위로
              // 하이라이트(章 창 열림) + 드래그 히트 — 창이 닫혀 있어도 투명 히트는 남겨
              // 이름 글자를 끌면 언제든 옮겨진다(클릭(무이동)은 기존처럼 이름 카드).
              // 상자는 getBBox가 아니라 좌표로 계산 — 이 시점엔 svg가 아직 DOM에 안 붙어
              // getBBox가 0을 돌려준다(세로쓰기: 첫 글자 기준선 gnDrawY, 폭 ≈ 글자 크기).
              const gnHl = rect(gnDrawX - gnFont * 0.68, gnDrawY - gnFont * 0.95,
                gnFont * 1.36, (gnChars.length - 1) * gnLineH + gnFont * 1.2,
                gakWinOpen ? 0.2 : 0,
                { fill: gakWinOpen ? "rgba(138,109,59,.08)" : "transparent",
                  stroke: gakWinOpen ? "#8a6d3b" : "none", "stroke-dasharray": "1.4,1.1",
                  "pointer-events": "all", class: "no-print" });
              gnHl.style.cursor = "move";
              gnHolder.appendChild(gnHl);
              (function (gi, pg, cxv, topv) {
                attachLabelDrag(gnHolder, svg, function (dx, dy) {
                  const o = gakNameOffs[gi] || (gakNameOffs[gi] = {});
                  o.dx = Math.round(((o.dx || 0) + dx / scale) * 10) / 10;
                  o.dy = Math.round(((o.dy || 0) + dy / scale) * 10) / 10;
                  render();
                }, function () { openGakNameCard(gi, pg, cxv, topv); });
              })(melIdx, pageIdx, gakCx, gnTop - cell * 1.4);
            }
            // 각 위 클릭 영역(투명) — 누르면 그 자리에서 이름 입력 카드가 열린다.
            // **章 창이 열려 있을 때만** 둔다: 각 위 빈 자리는 cell*1.4나 되는 넓은 띠라,
            // 늘 살아 있으면 제목 근처나 위쪽 여백을 누를 때마다 이름 카드가 불쑥 열린다.
            // (이름 글자 자체를 끌거나 누르는 길은 창과 무관하게 그대로 — 위 gnHl 참고.
            //  하이라이트·드래그가 章 창 열림에만 반응하는 규칙과 이제 결이 같다.)
            if (gakWinOpen) {
            const gnZoneH = cell * 1.4;
            // 클릭존은 묶음 전체 폭 — 총보에서도 각 위 아무 데나 눌러 이름을 달 수 있게
            const gnHit = rect(gakLeft, gnTop - gnZoneH, gakW, gnZoneH, 0,
              { fill: "transparent", stroke: "none", "pointer-events": "all" });
            gnHit.style.cursor = "text";
            (function (gi, cxv, topv, pg) {
              gnHit.addEventListener("mousedown", function (e) {
                e.preventDefault();
                if (cellEditInput) commitCellEditor(false);
                openGakNameCard(gi, pg, cxv, topv);
              });
            })(melIdx, gakCx, gnTop - gnZoneH, pageIdx);
            svg.appendChild(gnHit);
            }
          }

          // 장단 줄(악곡 맨 처음 자리, 가장 오른쪽) — 켜져 있고, 악곡 맨 처음 각일 때만.
          // 곡에 한 줄뿐이라 파트 루프에선 한 번만(pi===0) 그린다.
          if (wantJangdan && melIdx === 0 && pi === 0) {
            // 장단은 **곡의 장단**이라 표준 정간 수를 쓴다 — 첫 각이 짧아도(가곡 5정간) 장단
            // 줄은 온전한 한 각이다. 아래 셈이 각별 값 대신 이 값을 보도록 여기서 가린다.
            const gBeats = defBeats(), gBottom = gridTop + gBeats * cell, gDg = dgSetFor(gBeats);
            // 장단 자리는 한 각(묶음) 자리 폭 — 장단 칸은 그 자리의 맨 왼쪽(각들의 선 끝)에 맞춘다
            const jdRight = musicRightEdge - (gakW - cell), jdLeft = jdRight - jdW;
            // 템포 표기 — 장단이 있으면 첫 각 대신 장단 칸 위에(같은 각/장 규칙)
            if (wantTempo && pageIdx === 0) drawTempoLabel((jdLeft + jdRight) / 2, bandTop);
            // 어느 칸이 장단인지 알려주는 회색 '장단' 라벨 — 각 번호와 한 세트:
            // 같은 자리(각 아래)·같은 회색·같은 표시 설정(각 번호를 끄면 같이 꺼지고,
            // '화면에만'이면 gak-num 클래스로 인쇄·PNG에서도 각 번호와 같이 빠진다)
            if (gakNumMode !== "none") {
              const jdLabelFont = cell * 0.26;
              const jdLabel = el("text", { x: (jdLeft + jdRight) / 2, y: gBottom + jdLabelFont * 1.25,
                "text-anchor": "middle", "font-size": jdLabelFont, "font-family": CJK,
                fill: "#c9c9c9", "class": "gak-num" });
              jdLabel.textContent = "장단";
              svg.appendChild(jdLabel);
            }
            // 장단 에디터 커서 하이라이트용 칸 좌표 (내용 유무와 무관하게 전체 박)
            for (let j = 0; j < gBeats; j++) {
              jdGeom[j] = { page: pageIdx, x: jdLeft, y: gridTop + j * cell, w: jdW, h: cell };
            }
            const jdCells = jdParsed && jdParsed[0];
            const jdCount = jdCells ? jdCells.length : 0;
            const jdFilled = jdCount > 0 ? Math.min(gBeats, jdCount) : 0;
            for (let j = 0; j < jdFilled; j++) {
              const content = jdCells[j] ? jdCells[j].text : "";
              if (content) drawJangdanCell(svg, jdLeft, gridTop + j * cell, jdW, cell, content);
            }
            // 클릭 영역 — 글자 그림(image) 위로 올려야(뒤에 appendChild) 그 위를 클릭해도 먹힌다
            for (let j = 0; j < gBeats; j++) {
              const jdHit = rect(jdLeft, gridTop + j * cell, jdW, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all",
                  class: "tour-lane-jd" });   // 장단은 곡에 한 줄뿐이라 전부 표적
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
            svg.appendChild(line(jdLeft, gridTop, jdLeft, gBottom, jdLineW));
            svg.appendChild(line(jdRight, gridTop, jdRight, gBottom, jdLineW));
            svg.appendChild(line(jdLeft, gridTop, jdRight, gridTop, jdLineW));
            svg.appendChild(line(jdLeft, gBottom, jdRight, gBottom, jdLineW));
            // 다른 정간과 똑같이 박(정간) 구분선을 그림(대강은 굵게)
            for (let i = 1; i < gBeats; i++) {
              svg.appendChild(line(jdLeft, gridTop + i * cell, jdRight, gridTop + i * cell,
                gDg.has(i) ? T_DAEGANG : T_THIN));
            }
          }

          // 가사(선율 오른쪽) — 곁줄이 켜진 파트마다, 제 정간 열 오른쪽에. 별도 테두리 없이 글자만 놓음
          if (lyOnP) {
            const lyLeft = x + cell + lyGap;
            const lyCells = lyParsedBy[pi] && lyParsedBy[pi][melIdx];
            const lyCount = lyCells ? lyCells.length : 0;
            const lyFilled = lyCount > 0 ? Math.min(gBeats, lyCount) : 0;
            for (let j = 0; j < lyFilled; j++) {
              const content = lyCells[j] ? lyCells[j].text : "";
              // 옆 정간의 율명 내용을 같이 넘겨 분박 행 위치에 가사를 나란히 앉힌다
              const melTxt = gakCells && gakCells[j] ? gakCells[j].text : "";
              if (content) drawLyricCell(svg, lyLeft, gridTop + j * cell, lyW, cell, content, lyricsFontFam, melTxt);
            }
            // 클릭 영역 — 숨은 정간 포함 그 각의 정간 전부, 글자 위로 올려야 그 위를 클릭해도 먹힌다.
            // 활성 파트의 곁줄에만(총보에서 남의 곁줄 편집 라우팅은 다음 단계).
            if (isActiveCol) for (let j = 0; j < gBeats; j++) {
              const lyHit = rect(lyLeft, gridTop + j * cell, lyW, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all",
                  class: melIdx === 0 ? "tour-lane-ly" : null });
              lyHit.style.cursor = "text";
              (function (gi, ci) {
                // 가사는 더블클릭으로만 편집 — 정간 드래그 선택과 헷갈리지 않게
                lyHit.addEventListener("mousedown", function (e) { e.preventDefault(); });
                lyHit.addEventListener("dblclick", function (e) {
                  e.preventDefault();
                  // 시김새 수정 모드였다면 끄고 **편집을 이어서 연다**. 선율·장단 칸은 한 번
                  // 누르는 것이 곧 '고른 걸 놓기'라 그 자리에서 멈추는 게 맞지만, 곁줄은
                  // 더블클릭이라야 열리므로 '여기에 글자를 넣겠다'는 뜻 말고 될 수가 없다.
                  // 예전엔 여기서도 멈춰서 아무 반응이 없었고, 모드를 켜둔 걸 잊은 사람에겐
                  // 곁줄이 고장 난 것처럼 보였다(도구창·탭을 바꿀 때 모드가 꺼지는 것과 같은 규칙).
                  exitOrnEditMode();
                  if (cellEditInput) commitCellEditor(false);
                  if (inputMode === "editor") CELL_EDIT.ly.setCursor(gi, ci, true);
                  else openCellEditor("ly", gi, ci);
                });
              })(melIdx, j);
              svg.appendChild(lyHit);
            }
            // 총보에서 남의 파트 곁줄 — 더블클릭하면 그 파트로 갈아타고 그 칸을 연다
            // (곁줄은 원래 더블클릭 편집이라 규칙이 같다)
            else if (scoreMode) for (let j = 0; j < gBeats; j++) {
              const lyHit = rect(lyLeft, gridTop + j * cell, lyW, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all", class: "no-print" });
              lyHit.style.cursor = "text";
              (function (pIdx, gi, ci) {
                lyHit.addEventListener("mousedown", function (e) { e.preventDefault(); });
                lyHit.addEventListener("dblclick", function (e) {
                  e.preventDefault();
                  exitOrnEditMode();
                  switchPart(pIdx);
                  if (inputMode === "editor") CELL_EDIT.ly.setCursor(gi, ci, true);
                  else openCellEditor("ly", gi, ci);
                });
              })(pi, melIdx, j);
              svg.appendChild(lyHit);
            }
          } else if (!scoreMode) {
            // (총보에선 이 진입로를 두지 않는다 — 곁줄 없는 열 오른쪽엔 곧바로 옆 파트 열이
            //  붙어 있어 빈 틈 자체가 없다. 곁줄은 그 파트를 활성으로 두고 리본에서 켠다.)
            // 곁줄이 아직 없을 때(내용도 없고 창도 닫힘) — 정간 오른쪽 틈에 '여기가 곁줄 자리'
            // 라는 진입로를 둔다. 정간은 격자가 늘 그려져 있어 아무 데나 눌러도 열리는데
            // 곁줄만 없으면 누를 데조차 없어서, 처음 쓰는 사람은 곁줄을 리본에서 켜야 한다는
            // 걸 알아낼 방법이 없었다(정간은 되는데 곁줄은 안 된다는 비대칭).
            // 더블클릭으로만 반응한다 — 정간 드래그 선택이 이 틈을 지날 때 걸리지 않게.
            for (let j = 0; j < gBeats; j++) {
              const lyOpen = rect(x + cell, gridTop + j * cell, gap, cell, 0,
                { fill: "transparent", stroke: "none", "pointer-events": "all",
                  class: "no-print" + (melIdx === 0 ? " tour-lane-ly" : "") });
              lyOpen.style.cursor = "text";
              (function (gi, ci) {
                lyOpen.addEventListener("mousedown", function (e) { e.preventDefault(); });
                lyOpen.addEventListener("dblclick", function (e) {
                  e.preventDefault();
                  exitOrnEditMode();
                  if (cellEditInput) commitCellEditor(false);
                  // 곁줄을 켜는 길은 모드마다 다르다(lyricsWinOpen이 둘 다 본다):
                  // 에디터는 레일 탭의 .active, 직접 입력은 뜬 창의 .win-open.
                  // 에디터에선 setCursor(focusTa=true)가 레일 탭을 눌러 주므로 그것만으로 켜진다.
                  // 어느 쪽이든 켜지는 순간 빈 곁줄이 생기고 각 폭이 다시 잡히며(render 포함)
                  // 좌표가 통째로 바뀌므로, 칸을 여는 건 **그 뒤**여야 한다.
                  if (inputMode === "editor") CELL_EDIT.ly.setCursor(gi, ci, true);
                  else { activateDirectPanel("lyricsArea"); openCellEditor("ly", gi, ci); }
                });
              })(melIdx, j);
              svg.appendChild(lyOpen);
            }
          }
          }   // 파트 열 루프(pi) 끝
        }
        gakAccum += nMusic;

        // 밴드 위/아래 통줄 (전체 폭 — 각 사이 간격까지 끊기지 않게 한 줄로).
        // 위 통줄은 각이 다 같은 자리에서 시작하므로 늘 한 줄이고, **아래 통줄만** 각 길이가
        // 섞인 밴드에서 각별로 끊어 긋는다(각마다 아래끝이 다르므로). 길이가 같으면 예전 그대로.
        svg.appendChild(line(capLeft, gridTop, capRight, gridTop, T_THICK));
        structuralSegs.push([capLeft, gridTop, capRight, gridTop, T_THICK]);
        if (bandUniform) {
          svg.appendChild(line(capLeft, gridBottom, capRight, gridBottom, T_THICK));
          structuralSegs.push([capLeft, gridBottom, capRight, gridBottom, T_THICK]);
        } else {
          for (let m = 0; m < nMusic; m++) {
            const gi = gakAccum - nMusic + m;   // gakAccum은 위에서 이미 nMusic만큼 늘었다
            const gRight = musicRightEdge - m * slot - bandJdExtra;
            const yb = gridTop + beatsAt(gi) * cell;
            svg.appendChild(line(gRight - gakW, yb, gRight, yb, T_THICK));
            structuralSegs.push([gRight - gakW, yb, gRight, yb, T_THICK]);
          }
          if (bandJdExtra) {   // 장단 칸은 제 높이(표준 각)로 따로 마감
            const jdR = musicRightEdge - (gakW - cell), yb = gridTop + defBeats() * cell;
            svg.appendChild(line(jdR - jdW, yb, jdR, yb, T_THICK));
            structuralSegs.push([jdR - jdW, yb, jdR, yb, T_THICK]);
          }
        }
        // 맨 오른쪽이 내용 있는 가사 열이면, 통줄이 그 자리까지 덮으므로 오른쪽 끝을 세로선으로 마감.
        // 제목이 있는 페이지는 통줄이 제목 칸 세로선까지 이어져 그 선이 마감을 겸하므로 긋지 않는다.
        if (closeLyricCol && !page.hasTitle) {
          svg.appendChild(line(musicRightEdge, gridTop, musicRightEdge, gridBottom, T_THICK));
        }

        // 대강선 — 각마다 끊어 그리지 않고, 통줄처럼 밴드 폭 전체(제목 칸 앞까지)로 한 번에 그림
        const daegangRight = Math.min(capBase, musicRightEdge);
        if (bandUniform) {
          dgSetFor(bandBeats).forEach(function (i) {
            svg.appendChild(line(musicLeft, gridTop + i * cell, daegangRight, gridTop + i * cell, T_DAEGANG));
            structuralSegs.push([musicLeft, gridTop + i * cell, daegangRight, gridTop + i * cell, T_DAEGANG]);
          });
        } else {
          // 길이가 섞인 밴드 — 대강도 각마다 다르므로 각 폭에서 끊어 긋는다
          for (let m = 0; m < nMusic; m++) {
            const gi = gakAccum - nMusic + m;
            const gRight = Math.min(musicRightEdge - m * slot - bandJdExtra, daegangRight);
            dgSetFor(beatsAt(gi)).forEach(function (i) {
              const y = gridTop + i * cell;
              svg.appendChild(line(gRight - gakW, y, gRight, y, T_DAEGANG));
              structuralSegs.push([gRight - gakW, y, gRight, y, T_DAEGANG]);
            });
          }
          if (bandJdExtra) {
            const jdR = musicRightEdge - (gakW - cell);
            dgSetFor(defBeats()).forEach(function (i) {
              const y = gridTop + i * cell;
              svg.appendChild(line(jdR - jdW, y, jdR, y, T_DAEGANG));
              structuralSegs.push([jdR - jdW, y, jdR, y, T_DAEGANG]);
            });
          }
        }
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
            const t = gridY + bandTops[b] + headH;
            svg.appendChild(line(panelX, t, panelX, t + bandBeatsOf(page, b) * cell, T_THICK));
          }
        }
        const pBottom = wantFrame ? boxBottom : gridY + bandTops[usedBands - 1] + bandHs[usedBands - 1];
        const cx = (panelX + panelRight) / 2;
        const panelW = panelRight - panelX;
        // '//'로 여러 세로줄이면 줄 묶음 전체가 제목 칸 폭에 들어가게 글자를 줄인다
        const titleCols = Math.max(1, titleParts.length);
        const titleFont = Math.min(desiredTitle * scale,
          titleCols > 1 ? panelW * 0.92 / (1.18 * titleCols) : panelW * 0.78);
        const startY = gridY + headH + titleFont * 1.05 + desiredTitleOff * scale;
        const tt = verticalTextML(cx + desiredTitleOffX * scale, startY, titleTxt, titleFont, 700, "#000", titleFontFam, desiredTitleSpacing * scale);
        const ttHolder = el("g", {});
        ttHolder.appendChild(tt.g);
        svg.appendChild(ttHolder);   // getBBox엔 DOM에 붙어 있어야 함
        attachTitleDrag(ttHolder, tt.g, titleFont * 0.28, svg, scale, "titleOffset", "titleOffsetX", textWinOpen);
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
            const stHolder = el("g", {});
            stHolder.appendChild(st.g);
            svg.appendChild(stHolder);
            attachTitleDrag(stHolder, st.g, subFont * 0.28, svg, scale, "subOffset", "subOffsetX", textWinOpen);
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
        const thHolder = el("g", {});
        titleParts.forEach(function (ln, i) {
          const t = el("text", { x: cx + desiredTitleOffX * scale, y: titleBase + i * titleLineH,
            "text-anchor": "middle", "font-size": titleTopFont, "font-family": titleFontFam,
            "font-weight": 700, fill: "#000", "letter-spacing": desiredTitleSpacing * scale });
          t.textContent = ln;
          thHolder.appendChild(t);
        });
        svg.appendChild(thHolder);
        attachTitleDrag(thHolder, thHolder, titleTopFont * 0.28, svg, scale, "titleOffset", "titleOffsetX", textWinOpen);
        if (subParts.length) {
          // 부제 기준점은 '상황에 맞게' — 제목이 아래(부제 쪽)로 내려오면 겹치지 않게
          // 따라 밀리고, 위로 올라가면 따라가지 않는다(부제 상하는 부제만 움직임).
          const titleLastY = titleBase + (Math.max(1, titleParts.length) - 1) * titleLineH;
          const subFirstY = titleLastY - Math.min(desiredTitleOff * scale, 0)
            + titleTopSubFont * 1.45 + desiredSubOff * scale;
          const shHolder = el("g", {});
          subParts.forEach(function (ln, i) {
            const st = el("text", { x: cx + desiredSubOffX * scale, y: subFirstY + i * subLineH,
              "text-anchor": "middle", "font-size": titleTopSubFont, "font-family": titleFontFam,
              "font-weight": 400, fill: "#333", "letter-spacing": desiredSubSpacing * scale });
            st.textContent = ln;
            shHolder.appendChild(st);
          });
          svg.appendChild(shHolder);
          attachTitleDrag(shHolder, shHolder, titleTopSubFont * 0.28, svg, scale, "subOffset", "subOffsetX", textWinOpen);
        }
      }

      // 각/장 이름·빠르기 홀더를 클릭존 위로 — appendChild는 이미 붙은 노드를 맨 뒤(=맨 위)로
      // 옮긴다. 자유 텍스트보다는 아래(자유 텍스트가 늘 잡히게 그 전에 올린다).
      gnRaiseEls.forEach(function (n) { svg.appendChild(n); });
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
          // 텍스트 창이 열려 있을 때만 하이라이트·드래그·선택 활성(章과 같은 규칙). 닫혀 있으면 정적 표시.
          if (textWinOpen) {
            const bb = vt.g.getBBox();
            const pad = t.size * 0.28;
            const selected = textSel === t.id;
            // 평소엔 章과 같은 갈색 점선, 고른 것(패널 열림)은 빨간색으로 더 또렷하게. 둘 다 no-print.
            const hit = rect(bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2, selected ? 0.3 : 0.2,
              { fill: selected ? "rgba(192,57,43,.08)" : "rgba(138,109,59,.08)",
                stroke: selected ? "#c0392b" : "#8a6d3b", "stroke-dasharray": "1.4,1.1",
                "pointer-events": "all", class: "no-print" });
            hit.classList.add("hit-fit"); hit.dataset.pad = pad;
            hit.style.cursor = "move";
            holder.appendChild(hit);
            attachTextDrag(holder, t, svg);
          }
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
    // 이제 SVG가 DOM에 있으니 제목·부제·자유텍스트 하이라이트/드래그 상자를 실제 글자에 맞춘다
    fitDragHits(sheet);

    // 시김새 수정 모드: 조절 가능한 시김새마다 옅은 네모(어떤 게 클릭되는지 미리 보이게) +
    // 고른 것만 진한 빨강 네모로 강조 + 클릭 히트(내용 위에 얹음)
    // 상자는 편집을 돕는 표시일 뿐이라 둘 다 no-print — 이게 없으면 수정 모드를 켠 채
    // 인쇄하거나 PNG로 저장할 때 빨간 네모가 악보에 같이 찍힌다(모드는 출력 때 안 꺼진다).
    if (ornEditMode) {
      ornInstances.forEach(function (o) {
        const svg = pageSvgs[o.page]; if (!svg) return;
        const selected = ornSel && ornSel.gak === o.gak && ornSel.cell === o.cell && ornSel.k === o.k;
        svg.appendChild(rect(o.x - 0.6, o.y - 0.6, o.w + 1.2, o.h + 1.2, 0.4,
          selected
            ? { fill: "none", stroke: "#c0392b", class: "no-print" }
            : { fill: "none", stroke: "#c0392b", "stroke-opacity": "0.32",
                "stroke-dasharray": "1.1,0.9", class: "no-print" }));
        const hit = rect(o.x - 0.6, o.y - 0.6, o.w + 1.2, o.h + 1.2, 0,
          { fill: "transparent", stroke: "none", "pointer-events": "all", class: "no-print" });
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
        `⚠ 선율(${parsed.length}각)과 곁줄(${lyParsed.length}각)의 각 수가 달라요 — 구조를 바꾸면(각 추가/삭제 등) 넘치는 내용이 잘릴 수 있습니다.`;
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
    // 문구는 건조하게 — '이 설정이면 ~ 그립니다' 같은 말 붙임 없이 값만.
    $("readout").innerHTML =
      `페이지 <b>${pages.length}장</b> · 정간 한 칸 <b>${cell.toFixed(1)}mm</b>` +
      (scale < 0.999 ? ` · <span style="color:#8a6d3b">종이에 맞춰 <b>${Math.round(scale * 100)}%</b> 축소</span>` : "") +
      (dg.ok ? "" : `<div class="warn">⚠ 대강 분절의 합이 한 각의 정간 수(${beats})와 달라 적용하지 않았습니다.</div>`) +
      (lyGakMismatch ? `<div class="warn">⚠ 선율(${parsed.length}각)과 가사(${lyParsed.length}각)의 각 수가 달라요 — 구조를 바꾸면(각 추가/삭제 등) 넘치는 내용이 잘릴 수 있습니다.</div>` : "") +
      (jdBeatMismatch ? `<div class="warn">⚠ 장단의 정간 수(${jdParsed[0].length})가 선율(${beats})과 달라요 — 구조를 바꾸면 넘치는 내용이 잘릴 수 있습니다.</div>` : "");

    // 오선보 칸이 열려 있으면 뒤따라 다시 그린다(닫혀 있으면 아무 일도 안 한다).
    // 여기서 바로 그리지 않는 건 render()가 글자 한 자에도 불리기 때문 — '오선보 보기' 절 참고.
    scheduleStaff();
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

  // ---------- 시김새 소리내기 (음계 사다리) ----------
  // 시김새의 '니'는 반음 위가 아니라 **그 곡 음계의 바로 윗음**이다. 그래서 시김새를 소리로
  // 내려면 음높이를 옮기기 전에 곡의 음계부터 정해야 한다. 무엇을 몇 칸 옮기나는 기호 사전이
  // 쥐고 있고(js/symbols-registry.js의 snd, 머리말에 형식 설명), 여기는 '한 칸'을 세는 자리다.
  const SYM_SND = SYM_REG.sound;

  // 곡의 음계 다섯 음. 조 프리셋(#joPreset)이 정해져 있으면 그 말을 믿고, '12율 전체'(기본값)
  // 이면 악보에 많이 나온 율명 다섯을 세어 정한다. 조 칸은 본래 팔레트를 추리는 자리지만
  // 이 앱에서 악조를 적어 두는 곳이 거기 하나뿐이라, 적혀 있으면 그게 곧 이 곡의 음계다.
  // 율명이 넷도 안 되는 악보(빈 악보·쓰다 만 악보)는 셀 것이 없어 황종 평조로 둔다.
  // 조(음계) 판단 — 조 프리셋이 정해져 있으면 그것, '12율 전체'(기본)면 **곡이 어느 조인지
  // 먼저 판단한다**(2026-08-14 사용자 확정). 예전엔 많이 나온 율명 다섯을 그냥 뽑았는데,
  // 시김새가 스치는 이웃 음이 순위에 끼면 어느 조도 아닌 음계가 나와 '한음 위'가 어긋났다.
  // 판단: 평조 꼴(궁에서 0·2·5·7·9 반음)을 12율 어디에나 앉혀 본 12벌 가운데 **곡의 음을
  // 가장 많이 담는** 것을 고른다. 계면조(0·3·5·7·10)는 따로 안 훑는다 — 같은 5음 집합을
  // 다른 궁에서 부른 이름이라(황종 계면조 = 무역 평조의 집합) 12벌이 이미 다 덮고,
  // 시김새 '한음 위'가 보는 것은 이름이 아니라 집합이다. 황종평조·황종계면조·중려평조도
  // 전부 이 12벌 안에 있다.
  function scaleNotes() {
    const jo = JO_PRESETS[$("joPreset").value];
    if (jo) return jo.notes;
    const PYEONG = [0, 2, 5, 7, 9];
    const cnt = new Array(12).fill(0);
    let total = 0, distinct = 0;
    parseMelodyOffsets(melodyFull).forEach(function (gak) {
      gak.forEach(function (cell) {
        cell.text.split(/\s+/).forEach(function (row) {
          tokenizeNotes(row).forEach(function (tk) {
            if (!tk.base) return;
            const i = SCALE.indexOf(tk.base);
            if (i < 0) return;
            if (!cnt[i]) distinct++;
            cnt[i]++; total++;
          });
        });
      });
    });
    // 셀 것이 너무 적으면 황종 평조로 둔다(예전 규칙 그대로)
    if (total < 4 || distinct < 4) return JO_PRESETS["hwang-pyeong"].notes;
    let best = null;
    for (let r = 0; r < 12; r++) {
      let inn = 0, cover = 0;
      PYEONG.forEach(function (p) {
        const c = cnt[(r + p) % 12];
        inn += c;
        if (c) cover++;
      });
      // 담는 음 수가 같으면 곡에 실제로 나온 음계음이 많은 쪽(cover) — 빈 자리로 이긴
      // 조는 곡과 덜 닮은 것이다
      const score = inn * 100 + cover;
      if (!best || score > best.score) best = { score: score, root: r };
    }
    return PYEONG.map(function (p) { return SCALE[(best.root + p) % 12]; });
  }

  // 음계 사다리. 절대 음높이가 나오려면 황의 음고를 알아야 하므로 재생할 때 만든다.
  function makeScale(hwangMidi) {
    const pcs = {};
    scaleNotes().forEach(function (n) {
      const i = SCALE.indexOf(n);
      if (i >= 0) pcs[((i % 12) + 12) % 12] = true;
    });
    function inScale(midi) { return !!pcs[(((midi - hwangMidi) % 12) + 12) % 12]; }
    // n칸 위(양수)·아래(음수)로 옮긴 음. 음계에 없는 음(예외음)에서 떠날 땐 그 방향의 첫
    // 음계음까지가 한 칸이다 — 그래야 한 칸이 어디서 출발하든 늘 '바로 다음 음'이 된다.
    function step(midi, n) {
      if (!n) return midi;
      const dir = n > 0 ? 1 : -1;
      let cur = midi;
      for (let left = Math.abs(n); left > 0; left--) {
        for (let g = 0; g < 12; g++) { cur += dir; if (inScale(cur)) break; }
      }
      return cur;
    }
    // 사전의 snd 값 하나 → 절대 음높이. 정수면 음계 칸수, 문자열이면 율명 그대로
    // (싸랭·슬기둥의 개방현처럼 음계와 무관하게 정해진 음).
    function pitch(ref, d) {
      if (typeof d === "string") {
        const tk = tokenizeNotes(d)[0];
        return (tk && tk.base) ? hwangMidi + SCALE.indexOf(tk.base) + tk.oct * 12 : ref;
      }
      return step(ref, d);
    }
    return { step: step, pitch: pitch };
  }

  // 악보를 '자리(slot)' 목록으로 푼다. 자리 하나 = 정간 안에서 고르게 나뉜 한 칸이고,
  // 거기서 무엇이 울리는지가 다 들어 있다. 재생(초 단위 사인파)과 오선보 내보내기(박 단위
  // 음표)가 이 함수 하나를 나눠 쓴다 — 같은 셈을 두 벌 적으면 소리와 악보가 어긋난다.
  //   { gak, cell, beat, dur, kind, seq, pre, post }
  //   beat·dur  정간 하나를 1로 센 시작 시각·길이
  //   kind      "note" 새 소리 · "rest" 쉼표 · "hold" 앞 음을 잇는다(새로 시작하지 않음)
  //   seq       이 자리를 고르게 나눠 채울 음높이(midi)들 — kind가 "note"일 때만
  //   pre·post  본음 앞뒤를 스치는 꾸밈음(midi). 제 길이가 따로 없어 자리에서 떼어 쓴다.
  // opts.plain — **시김새를 빼고 적힌 율명만** 푼다(재생 설정의 '시김새대로 연주' 끔).
  // 가락의 뼈대만 듣고 싶을 때가 있어서 둔 길이고, 기본은 늘 켬(시김새대로)이다.
  // **재생만 이 옵션을 준다** — 오선보·MusicXML은 늘 시김새를 그리므로 안 준다.
  function realizeMelody(hwangMidi, melodyText, opts) {
    const plain = !!(opts && opts.plain);
    const sc = makeScale(hwangMidi);
    // melodyText를 주면 그 선율을(합주에서 파트마다), 안 주면 활성 파트 작업 사본을 푼다
    const gaks = parseMelodyOffsets(melodyText != null ? melodyText : melodyFull);
    const slots = [];
    let beat = 0;
    // 독립 시김새(제 음높이가 없는 노·니·느나…)가 기준 삼을 마지막 실음. 꾸밈음이 아니라
    // 본음이 들어간다 — 니레의 스치는 음이 다음 '노'의 기준이 되면 가락이 밀린다.
    let prevMidi = null;
    // 마지막 실음이 난 각 — **지속은 제 각 안에서만**이라 이걸로 가른다.
    let lastNoteGak = -1;

    function push(kind, dur, g, j, r) {
      // 각(=한 장단)을 넘는 지속은 끊고 쉼으로 적는다(2026-08-14 사용자 확정) — 빈 정간·
      // 이음(-)은 제 각 안에서만 앞 음을 잇는다. 재생과 오선보가 이 함수 하나를 나눠 보므로
      // 소리도 여기서 끊기고 악보에도 쉼표로 나온다. prevMidi는 그대로 둔다 — 쉼표와 같은
      // 규칙(다음 각의 '노'도 앞 각 마지막 음 기준이라야 가락이 이어진다).
      if (kind === "note") lastNoteGak = g;
      else if (kind === "hold" && lastNoteGak !== g) kind = "rest";
      slots.push({ gak: g, cell: j, beat: beat, dur: dur, kind: kind,
                   seq: (r && r.seq) || [], pre: (r && r.pre) || [], post: (r && r.post) || [] });
      beat += dur;
    }

    // 그룹 하나(주 토큰 + 붙은 시김새들)를 음높이로 푼다. 풀 것이 없으면(표류 시김새·
    // 이음·기준 삼을 앞 음이 없음) null — 부르는 쪽이 앞 음을 잇는다.
    function resolveGroup(grp) {
      const tk = grp.main;
      const atts = [];
      // 민음으로 들을 땐 붙은 시김새를 아예 안 본다 — 꾸밈음도, 본음 자리를 가르는 꼴도 없다
      if (!plain) {
        grp.att.forEach(function (a) { if (a.sym && SYM_SND[a.sym]) atts.push(SYM_SND[a.sym]); });
      }

      let ref, degs;
      if (tk.base) {
        ref = hwangMidi + SCALE.indexOf(tk.base) + tk.oct * 12;
        degs = [0];
        // 나니나처럼 본음의 자리를 가르는 붙임이 있으면 그 꼴이 본음 하나를 대신한다
        for (let i = 0; i < atts.length; i++) if (atts[i].seq) { degs = atts[i].seq; break; }
      } else {
        // 독립 시김새는 적힌 율명이 아니라 시김새 그 자체다 — 민음에서는 앞 음이 이어진다
        if (plain) return null;
        const own = tk.sym ? SYM_SND[tk.sym] : null;
        if (!own || !own.seq || prevMidi == null) return null;
        ref = prevMidi;   // 독립 시김새의 기준음은 앞 음
        degs = own.seq;
      }

      const pre = [], post = [];
      atts.forEach(function (a) {
        if (a.pre) a.pre.forEach(function (d) { pre.push(sc.pitch(ref, d)); });
        if (a.post) a.post.forEach(function (d) { post.push(sc.pitch(ref, d)); });
      });
      const seq = degs.map(function (d) { return sc.pitch(ref, d); });
      prevMidi = seq[seq.length - 1];
      return { seq: seq, pre: pre, post: post };
    }

    for (let g = 0; g < gaks.length; g++) {
      const gakCells = gaks[g];
      // 각마다 정간 수가 다를 수 있다 — 그 각의 수만큼 시간이 흐른다(빈 각도 제 길이만큼)
      const gb = beatsAt(g);
      const filled = gakCells.length > 0 ? Math.min(gb, gakCells.length) : gb;
      for (let j = 0; j < filled; j++) {
        const text = gakCells[j] ? gakCells[j].text : "";
        const rows = text.split(/\s+/).filter(Boolean);
        if (!rows.length) { push("hold", 1, g, j); continue; }
        const rowDur = 1 / rows.length;
        for (let r = 0; r < rows.length; r++) {
          // 숨표(<)·빠르기(tempo) 기호는 소리에 영향 없음 — 배치·소리 계산에서 제외
          const toks = tokenizeNotes(rows[r]).filter(function (tk) {
            return !tk.breath && !(tk.sym && ORN_CAT[tk.sym] === "tempo");
          });
          const groups = groupRowTokens(toks);
          if (!groups.length) { push("hold", rowDur, g, j); continue; }
          const slotDur = rowDur / groups.length;
          for (let gi = 0; gi < groups.length; gi++) {
            const grp = groups[gi];
            // 쉼표는 앞 음을 끊지만 기준음은 지우지 않는다 — 쉼표 뒤의 '노'도 쉼표 앞
            // 음에서 한 칸 내린 음이라야 가락이 이어진다.
            if (grp.main.sym === "pause_007") { push("rest", slotDur, g, j); continue; }
            const res = resolveGroup(grp);
            push(res ? "note" : "hold", slotDur, g, j, res);   // 이음(-)·소리 없는 기호 → 지속
          }
        }
      }
    }
    return slots;
  }

  // ---------- 재생 (사인파 sonification) ----------
  // 규칙: 정간 1칸 = 1박. 칸 안 공백 행(분박)은 박을 등분. 빈 정간·이음(-)·소리 없는 시김새는
  // 앞 음을 지속(새 음을 시작하지 않고 직전 이벤트 길이를 늘림). 쉼표만 실제 무음.
  // 지속은 **제 각 안에서만**이다 — 각(=한 장단)이 바뀌면 끊겨 쉼이 된다(realizeMelody의
  // push가 자른다 — 오선보도 같은 슬롯을 보므로 거기선 쉼표로 적힌다).
  // 소리가 있는 시김새(사전의 snd)는 제 자리를 나눠 갖거나 본음 앞뒤에 짧게 붙는다.
  function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // 시김새대로 연주할까 — 재생 설정의 체크. 칸이 없으면(옛 저장분·검사) 켠 것으로 본다.
  // **오선보는 이 값과 무관하다** — 거기선 늘 시김새를 그린다. 이건 '어떻게 들을까'일 뿐이다.
  function sigimsaeSoundOn() {
    const el = $("playSigimsae");
    return !el || el.checked;
  }

  // 장구 소리를 낼 조건 — 장단 줄이 켜져 있고(악보에 그 줄이 있고) 실제로 적힌 구음이 있으며
  // 재생 설정에서 끄지 않았을 때. '줄은 켰지만 비어 있음'도 자연히 소리가 없다.
  function jangguSoundOn() {
    return !!($("wantJangdan").checked && $("playJanggu") && $("playJanggu").checked
              && ($("jangdan").value || "").trim());
  }

  // 멜로디 텍스트 → 재생 이벤트 목록 [{ t, dur, freq, gak, cell }] (freq=null → 무음).
  // janggu: 장구 타점 [{ t, name }] — 선율과 같은 시간축이지만 음높이가 없어 따로 담는다.
  function buildAudioEvents() {
    const bpm = Math.max(1, parseInt($("tempoBpm").value) || 60);
    const hwangMidi = parseInt($("hwangPitch").value) || 63;
    const secPerBeat = 60 / bpm;

    const events = [];
    // marks: 오디오 이벤트와 별개로, 지속(빈 정간·이음)이어도 매 정간마다 하나씩 남겨서
    // 재생 하이라이트가 시간이 지나면 그 정간으로 계속 이동하도록 함.
    // 합주에서도 **활성 파트의 것만** 담는다 — 하이라이트 좌표(cellGeom)가 활성 파트 열이라서.
    const marks = [];
    let totalT = 0;   // 가장 긴 파트의 끝 — 파트마다 각 수가 다를 수 있다

    // 앞·뒷꾸밈 한 알의 길이. 스치듯 짧은 소리라 고정 시간에 가깝게 두되, 느린 곡에서
    // 자리를 다 먹지 않게 자리의 3할을 넘기지 않는다(그 3할을 꾸밈 수로 나눠 갖는다).
    // 오선보에서는 꾸밈음이 길이를 안 먹으므로(grace) 이 값은 재생에만 있는 규칙이다.
    const GRACE_MAX = 0.09;   // 초
    function graceLen(dur, n) { return n ? Math.min(GRACE_MAX, dur * 0.3 / n) : 0; }

    // 장단 줄은 곡에 한 각짜리 패턴 하나뿐이고 그것이 각마다 되풀이된다(악보에서도 맨 처음
    // 각 옆에 한 번만 그린다) — 그래서 각마다 같은 칸을 그 각의 시각에 얹는다.
    const jdCells = jangguSoundOn() ? (parseMelodyOffsets($("jangdan").value)[0] || []) : [];
    const janggu = [];
    function jangguCell(cellStart, cellIdx) {
      const cell = jdCells[cellIdx];
      const rows = cell ? cell.text.split(/\s+/).filter(Boolean) : [];
      if (!rows.length) return;
      const rowDur = secPerBeat / rows.length;   // 분박은 선율과 같은 규칙으로 박을 등분
      for (let i = 0; i < rows.length; i++) {
        // 장단 줄은 괄호가 선택이라 덩·{덩} 둘 다 온다(stripSymBracket이 벗겨 읽는다).
        // 이음(-)은 앞 소리를 잇는 표시라 새로 치지 않는다 — 북은 이미 울리고 있다.
        const name = stripSymBracket(rows[i]);
        if (name && name !== "-") janggu.push({ t: cellStart + rowDur * i, name: name });
      }
    }

    // 파트 하나의 선율을 시간축에 앉힌다(합주는 이 함수를 파트 수만큼 부른다 — 모두 0초에서
    // 함께 출발). opts.sound=false면 소리 없이 시간만 재고(음소거된 활성 파트의 하이라이트),
    // opts.marks=false면 하이라이트 표식 없이(비활성 파트), opts.janggu는 장단 타점 담당 표시.
    // 무엇이 울리나는 realizeMelody가 이미 다 풀어 놓았다. 여기는 그 자리들을 시간(초)에
    // 앉히고 사인파로 바꾸는 일만 한다.
    function addPart(melodyText, opts) {
      let t = 0, lastEvent = null;
      function mark(g, c) { if (opts.marks) marks.push({ t: t, gak: g, cell: c }); }
      function extend(dur, g, c) {
        mark(g, c);
        if (opts.sound && lastEvent) lastEvent.dur += dur;
        t += dur;
      }
      function rest(dur, g, c) { mark(g, c); lastEvent = null; t += dur; }
      function note(freq, dur, g, c) {
        mark(g, c);
        if (opts.sound) {
          const ev = { t: t, dur: dur, freq: freq, gak: g, cell: c };
          events.push(ev); lastEvent = ev;
        }
        t += dur;
      }
      let curGak = -1, curCell = -1;
      realizeMelody(hwangMidi, melodyText, { plain: !sigimsaeSoundOn() }).forEach(function (s) {
        // 정간 하나가 늘 1박이므로, 그 정간의 첫 자리가 시작되는 시각이 곧 장단 타점의 시작
        if (opts.janggu && (s.gak !== curGak || s.cell !== curCell)) {
          jangguCell(t, s.cell); curGak = s.gak; curCell = s.cell;
        }
        const dur = s.dur * secPerBeat;
        if (s.kind === "rest") { rest(dur, s.gak, s.cell); return; }
        if (s.kind === "hold") { extend(dur, s.gak, s.cell); return; }
        const gn = s.pre.length + s.post.length;
        const gl = graceLen(dur, gn);
        const body = (dur - gl * gn) / s.seq.length;
        s.pre.forEach(function (m) { note(midiToFreq(m), gl, s.gak, s.cell); });
        s.seq.forEach(function (m) { note(midiToFreq(m), body, s.gak, s.cell); });
        s.post.forEach(function (m) { note(midiToFreq(m), gl, s.gak, s.cell); });
      });
      totalT = Math.max(totalT, t);
    }

    // 합주 — 모든 파트가 한 시간축에서 함께 울린다(파트가 하나면 예전과 동일).
    // 스피커(muted) 꺼진 파트는 소리에서 빠지고, 하이라이트는 활성 파트를 따라간다.
    // 장단 타점은 각(박) 격자의 일이라 파트와 무관 — 각 수가 가장 많은 파트에 얹어
    // 곡 끝까지 되풀이되게 한다.
    stashActivePart();
    const texts = parts.map(function (p, i) { return i === activePart ? melodyFull : p.melody; });
    let host = 0, hostLen = -1;
    texts.forEach(function (txt, i) {
      const n = parseMelodyOffsets(txt).length;
      if (n > hostLen) { hostLen = n; host = i; }
    });
    // **들리는 것은 보이는 것과 같다** — 총보면 합주, 파트보면 펴 놓은 그 악기만 울린다
    // (2026-08-14 사용자 요청). 화면엔 한 악기만 있는데 소리는 온 악기가 나면 무엇을 듣고
    // 있는지 알 수가 없다. 인쇄·PNG가 '보이는 그대로'인 것과 같은 규칙이다.
    // 장단은 곡에 하나뿐이라 보기와 무관하게 그대로 울린다(악보에도 늘 그려진다).
    const scoreOn = scoreViewOn();
    let voices = 0;   // 실제로 소리를 내는 파트 수 — 재생 쪽이 이 값으로 음량을 나눈다
    parts.forEach(function (p, i) {
      const inView = scoreOn || i === activePart;
      const opts = { sound: inView && p.muted !== true, marks: i === activePart, janggu: i === host };
      if (!opts.sound && !opts.marks && !opts.janggu) return;   // 소리도 표식도 장단도 없으면 헛돎
      if (opts.sound) voices++;
      addPart(texts[i], opts);
    });
    return { events: events.filter(function (e) { return e.dur > 0; }), marks: marks,
             janggu: janggu, total: totalT, voices: voices };
  }
  // 시김새가 제대로 풀렸는지는 귀 말고는 볼 길이 없어 창구를 하나 낸다
  // (window.jgbShareLink·window.jgbTrack과 같은 성격의 검증용 노출).
  window.jgbAudioEvents = buildAudioEvents;

  let audioCtx = null, playTimer = null, playing = false, paused = false, playState = null;

  // ----- 출력 버스 (음량 정규화 + 소프트 클립) -----
  // 총보 합주가 지지직거리던 까닭: 마스터가 0.25 고정인데 음 하나가 진폭 1까지 오른다.
  // 정악은 헤테로포니라 악기들이 **같은 가락을 같은 시각에** 내고, 소리가 전부 순수
  // 사인파에 osc.start(on)이라 **시작 위상까지 같아서** √N이 아니라 그대로 N배로 더해진다
  // (실측: 봉우리 = 0.25 × 소리 나는 파트 수. 5파트 영산회상 군악에서 1.249 → destination이
  //  [-1,1]로 하드 클립하며 사인 꼭대기가 평평해져 홀수 배음이 생긴다 = 지지직).
  // 그래서 ① 파트 수로 나누고 ② 그래도 넘는 자리는 소프트 클립으로 눌러 모서리가 안 생기게 한다.
  const MELODY_PEAK = 0.25;   // 파트가 몇이든 선율 합의 봉우리 — 예전 독주와 같은 크기다
  const SOFT_KNEE = 0.7;      // 여기까지는 손대지 않고 그대로 통과, 위로만 눌린다

  // 소프트 클립 곡선. WaveShaper의 curve는 **입력 -1~1로 색인**되고 그 밖은 끝값에 물리므로,
  // 버스 앞에서 절반으로 줄여 넣고 곡선이 그 절반을 되돌린다 — 덕분에 원래 진폭 2.0까지
  // 다룰 수 있다. 무릎(SOFT_KNEE) 아래는 정확히 통과라 평소 소리엔 왜곡이 0이다.
  function softClipCurve(n) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2;   // 버스에서 0.5배로 줄이기 전의 진폭 (-2~2)
      const a = Math.abs(x);
      const y = a <= SOFT_KNEE ? a
        : SOFT_KNEE + (1 - SOFT_KNEE) * Math.tanh((a - SOFT_KNEE) / (1 - SOFT_KNEE));
      c[i] = Math.sign(x) * y;
    }
    return c;
  }

  // 모든 소리가 여기 모여 나간다 — 선율(master)도 장구도 이 버스를 지난다.
  // **destination에 직접 연결하지 말 것**: 우회하는 소리가 있으면 아무리 나눠도 그만큼 샌다.
  function makeOutBus(ctx) {
    const pre = ctx.createGain();
    pre.gain.value = 0.5;              // 곡선의 색인 범위(-1~1)에 맞춰 줄여 넣는다
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(2049);
    shaper.oversample = "4x";          // 눌리는 자리에서 생기는 에일리어싱을 줄인다
    pre.connect(shaper); shaper.connect(ctx.destination);
    return pre;
  }

  // ----- 장구 음원 -----
  // 선율 합(MELODY_PEAK)과의 균형 — 소리 크기를 바꿀 땐 여기 한 곳만. 파트가 몇이든 선율
  // 쪽 봉우리가 0.25로 고정이라 이 비율은 독주·합주에서 똑같이 유지된다.
  const JANGGU_GAIN = 0.5;

  // 박보다 이만큼(초) 먼저 음원을 시작한다. 겹타는 음원 맨 앞이 본 타가 아니라 앞꾸밈이라,
  // 파일 시작을 박에 맞추면 정작 귀에 박으로 들리는 본 타가 그만큼 늦게 떨어진다.
  // 기덕 0.15 = 잰 값(앞꾸밈 '기' 0초, 본 타 '덕' 0.150초 — 무음을 뗀 음원 기준).
  // 나머지 구음은 첫 소리가 곧 본 타라 당길 것이 없다.
  const JANGGU_LEAD = { "기덕": 0.15 };
  function jangguLead(name) { return JANGGU_LEAD[name] || 0; }
  // 소리는 [재생]을 눌러야 쓰이므로 js/janggu-audio.js는 index.html에서 미리 싣지 않고
  // 첫 재생 때 <script>로 불러온다(데이터 URL이라 파일 경로·CORS를 안 탄다).
  let jangguAudioReq = null;
  function loadJangguAudio() {
    if (window.JANGGU_AUDIO) return Promise.resolve(window.JANGGU_AUDIO);
    if (!jangguAudioReq) {
      jangguAudioReq = new Promise(function (res) {
        const s = document.createElement("script");
        s.src = "js/janggu-audio.js";
        s.onload = function () { res(window.JANGGU_AUDIO || null); };
        // 못 불러와도 선율 재생은 그대로 — 소리 하나 때문에 재생이 통째로 막히면 안 된다
        s.onerror = function () { jangguAudioReq = null; res(null); };
        document.head.appendChild(s);
      });
    }
    return jangguAudioReq;
  }

  // decodeAudioData는 컨텍스트의 표본율로 풀어내므로 표본율이 같을 때만 캐시를 다시 쓴다
  // (재생용 컨텍스트는 정지할 때마다 close 되고 다음 재생에 새로 만들어진다).
  let jangguBufs = null, jangguBufRate = 0;
  function decodeAudioBuf(ctx, arr) {
    return new Promise(function (res, rej) {
      // 옛 사파리는 콜백 꼴만 받고 프로미스를 안 돌려준다 — 둘 다 받아 둔다
      const p = ctx.decodeAudioData(arr, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  function jangguBuffers(ctx) {
    if (jangguBufs && jangguBufRate === ctx.sampleRate) return Promise.resolve(jangguBufs);
    const data = window.JANGGU_AUDIO || {};
    const names = Object.keys(data);
    return Promise.all(names.map(function (n) {
      const uri = data[n];
      const bin = atob(uri.slice(uri.indexOf(",") + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return decodeAudioBuf(ctx, arr.buffer).catch(function () { return null; });
    })).then(function (bufs) {
      const map = {};
      names.forEach(function (n, i) { if (bufs[i]) map[n] = bufs[i]; });
      jangguBufs = map; jangguBufRate = ctx.sampleRate;
      return map;
    });
  }

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
    $("btnPlay").title = !playing ? "재생 (사인파·장구 소리, 시김새 제외)" : (paused ? "이어 재생" : "일시정지");
    $("btnStop").disabled = !playing;
  }

  function stopPlayback() {
    if (!playing && !audioCtx) return;
    playing = false; paused = false; playState = null;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    playHi.forEach(function (h) { h.style.display = "none"; });
    staffPlayMark(null);
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
    // 오선보도 **같은 시계**를 본다(오선보 보기 절의 '재생 위치 짚기') — 칸이 닫혀 있거나
    // 조판기로 안 그렸으면 그 안에서 조용히 아무 일도 안 한다.
    staffPlayMark(now * 1000);
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

  // 장구가 있으면 음원을 불러 푸는 동안 재생 시작이 한 박자 늦는다 — 그 사이 [재생]을 또
  // 눌러 두 번 시작되는 걸 막는 빗장.
  let playPending = false;

  function playMelody() {
    if (playing || playPending) return;
    const built = buildAudioEvents();
    if (!built.events.length) return;
    if (!built.janggu.length) { startPlayback(built, null, null); return; }
    playPending = true;
    loadJangguAudio().then(function (data) {
      if (!data) { playPending = false; startPlayback(built, null, null); return; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      return jangguBuffers(ctx).then(function (bufs) {
        playPending = false;
        startPlayback(built, ctx, bufs);
      });
    }).catch(function () {
      playPending = false;
      if (!playing) startPlayback(built, null, null);
    });
  }

  // 음원을 다 푼 뒤의 실제 재생. ctx는 장구 음원을 풀 때 미리 만든 컨텍스트(없으면 여기서 만듦).
  function startPlayback(built, ctx, bufs) {
    const events = built.events, marks = built.marks;
    track("play");
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx = ctx;
    // 첫 박에 겹타(기덕)가 있으면 그 음원은 0초보다 **앞서** 시작해야 한다 — 그만큼 여유를
    // 더 두지 않으면 시작 시각이 과거가 되어 그 한 번만 앞꾸밈이 잘린 채 울린다.
    const maxLead = bufs ? built.janggu.reduce(function (m, h) {
      return Math.max(m, jangguLead(h.name));
    }, 0) : 0;
    const startAt = ctx.currentTime + 0.15 + maxLead;
    const bus = makeOutBus(ctx);
    const master = ctx.createGain();
    // **소리 나는 파트 수로 나눈다.** 1/√N이 아니라 1/N인 것은 헤테로포니라 봉우리가 파트
    // 수에 정비례하기 때문이다(위 '출력 버스' 머리말 참고 — 실측으로 정확히 0.25×N이었다).
    master.gain.value = MELODY_PEAK / Math.max(1, built.voices || 1);
    master.connect(bus);

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

    // 장구 타점 — 녹음된 소리라 선율 master를 함께 타면 묻힌다(파트 수로 나뉘므로 더욱).
    // 그래서 master와 나란히, 그러나 **같은 버스로** 내보낸다 — destination에 직결하면
    // 소프트 클립을 우회해 장구만 잘린 채 울린다(음원 봉우리가 이미 0dBFS 가까이 차 있다).
    let jangguEnd = 0;
    if (bufs) {
      built.janggu.forEach(function (h) {
        const b = bufs[h.name];
        if (!b) return;   // 아직 음원이 없는 구음(사전에만 있는 것)은 조용히 넘어간다
        const src = ctx.createBufferSource();
        src.buffer = b;
        const g = ctx.createGain();
        g.gain.value = JANGGU_GAIN;
        src.connect(g); g.connect(bus);
        // 겹타는 음원을 박보다 먼저 시작해 본 타가 박에 떨어지게 한다(JANGGU_LEAD)
        const at = h.t - jangguLead(h.name);
        src.start(startAt + at);
        jangguEnd = Math.max(jangguEnd, at + b.duration);
      });
    }

    playing = true; paused = false;
    // 마지막 박에 친 장구는 선율이 끝난 뒤에도 울림이 남는다 — 그만큼 총 길이를 늘려
    // 컨텍스트가 닫히며 소리가 뚝 끊기지 않게 한다(하이라이트는 마지막 정간에 머문다).
    // 합주는 파트마다 이벤트가 섞여 마지막 원소가 끝이 아닐 수 있다 — built.total(가장 긴
    // 파트의 끝)을 쓰고, 이벤트 최대치와 장구 울림으로 한 번 더 받친다.
    const evEnd = events.reduce(function (m, e) { return Math.max(m, e.t + e.dur); }, 0);
    const total = Math.max(built.total || 0, evEnd, jangguEnd);
    playState = { startAt: startAt, total: total, marks: marks };
    updatePlayButtons();
    tick();
  }

  // ---------- 보기별 레이아웃 (총보/파트보 프로필) ----------
  // 총보는 각이 파트 수만큼 넓어져 한 줄 각 수·배율·간격의 적정값이 파트보와 다르다 —
  // 그래서 레이아웃이 두 벌이다. 경계는 탭으로 긋는다(사용자 확정, 2026-08-08):
  // **레이아웃 탭(배치·크기·간격·머리단·테두리) + 종이 크기·방향 = 보기별**,
  // 문서 탭(정간 수·총 각 수·대강·제목 등 곡의 구조)·왼쪽 퀵 패널(율명·곁줄 크기) = 공유.
  // 컨트롤(DOM)은 늘 '지금 보기'의 작업 사본이고, 보기가 바뀔 때 stash/hydrate —
  // 파트 전환(stashActivePart/hydrateActivePart)과 같은 문법이다.
  const VIEW_LAYOUT_IDS = ["paperSize", "paperW", "paperH", "orientation",
    "gakPerRow", "stackCount", "stackAuto", "sizeScale", "pageFill",
    "cellSize", "gakGap", "bandGap", "header", "frame"];
  let viewLayouts = { part: null, score: null };   // null = 아직 그 보기로 안 가 봄
  let layoutView = "part";                          // 지금 컨트롤에 입혀진 프로필
  function grabViewLayout() {
    const o = {};
    VIEW_LAYOUT_IDS.forEach(function (id) {
      const el = $(id);
      o[id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return o;
  }
  function putViewLayout(o) {
    VIEW_LAYOUT_IDS.forEach(function (id) {
      if (!(id in o)) return;
      const el = $(id);
      if (el.type === "checkbox") el.checked = !!o[id];
      else el.value = o[id];
    });
  }
  // render() 첫머리가 부른다 — 상단바 메뉴·파트 추가/삭제 등 어떤 길로 보기가 바뀌어도
  // 컨트롤이 제 보기의 프로필을 입고 나서 레이아웃 셈이 시작되게.
  function syncViewLayout(scoreMode) {
    const next = scoreMode ? "score" : "part";
    if (next === layoutView) return;
    viewLayouts[layoutView] = grabViewLayout();
    if (!viewLayouts[next]) {
      // 처음 가 보는 보기 — 지금 값으로 시작하되, 총보는 각이 파트 수만큼 넓어지므로
      // 한 줄 각 수를 파트 수로 나눠 첫 화면이 종이를 넘치지 않게 한다.
      const seed = grabViewLayout();
      if (next === "score") {
        const per = Math.max(1, parseInt(seed.gakPerRow, 10) || 1);
        seed.gakPerRow = String(Math.max(1, Math.round(per / Math.max(1, parts.length))));
      }
      viewLayouts[next] = seed;
    }
    putViewLayout(viewLayouts[next]);
    layoutView = next;
  }

  // ---------- 파트 (총보 성부) ----------
  // 문서 = 공유 뼈대(레이아웃 controls·장단·각 이름·자유 텍스트) + 파트 목록.
  // 파트 = 악기 하나의 내용: 선율·곁줄·정간 서식(+악기 이름·시김새 우선순위 악기).
  // 장단은 파트에 안 넣는다 — 장구 줄은 합주에 하나뿐이라 곡(공유)에 속한다.
  //
  // 전역 melodyFull·lyricsFull·cellStyles·ornInstrument는 **활성 파트의 작업 사본**이다.
  // 4천 줄이 이 전역들을 그대로 읽고 쓰므로 갈아엎지 않고, 목록과 어긋나지 않게
  // 두 함수로만 오간다: stashActivePart(사본→목록, 저장·파트 전환 직전에)와
  // hydrateActivePart(목록→사본, 불러오기·파트 전환 직후에).
  // cellStyles는 객체 참조가 같아 그 자리 수정이 목록에도 바로 닿지만, melody·lyrics는
  // 문자열이라 stash 없이는 목록이 낡는다 — **parts를 읽기 전엔 반드시 stash를 부를 것.**
  let nextPartId = 1;
  let parts = [newPart()];   // 늘 1개 이상 — 파트가 하나면 지금까지의 단독 악보와 동일
  let activePart = 0;

  // 지금이 총보인가(악기가 둘 이상 + #scoreView 켬). 정간보 그리기·오선보·레이아웃 프로필·
  // 재생이 **같은 답을 봐야** 화면과 소리와 종이가 한 가지를 가리킨다 — 이 셈을 여기 말고
  // 다른 데서 다시 적지 말 것(예전엔 같은 식이 네 군데 복사돼 있었다).
  function scoreViewOn() {
    return parts.length > 1 && !!($("scoreView") && $("scoreView").checked);
  }

  // name = 첫 줄(곡 머리)에 붙는 이름 · abbr = 둘째 줄부터 붙는 약어(비우면 생략) ·
  // instrument = 실제 악기 종류(시김새 팔레트 우선순위가 따라감) — 피날레 Score Manager처럼
  // 셋을 따로 둔다(사용자 확정, 2026-08-08).
  function newPart(name) {
    return { id: nextPartId++, name: typeof name === "string" ? name : "",
             abbr: "", instrument: "all", muted: false,
             melody: "", lyrics: "", cellStyles: {} };
  }
  // 저장분·남의 파일에서 온 파트 하나를 검증해 들인다. 꼴이 아예 아니면 null.
  function sanitizePart(p) {
    if (!p || typeof p !== "object") return null;
    return {
      id: (typeof p.id === "number" && p.id > 0) ? p.id : nextPartId++,
      name: typeof p.name === "string" ? p.name : "",
      abbr: typeof p.abbr === "string" ? p.abbr : "",
      instrument: (typeof p.instrument === "string"
        && (p.instrument === "all" || INSTRUMENT_PRIORITY[p.instrument])) ? p.instrument : "all",
      muted: p.muted === true,
      melody: normalizeGakSeparators(typeof p.melody === "string" ? p.melody : ""),
      lyrics: normalizeGakSeparators(typeof p.lyrics === "string" ? p.lyrics : ""),
      cellStyles: (p.cellStyles && typeof p.cellStyles === "object") ? p.cellStyles : {}
    };
  }
  function stashActivePart() {
    const p = parts[activePart];
    p.melody = melodyFull;
    p.lyrics = lyricsFull;
    p.cellStyles = cellStyles;
    p.instrument = ornInstrument;
  }
  function hydrateActivePart() {
    const p = parts[activePart];
    melodyFull = p.melody;
    lyricsFull = p.lyrics;
    cellStyles = p.cellStyles;
    ornInstrument = p.instrument;
  }

  // ---------- 악기 관리 창 (총보 파트 목록, #partsWin) ----------
  // 피날레 Score Manager 같은 자리 — 파트 추가·삭제·이름·악기·순서·'지금 편집할 악기'를
  // 한 창에서. 사이드바 '문서' 탭 [악기 관리…]가 열고, 입력 방식과 무관하게 뜬다.
  // 목록 순서 = 나중 총보에서 악기 열이 서는 순서(오른쪽→왼쪽으로 읽으니 위 = 오른쪽).
  // 부르는 이름: 지은 이름 → 악기 이름 → "파트 N". 관리 창·보기 메뉴·총보 열 이름이 같이 쓴다.
  function partLabel(p, i) {
    return (p.name || "").trim()
      || (p.instrument && p.instrument !== "all" ? p.instrument : "")
      || ("파트 " + (i + 1));
  }

  // 활성 파트의 내용을 화면(작업 사본·에디터·팔레트·악보)에 들이는 공통 절차 —
  // 파트 전환과 '활성 파트 삭제'가 같이 쓴다. hydrateActivePart와 달리 악기는
  // setOrnInstrument를 태워 숫자 단축키 번들·팔레트 정렬이 함께 갈아탄다.
  function loadActivePartIntoView() {
    const p = parts[activePart];
    melodyFull = p.melody; lyricsFull = p.lyrics; cellStyles = p.cellStyles;
    setOrnInstrument(p.instrument, { silent: true });
    // 이전 파트를 가리키던 것들 정리 — 정간 선택·시김새 선택은 그 파트의 것이었다
    melSelStart = null; melSelEnd = null; refreshMelSelBtns();
    ornSel = null; hideOrnPanel();
    edPage = 0; edRange = null; edLyRange = null;
    reconcileMelody(); reconcileLyrics();
    refreshEditorSlices(); syncActiveFromCursor();
    render();
  }
  function switchPart(idx) {
    idx = Math.max(0, Math.min(parts.length - 1, idx | 0));
    if (idx === activePart) return;
    if (cellEditInput) commitCellEditor(false);   // 편집 중이던 정간 확정(되돌리기와 같은 순서)
    stashActivePart();
    activePart = idx;
    track("part_switch");
    loadActivePartIntoView();
    renderPartsList(); saveState();
  }
  function addPart() {
    if (cellEditInput) commitCellEditor(false);
    stashActivePart();
    parts.push(newPart());
    activePart = parts.length - 1;   // 새 악기를 바로 편집 — 추가하고 곧장 적기 시작하게
    track("part_add", { v: String(parts.length) });
    loadActivePartIntoView();
    renderPartsList(); saveState();
  }
  function removePart(i) {
    if (parts.length <= 1) return;   // 마지막 하나는 못 지운다(문서는 늘 파트 1개 이상)
    if (!confirm("'" + partLabel(parts[i], i) + "' 악기를 지웁니다. 이 악기의 선율·곁줄·정간 서식이 함께 사라집니다(⌘Z로 되돌릴 수 있음). 계속할까요?")) return;
    if (cellEditInput) commitCellEditor(false);
    stashActivePart();
    const wasActive = (i === activePart);
    parts.splice(i, 1);
    if (i < activePart) activePart -= 1;
    else if (wasActive) activePart = Math.min(i, parts.length - 1);
    track("part_remove", { v: String(parts.length) });
    if (wasActive) loadActivePartIntoView();   // (render 포함)
    else render();                             // 총보면 그 파트의 열이 사라져야 한다
    renderPartsList(); saveState();
  }
  function movePart(i, d) {
    const j = i + d;
    if (j < 0 || j >= parts.length) return;
    stashActivePart();   // 문자열 사본(melody·lyrics)이 목록에서 낡지 않게 먼저 맞춘다
    const t = parts[i]; parts[i] = parts[j]; parts[j] = t;
    if (activePart === i) activePart = j;
    else if (activePart === j) activePart = i;
    render();            // 총보면 열 순서가 곧 그리는 순서 (render가 저장까지 겸한다)
    renderPartsList();
  }
  function renderPartsList() {
    const list = $("partsList");
    if (!list) return;
    list.innerHTML = "";
    parts.forEach(function (p, i) {
      const row = document.createElement("div");
      row.className = "tx-item part-item" + (i === activePart ? " active" : "");
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "partActive"; radio.checked = (i === activePart);
      radio.title = "이 악기를 편집";
      radio.addEventListener("change", function () { switchPart(i); });
      const name = document.createElement("input");
      name.type = "text"; name.className = "part-name";
      name.value = p.name; name.placeholder = partLabel(p, i);
      name.title = "이름 — 총보 곡 머리(첫 줄)의 열 위와 오선보 왼쪽에 붙습니다 (비우면 악기·번호로 부릅니다)";
      name.addEventListener("change", function () { p.name = name.value.trim(); render(); });
      const abbr = document.createElement("input");
      abbr.type = "text"; abbr.className = "part-abbr";
      abbr.value = p.abbr || ""; abbr.placeholder = "약어";
      abbr.title = "약어 — 총보·오선보의 둘째 줄부터 붙습니다 (비우면 첫 줄에만 이름이 붙습니다)";
      abbr.addEventListener("change", function () { p.abbr = abbr.value.trim(); render(); });
      const inst = document.createElement("select");
      inst.className = "part-inst";
      inst.title = "악기 — 시김새 팔레트의 우선순위가 이 악기를 따릅니다. 이름을 비워 두면 오선보에는 이 악기 이름이 적힙니다";
      [["all", "악기 선택"]].concat(Object.keys(INSTRUMENT_PRIORITY).map(function (k) { return [k, k]; }))
        .forEach(function (pair) {
          const o = document.createElement("option");
          o.value = pair[0]; o.textContent = pair[1]; inst.appendChild(o);
        });
      inst.value = p.instrument;
      inst.addEventListener("change", function () {
        p.instrument = inst.value;
        if (i === activePart) setOrnInstrument(inst.value);   // saveState 포함
        else saveState();
        // 악기는 정간보를 안 바꾸지만 **오선보에는 이름으로 적힌다** — 여기서 안 부르면
        // 위에서 악기를 골라도 아래 오선보가 옛 이름인 채로 남는다.
        scheduleStaff();
      });
      const mute = document.createElement("button");
      mute.type = "button"; mute.className = "mel-btn part-mute";
      mute.textContent = p.muted ? "🔇" : "🔊";
      mute.title = p.muted ? "재생에서 빠져 있습니다 — 누르면 다시 들립니다"
                           : "재생에서 이 악기의 소리 끄기(악보에는 그대로)";
      mute.addEventListener("click", function () { p.muted = !p.muted; renderPartsList(); saveState(); });
      const up = document.createElement("button");
      up.type = "button"; up.className = "mel-btn"; up.textContent = "↑"; up.title = "위로";
      up.disabled = (i === 0);
      up.addEventListener("click", function () { movePart(i, -1); });
      const down = document.createElement("button");
      down.type = "button"; down.className = "mel-btn"; down.textContent = "↓"; down.title = "아래로";
      down.disabled = (i === parts.length - 1);
      down.addEventListener("click", function () { movePart(i, 1); });
      const del = document.createElement("button");
      del.type = "button"; del.className = "tx-del"; del.textContent = "✕";
      del.title = (parts.length <= 1) ? "마지막 악기는 지울 수 없습니다" : "이 악기 삭제";
      del.disabled = (parts.length <= 1);
      del.addEventListener("click", function () { removePart(i); });
      row.appendChild(radio); row.appendChild(name); row.appendChild(abbr); row.appendChild(inst);
      row.appendChild(mute); row.appendChild(up); row.appendChild(down); row.appendChild(del);
      list.appendChild(row);
    });
    updateViewMenu();   // 편성이 바뀌면 상단바 보기 메뉴(노출 여부·이름들)도 따라간다
  }
  // ---------- 보기 전환 메뉴 (상단바 #viewToggle — 총보 / 파트들) ----------
  // 악기가 둘 이상일 때만 보인다. 버튼 글씨 = 지금 보기(총보 또는 활성 파트 이름).
  // 항목을 누르면 보기와 편집 대상이 한 번에 정해진다 — 관리 창은 편성 관리만 맡는다.
  function setScoreView(on) {
    const cb = $("scoreView");
    if (cb.checked !== on) {
      cb.checked = on;
      render();   // render 첫머리의 syncViewLayout이 보기별 레이아웃을 갈아입힌다(저장 포함)
    }
    updateViewMenu();
  }
  function updateViewMenu() {
    const box = $("viewBox");
    if (!box) return;
    const many = parts.length > 1;
    box.style.display = many ? "" : "none";
    if (!many) return;
    const scoreOn = $("scoreView").checked;
    $("viewLbl").textContent = scoreOn ? "총보" : partLabel(parts[activePart], activePart);
    const pop = $("viewPop");
    pop.innerHTML = "";
    const bt = document.createElement("button");
    bt.type = "button"; bt.textContent = "총보";
    bt.className = scoreOn ? "sel" : "";
    bt.addEventListener("click", function () { setScoreView(true); });
    pop.appendChild(bt);
    pop.appendChild(document.createElement("hr"));
    parts.forEach(function (p, i) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = partLabel(p, i);
      b.className = (!scoreOn && i === activePart) ? "sel" : "";
      b.addEventListener("click", function () {
        setScoreView(false);
        if (i !== activePart) switchPart(i);
        else updateViewMenu();
      });
      pop.appendChild(b);
    });
  }

  $("btnPartsWin").addEventListener("click", function () {
    const w = $("partsWin");
    if (w.classList.contains("open")) { w.classList.remove("open"); return; }
    renderPartsList();
    w.classList.add("open");
  });
  $("partsClose").addEventListener("click", function () { $("partsWin").classList.remove("open"); });
  $("partAddBtn").addEventListener("click", addPart);

  // ---------- 오선보 재료 만들기 ----------
  // 무엇이 울리나는 realizeMelody가 이미 다 풀어 놓았다(재생과 같은 표 = 사전의 snd).
  // 여기가 하는 일은 그것을 '서양 악보의 재료'로 바꾸는 것뿐이고, 그 재료를 **화면
  // (js/staff-view.js)과 파일(js/musicxml.js)이 나눠 쓴다** — 보이는 것과 나가는 것이
  // 다르면 보는 뜻이 없다. 음이름 적기·조표 고르기·음표꼴 같은 밑감은 js/staff-core.js에 있다.
  //   · 정간 하나 = 점4분음표(3/8). 그래서 각(=한 마디)의 박자표가 3N/8이 된다.
  //   · 각 = 마디. 마디를 넘는 음은 붙임줄로 잇는다.
  //   · 붙임 시김새 = 꾸밈음(길이를 안 먹음) · 독립 시김새 = 제 자리를 나눈 실음.
  const SC = window.JGB_STAFF_CORE;

  // 오선보의 기준음 = **정간보 쪽에 적어 둔 황 음고**(#hwangPitch, 기본 E♭=63). 황을 C로
  // 두고 쓰는 악보면 오선보도 C로 적혀야 한다 — 정간보와 오선보가 같은 곡을 가리키는데
  // 기준음이 갈리면 그건 다른 곡이다.
  // 다만 **곡 하나에 기준음은 하나**다. 이 값이 어디서 오는지를 여기 한 줄로 못 박아 두는
  // 것은, 예전처럼 조표·음이름·재생이 저마다 다른 데서 기준음을 집어 오면 어긋나기 때문.
  function staffHwang() { return parseInt($("hwangPitch").value) || 63; }

  // 조표 — 기본은 **음계의 '도'가 정하고**(js/staff-core.js의 fifthsFor) 오선보 창의 '조표'
  // 칸에서 사람이 고르면 그 값이 이긴다. 5음 음계는 임시표 없이 적을 수 있는 조표가 셋이라
  // 어느 쪽도 음정이 틀리지 않고, 채보하는 사람마다 관행이 다르다(국립국악원 교과서
  // 표준악보집은 가야금 연주곡을 아예 본청=사음으로 옮겨 ♯1개로 적는다). 그래서 자동으로
  // 정해 주되 잠그지는 않는다. **문서에 딸린 값**이라 CTRL_IDS에 있고 남에게 악보를 주면
  // 조표도 같이 간다(#staffUnit·#joPreset과 같은 성격).
  function staffFifths() {
    const pick = $("staffKey") && $("staffKey").value;
    if (pick && pick !== "auto") {
      const f = parseInt(pick, 10);
      if (f >= -7 && f <= 7) return f;
    }
    const hwangMidi = staffHwang();
    const pcs = [];
    scaleNotes().forEach(function (n) {
      const i = SCALE.indexOf(n);
      if (i >= 0) pcs.push((((hwangMidi + i) % 12) + 12) % 12);
    });
    return SC.fifthsFor(pcs);
  }

  // 선율 하나 → 오선보 재료 하나.
  //   { name, abbr, fifths, clef, beats, bpm, measLen, measures: [[음표…]] }
  //   음표 = { midi, rest, units, graces, afters, tieStart, tieStop }  (units는 SC.DIV 기준)
  function staffScoreOf(melodyText, meta) {
    const hwangMidi = staffHwang();   // 곡 하나에 기준음 하나 (위 주석)
    const beats = Math.max(1, parseInt($("beats").value) || 1);
    const bpm = Math.max(1, parseInt($("tempoBpm").value) || 60);
    const fifths = staffFifths();
    // 정간 하나를 무엇으로 볼지(점4분음표·4분음표·8분음표) — 문서에 딸린 값이다(조 프리셋과
    // 같은 성격이라 CTRL_IDS에 있고, 남에게 악보를 주면 같이 간다). 화면 배율처럼 '이
    // 브라우저의 보기 방식'이 아니라 '이 악보를 어떻게 읽나'라서.
    // 무엇이 있나는 SC.JG가 정한다 — 여기서 이름을 다시 세면 새 단위를 늘릴 때 어긋난다.
    // '자동'은 **각의 정간 수**가 정한다: 12정간이면 8분음표(12/8), 그 밖은 점4분음표.
    // 12정간을 점4분음표로 보면 36/8이 되어 한 마디가 서양 악보에서 터무니없이 길다
    // (2026-08-14 사용자 확정). 취타·여민락처럼 12정간 각이 흔해 기본값으로 둘 값어치가 있다.
    // 고른 값은 문서에 딸려 가므로, 예전에 저장한 문서는 거기 적힌 값 그대로 열린다.
    const pick = $("staffUnit") && $("staffUnit").value;
    const unit = SC.JG[pick] ? pick : (beats === 12 ? "eighth" : "dotted");
    const jg = SC.JG[unit];
    // 각 하나가 한 마디인데 **각마다 정간 수가 다를 수 있으므로** 마디 길이도 마디마다다.
    // 정간 하나는 위 ①에서 늘 딱 jg가 되게 다듬으므로, 각의 총 길이 = 그 각의 정간 수 × jg다.
    const gakN = parseMelodyOffsets(melodyText != null ? melodyText : melodyFull).length;
    const measBeats = [];
    for (let g = 0; g < gakN; g++) measBeats.push(beatsAt(g));
    const capAt = function (i) { return (measBeats[i] || beats) * jg; };

    // ① 자리 길이를 정수 단위로. 나눠떨어지지 않는 분박(11등분 등)에서 생기는 반올림
    //    오차는 그 정간의 마지막 자리에서 걷어, 정간 하나가 늘 딱 jg가 되게 한다 —
    //    안 그러면 오차가 쌓여 뒤쪽 마디부터 마디 길이가 어긋난다.
    const slots = realizeMelody(hwangMidi, melodyText);
    let cellSum = 0;
    slots.forEach(function (s, i) {
      s.units = Math.max(1, Math.round(s.dur * jg));
      cellSum += s.units;
      const next = slots[i + 1];
      if (!next || next.cell !== s.cell || next.gak !== s.gak) {
        s.units = Math.max(1, s.units + jg - cellSum);
        cellSum = 0;
      }
    });

    // ② 자리 → 음표. 'hold'(빈 정간·이음·소리 없는 기호)는 새 음이 아니라 앞 음이 이어지는
    //    것이므로 앞 음의 길이에 더한다(재생의 extend와 같은 규칙). 이을 앞 음이 없으면 쉼표.
    //    cell(어느 정간에서 났나)은 musicxml.js가 셋잇단 묶음의 경계로 쓴다 — 같은 정간에서
    //    난 잇단 음들만 한 괄호(숫자 3)로 묶여야 해서.
    const notes = [];
    let prev = null;
    slots.forEach(function (s) {
      const cellKey = s.gak + ":" + s.cell;
      if (s.kind !== "note") {
        if (s.kind === "hold" && prev) { prev.units += s.units; return; }
        notes.push({ rest: true, units: s.units, cell: cellKey });
        prev = null;
        return;
      }
      const each = s.units / s.seq.length;
      s.seq.forEach(function (m, i) {
        prev = { midi: m, units: each, grace: i === 0 ? s.pre : [], after: [], cell: cellKey };
        notes.push(prev);
      });
      if (s.post.length) prev.after = s.post;
    });

    // ③ 마디(=각)에 채워 넣기. 마디를 넘는 음은 잘라 붙임줄로 잇는다.
    const measures = [];
    let cur = null, filled = 0, measLen = capAt(0);
    function newMeasure() { cur = []; measures.push(cur); filled = 0; measLen = capAt(measures.length - 1); }
    newMeasure();
    notes.forEach(function (n) {
      let left = Math.round(n.units);
      if (left <= 0) return;   // 너무 잘게 쪼개져 길이가 0이 된 자리는 적을 수 없다
      let first = true;
      while (left > 0) {
        if (filled >= measLen) newMeasure();
        const take = Math.min(left, measLen - filled);
        cur.push({
          midi: n.midi, rest: n.rest, units: take, cell: n.cell,
          // 꾸밈은 앞쪽은 첫 조각에, 뒤쪽은 마지막 조각에만 붙는다
          graces: first ? (n.grace || []) : [],
          afters: (left - take <= 0) ? (n.after || []) : [],
          tieStart: left - take > 0, tieStop: !first
        });
        filled += take; left -= take; first = false;
      }
    });
    // 마지막 마디의 남는 자리는 쉼표로 메운다(마디가 짧으면 악보 프로그램이 경고한다)
    if (cur.length && filled < measLen) {
      cur.push({ rest: true, units: measLen - filled, graces: [], afters: [] });
    }

    // 음역을 보고 높은음자리표/낮은음자리표를 고른다 — 거문고처럼 낮은 음만으로 된 곡을
    // 높은음자리표에 얹으면 덧줄만 잔뜩 생겨 읽을 수가 없다. **악기 이름이 아니라 적힌 음을
    // 본다** — 같은 악기라도 곡에 따라 음역이 다르고, 악기를 안 고른 악보도 있어서.
    // 셈은 staff-core에 있다(꾸밈음까지 함께 세어야 하므로 실제로 그려질 음을 다 넘긴다).
    const dias = [];
    notes.forEach(function (n) {
      if (n.rest) return;
      dias.push(SC.pitchAt(n.midi, fifths).dia);
      (n.graces || []).forEach(function (m) { dias.push(SC.pitchAt(m, fifths).dia); });
      (n.afters || []).forEach(function (m) { dias.push(SC.pitchAt(m, fifths).dia); });
    });
    const clef = SC.pickClef(dias);

    // 대강 분절을 함께 실어 보낸다 — 정간을 8분음표로 보면 정간 하나가 한 박이 아니라서
    // 오선보의 빔이 대강으로 묶여야 한다(js/staff-view.js '빔 묶음' 참고). 비어 있으면 null.
    const daegang = parseDaegang(daegangTextFor(beats), beats).groups;

    // beats = 기본 각의 정간 수(박자표의 기준) · measBeats = 마디(=각)마다의 정간 수.
    // 길이가 다 같으면 measBeats가 전부 같은 값이라 예전과 똑같이 그려진다.
    return { name: (meta && meta.name) || "", abbr: (meta && meta.abbr) || "",
             fifths: fifths, clef: clef, beats: beats, measBeats: measBeats, bpm: bpm,
             unit: unit, jg: jg, daegang: daegang, measures: measures };
  }

  // 오선보가 무엇을 보여줄까는 **정간보의 '총보' 체크(#scoreView)를 그대로 따른다** —
  // 켜져 있으면 모든 악기를, 아니면 지금 편집 중인 악기만. 둘이 늘 같은 것을 보여야
  // 나란히 놓고 견줄 수 있다(그러라고 아래에 붙여 둔 창이다).
  function buildStaffScores() {
    stashActivePart();   // parts[]를 읽기 전엔 반드시 — melody는 문자열이라 사본이 낡는다
    const all = scoreViewOn();
    const idx = all ? parts.map(function (p, i) { return i; }) : [activePart];
    return idx.map(function (i) {
      const p = parts[i];
      // 오선보에 적을 이름 — 이름을 안 적고 **악기만 고른 경우에도** 그 악기가 보여야 한다
      // (위에서 고른 것과 아래 오선보가 같은 것을 가리켜야 하므로). 총보는 열을 가려야 하니
      // partLabel의 '파트 N'까지 쓰지만, 악기 하나짜리 파트보는 이름도 악기도 없으면 빈
      // 채로 둔다 — 거기 '파트 1'이라 적히면 알려 주는 것 없이 자리만 먹는다.
      const named = (p.name || "").trim()
        || (p.instrument && p.instrument !== "all" ? p.instrument : "");
      return staffScoreOf(i === activePart ? melodyFull : p.melody,
                          { name: all ? partLabel(p, i) : named, abbr: p.abbr });
    });
  }

  function buildMusicXml() {
    return window.JGB_MUSICXML.build(buildStaffScores(),
      { title: $("title").value, subtitle: $("subtitle").value });
  }

  function exportMusicXml() {
    track("export_musicxml");
    const blob = new Blob([buildMusicXml()], { type: "application/vnd.recordare.musicxml+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (($("title").value || "").trim() || "정간보") + ".musicxml";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  // 검증용 노출 (jgbShareLink·jgbAudioEvents와 같은 성격)
  window.jgbMusicXml = buildMusicXml;
  window.jgbStaffScores = buildStaffScores;
  window.jgbStaffPages = function () { return staffOnlyPages(); };   // 인쇄 쪽 SVG들(프로미스)
  window.jgbSidePages = function () { return sideBySidePages(); };

  // ---------- 오선보 보기 (정간보 아래 붙박이 칸) ----------
  // 그리는 일은 js/staff-view.js가 한다 — 이 절은 '언제 다시 그리나'와 창 여닫이만 맡는다.
  // 붙박이라 정간보를 고치면 곧바로 따라 바뀌어야 하는데, render()는 글자 한 자에도 불리므로
  // 그때마다 온 곡을 다시 풀면 타이핑이 뻑뻑해진다. 그래서 **열려 있을 때만, 한 박자 늦게**
  // 그린다(scheduleStaff). 이 절 밖에서 오선보를 직접 그리지 말 것.
  // var인 건 이 절이 파일 아래쪽에 있어서다 — render()는 여기보다 위에서 정의되고 로드
  // 도중에도 불릴 수 있는데, let이면 그때 아직 '못 만들어진 변수'라 예외가 난다(TDZ).
  // var는 hoisting되어 undefined로 읽히므로 scheduleStaff의 빗장이 조용히 지나간다.
  var staffOpen = false, staffZoom = 1, staffTimer = null, staffHeight = 0;

  // 배율·높이는 **앱 설정**으로 기억한다(다크·테마와 같은 성격) — 그건 '이 악보가 어떤
  // 악보인가'가 아니라 '내가 이 브라우저에서 어떻게 보는가'라, 문서에 넣으면 남이 내 악보를
  // 열었을 때 내 보기 방식이 따라간다. 그래서 collectState가 아니라 여기 따로 산다.
  // **열림은 일부러 안 기억한다** — 칸이 화면을 꽤 차지해서 켜 둔 채 잊으면 다음에 열 때
  // 종이가 좁아 보인다(2026-08-08 사용자 확정). 늘 닫힌 채로 시작한다.
  // 높이를 offsetHeight로 재지 않고 따로 들고 있는 건 칸이 닫혀 있을 때 그 값이 0이라서다.
  const STAFF_LS_KEY = "jgb_staff_v1";
  function saveStaffPrefs() {
    try {
      localStorage.setItem(STAFF_LS_KEY, JSON.stringify({ zoom: staffZoom, height: staffHeight }));
    } catch (e) {}
  }

  // ----- Verovio 조판 -----
  // 화면 오선보는 Verovio(www.verovio.org, LGPL)가 그린다 — 재료는 그대로 buildStaffScores()
  // 이고, 그것을 MusicXML(js/musicxml.js)로 적어 먹인다. MEI로 미리 바꿀 필요는 없다 —
  // Verovio가 안에서 스스로 바꾸므로 결과가 같다(2026-08-14 좌표 단위까지 대조).
  // js/vendor/verovio-toolkit-wasm.js(6.7MB, wasm 내장 단일 파일)는 오선보를 열 때만
  // <script>로 불러온다(janggu-audio와 같은 지연 로드 수법). 로드 전·실패 시엔 staff-view가
  // 예전처럼 그린다 — 조판기 하나 때문에 오선보가 통째로 막히면 안 된다.
  var vrvTk = null, vrvState = "";   // "" 안 불림 · "loading" · "failed"
  function loadVerovio() {
    if (vrvTk || vrvState) return;
    vrvState = "loading";
    const s = document.createElement("script");
    s.src = "js/vendor/verovio-toolkit-wasm.js";
    s.onload = function () {
      // 공식 초기화 절차 — wasm이 풀리면 불린다. 콜백을 script 실행 직후(onload)에 걸므로
      // 늦지 않는다(wasm 컴파일은 비동기라 이 시점엔 아직 안 끝나 있다).
      window.verovio.module.onRuntimeInitialized = function () {
        vrvTk = new window.verovio.toolkit();
        vrvState = "";
        scheduleStaff();
      };
    };
    s.onerror = function () { vrvState = "failed"; scheduleStaff(); };
    document.head.appendChild(s);
  }

  // 인쇄·PNG처럼 '지금 꼭 필요한' 쪽이 기다리는 창구 — 준비되면 조판기를, 실패하면 null을
  // 준다(받는 쪽이 staff-view로 물러난다). 15초를 넘겨도 안 오면 실패로 친다.
  function vrvReady() {
    if (vrvTk) return Promise.resolve(vrvTk);
    if (vrvState === "failed") return Promise.resolve(null);
    loadVerovio();
    return new Promise(function (res) {
      let waited = 0;
      (function poll() {
        if (vrvTk) return res(vrvTk);
        if (vrvState === "failed" || (waited += 100) > 15000) return res(null);
        setTimeout(poll, 100);
      })();
    });
  }

  // scores → Verovio SVG(쪽들을 이어 붙인 HTML). 배율은 staff-view와 딴 단위라
  // (Verovio scale 40 ≈ 지금 100%) staffZoom을 40에 곱해 옮긴다.
  function vrvRender(scores, width) {
    const scale = Math.max(15, Math.round(40 * staffZoom));
    vrvTk.setOptions({
      pageWidth: Math.max(600, Math.round(width * 100 / scale)),
      scale: scale,
      adjustPageHeight: true,
      pageHeight: 60000,     // 한 쪽에 담을 수 있는 최대 — 넘치면 쪽이 늘고 아래로 이어 붙인다
      breaks: "auto",
      header: "none", footer: "none"   // 제목·쪽번호는 칸에 안 그린다(staff-view와 같음)
    });
    const xml = window.JGB_MUSICXML.build(scores,
      { title: $("title").value, subtitle: $("subtitle").value });
    if (!vrvTk.loadData(xml)) throw new Error("Verovio가 MusicXML을 읽지 못했습니다");
    let html = "";
    const n = vrvTk.getPageCount();
    for (let i = 1; i <= n; i++) html += vrvTk.renderToSVG(i, {});
    grabTimemap();   // 재생 위치를 짚으려면 방금 조판한 이 데이터의 시간표가 필요하다
    return "<div class=\"vrv-out\">" + html + "</div>";
  }

  // ----- 재생 위치 짚기 -----
  // 재생 중 지금 울리는 음표를 오선보에서도 강조한다 — 정간보가 현재 정간을 상자로 짚는
  // 그 순간과 같은 것을 가리킨다. 자리를 우리가 다시 세지 않고 **Verovio가 조판과 함께
  // 내주는 timemap**(시각 → 음표 id)을 그대로 쓴다. 어긋날 수가 없는 것은 MusicXML에 적어
  // 보낸 <sound tempo>가 재생과 같은 #tempoBpm에서 나오기 때문이다(bpm 60·점4분음표면
  // tempo=90이 적히고 정간 하나가 딱 1000ms로 떨어짐을 실측, 2026-08-14).
  // **새 타이머를 두지 않는다** — 재생의 tick()에 얹는다. 시계가 둘이면 둘이 어긋난다.
  // 그림(staff-view)으로 물러난 경우엔 음표에 id가 없어 이 표시가 조용히 빠진다.
  var vrvTimemap = null;                     // [{ tstamp(ms), on:[id], off:[id] }]
  var vrvWalk = { i: 0, ms: -1, on: null };  // 훑어 온 자리 — 재생은 앞으로만 가므로 이어 센다
  var staffNowEls = [], staffNowKey = "";

  function grabTimemap() {
    vrvTimemap = null;
    try {
      const tm = vrvTk.renderToTimemap({ includeMeasures: false, includeRests: false });
      // 판에 따라 배열 그대로 주기도 하고 JSON 문자열로 주기도 한다
      vrvTimemap = typeof tm === "string" ? JSON.parse(tm) : tm;
    } catch (e) { vrvTimemap = null; }
    // 새로 그린 SVG라 옛 요소는 이미 떨어져 나갔다 — 훑던 자리도 표시도 처음부터
    vrvWalk = { i: 0, ms: -1, on: null };
    staffNowEls = []; staffNowKey = ""; staffNowSys = null;
  }

  // ms 시점에 **울리고 있는** 음표 id들. on/off를 차례로 걷어 '지금 켜져 있는 것'을 센다 —
  // 마지막에 시작한 음표만 보면 총보에서 다른 파트의 긴 음이 꺼진다.
  function vrvNotesAt(ms) {
    if (!vrvTimemap) return null;
    if (!vrvWalk.on || ms < vrvWalk.ms) vrvWalk = { i: 0, ms: -1, on: {} };   // 되감김
    while (vrvWalk.i < vrvTimemap.length && vrvTimemap[vrvWalk.i].tstamp <= ms) {
      const e = vrvTimemap[vrvWalk.i++];
      (e.off || []).forEach(function (id) { delete vrvWalk.on[id]; });
      (e.on || []).forEach(function (id) { vrvWalk.on[id] = 1; });
    }
    vrvWalk.ms = ms;
    return Object.keys(vrvWalk.on);
  }

  // 현재 음표가 칸 밖으로 나가면 보이는 자리로 끌어온다.
  // **세로는 줄(system)이 바뀔 때만 움직인다.** 음표마다 세로를 맞추면 음높이를 따라 악보가
  // 위아래로 출렁여 읽을 수가 없다(2026-08-14 사용자 제보) — 한 줄을 지나는 동안 종이는
  // 가만히 있어야 한다. 가로는 각을 두 줄에 걸쳐 쪼개지 않는 탓에 각이 창보다 넓을 수
  // 있어(위 '#staffBody' CSS 주석) 그때만 따라간다.
  // smooth를 안 쓰는 건 60ms마다 불리는 자리라 부드러운 스크롤이 서로를 밀어내기 때문.
  var staffNowSys = null;
  function scrollStaffTo(el) {
    const body = $("staffBody");
    if (!body) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;      // 아직 그려지지 않았거나 숨은 요소
    const b = body.getBoundingClientRect(), PAD = 40;
    if (r.left < b.left + PAD || r.right > b.right - PAD) {
      body.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
    }
    const sys = el.closest ? el.closest("g.system") : null;
    if (!sys || sys === staffNowSys) return;   // 같은 줄이면 세로는 손대지 않는다
    staffNowSys = sys;
    const sr = sys.getBoundingClientRect();
    if (sr.top < b.top || sr.bottom > b.bottom) body.scrollTop += sr.top - b.top - 8;
  }

  // 재생 쪽(tick·stopPlayback)이 부르는 창구. ms=null이면 표시를 걷는다.
  // 60ms마다 불리므로 **바뀐 것이 없으면 DOM을 안 건드린다** — 매번 다시 칠하면 긴 곡에서
  // 눈에 띄게 버벅인다.
  function staffPlayMark(ms) {
    const body = $("staffBody");
    if (!body) return;
    const ids = (staffOpen && ms != null) ? (vrvNotesAt(ms) || []) : [];
    const key = ids.join(",");
    if (key === staffNowKey) return;
    staffNowKey = key;
    staffNowEls.forEach(function (el) { el.classList.remove("staff-now"); });
    staffNowEls = [];
    ids.forEach(function (id) {
      const el = body.querySelector("[id=\"" + id + "\"]");
      if (el) { el.classList.add("staff-now"); staffNowEls.push(el); }
    });
    if (staffNowEls.length) scrollStaffTo(staffNowEls[0]);
  }
  // 재생 표시가 제대로 짚는지는 눈 말고는 볼 길이 없어 창구를 하나 낸다
  // (window.jgbAudioEvents·jgbShareLink와 같은 성격의 검증용 노출).
  window.jgbStaffNow = function (ms) {
    return { timemap: vrvTimemap && vrvTimemap.length, open: staffOpen,
             at: ms == null ? null : vrvNotesAt(ms), marked: staffNowKey };
  };

  function staffDraw() {
    const body = $("staffBody");
    if (!body || !staffOpen) return;
    if (!window.JGB_STAFF) { body.innerHTML = "<div class='staff-empty'>오선보 그리기를 불러오지 못했습니다.</div>"; return; }
    let scores;
    try {
      scores = buildStaffScores();
    } catch (err) {
      console.error("오선보를 만들지 못했습니다:", err);
      body.innerHTML = "<div class='staff-empty'>이 악보는 아직 오선보로 옮기지 못합니다.</div>";
      return;
    }
    const notes = scores.reduce(function (a, sc) {
      return a + sc.measures.reduce(function (b, m) {
        return b + m.filter(function (n) { return !n.rest; }).length;
      }, 0);
    }, 0);
    if (!notes) {
      body.innerHTML = "<div class='staff-empty'>정간에 율명을 적으면 여기에 오선보로 나타납니다.</div>";
      return;
    }
    const width = Math.max(320, body.clientWidth - 8);
    if (vrvTk) {
      try { body.innerHTML = vrvRender(scores, width); return; }
      catch (err) { console.error("Verovio 조판 실패 — staff-view로 물러납니다:", err); }
    } else if (!vrvState) loadVerovio();   // 처음 그릴 때 뒤에서 불러 두고 우선 staff-view로
    body.innerHTML = window.JGB_STAFF.render(scores, { width: width, scale: staffZoom });
  }

  // render()가 부른다. 창이 닫혀 있으면 아무 일도 안 하므로 평소엔 값이 0이다.
  function scheduleStaff() {
    if (!staffOpen) return;
    clearTimeout(staffTimer);
    staffTimer = setTimeout(staffDraw, 120);
  }

  function applyStaffOpen(on) {
    staffOpen = on;
    const pane = $("staffPane");
    if (pane) pane.hidden = !on;
    if ($("btnStaff")) $("btnStaff").classList.toggle("on", on);
    if (on) { loadVerovio(); staffDraw(); }   // 조판기는 여는 순간부터 뒤에서 불러 둔다
    else staffPlayMark(null);                 // 닫으면 재생 표시도 함께 걷는다
  }

  function setStaffZoom(z, quiet) {
    staffZoom = Math.min(3, Math.max(0.6, Math.round(z * 20) / 20));
    if ($("staffZoomVal")) $("staffZoomVal").textContent = Math.round(staffZoom * 100) + "%";
    staffDraw();
    if (!quiet) saveStaffPrefs();   // quiet = 저장분을 되살리는 중(그대로 다시 쓸 필요 없음)
  }

  function setStaffHeight(px, quiet) {
    staffHeight = Math.min(window.innerHeight - 180, Math.max(90, px));
    if ($("staffPane")) $("staffPane").style.height = staffHeight + "px";
    if (!quiet) saveStaffPrefs();
  }

  // ---------- 오선보 인쇄·PNG ----------
  // 화면 칸의 오선보는 창 너비에 맞춰 줄을 접은 **한 덩어리**다. 종이로 옮기려면 종이 폭에
  // 맞춰 다시 접고 높이만큼 잘라 여러 쪽으로 나눠야 한다. 자르는 자리는 **줄(system)
  // 경계**뿐이다 — 오선 한 줄을 반으로 잘라 다음 장으로 넘기는 악보는 없다.
  // 줄 높이·줄 수는 staff-view가 그림에 적어 보낸다(data-sys-h·data-sys-count). 그리기 셈을
  // 여기 한 벌 더 적으면 오선보를 고칠 때 인쇄만 옛 자리에서 자른다.
  //
  // 종이 크기·방향·여백은 **정간보와 같은 값**을 쓴다(#paperSize·#orientation·페이지 채움).
  // 두 표기를 나란히 놓고 볼 때 여백이 다르면 딴 종이에 찍은 것처럼 보인다.
  const STAFF_PRINT_SCALE = 1.15;   // 인쇄용 오선 크기 — 화면 배율(보는 사람 사정)과 무관하다

  function paperWH() {
    const paper = paperSize();
    const landscape = $("orientation").value === "landscape";
    return { w: landscape ? paper.h : paper.w, h: landscape ? paper.w : paper.h };
  }
  function paperMargin() {
    const pct = Math.max(0, Math.min(100, parseFloat($("pageFill").value) || 0));
    return MARGIN_MIN + (MARGIN_BASE - MARGIN_MIN) * (1 - pct / 100);
  }

  // 오선보 그림 하나 → 종이에 앉힌 쪽 목록(SVG 문자열).
  //   box = { x, y, w, h }  종이 안에서 오선보가 앉을 자리(mm). 없으면 여백 안 전체.
  // 되돌려주는 것은 { pages: [{ y0, sysCount }], svgAt(i) } 가 아니라 그냥 쪽 SVG 문자열들.
  function staffSheetPages(scores, opts) {
    opts = opts || {};
    const P = paperWH(), M = paperMargin();
    const box = opts.box || { x: M, y: M, w: P.w - 2 * M, h: P.h - 2 * M };
    // 그림 폭(사용자 단위)은 종이 폭에 비례해 잡는다 — 종이가 좁으면 줄이 짧게 접힌다.
    // 3.78 = 1mm를 그리기 단위 몇으로 볼 것인가(96dpi 어림). 이 값이 곧 '종이에서의 오선 크기'를
    // 정하므로 STAFF_PRINT_SCALE과 짝이다.
    const unitPerMm = 3.78;
    const inner = window.JGB_STAFF.render(scores, {
      width: Math.max(320, box.w * unitPerMm), scale: STAFF_PRINT_SCALE
    });
    if (!inner) return [];
    const m = inner.match(/data-sys-h="([\d.]+)" data-sys-count="(\d+)" data-top="([\d.]+)"/);
    const vb = inner.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (!m || !vb) return [];
    const sysH = parseFloat(m[1]), sysN = parseInt(m[2], 10), top = parseFloat(m[3]);
    const W = parseFloat(vb[1]);
    const k = box.w / W;                                   // 사용자 단위 → mm
    const perPage = Math.max(1, Math.floor((box.h / k) / sysH));
    // 줄 단위로 가른다 — 쪽마다 **제 줄만** 싣기 위해서다. 통째로 싣고 viewBox로 오려 내면
    // 그림은 맞게 나오지만 쪽마다 곡 전체를 품게 되어(쪽 수 × 줄 수) 200각짜리에서 파일이
    // 터진다. 가르는 자리는 staff-view가 찍어 둔 <!--sys--> 주석이다.
    const body = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const chunks = body.split("<!--sys-->");
    const pre = chunks.shift() || "";     // 줄보다 앞에 그려지는 것(지금은 없다)
    const pages = [];
    for (let i = 0; i < sysN; i += perPage) {
      const n = Math.min(perPage, sysN - i);
      pages.push({
        // 그 쪽에 실린 줄 범위 — 나란히 인쇄가 '어느 각까지 실렸나'를 이걸로 안다
        sys0: i, sysCount: n,
        // 안쪽 <svg>가 그 줄들이 놓인 자리만 보이게 오려 낸다(y 자리는 원래 그대로 두고
        // viewBox를 옮긴다 — 줄마다 좌표를 다시 셈하면 그리기 셈을 여기 옮겨 적는 꼴이 된다)
        svg: "<svg x=\"" + box.x + "\" y=\"" + box.y + "\" width=\"" + box.w +
             "\" height=\"" + (n * sysH * k) + "\" viewBox=\"0 " + (top + i * sysH) + " " +
             W + " " + (n * sysH) + "\" overflow=\"hidden\">" + pre +
             chunks.slice(i, i + n).join("") + "</svg>"
      });
    }
    return pages;
  }

  // ── Verovio 쪽 나눔 — 화면과 같은 조판기가 종이도 접는다 ──
  // staff-view의 staffSheetPages(위)가 줄 경계 주석으로 쪽을 갈랐다면, Verovio는 종이
  // 크기(pageWidth/pageHeight)를 주면 **스스로 쪽을 접는다** — 줄을 반으로 자르지 않는
  // 규칙도 저들이 지킨다. staffSheetPages는 조판기를 못 불러왔을 때의 대비책으로 남는다.
  //   box(mm) 안에 앉는 쪽들을 [{svg}]로 준다 — svg는 종이(mm) 좌표에 앉힌 조각(같은 계약).
  //   measStart = 첫 마디 번호(나란히가 각 범위를 잘라 쪽마다 만들 때 번호가 이어지게).
  function vrvSheetPages(scores, box, measStart) {
    // 3.78 = 1mm를 그리기 단위 몇으로 볼 것인가(96dpi 어림) — staffSheetPages와 같은 값.
    // scale은 화면 100%(40)에 인쇄 배율(STAFF_PRINT_SCALE)을 곱한 것 — 화면 배율과 무관.
    const pxW = box.w * 3.78, pxH = box.h * 3.78;
    const scale = Math.round(40 * STAFF_PRINT_SCALE);
    vrvTk.setOptions({
      pageWidth: Math.max(100, Math.round(pxW * 100 / scale)),
      pageHeight: Math.max(100, Math.round(pxH * 100 / scale)),
      scale: scale,
      adjustPageHeight: false,   // 인쇄는 쪽 높이가 한결같아야 한다(화면 칸과 다른 점)
      breaks: "auto",
      header: "none", footer: "none"
    });
    const xml = window.JGB_MUSICXML.build(scores,
      { title: $("title").value, subtitle: $("subtitle").value, measStart: measStart });
    if (!vrvTk.loadData(xml)) return [];
    const pages = [];
    const n = vrvTk.getPageCount();
    for (let i = 1; i <= n; i++) {
      // 루트 <svg width="Wpx" height="Hpx">를 종이(mm) 좌표의 상자로 갈아입힌다 —
      // 비율은 pageWidth/Height를 box에서 셈했으니 그대로 맞는다(반올림 오차뿐).
      const svg = vrvTk.renderToSVG(i, {});
      const m = svg.match(/^<svg width="([\d.]+)px" height="([\d.]+)px"/);
      if (!m) continue;
      const W = parseFloat(m[1]), H = parseFloat(m[2]);
      pages.push({
        svg: svg.replace(/^<svg width="[\d.]+px" height="[\d.]+px"/,
          "<svg x=\"" + box.x + "\" y=\"" + box.y + "\" width=\"" + box.w +
          "\" height=\"" + (box.w * H / W) + "\" viewBox=\"0 0 " + W + " " + H + "\"")
      });
    }
    return pages;
  }

  // 쪽 SVG 하나를 종이 크기 상자에 담는다(정간보 페이지와 같은 꼴 — 흰 바탕 + mm viewBox).
  function paperWrap(innerSvg) {
    const P = paperWH();
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + P.w + " " + P.h +
           "\" class=\"staff-page-svg\"><rect x=\"0\" y=\"0\" width=\"" + P.w + "\" height=\"" +
           P.h + "\" fill=\"#fff\"/>" + innerSvg + "</svg>";
  }

  // 오선보 재료 — 못 만들면 왜인지 알려 주고 멈춘다(인쇄 대화상자가 빈 종이로 뜨는 것보다 낫다)
  function staffScoresOrWarn() {
    try {
      const sc = buildStaffScores();
      const notes = sc.reduce(function (a, s) {
        return a + s.measures.reduce(function (b, m) {
          return b + m.filter(function (n) { return !n.rest; }).length;
        }, 0);
      }, 0);
      if (!notes) { alert("정간에 율명을 적으면 오선보를 뽑을 수 있습니다."); return null; }
      return sc;
    } catch (err) {
      console.error("오선보를 만들지 못했습니다:", err);
      alert("이 악보는 아직 오선보로 옮기지 못합니다.");
      return null;
    }
  }

  // 인쇄용 종이들을 #staffSheet에 깔고 인쇄한다. body.print-staff가 정간보(#sheet)를 감추고
  // 이쪽을 내놓는다 — 인쇄가 끝나면(afterprint) 도로 걷는다.
  function printPages(htmlPages, what) {
    const holder = $("staffSheet");
    if (!holder || !htmlPages.length) return;
    holder.innerHTML = htmlPages.map(function (s) {
      return "<div class=\"page\">" + s + "</div>";
    }).join("");
    document.body.classList.add("print-staff");
    track("export_print", { v: what });
    const done = function () {
      document.body.classList.remove("print-staff");
      holder.innerHTML = "";
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    // afterprint를 안 주는 브라우저 대비 — 인쇄 대화상자는 print()를 막고 서므로 여기 오면 끝난 뒤다
    setTimeout(done, 1000);
  }

  // SVG 문자열 목록 → PNG 파일들(정간보 저장과 같은 300dpi). 종이 크기 상자라 viewBox가 mm다.
  function downloadSvgPngs(svgs, base) {
    const multi = svgs.length > 1;
    svgs.forEach(function (svgText, idx) {
      const vb = (svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || [0, 210, 297]);
      const pw = parseFloat(vb[1]) || 210, ph = parseFloat(vb[2]) || 297;
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
      img.src = "data:image/svg+xml;base64," +
                btoa(unescape(encodeURIComponent(svgText)));
    });
  }

  // 조판기 로드를 기다려야 해서 **프로미스**를 준다 — 준비 전에 눌러도 기다렸다 뽑고,
  // 못 불러오면 staff-view 쪽 나눔으로 물러난다(화면 칸과 같은 규칙).
  function staffOnlyPages() {
    const scores = staffScoresOrWarn();
    if (!scores) return Promise.resolve([]);
    return vrvReady().then(function (tk) {
      const P = paperWH(), M = paperMargin();
      const pages = tk
        ? vrvSheetPages(scores, { x: M, y: M, w: P.w - 2 * M, h: P.h - 2 * M }, 1)
        : staffSheetPages(scores);
      return pages.map(function (p) { return paperWrap(p.svg); });
    });
  }
  function printStaffOnly() {
    staffOnlyPages().then(function (pages) { printPages(pages, "staff"); });
  }
  function pngStaffOnly() {
    staffOnlyPages().then(function (pages) {
      if (!pages.length) return;
      track("export_png", { v: "staff" + pages.length + "p" });
      downloadSvgPngs(pages, (($("title").value || "").trim() || "정간보") + "-오선보");
    });
  }

  // ── 나란히 — 한 장을 좌우로 갈라 **왼쪽 오선보 / 오른쪽 정간보** ──
  // 정간보가 종이 오른쪽 끝에서 시작해 왼쪽으로 읽으므로 오른쪽 반을 정간보에 준다.
  // 정간보는 '반 폭 종이'로 **다시 앉혀** 넣는다 — 전체 폭 배치를 그대로 줄이면 아래 반이
  // 통째로 비기 때문. 그래서 종이 칸을 잠깐 반 폭으로 바꿔 render()를 한 번 돌리고,
  // 그린 것을 걷은 뒤 원래 값으로 되돌려 다시 그린다(render는 컨트롤을 읽어 그릴 뿐
  // 저장·되돌리기를 건드리지 않는다).
  // 대응은 **쪽 단위**다: 그 쪽의 정간보에 담긴 각 = 그 쪽 오선보의 마디. 줄 단위까지 맞추려면
  // 각마다 오선 한 줄을 강제해야 하는데, 그러면 짧은 각에서 오선보가 뭉텅뭉텅 빈다.
  function sideBySidePages() {
    const scores = staffScoresOrWarn();
    if (!scores) return Promise.resolve([]);
    const P = paperWH(), M = paperMargin();
    const halfW = P.w / 2;
    // 사용자 지정 종이는 60mm가 아래끝이다(그보다 좁으면 배치가 터져 기본값으로 되돌려진다).
    // 반으로 갈라 그 아래로 내려가면 나란히는 애초에 될 일이 아니다.
    if (halfW < 60) {
      alert("종이가 좁아 나란히 뽑을 수 없습니다.\n종이를 키우거나 가로로 두고 다시 해보세요.");
      return Promise.resolve([]);
    }

    // ① 정간보를 반 폭으로 다시 앉히고 쪽마다 그림과 각 범위를 걷는다.
    //    방향(가로/세로)도 잠깐 세로로 둔다 — render가 가로일 때 폭·높이를 뒤집으므로
    //    가로인 채로 반 폭을 적어 넣으면 뒤집혀 엉뚱한 종이가 된다.
    const keep = { size: $("paperSize").value, w: $("paperW").value, h: $("paperH").value,
                   orient: $("orientation").value };
    $("paperSize").value = "custom";
    $("paperW").value = String(Math.round(halfW * 10) / 10);
    $("paperH").value = String(P.h);
    $("orientation").value = "portrait";
    let jgPages = [];
    try {
      render();
      jgPages = Array.prototype.map.call($("sheet").querySelectorAll(".page svg"), function (svg, i) {
        const node = svg.cloneNode(true);
        node.querySelectorAll(".no-print").forEach(function (n) { n.remove(); });
        if ($("gakNumMode").value === "screen") {
          node.querySelectorAll(".gak-num").forEach(function (n) { n.remove(); });
        }
        const r = pageGakRanges[i] || { start: 0, end: 0 };
        return { xml: new XMLSerializer().serializeToString(node), start: r.start, end: r.end };
      });
    } finally {
      $("paperSize").value = keep.size;
      $("paperW").value = keep.w;
      $("paperH").value = keep.h;
      $("orientation").value = keep.orient;
      render();
    }
    if (!jgPages.length) return Promise.resolve([]);

    // ② 쪽마다 그 각 범위의 오선보를 왼쪽 반에 앉힌다 — 조판은 화면과 같은 Verovio,
    //    못 불러왔으면 staff-view(같은 상자·같은 계약이라 갈아끼우기만 하면 된다).
    return vrvReady().then(function (tk) {
      return jgPages.map(function (jp) {
        const cut = scores.map(function (s) {
          return Object.assign({}, s, { measures: s.measures.slice(jp.start, jp.end) });
        });
        const box = { x: M, y: M, w: halfW - M * 1.5, h: P.h - 2 * M };
        // 마디 번호는 jp.start+1부터 — 쪽마다 잘라 만들어도 번호가 곡 전체로 이어진다
        const left = tk ? vrvSheetPages(cut, box, jp.start + 1)
                        : staffSheetPages(cut, { box: box });
        // 각이 많아 왼쪽 반에 다 안 들어가면 첫 쪽만 넣는다 — 넘치는 줄은 잘린다.
        // 한 쪽에 정간보 각이 몇이나 들어가나는 정간보 배치가 정하므로, 여기서 더 나누면
        // 오른쪽 정간보와 짝이 어긋난다(짝이 맞는 것이 이 인쇄의 전부다).
        const staffSvg = left.length ? left[0].svg : "";
        // 오른쪽 반에 정간보 쪽 그림을 통째로 앉힌다(제 viewBox가 반 폭 종이라 그대로 들어간다)
        const jgSvg = jp.xml
          .replace(/^<svg /, "<svg x=\"" + halfW + "\" y=\"0\" width=\"" + halfW +
                             "\" height=\"" + P.h + "\" ");
        return paperWrap(staffSvg + jgSvg);
      });
    });
  }
  function printSideBySide() {
    sideBySidePages().then(function (pages) { printPages(pages, "side"); });
  }
  function pngSideBySide() {
    sideBySidePages().then(function (pages) {
      if (!pages.length) return;
      track("export_png", { v: "side" + pages.length + "p" });
      downloadSvgPngs(pages, (($("title").value || "").trim() || "정간보") + "-나란히");
    });
  }

  if ($("btnStaff")) {
    $("btnStaff").addEventListener("click", function () {
      applyStaffOpen(!staffOpen);
      if (staffOpen) track("staff_open");
    });
    $("staffClose").addEventListener("click", function () { applyStaffOpen(false); });
    $("staffZoomIn").addEventListener("click", function () { setStaffZoom(staffZoom + 0.15); });
    $("staffZoomOut").addEventListener("click", function () { setStaffZoom(staffZoom - 0.15); });
    // 저장해 둔 보기 설정 되살리기 — 열림은 뺀다(늘 닫힌 채 시작). 값이 이상하면 그냥 무시하고
    // 기본값으로 둔다: 보기 설정 하나 때문에 앱이 안 뜨면 안 된다.
    try {
      const pref = JSON.parse(localStorage.getItem(STAFF_LS_KEY) || "null");
      if (pref && typeof pref === "object") {
        if (typeof pref.zoom === "number" && isFinite(pref.zoom)) setStaffZoom(pref.zoom, true);
        if (typeof pref.height === "number" && isFinite(pref.height) && pref.height > 0) {
          setStaffHeight(pref.height, true);
        }
      }
    } catch (e) {}
    // 뽑기 메뉴 — 파일(MusicXML) · 오선보만 인쇄/PNG · 정간보와 나란히 인쇄/PNG
    wireTopMenu("staffOutToggle", "staffOutPop");
    $("staffExport").addEventListener("click", exportMusicXml);
    $("staffPrint").addEventListener("click", printStaffOnly);
    $("staffPng").addEventListener("click", pngStaffOnly);
    $("staffPrintSide").addEventListener("click", printSideBySide);
    $("staffPngSide").addEventListener("click", pngSideBySide);
    // 정간을 무엇으로 보나 · 조표를 무엇으로 적나 — 둘 다 문서 값이라 saveState까지 부른다
    // (배율·높이는 브라우저별 보기 설정이라 다른 자리에 산다).
    $("staffUnit").addEventListener("change", function () { staffDraw(); saveState(); });
    $("staffKey").addEventListener("change", function () { staffDraw(); saveState(); });
    // 창 폭이 바뀌면 줄 나눔이 달라지므로 다시 그린다(열려 있을 때만).
    window.addEventListener("resize", scheduleStaff);
    // 높이 끌기 — #melodyResizer와 같은 손놀림. 위로 끌면 커진다.
    const grip = $("staffResizer");
    grip.addEventListener("mousedown", function (e) {
      e.preventDefault();
      const y0 = e.clientY, h0 = $("staffPane").offsetHeight;
      // 끄는 동안에는 저장하지 않는다 — 손을 뗄 때 한 번만(마우스가 움직일 때마다
      // localStorage를 쓰면 끌기가 뻑뻑해진다).
      const move = function (ev) { setStaffHeight(h0 + (y0 - ev.clientY), true); };
      const up = function () {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        saveStaffPrefs();
        staffDraw();   // 높이가 바뀌면 보이는 줄 수가 달라진다
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  // ---------- 저장 / 불러오기 ----------
  const CTRL_IDS = ["paperSize", "paperW", "paperH", "orientation", "beats", "gakBeats", "gakPerRow", "stackCount", "stackAuto", "gakCount",
    "daegang", "noteMode", "sizeScale", "pageFill", "noteScale", "lyricsScale", "cellSize", "gakGap", "bandGap", "header", "frame",
    "title", "titleSize", "titleOffset", "titleOffsetX", "titleSpacing",
    "subtitle", "subSize", "subOffset", "subOffsetX", "subSpacing", "titleFont", "titleLayout", "titleGakWidth",
    "hwangPitch", "tempoBpm", "playJanggu", "playSigimsae", "tempoBpmGak", "tempoBpmGakMax", "wantJangdan", "wantTempo", "lyricsFont", "palSound", "palInsert", "joPreset", "pageNumPos", "gakNumMode",
    "gakNameSize", "gakNameGap", "gakNameHanja", "tempoSize", "tempoGap", "tempoSpacing", "tempoOffX",
    "scoreView", "staffUnit", "staffKey"];
  const LS_KEY = "jgb_state_v1";

  // 이 문서가 서버에 게시된 것이라면 그 게시물 id(js/cloud.js가 읽고 쓴다).
  // **수정 토큰은 여기 두지 않는다** — 권한은 게시한 브라우저의 localStorage에만 있어야 하고,
  // 문서에 실으면 파일(.jgb.json)·링크를 타고 남의 손에 그대로 넘어간다.
  // id를 문서 상태에 두는 까닭: '새 문서·불러오기·되돌리기·링크 열기'가 저마다 따로 챙기지
  // 않아도 정체성이 문서를 따라다녀 저절로 맞는다. 남의 파일을 열면 그 사람의 id가 딸려오지만
  // 토큰이 없어 갱신은 못 하고 새 게시로 흐르며, 그때 이 값이 '원본'으로 기록된다.
  let pubId = null;

  function collectState() {
    stashActivePart();   // 전역 작업 사본(melodyFull 등)을 파트 목록에 되써 넣고 나서 뜬다
    viewLayouts[layoutView] = grabViewLayout();   // 지금 보기의 레이아웃도 제 프로필에
    const c = {};
    CTRL_IDS.forEach(function (id) {
      const el = $(id);
      c[id] = (el.type === "checkbox") ? el.checked : el.value;
    });
    const at = document.querySelector(".tab.active");
    // v:2 — 선율·곁줄·정간 서식·악기가 parts[]로 들어갔다(총보). 옛 v1의 루트
    // melody·lyrics·cellStyles·ornInstrument는 더 안 쓰고, 읽기(applyState)만 남긴다.
    return { v: 2, controls: c, jangdan: $("jangdan").value,
             parts: parts, activePart: activePart, viewLayouts: viewLayouts, gakUserSet: gakUserSet,
             daegangAuto: daegangAuto, activeTab: at ? at.getAttribute("data-tab") : "input",
             customTexts: customTexts, palZoom: palZoom, ornPalZoom: ornPalZoom, edFontPx: edFontPx,
             melInput: inputMode, ribbonPos: ribbonPos, ornAddMap: ornAddMap, ornAddMaps: ornAddMaps,
             symRecent: symRecent,
             tempoBpmUserSet: tempoBpmUserSet, pubId: pubId,
             gakNames: gakNames, gakNameOffs: gakNameOffs, leftDockW: leftDockW };
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
    // 정간 단위가 문서에 안 적혀 있으면 **'자동'으로 되돌린다** — 위 루프는 없는 칸을 건너뛰어
    // 앞서 보던 악보의 값이 남는데, 그러면 남의 12정간 곡을 열었을 때 36/8로 펼쳐진다
    // (국악원 자료처럼 이 칸이 없는 문서가 있다). 적혀 있으면 그 값이 그대로 이긴다.
    if (!("staffUnit" in s.controls) && $("staffUnit")) $("staffUnit").value = "auto";
    if (typeof s.jangdan === "string") $("jangdan").value = s.jangdan;   // 장단은 곡에 하나(공유)
    // 파트 — v2는 parts[]. v1(옛 저장분·파일·박제된 링크)은 루트의 단일 선율·곁줄·서식을
    // 파트 1개로 승계한다(tempoBpm 승계와 같은 관례 — 옛 문서는 그대로 열려야 한다).
    if (Array.isArray(s.parts) && s.parts.length) {
      parts = s.parts.map(sanitizePart).filter(Boolean);
    } else {
      parts = [sanitizePart({ melody: s.melody, lyrics: s.lyrics,
        cellStyles: s.cellStyles, instrument: s.ornInstrument })];
    }
    if (!parts.length) parts = [newPart()];
    nextPartId = parts.reduce(function (m, p) { return Math.max(m, p.id + 1); }, nextPartId);
    activePart = Math.min(Math.max(0, parseInt(s.activePart, 10) || 0), parts.length - 1);
    hydrateActivePart();   // melodyFull·lyricsFull·cellStyles·ornInstrument가 활성 파트를 따라간다
    renderPartsList();
    // 보기별 레이아웃 — controls에는 저장 당시 보기의 작업 사본이 실려 있으므로,
    // layoutView를 그 보기로 맞춰 두면 다음 전환 때 제 프로필에 stash된다.
    viewLayouts = { part: null, score: null };
    if (s.viewLayouts && typeof s.viewLayouts === "object") {
      ["part", "score"].forEach(function (k) {
        const o = s.viewLayouts[k];
        if (!o || typeof o !== "object") return;
        const c2 = {};
        VIEW_LAYOUT_IDS.forEach(function (id) { if (id in o) c2[id] = o[id]; });
        viewLayouts[k] = c2;
      });
    }
    layoutView = scoreViewOn() ? "score" : "part";
    edPage = 0; edRange = null; edLyRange = null;
    gakUserSet = !!s.gakUserSet;
    daegangAuto = s.daegangAuto || "";
    // 게시물 id — 꼴이 이상하면 조용히 버린다(남이 손댄 파일도 그냥 열려야 한다)
    pubId = (typeof s.pubId === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(s.pubId)) ? s.pubId : null;
    if (s.activeTab) applyActiveTab(s.activeTab);
    customTexts = Array.isArray(s.customTexts) ? s.customTexts : [];
    nextTextId = customTexts.reduce(function (m, t) { return Math.max(m, (t.id || 0) + 1); }, 1);
    textSel = null;
    gakNames = (s.gakNames && typeof s.gakNames === "object") ? s.gakNames : {};
    gakNameOffs = (s.gakNameOffs && typeof s.gakNameOffs === "object") ? s.gakNameOffs : {};
    renderGakNameList();
    // 시김새 우선순위 악기는 파트 소속이 됐다(위 hydrate가 정함) — 셀렉트만 따라 맞춘다
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
    // 빠르기 — 옛 저장분엔 표기용 칸(tempoBpmGak)이 없고 재생 BPM 하나뿐이었다. 그때는 둘이
    // 늘 같은 값이었으므로 재생 BPM을 표기 최소값으로 승계해야 악보가 예전 그대로 나온다.
    if (s.controls && !("tempoBpmGak" in s.controls) && ("tempoBpm" in s.controls)) {
      $("tempoBpmGak").value = s.controls.tempoBpm;
    }
    tempoBpmUserSet = !!s.tempoBpmUserSet;
    // 최근 쓴 기호(줄별) — 옛 저장분엔 없으니 없으면 빈 목록. 모르는 줄 이름은 버린다.
    symRecent = { mel: [], lyric: [], jd: [] };
    if (s.symRecent && typeof s.symRecent === "object") {
      Object.keys(symRecent).forEach(function (lane) {
        const arr = s.symRecent[lane];
        if (Array.isArray(arr)) {
          symRecent[lane] = arr.filter(function (x) { return typeof x === "string"; })
            .slice(0, SYM_RECENT_MAX);
        }
      });
    }
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

  // ---------- 남이 준 악보 들이기 (링크·게시물 공용) ----------
  // 받은 악보를 화면에 들이는 절차는 출처가 무엇이든 같다: 작업 중이던 문서가 있으면 먼저
  // 묻고, 예이면 그 문서를 보관함에 자동 저장한 뒤 교체한다. 링크(#s=)가 쓰던 절차를 그대로
  // 뽑아 둔 것으로, 뒤에 붙는 게시물 열기(js/cloud.js)도 이 길을 타야 한다 — '남의 악보가 내
  // 작업을 조용히 덮지 않는다'는 약속은 출처가 늘 때마다 다시 쓸 것이 아니다.
  // 반환값 false = 사용자가 취소 → 부른 쪽은 아무것도 바꾸지 말 것.
  function adoptState(state, hadWork, openMsg, snapTag) {
    if (hadWork) {
      if (!confirm(openMsg + "\n지금 작업은 사이드바 '보관' 탭에 저장해 둡니다.")) return false;
      const list = loadSnaps();
      list.unshift({ id: Date.now(), name: (($("title").value.trim() || "제목 없음") + " — " + snapTag),
        time: new Date().toISOString(), state: collectState() });
      while (list.length > SNAP_MAX) list.pop();
      saveSnaps(list); renderSnapList();
    }
    restoreFromState(state);
    return true;
  }

  // ---------- 바깥에 여는 문서 훅 (window.jgbDoc) ----------
  // app.js는 단일 IIFE라 바깥에서 속을 들여다볼 수 없다. 나중에 붙는 기능(서버 게시
  // js/cloud.js 등)이 이 파일을 고치지 않고도 문서를 읽고 들일 수 있도록 꼭 필요한 것만
  // 내놓는다 — window.jgbShareLink·window.jgbTrack과 같은 성격의 창구다.
  // 여기 없는 것이 곧 경계다: 렌더러·팔레트·내부 상태는 바깥에서 못 만진다.
  window.jgbDoc = {
    state: collectState,                                    // 지금 문서 전체 (서버에 올릴 것)
    adopt: adoptState,                                      // 받은 문서를 화면에 들이기
    hasSavedWork: function () { return restored; },          // 들이기 전에 물어봐야 하는 상태인가
    title: function () { return $("title").value.trim(); },  // 목록·파일 이름에 쓰는 제목
    pubId: function () { return pubId; },                    // 이 문서가 어느 게시물인지
    // 게시 직후 부른다. 토큰은 받지 않는다 — 수정 권한은 문서가 아니라 브라우저에 있다.
    setPubId: function (id) { pubId = (typeof id === "string" && id) ? id : null; saveState(); },
  };

  // ---------- 링크 공유 (문서를 URL 해시에 담기) ----------
  // 문서 전체(collectState)를 deflate로 압축해 주소의 해시에 싣는다:
  //   https://umulsai.com/#s=1.<base64url>
  // 해시는 서버로 전송되지 않으므로 정적 페이지 그대로 동작한다(서버·계정 불요).
  // 압축은 브라우저 내장 CompressionStream("deflate-raw") — 외부 라이브러리를 안 들이는
  // 무의존 원칙 유지. 우락 전곡이 payload 약 2,000자(실측)라 메신저·브라우저 한계 안이고,
  // SHARE_WARN_LEN을 넘으면 파일 공유를 권한다. "1."은 버전 접두어 — 링크는 글·논문에
  // 박제되어 몇 년 뒤 열릴 수 있으므로, 형식이 바뀌어도 옛 버전 링크는 계속 읽어야 한다.
  const SHARE_WARN_LEN = 8000;
  function b64urlFromBytes(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)   // 한 번에 spread하면 인자 수 한계에 걸릴 수 있어 쪼갠다
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesFromB64url(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function bytesThroughStream(bytes, ts) {
    const stream = new Blob([bytes]).stream().pipeThrough(ts);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function shareLinkBuild() {
    const json = JSON.stringify(collectState());
    const comp = await bytesThroughStream(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
    return location.origin + location.pathname + "#s=1." + b64urlFromBytes(comp);
  }
  window.jgbShareLink = shareLinkBuild;   // 검증·임베드용 노출 (window.jgbTrack과 같은 성격)
  async function shareLinkCopy() {
    if (typeof CompressionStream === "undefined") { alert("이 브라우저는 링크 공유를 지원하지 않습니다."); return; }
    track("share_link");
    const link = await shareLinkBuild();
    if (link.length > SHARE_WARN_LEN &&
        !confirm("곡이 커서 링크가 매우 깁니다(" + link.length + "자). 메신저에 따라 잘릴 수 있으니 '파일로 저장' 공유를 권합니다.\n그래도 복사할까요?")) return;
    try {
      await navigator.clipboard.writeText(link);
      alert("악보를 담은 링크가 복사되었습니다.\n붙여넣기로 공유하세요.");
    } catch (e) {
      // 클립보드 권한이 없는 환경 — 손으로 복사할 수 있게 보여준다
      prompt("자동 복사가 막혀 있습니다. 아래 링크를 직접 복사해 주세요.", link);
    }
  }
  // 링크로 받은 악보 열기 — init에서 한 번 호출된다.
  // 규칙은 ?first=1과 같다: 해시는 쓰자마자 replaceState로 주소에서 뗀다 — 안 떼면 이
  // 주소를 새로고침할 때마다 편집하던 악보가 링크 내용으로 되돌아간다. 작업 중이던
  // 문서가 있으면(restored) confirm으로 묻고, 보관함에 자동 저장한 뒤 교체한다.
  async function consumeShareHash(hadWork) {
    const m = location.hash.match(/^#s=(\d+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return;
    const strip = function () { history.replaceState(null, "", location.pathname + location.search); };
    if (m[1] !== "1" || typeof DecompressionStream === "undefined") {
      strip(); alert("이 링크의 악보를 이 브라우저에서는 읽을 수 없습니다."); return;
    }
    try {
      const raw = await bytesThroughStream(bytesFromB64url(m[2]), new DecompressionStream("deflate-raw"));
      const state = JSON.parse(new TextDecoder().decode(raw));
      // 해시는 들이기 전에 뗀다 — 취소하든 열든 주소에는 남기지 않는다(원래 동작).
      strip();
      if (!adoptState(state, hadWork, "링크에 담긴 악보를 엽니다.", "링크 열기 전 자동 저장")) return;
      track("share_open");
    } catch (e) {
      strip();
      alert("링크의 악보를 읽지 못했습니다. 링크가 중간에 잘려 복사되었을 수 있습니다.");
    }
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
  // 눈으로 보며 맞추는 값(크기·간격·자간·위치)은 **치는 대로 바로** 반영한다 — [확인]을 눌러야
  // 보이면 한 번에 못 맞추고 몇 번씩 오간다. 대신 두 가지를 지킨다:
  //  · min/max 밖의 '치는 도중 값'은 렌더에 안 넘긴다 — 11을 치려고 1을 친 순간 정간이 1mm가
  //    되어 페이지가 수백 장으로 불어나는 걸 막는다(칸의 글자는 그대로 두고 렌더만 건너뜀).
  //  · 디바운스 — 한 글자마다 악보를 다시 그리면 타이핑이 끊긴다.
  // 개수를 정하는 값(정간 수·각 수·한 줄 각 수·대강)은 여기 쓰지 말 것 — 중간값도 범위 안이라
  // 걸러지지 않고, 배치가 통째로 뒤집혀 눈이 따라가지 못한다. 그쪽은 wireConfirm.
  function wireLive(el, apply) {
    if (!el) return;
    const num = function () {
      const v = parseFloat(el.value);
      if (el.value.trim() === "" || !isFinite(v)) return null;
      const mn = parseFloat(el.min), mx = parseFloat(el.max);
      if (isFinite(mn) && v < mn) return null;
      if (isFinite(mx) && v > mx) return null;
      return v;
    };
    let timer = null;
    el.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; if (num() !== null) apply(); }, 90);
    });
    // 스피너·포커스 아웃은 곧바로. 범위를 벗어난 채로 떠나면 칸을 범위 안으로 당겨 맞춘다.
    el.addEventListener("change", function () {
      if (timer) { clearTimeout(timer); timer = null; }
      if (num() === null) {
        const v = parseFloat(el.value), mn = parseFloat(el.min), mx = parseFloat(el.max);
        if (isFinite(v)) el.value = String(Math.max(isFinite(mn) ? mn : v, Math.min(isFinite(mx) ? mx : v, v)));
      }
      if (num() !== null) apply();
    });
  }

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
  // 각 개수·길이를 바꾸는 값이라 [확인]/Enter로만 적용한다(wireLive가 아니다 — 치는 도중
  // "1:"만 적힌 상태가 렌더에 들어가면 배치가 매번 뒤집힌다)
  wireConfirm($("gakBeats"), onFormChange);
  // 총 각 수를 직접 확정하면 '페이지 꽉 채우기' 자동 추종을 멈춘다
  wireConfirm($("gakCount"), function () { gakUserSet = true; onFormChange(); });
  ["gakPerRow", "stackCount"].forEach(id => wireConfirm($(id), onFormChange));
  // 모양만 바꾸는 숫자 칸(대강 분절 포함) → 확정 시 렌더만
  // 대강 분절은 '숫자의 합이 정간 수와 같아야' 하는 값이라 치는 도중엔 늘 어긋난다 → 확인 유지
  wireConfirm($("daegang"), render);
  // 아래는 전부 눈으로 보며 맞추는 값 — 치는 대로 바로 반영
  // 종이 폭·높이(사용자 지정)도 여기 — 눈으로 보며 비율을 맞추는 값이라 치는 대로 반영한다.
  // 범위(60~600mm) 밖의 '치는 도중 값'은 wireLive가 걸러 내고, paperSize()도 한 번 더 막는다.
  ["cellSize", "gakGap", "bandGap", "paperW", "paperH",
   "titleSize", "titleOffset", "titleOffsetX", "titleSpacing",
   "subSize", "subOffset", "subOffsetX", "subSpacing",
   "gakNameSize", "gakNameGap", "tempoSize", "tempoSpacing"].forEach(id => wireLive($(id), render));
  // 체크박스·셀렉트·제목 텍스트는 예전처럼 즉시 반영
  ["stackAuto", "title", "titleLayout", "titleGakWidth", "wantJangdan"].forEach(id => {
    $(id).addEventListener("input", onFormChange);
    $(id).addEventListener("change", onFormChange);
  });
  ["sizeScale", "pageFill", "noteScale", "lyricsScale", "subtitle",
   "titleFont", "lyricsFont", "header", "frame", "noteMode", "paperSize", "orientation", "pageNumPos", "gakNumMode",
   "gakNameHanja", "scoreView"].forEach(id => {
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
      // 크기는 보기마다 값이 따로라 **보기를 바꿀 때 다시 입혀야** 한다 — 안 그러면 창 하나에
      // 마지막으로 쓴 배율이 그대로 남아, 율명에서 키운 값이 시김새에도 묻어난다.
      applyPalZoom();
      saveState();
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
  attachBarDrag($("jangdanArea"));
  attachBarDrag($("lyricsArea"));
  attachBarDrag($("textArea"));
  attachBarDrag($("cellStyleWin"));
  attachBarDrag($("partsWin"));   // 악기 관리 창 — 독립 창이지만 끌기는 도구창과 같은 문법
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
      const lyBefore = lyricsLaneOn();
      document.querySelectorAll(".dock-panel").forEach(function (p) {
        p.classList.toggle("active", p.id === panelId);
      });
      // 곁줄 탭을 고르고 벗어날 때 빈 곁줄이 생기고 사라진다(직접 입력의 창 여닫이와 같은 규칙)
      if (lyBefore !== lyricsLaneOn()) render();
    });
  });

  // 직접 입력 모드 도구창 전환 — 창 자체는 예전처럼 악보 위에 뜨지만(호버 창, CSS 참고),
  // 다른 탭을 누르면 이전에 열려 있던 창이 자동으로 닫혀 한 번에 하나만 뜬다.
  // 이미 열린 탭을 다시 누르면 그냥 닫힌다(별도 닫기 버튼 없음).
  // 에디터 모드의 .dock-panel.active 상태는 건드리지 않는다 — 뜬 창의 표시 여부는
  // .win-open 클래스만으로 결정되므로 두 모드의 상태가 서로 새지 않는다.
  function activateDirectPanel(targetId) {
    // 章·텍스트 창은 여닫이에 따라 악보 위 하이라이트(각/장 이름·빠르기 / 제목·부제·자유텍스트)가
    // 켜지고 꺼지므로, 둘 중 하나라도 열림 상태가 바뀌면 다시 그린다.
    // 곁줄 창은 한 걸음 더 나아가 여닫이가 '빈 곁줄이 보이나'를 정한다(lyricsLaneOn) —
    // 내용이 없을 때 창을 열면 빈 줄이 생기고 닫으면 사라지므로 반드시 다시 그려야 한다.
    const gakBefore = !!document.querySelector("#gakNameArea.win-open");
    const txtBefore = !!document.querySelector("#textArea.win-open");
    const lyBefore = lyricsLaneOn();
    document.querySelectorAll(".win-toggle").forEach(function (b) {
      const tid = b.getAttribute("data-target");
      const t = $(tid);
      if (t) t.classList.toggle("win-open", tid === targetId);
      b.classList.toggle("on", tid === targetId);
    });
    dockDirectWins();   // 기능바 왼쪽 도킹이면 열린 창을 #leftDock 안으로 (아니면 원위치)
    if (gakBefore !== !!document.querySelector("#gakNameArea.win-open") ||
        txtBefore !== !!document.querySelector("#textArea.win-open") ||
        lyBefore !== lyricsLaneOn()) render();
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

  // 팔레트·에디터 글자 크기 조절 — 값은 저장 상태에 함께 보관.
  // 율명 표와 시김새 칩은 적정 크기가 달라 **보기마다 값을 따로** 둔다(palZoom / ornPalZoom).
  // 창은 하나뿐이므로 지금 보기의 값을 그 한 창에 입힌다.
  function palZoomCur() { return palView === "orn" ? ornPalZoom : palZoom; }
  function applyPalZoom() {
    $("notePalette").style.zoom = palZoomCur();
    fitPianoHeight();
  }
  // 옛 이름 — 호출부가 여럿이라 얇게 남겨 둔다(이제 크기는 한 곳에서 갈린다)
  function applyOrnPalZoom() { applyPalZoom(); }
  function applyEdFont() {
    $("melody").style.fontSize = edFontPx + "px";
    $("melodyHlBack").style.fontSize = edFontPx + "px";
    updateMelodyHl();
  }
  // 크기 ± 는 **지금 보기의 값**을 움직인다 — 율명 표와 시김새 칩은 적정 크기가 달라서.
  // 창이 하나로 합쳐진 뒤에도 값을 둘로 유지하는 이유가 이것이고, 옛 저장분의 두 값이 그대로 산다.
  function bumpPalZoom(d) {
    const v = Math.max(0.6, Math.min(2, +((palZoomCur() + d).toFixed(2))));
    if (palView === "orn") ornPalZoom = v; else palZoom = v;
    applyPalZoom(); saveState();
  }
  $("palSizeDown").addEventListener("click", function () { bumpPalZoom(-0.1); });
  $("palSizeUp").addEventListener("click", function () { bumpPalZoom(0.1); });
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
  // 정간 구간 복사·오려두기·붙여넣기 (⌘/Ctrl+C·X·V) — 드래그로 고른 구간이 대상이고,
  // 붙여넣기는 **고른 구간의 첫 칸부터** 덮어쓴다. 버튼은 두지 않기로 했다.
  // 글자를 치는 중(input/textarea)이거나 글을 고른 상태면 브라우저 기본 동작에 양보한다 —
  // 도움말·안내문은 user-select가 살아 있어 거기서 ⌘C가 먹어야 한다.
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = (e.key || "").toLowerCase();
    if (k !== "c" && k !== "x" && k !== "v") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (window.getSelection && String(window.getSelection())) return;
    const r = melSelRange();
    if (!r) return;
    if (k === "v") {
      if (!melClip || !melClip.length) return;
      e.preventDefault();
      // 붙인 만큼으로 선택을 넓혀 무엇이 들어갔는지 눈에 보이게 한다(악보 끝에서 잘린 만큼은 빼고).
      // 악보 전체의 마지막 정간 번호 — 각 길이가 섞이면 각 수×정간 수로는 못 센다
      const lastSeq = Math.max(0, gakCellOffset(parseMelodyOffsets(melodyFull).length) - 1);
      const end = Math.min(r.lo + melClip.length - 1, lastSeq);
      melSelStart = seqToCell(r.lo); melSelEnd = seqToCell(end);
      pasteMelCells(r.lo, melClip);
      return;
    }
    e.preventDefault();
    copyMelRange(k === "x");
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
      // 좌우·상하는 악보에서 직접 끄는 것으로 대신한다(패널에서 뺌) — updateOrnParams의
      // dDx·dDy 인자는 '위치·크기 초기화'가 아직 쓰므로 그대로 둔다.
      const a = b.getAttribute("data-a");
      if (a === "sz+") updateOrnParams(10, 0, 0);
      else if (a === "sz-") updateOrnParams(-10, 0, 0);
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
  // 목록 맨 위 제목·부제 항목의 내용 칸 → 설정 › 문서 탭(정본)
  wireTextMirror("titleMirror", "title");
  wireTextMirror("subMirror", "subtitle");
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
  // 장구 소리 켜기/끄기 — 재생 중에 바꾸면 다음 재생부터 반영된다(이미 예약된 소리는 그대로)
  $("playJanggu").addEventListener("change", saveState);
  $("playSigimsae").addEventListener("change", saveState);
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
      // 예전엔 여기서 palView를 율명으로 되돌렸다 — 직접 입력엔 시김새 창이 따로 있었으니
      // 왼쪽 팔레트는 율명만 맡으면 됐다. 이제 한 창이 둘을 다 맡으므로 되돌리면 안 된다
      // (시김새를 보다가 모드를 오갈 때마다 율명으로 튄다).
      buildPalette();
      buildOrnAddMapBar();
      applyPalZoom();
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
  // 빠르기 숫자들은 눈으로 보며 맞추는 값이라 즉시 반영 — min이 20이라 한 자릿수(1·6…)는
  // 저절로 걸러져 '一分・一井' 같은 이상한 중간 표기가 안 나온다.
  wireLive($("tempoBpm"), render);
  // 각/장 창의 빠르기(BPM) 미러 — 재생 설정(#tempoBpm)과 양방향 연동. 확정 시 정본에 써넣고 렌더
  // (render가 다시 정본→미러를 맞추지만, 미러는 지금 포커스 중이라 그 단계는 건너뛴다).
  wireLive($("tempoBpmGak"), function () { syncPlayBpmFromLabel(); render(); });
  // 최대(선택) — 비우면 한 값 표기로 돌아간다
  if ($("tempoBpmGakMax")) wireLive($("tempoBpmGakMax"), function () { render(); });
  // 재생 설정에서 직접 만지면 그때부터 악보 표기와 끊어진다
  ["change", "input"].forEach(function (ev) {
    $("tempoBpm").addEventListener(ev, function () { tempoBpmUserSet = true; });
  });
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
      const on = $(popId).classList.toggle("on");
      $(btnId).classList.toggle("on");
      // 아래가 모자라면 위로 뒤집는다 — 오선보 [뽑기]처럼 화면 아래쪽에 사는 메뉴는
      // 창을 낮추면 아래로 펼 자리가 없어 열려도 안 보인다(도구창 ? 안내의 placeGuide와
      // 같은 취지). 상단바 메뉴들은 늘 자리가 남아 이 가지를 안 탄다.
      if (on) {
        const pop = $(popId);
        pop.style.top = ""; pop.style.bottom = "";   // 먼저 제자리로 두고 재야 참값이 나온다
        if (pop.getBoundingClientRect().bottom > window.innerHeight - 8) {
          pop.style.top = "auto";
          pop.style.bottom = "calc(100% + 10px)";
        }
      }
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
  wireTopMenu("viewToggle", "viewPop");   // 보기 전환(총보/파트보) — 악기 둘 이상일 때만 노출
  wireTopMenu("fileToggle", "filePop");
  wireTopMenu("modeToggle", "modePop");
  wireTopMenu("screenToggle", "screenPop");   // 색상 메뉴 — 색상 테마 + 다크 전환
  wireTopMenu("betaBadge", "betaPop");   // 베타 배지 → 저장 주의 안내
  // 좁은 창에서 팝오버(왼쪽 정렬)가 오른쪽으로 넘치면 그만큼 왼쪽으로 당겨 화면 안에 둔다.
  // wireTopMenu가 먼저 .on을 토글하므로(같은 요소의 다른 리스너는 stopPropagation과 무관) 그 뒤 재보정.
  if ($("betaBadge")) $("betaBadge").addEventListener("click", function () {
    const pop = $("betaPop");
    if (!pop.classList.contains("on")) return;   // 닫히는 클릭이면 무시
    pop.style.left = "0";
    const over = pop.getBoundingClientRect().right - (window.innerWidth - 8);
    if (over > 0) pop.style.left = (-over) + "px";
  });
  // 팝오버의 '지금 파일로 저장' — 파일 메뉴의 저장(#btnExport)을 그대로 실행(팝오버는 클릭 시 닫힘)
  if ($("betaSaveBtn")) $("betaSaveBtn").addEventListener("click", function () { $("btnExport").click(); });
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
  // 인쇄창에 머문 시간 — **추정용**이다. 브라우저는 사용자가 종이에 뽑았는지 PDF로 저장했는지
  // 그냥 닫았는지 알려주지 않는다(규격이 일부러 막아 둔 것). 그래서 셀 수 있는 것은 '창을
  // 열었다'(export_print)까지인데, 열어보고 곧장 닫은 것과 무언가 고른 것 정도는 머문 시간으로
  // 어림잡을 수 있다. 이름에 closed·quick/used를 넣어 **추정임이 드러나게** 한다 — 대시보드에서
  // 이 값을 '진짜 인쇄된 장수'로 읽으면 안 된다.
  // 인쇄를 다루는 자리가 하나이도록 제목 바꾸기와 같은 리스너에 붙인다.
  const PRINT_QUICK_SEC = 3;
  let printOpenedAt = 0;
  window.addEventListener("beforeprint", function () {
    printOpenedAt = Date.now();
    const t = $("title").value.trim();
    if (t) document.title = t;
  });
  window.addEventListener("afterprint", function () {
    document.title = APP_DOC_TITLE;
    if (!printOpenedAt) return;   // beforeprint 없이 afterprint만 오는 경우는 세지 않는다
    const sec = (Date.now() - printOpenedAt) / 1000;
    printOpenedAt = 0;
    track("print_closed", { v: sec < PRINT_QUICK_SEC ? "quick" : "used" });
  });
  $("btnExport").addEventListener("click", exportFile);
  $("btnMusicXml").addEventListener("click", exportMusicXml);
  $("btnShareLink").addEventListener("click", shareLinkCopy);
  $("btnImport").addEventListener("click", function () { $("fileImport").click(); });
  $("fileImport").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = "";
  });

  // 입력 방법 가이드(?) 팝오버
  // 안내(?) 팝오버 공통 — 버튼 클릭으로 열고 닫기, 바깥 클릭으로 닫기
  // (선율/장단/가사/텍스트 입력 방법 · 시김새 조정 설명)
  // ? 안내 패널 자리잡기 — 패널이 position:fixed라 **화면 좌표**로 넣는다(까닭은 styles.css
  // .melody-guide 주석: 도구창이 overflow:auto라 absolute면 창 경계에서 잘렸다).
  // 자리 규칙은 '버튼 아래 왼쪽 맞춤'이 기본이고, 세 방향을 차례로 챙긴다:
  //   ① 가로 — 폭 240px가 화면 오른쪽을 넘으면 안으로 당긴다(왼쪽 여백도 지킨다).
  //   ② 세로 — 아래가 모자라면 버튼 위로 뒤집는다.
  //   ③ 위아래 둘 다 모자라면 넓은 쪽을 골라 max-height로 눌러 패널 안에서 스크롤시킨다.
  // (에디터 모드는 ? 버튼이 하단 독에 있어 아래가, 직접 입력은 도구창이 위쪽에 떠 있어
  //  위가 모자랄 수 있다 — 방향을 고정하면 어느 한쪽이 반드시 잘린다.)
  const GUIDE_M = 8;      // 화면 가장자리 여백
  const GUIDE_GAP = 6;    // 버튼과 패널 사이
  function placeGuide(g, btn) {
    g.style.maxHeight = ""; g.style.overflowY = "";
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const b = btn.getBoundingClientRect();
    const w = g.offsetWidth, h = g.offsetHeight;
    const left = Math.max(GUIDE_M, Math.min(b.left, vw - w - GUIDE_M));
    const below = vh - b.bottom - GUIDE_M - GUIDE_GAP;
    const above = b.top - GUIDE_M - GUIDE_GAP;
    let top;
    if (h <= below) top = b.bottom + GUIDE_GAP;
    else if (h <= above) top = b.top - GUIDE_GAP - h;
    else {
      const useUp = above > below;
      const cap = Math.max(120, useUp ? above : below);
      g.style.maxHeight = cap + "px"; g.style.overflowY = "auto";
      top = useUp ? Math.max(GUIDE_M, b.top - GUIDE_GAP - Math.min(h, cap)) : b.bottom + GUIDE_GAP;
    }
    g.style.left = left + "px";
    g.style.top = top + "px";
  }
  function makeGuideToggle(guideId, btnId) {
    const fn = function (show) {
      const on = typeof show === "boolean" ? show : !$(guideId).classList.contains("on");
      $(guideId).classList.toggle("on", on);
      $(btnId).classList.toggle("on", on);
      if (on) placeGuide($(guideId), $(btnId));
    };
    $(btnId).addEventListener("click", function (e) { e.stopPropagation(); fn(); });
    document.addEventListener("click", function (e) {
      if ($(guideId).classList.contains("on") && !$(guideId).contains(e.target) && e.target !== $(btnId)) {
        fn(false);
      }
    });
    // 열려 있는 동안 창 크기가 바뀌거나 어딘가 스크롤되면 버튼이 움직인다 — fixed 패널은
    // 따라가지 않으므로 다시 잡아 준다(스크롤은 도구창 안쪽에서도 나므로 캡처 단계로 듣는다).
    const follow = function () {
      const g = $(guideId);
      if (g && g.classList.contains("on")) placeGuide(g, $(btnId));
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return fn;
  }
  const toggleMelodyGuide = makeGuideToggle("melodyGuide", "melodyGuideToggle");   // 처음 방문 안내에 재사용
  makeGuideToggle("inputModeGuide", "inputModeGuideToggle");
  // 시김새 전용 안내(#ornGuide)는 없앴다 — 창이 합쳐지며 #melodyGuide가 둘 다 다룬다.
  makeGuideToggle("jangdanGuide", "jangdanGuideToggle");
  makeGuideToggle("lyricsGuide", "lyricsGuideToggle");
  makeGuideToggle("textGuide", "textGuideToggle");
  makeGuideToggle("gakNameGuide", "gakNameGuideToggle");
  makeGuideToggle("shortcutsGuide", "shortcutsGuideToggle");

  // 사이드바 안내(?) 접기 — 설정 패널의 .hint(회색 작은 글씨)를 항목 이름 옆 ? 버튼 안으로.
  // 값보다 설명이 길어 무엇을 정하는 자리인지가 안 보였다. 마크업은 그대로 두고(문구를
  // 고칠 땐 index.html의 그 자리에서 고친다) 여기서 손잡이만 붙여 접는다.
  // 도구창의 ?(makeGuideToggle)와 달리 띄우지 않고 제자리에서 편다 — 까닭은 styles.css
  // .hint-btn 주석 참고. 새 .hint를 사이드바에 더하면 아무 배선 없이 같이 접힌다.
  function foldSidebarHints() {
    const QMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    document.querySelectorAll("#sidebar .hint").forEach(function (h) {
      // 붙일 자리는 '이 설명이 누구 것인가'로 정한다: 제 .field의 이름표(label) →
      // 이름표가 없는 칸(임시 저장처럼 label 없이 입력줄만 있는 곳)은 바로 위 묶음 머리글(.sec).
      // 둘 다 없으면 **접지 않는다** — 펼 손잡이가 없으면 글이 영영 안 보인다.
      // :scope > label — 칸 안쪽에 딸린 라벨(#stackCount의 '자동' 체크박스, 임시 저장 목록이
      // 나중에 그리는 것들)이 아니라 그 칸의 **이름표**만 집으려는 것.
      const field = h.closest(".field");
      let anchor = field && field.querySelector(":scope > label");
      if (!anchor) {
        let p = (field || h).previousElementSibling;
        while (p && !p.classList.contains("sec")) p = p.previousElementSibling;
        anchor = p;
      }
      if (!anchor) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn hint-btn";
      btn.title = "설명 보기";
      btn.setAttribute("aria-label", "설명 보기");
      btn.innerHTML = QMARK;
      anchor.appendChild(btn);
      h.classList.add("folded");
      btn.addEventListener("click", function (e) {
        // 체크박스 항목은 이름표가 <label class="chk">라 그 안의 클릭이 체크박스를 뒤집는다 —
        // 안내를 여닫는 것만으로 설정이 바뀌면 안 되므로 여기서 끊는다.
        e.preventDefault(); e.stopPropagation();
        const on = !h.classList.contains("on");
        h.classList.toggle("on", on);
        btn.classList.toggle("on", on);
      });
    });
  }
  foldSidebarHints();

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
    orn: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALYAAAC2CAYAAAB08HcEAAAQAElEQVR4AeydBZAcRRSG3x3ECgqCSyGHFFJYcA8XrCBI4YEEd9cET7gjQQp3dwnBLcEhBHcqQRI8aHArQoAY+82l92bn9lbn9kb+1Pa1THdPz//+7e1573Wnfqbv3/jx42eaWU7o1q2br4aSQqDzEYCTQZ5OmDAhZ2D1mQr6CIHEIVA/fPhwc2HkyJFtHnDGjBnZ666e4lbMhEXtsYCTQaLC3UmTJmWL6wcMGGAuDBo0KHvBJaZOnZq97uopbsVMWNQeCzjp+OnigQMH2ujRo13WtBTJQqFEkhAQsWMvTT1APgRE7HyoqCz2CIjYsRehHiAfAiJ2PlRUFnsEROzYi1APkA+B+ilTppgLY8eObVMnY+XJXnf1FLdiJixqjwWcDBJ13Lhx1r9//2xxfffu3c2Frl27Zi/4E+56Z8e6f6us0oyFn5suHeSuliIOGcWJQkDETpQ49TAOARHbIaE4UQiI2IkSpx7GISBiOyQU1wKBmt1DxK4Z1LpRLREQsWuJtu5VMwRE7JpBrRvVEgERu5Zo6141Q0DErhnUulEtERCxOwpt9dupCIjYnQq/bt5RCIjYHYWs+u1UBETsToVfN+8oBETsjkJW/XYqAiJ2p8Kvm3cUAmEQu6PGpn6FQMUIiNgVQ6eGUUZAxI6ydDS2ihEQsSuGTg2jjICIHWXpaGwVIyBiVwxdkhom71lE7OTJVE+UQUDEzoCgT/IQELGTJ1M9UQYBETsDgj7JQ0DETp5M9UQZBFJH7Mwz65MCBETsFAg5jY8oYqdR6il4ZhE7BUJO4yOK2GmUegqeWcROgZAT9oglPY6IXRJMqhQ3BETsuElM4y0JARG7JJhUKW4IiNhxk5jGWxICInZJMKlS3BAQsaMsMY2tYgRE7IqhU8MoIyBiR1k6GlvFCIjYFUOnhlFGQMSOsnQ0tooRELErhk4No4xAVIgdZYw0thgiIGLHUGgacnEEROziGKlGDBEQsWMoNA25OAIidnGMVCOGCIjYMRRaNIccrVGJ2NGSh0YTEgIidkhAqptoISBid5I83njjDbvzzjvt448/7qQRJPu2InYnyfeMM86wo446ytZbbz3be++97dNPP+2kkSTztiJ2J8l13XXXzd555MiRts4669j999+fLVOiOgRE7ArwC6PJnnvu2aabgw46yMaNG9emXAXlIyBil49ZTovPPvvMtt56a9tll11s6NCh9uijj9rkyZNz6uTLLLvssrbMMsu0ufTee++1KVNB+QiI2OVjltNi5syZ9vrrr9tzzz1nF198se2zzz62+OKL2znnnJNTL1+GesFyviTBMuXLR0DELh+znBbMvAcffHBOGZnzzz/fxo4dS7Ld8Ndff+VcO+SQQ2zeeefNKVOmMgRE7Mpwy2mFhqOhoSGnjMwcc8xB1G748ssvc66hJaHgv//+swkTJtiYMWPsgw8+oEihTARE7DIBy1e9R48edtVVV7W5lI/srtLff/9tP/30k8t68dVXX21bbrmlLbzwwrbBBhvYjjvuaBtvvLGtscYadvvtt3t19Kc0BIoQu7ROVMs8ffRKK62UhWKBBRaw2WefPZufNm2aff755/bMM8/YNddcY8cff3z2mktceeWV9tZbb7lsNp44caIdc8wx9sQTT2TLlCiMgIhdGJ+yrm6//fbZ+szG5513nh144IG2/vrr24ILLmhrrbWW7bbbbnbqqafaPffck61bamKuueYqtWrq64nYZVJg6tSp9s0339j7779vzz77rN166602bNgwj8CXX355Tm/nnnuuPfDAA/bRRx/llOfLrLbaarbtttva/vvvbyeddJLx8snMfscdd9hTTz1lqBVZnuRrq7K2CIjYbTEpWLLyyivbqquuar1797Zdd93VjjvuOLvooos8Age1HHQ055xzejN1v379PMJeccUV9sgjjxjlXCecfPLJNnr0aLvtttvsggsu8OodcMAB3uzet29fr/0888xDVYUSERCxSwTKVTv22GNzSOnKiZdffnmibHjppZfsq6++8mZcXgyZifv37++tx/1fgs033zzbJuzEiy++6BmQzj777LC7jnR/InaZ4jnssMO8l8CXX37ZbrjhBrvlllvs+eeft6+//tpeffVVb3Z1XaL5cGl/7Hd4WnTRRW311Vf3Xw4t3dzcbL0zvyy8dJ522mlGPrTOI95RfcTHF8nhoe1YccUVbaeddjJeGFmaOJ310ksvbe7fDz/84JJe/O+//9orr7xiQ4YM8fL8+fPPP+3nn38m2eGBL2CH3yQiNxCxQxaE3//jwQcf9F4CjzzySOvTp48tssgi3gsiKj93W5YkZ511lsuGGjc1NeX019jYmJNPckbE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"
  };
  TOUR_CELL_IMGS.tie = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALYAAAC2CAYAAAB08HcEAAAQAElEQVR4AeydCdxVwxvHnzd/kq0QFWlDCtEiW9FCPimlZCnZkqUFRYt2lVSWkhLaI1RCkSKhTYvIVipCRStSUlq0/N/v8c79zD3vufe973LvPXPu9GneWc+5M8/8ZuaZ53lmTr7D2r9Vq1YdFpEwlz9/fq2EDVoKJJ8CYNKN09WrV4dVLF96AfvfUiBwFLDADlyX2gZBAQtsqGBd4ChggR24LrUNggJZAvvff/+V+vXrW+dbGqRe34BJwBvNZQnsQ4cOycyZM62zNPANBsBkNFCTlyWwjzjiCOnSpYt1lga+wQCYBLzRXJbA/t///icDBgywztLANxgAk9FATV6WwKaQdZYCplHAAtu0HrP1jYkCRgE7phbZQpYC6RSwwE4ngv0fPApYYAevT22L0ilggZ1OBPs/eBSwwA5en9oWpVPAAjudCPZ/wiiQsB+ywE4Yqe0PJZICFtiJpLb9rYRRwAI7YaS2P5RIClhgJ5La9rcSRgEL7ISR2v5QIilggR0vatv3JpUCFthJJb/98XhRwAI7XpS1700qBSywk0p+++PxooAFdrwoa9+bVApYYCeV/PbH40WBvAB2vOpm32spkGMKWGDnmHT2QT9TIOWAvW7dOpkwYYJ89tlncvDgQT/3TZ7V7e2335ZatWrJDTfcIE899ZSsXbs2z97t1xelHLAnTZok7dq1k2uvvVZq1qwp8+bN82vf5Fm9li9fLt98843MnTtXBg4cKFWqVJFbb71Vfvrppzz7Db+9KOWAXbly5VAffPfdd9K4cWN57LHHJJZrs0IPGhZo3rx5php/8MEHUrVqVXn99dcz5QUhIV8QGpGdNtSuXVtOOeWUsEeGDRsm48ePD0sLUuSss85yWBCvNnXp0kV27drllWV0Wj5Ta3/gwAFp2rSpw1I8+uijzsyzZcuWLJvDLUKNGjXKVO7LL7/MlBakBGjl1Z5du3YJtPTKMznNWGCnpaXJV1995WwCR40aJQ888ICce+650qJFC9mxY0fUPilatGim/BtvvDFTWpASjjvuODnnnHMyNalu3bpSqFChTOmmJxgLbC4mfOaZZzLR/5133hE2iJkytIS9e/dqMXE6vFa61CAsMYCR0qVLZ2pVnTp1MqUFIcFYYEP8Bg0ayM0330wwzDE7hSW4Ihs2bAhLgc/Mly+fcD3t+vXrZcGCBbJkyZLAbSiLFSsW1m4iFSpUwAucMxrY9Eb//v3FDeSyZcuSFdGtWbMmLO/rr78WWJFSpUpJpUqV5Prrr5d69erJmWee6UhM9u3bF1be1EiBAgUyVZ02ZkoMQILxwD7ppJPkjjvuCOuKU089NRQ/fPiwsKlcuHChvPLKK9K9e3f54osvQvkEnnvuOfnkk0+EjRRx5YgjMenXr59KMto/6qijwurPhHDiiSeGpQUlYjyw6QiULfjKDRkyRB566CG55ppr5OSTT3Y2lbAt7du3lxdffFEVi9ln8MRc2McF3ZrWs88+28e1zV3VjAE2/O9vv/0mq1evdnhgNoioh5GG9OrVK4wKzMyvvvpqppk5rFBGBEnB1VdfLbfddps88sgjAmvzwgsvyMsvvyzvvvuurFixQhgQGcWN9rZv3x5W/9Iem8mwAgZHjAE2avBy5crJ5Zdf7vDAbdq0EdTDaM4Q+3n1wXnnnSfM1Dw7aNAgmTJlilx33XWhopdddpksXrxY3njjDRk6dKj06NFDWrVq5cjHea569epy2mmnSVpaWugZkwNuMWjJkiVNbk7UuhsDbLW582oN4INfVHmA+M8//3RmdmZeVObIt6+66irZv3+/KuZsEEORFAhs27YtrJUlSpQIiwcpYgywa9SoIWgHkWDAZowYMUKwd/jhhx8cdqF169ahfmHTF4poATaSixYtCqUg+QhFUiDAYNebWbx4cT1qSjimehoDbNUaZhkAedNNN8nFF18shQsXdrLOOOMMx+cPUhB85QA0Bk/w4jrof//9d1UkJXw3sKGlV8P37NkjH3/8sfTp08eROKG8YrVjH8Lqt3TpUkfm7/WsX9KMA3YkwukbIWZleOZOnTpJw4YNBV7yiiuukOHDh4c9fvfdd4fFgxxhcLsHsgI2eZiwvvbaaw6QTz/9dGHiQAz63nvvOSav7GP43ifiz7rpang0ln626w4MsHWlDLbHvXv3ljFjxsinn36aST6tAAzYVTjo/j///JOpiWPHjpU777zTGfiYsD744IMCkDMV9EgA6EwcHlm+SAoMsDFF1bVobCjRIiLLZgltny7DfuKJJxwxHirzjRs3esq0ESvCyixbtkw4eYJI8b777pP69esLttwsyYgIGzVqJG+99ZavLeOQgrAnmTp1qrChdiMOZdX06dMjDnx3eXfcz1aBgQE2REf5Auiw9kP+DJ+IvBu2BP6aDSZL6LHHHit0OMBkuWXmadq0qWN4D8+OlSDl7rnnHkek+OabbzpiwXXr1jkWhSzp8+fPl3vvvdc5cvXLL7/w8wlz/B6rEtrUDz/80BmAtJlVCvaKwQybUaZMGcH+vGXLljJkyJAc1Q9pEzTlPZy6gYZdu3aV0aNHC7+Zo5cm4KFAAbt8+fICn8hszWwLT82shMqdDRCdTR4zLzMwwGSDBMsCQOAzs0tzNqUMgrjYk3hUBolQxYoVnQGFrJ0ByQDEJp0BPG3aNEcxpW+SPV4TSmKlQ17PKZsuXbrI888/L7yDDSIDCIesn8FNHqseEwHnJ3k29CKfBYwA9u7du2X9+vUCe/D+++/L+PHj5cknn3Q0glj3oWgBtEhGLrroIodtoLN79uzpsBvwjcxwsXZ2dvuIGdyt1cvuO2Itj5b0wgsvjLW4U44Z1wlof1BKbd68Wb7//ntHw8qmsHPnzs5ZyCuvvFI4dcNsrT1iVDDpwF6XvrzDQmBoxOyKjQc8McspMyt2GgAWfpmZkZkF1TfARnX+0UcfOZ0TC2jpYDqN2Qa+mSUVm+5x48YJfCiGUAwerP/odMRjuD/++EN+/fVXWbVqlTMbIj9H8cMszwrx+eefi9fhhXgggd+ZPXu2AES1p9AByMBmEwibgHSI/QIsi16GeqGVzZ8/P8FAuqQDm5kDQA8ePNiZXVlqESthgQfos6I6yyGdiakp/B98JgOlY8eOYY/SsSypLLPwh6jjWVLhSXkWBRBLPGJDDKf0TsdWG768SJEiAt+K/Bw2gN/FAEsBLOwH4xjheBsDnCskoBObYaQ/bIgZbLBXTZo0EUwQsOhjv+Ee+H379o1jDZP/6qQDm9kFdXc0UgCcW265RZhhlcYR1oLZiKWUzmTWhf9jxqdsq1atwl5JJ4claJGdO3cKvLKa4bQsXwcZcAw05PRseL3srWkAwMfX3eTJk4WVR08LUjjpwKYzEEX9+OOPjtwZuSoOgyTYA2ZtlnpmYWZYFAfMmLAnzEaROsNtZ8wGiSNh/A7SkpEjRzrnJGF3SpUqJci0MZACILBC7lM2kX7HhHTa61VPjMMStTfw+v14piUd2BmNE3hp7vh49tlnBQcfDXtwwgknqCJZ+kgm2GQy82LJpz+AuAuJCIOCwYEEAMtABo5ejjCs0AUXXBCIy3RQzMydO5dmhRysFxE2vUwghIPmfAPsrAgLCFGOsPHr0KGDwCPDmsDGkM7GkDN9bDKZeVu5WJGs3u+Vz0CbM2eOV5YxafDhemWRqLCfYc9B+sSJE2XWrFkEA+WMATYzMWpcZh/4aTSC8NucSied2SdazyCzRg6LFIMNJJIF3gV/ziCJ9CzsUKQ8E9LdbAh2HrBpGDOp+rMv2bFjh4oGwjcG2MzMapbRKY/YihmagweAHW0i5q1bt27VizlaQjRnSDEQ+XF/HewGkg1Ef5dccklYeRVBuaPCpvkMdk4D6fWm/cRpF5tywpTjJBLmBMSD4IwBdtGiRWXAgAFhNGdZZcePPBs5OEoZNIxsBtPSwk+9ZMWrs7EMe3l6BJEYwE8PGvmfTblecejFYCbtyCOPdNg5wjj2Fe7ypJvqjAE2BEbLqM/aiPwiGeK4L5lE0nH++ec7m1TAz/KLcof3IuPlXYSVw+a7bdu2Kmqcj3kAkh+94qx6epy9CZpMlcbEAWum4tnz/VXaKGAzy8A26CSE90YaAi+Jtg3FDMstNsV6ORQZmzZtcpIAMYogBgpaRrSNTob2p3fv3kafdWQF05rj3L2CRaKeRhjZP75yrHqIRFXcVN8oYENkVO34ynE0bN68eY5hPIZA2Bi7JQGqrPJhVehkeHI0jWgkVR4+v4GtBGETHQOVTbVedyRJXuwYVzBgU6PKsno1a9ZM/v77b5VkpG8csOETdUpzHQMmlUg2OPALC4FIUOeNkV8jDcFmglmbzSUDgNkJ9fSMGTP0VwrpYQmGRTDR1auM2YF7pdPz2TjqdIWNQUmGDFwvZ1LYOGBjw1GzZs0QjVGFA046Dp4SFgNbEIyEVCFmX9gTzFqPPvpolez4LLu8w4lk/EELmRE0zsM4y70CPf7444KGN1JjYPEQher5iEIxiWUG19NNCRsHbAiLuA4fB7+M73b6phK5rcrnoCqzNiIuyqCqV3n48N0MHsKmOQyhHn744bBqw3LRprBEjwhi027duoXl8D60tNjShGUYEDES2JdeemmItCybbB5DCekBwIuZaXrQ+Q+/CZuCzTabSqQjaCq54w9lj1Mo4w8GVBnBiJ4fM37++WfHltpdNwbp+PHjhU2yO88dR1IEwPV09itoYE1T4BgJbFgKnfhoFVG+IL4CsICXuF4GW+usllXU8YgC9edMCANaWC29ffDV0AIrPuxuUEDBYrHXiKSIwajMvYLRfjS77GMirY6U8ZsLA3ZaWrhSw2+VVfUpWLCgINlQcU7IYIJJB8BiqPRIPp3ulYdCxivdz2m0mQGtt5vNMvYfHKLQ685eAjNhWBP3KqfKsZphg6PiysdYjEGPJjPSwFBl/eCHAdsPFYq1DjrLgGoYKQjKBgzwEftx/o+DvACezdTKlSsF3poTMdhw48OiAAJ+s0uXLlKtWjWCxjiUKYBan6kZ8Byfw6c9rGbuBrF6cYjZna7i8OnM8Cqu+1gDMjDcJgt6GT+EjQU2/CC7fRQMyGcR+8EzcyIGYKNpRB6NmSpLMip5JRF5+umnBbku8l7EfmggOe/nhw6JpQ7MtgAMqYVengGO6BJbdZWOool0FVc+M7oKu32kTCi7dC2vXoaBwT0kmBf7Vd5tLLARX6HyRtbKcsyspUxbmXHcKnW9YzjDyKYR1gNrN3xm72jP6M8nMww/zcoES6DXA1oAOEx39XToxOZRTyOcFTvBvX7u3+A55aA3EwubTfhyNuwqzw9+FsD2QxUj1wHJBzO2uwSyXNgNd7qKM4vpIkPuCMGOguUXgGfV6eo9ifSZGQESdYRXVr8NC0b9yTv++ONVcpgP+BjIemKkfYZeBqtJeHI9zR0G4JxZ5bwoAGfScJdJRtxYYKNYQRLgRTSOgSHa88ojjVmMeS0/SQAAD3RJREFU2Z1yxJVjgwTAuXOE85QqPZk+XyGgrgCYpV/VBTaBU0Hw02z4VHokn1MzmBCofA77qnA0H3W7m05e5dm8AnCumkNzi5kDdfcqm4g0I4ENb4z4ic2gTiQ2gthj8yUC+G49zx0+5phjhNMj3EnizkN2y7E0Bo87L5FxvuDAPgGVN8Dht+GXATgrEjbVfBaQ9FgcgEPuj0mBvvmO9iz8NrM9m9Fo5fQ8LitC9o2aHsmMu5/0svEKGwVs+Ok+ffoI94uwBOpEYUZCU4ZISk+PFuZKBa5/8AI3QGIZTiZbwjVs7B+YnZHLwyZxQxN2HKw60doWKQ8tbHZAynu4joIJg4mDeKwOQPPpE1aURE8SxgAbs1QkHG4xFZ2ObQizSk6+MBsN3MzcLKmxdmRel2O2BhCwSNhyoGBJS0uOrgErSHh52BlYE8Wjw7/r7aY/cOSzusBCodZnQOnl4h32PbBZjjFwwmaBGUAnCFZ82Fnj6+nZDQNuTrXrG0r1Dn2jptIS6XN6n/tDcvybefggdYGdgdWDFeLTHwx8NozoBXDc9Ycjn2szkLUjUmXWz8OqZPkq3wIbFgBLPUY8FyLqLWG3PnfuXOfGT2TXel5Ow4rn1i0HeRc8Kb51mSmQlpYmDDqc+OyfL4HNiEejhhJG56VRugBozjiqs3t5SU/4ViQQDBz1XgCvwtY3hwK+BDb8NAY38GooUFCPw2fixwPQenehnWTphJdEZozoT8+3YTMo4EtgI0vmgkVmbmZQZuqsxHd5SW5EXPCSyIj5rmRevtu+KzEU8CWwaTpsAb51lgI5oYBvgZ2DxthHLAVCFLDADpHCBoJEAQvsIPWmbUuIAhbYIVLYQJAoYIEdpN60bQlRwAI7RAobSD4F8q4GFth5R0v7Jh9RwALbR51hq5J3FLDAzjta2jf5iAIW2D7qDFuVvKOABXbe0dK+yUcUsMBOUmfYn40vBSyw40tf+/YkUcACO0mEtz8bXwpYYMeXvr5/O6feuYGVT574vrLZqKAFdjaIFcSifMiUaya4c5x7SjgVH4R2WmAHoRdz0QaOv6nHuY6ZKy64Q0SlmeonANimkiY16s2xO3dLuXr422+/dScbFbfANqq7IleWayK4y5BPknBB5fTp02X37t2RH8jI4cNTXGyTEQ15y5cvD4VNDFhgm9hrHnU+fPiwcHMVVwlztx/XoHFP9oABAzxKhydRLjxFhEHiTjMpboFtUm9FqSszLzdmuYtwyT1XWbjT9bh+dwvp999/v3DrE2FTnQW2qT3nUW8kHF4XTnKFm0fxUBKf7Q5F0gNISdI92b9/v/ClCK4xS/ZVb9QnO84COzvU8nlZrqzw+gqBF9hVU7jBlptlVRyfC9y5EJPPm3CvSuPGjYULMStXriwTJkygiO+dBbbvuyh7FUQerd+Ayq2nXACk3nLgwAHhm5B8d+ell14SPpWn8pQ/fPhw4bJPFVc+t3G1a9dO+GCVSvOrb4Ht157JRb0aNmwYeprZmOvauNmKe8C5xJOLPvnyV7du3YT7wUOFYwwk8lauGKuUqZgFdiaSmJHAh6A2bNggK1asEO465Ls7/fr1EwA8bNiwsEYMHDhQ+MoAV/uGZXhE+AoBl3Kqr6+x+WRm5+ZbrgRGrAh74vGor5IssH3VHbFXhq8EcEEnd3pzdzhfShs8eLADYLeUg7dywSczNZ/o4HOBXCTPPdekk4/jW5dz5swRbrPlExuUa9mypTC716tXT3g+0Re4U6+cOAvsnFDNB8+0b99edFDqVeK7lnqcT5hwwSczLhtDAMunP+DH9UHAZ/b050wOW2CH954xsdatWzubwIULFzoX4I8fP17mzp0rfCJw8eLFzuyqGoPkQ4V1Xzd44vsylSpV0rONDltgG9x9SDvKly8vfKqEDSOsiZJZlylTRtS/rVu3qqDj79u3TxYtWiS9evVy4vzZuXOn8MkNwkFwFthB6EWPNuj2H1OnThU2gXxWj6+qFStWTNggIvJTj8KSeH0MVuWb5ltgm9ZjMda3XLlyoZJIRLAZ4RL9aOp1ZvzQQ4YHLLAN78BI1ceuWs9D+4jtNTN1ixYtpHPnzoJ8Gzk2X/fi62yI+PRnCCNWROUO68JJG76zyYEEvhHEJhUNJT7vxAiLZ/zgLLD90AtxqEORIkUEeTaAXrJkifA1Xj49gihv0KBBgmgPmTcDgE9DswkFuICdj1rxbUZEiryHTSUDAhsSvrPJgQQ+rIryBw0lPh9XxSIQQ6w9e/bEoUWxvvK/chbY/9EhcH8xY0X2DPuxefNmmTRpkiDn7tChgzRt2lTQQmLBB/AR+zVu3FgALsoclDHz58+XTZs2ZZsufLoQtXu2H8zjByyw85ig8X4dgN2xY4cgqmMmRskyatQo6du3ryACZKbFWIkPhrKBREsIaNu0aSNoJseNGyfIs2PRQua0LX44pGCBndPei9Nz8Kks9/CyKFIAK5o/eFpYAwCLKA8Wghn5rrvuEsoNGTJEJk+eLMy069ati6l2GEvVrl1b0EYCfMR//DbsCgOGd7HZxGgKHpwv7+IIr127VjBlZXDBhowZM0Zmz54tU6ZMEZ6NqQJxLGSBHUfi5uTVzLyAGoAxEwNWxHLwtLGwBihaqlev7oAVlgARHqCrWbNmWHUYLAsWLBBYB7SRzOZoM2+//XZHFMg7GEicrilUqJAgM1cvIFywYEFBbFi2bFnHpJVVoUqVKsIAxKJQlU2Wb4GdLMpH+F0MjuB/I2Q7yWzmWqRLNhgEGD9xHIwDAWziMIpixgSsHDxgxgd0HNB1Hs74U7JkyYxQZg+FDgOJ1QP5duYS/k+xwPZZHzFDzpgxQ5YtWyYYIjVr1kyQNPTv399Z6rds2eJY8yHZQOHSoEEDqVixomCOesQRR0RsjXsWrVq1qqBthJ1AysE5ScR4iO7QZjLzIuUoUaKEsIJEUstH/MEkZxgLbMRSbdu2lXi4rl27SrJFVqVLlxbkyhj9I6lo1aqVsNQfddRRMUOG2XbNmjWCxR78r/4grEipUqUcNgJAc7IdgDPr6+UIwxbVqFHDsUMhboLLZ0IlveoI3zlx4kSJhxsxYoSwafL6Xb+kIYeuVauWYKXXvXt3QbOIKI84x7iYaXEoZZo0aeKo1HNTd+ywsf7buHFjbl6TsGeNBXbCKOTTH1q5cqUz+DimBT+NLQiiPOKwF8zW0arODM0ARr7NHSQcVsA6kDBXN3g9y2yOIscrz29pxgIbxQMdGC/HBs1vnaXXh1laj6swhwG4NIezjGgeZ86cKatWrRJ8VQY7blg4DiigEq9WrZrQXmxFCMPPq7K6D59ep04dPcm3YWOBXbhwYUfchMgpHi5//vy+7TQqBouB/Jmwcoj3UL6MHDlSevToIc2bNxe0iqjFDx06pIoJ8VDEI4BZq0eyc0LdnqDxokyO0+yDXhRAKqKns3rpcT2MMZOKwy8zU8OD4+rXry+sAEob6bW/QB6OUki9w+++sTO23wmbiPqhOYSFUL+lAMmBAXjloUOHOmp2NpPIslU5fIyX4MNxnLiBT1dsBnHKKAcL4paDqzy/+hbYfu2ZGOvFyRlVlM0dKm8O6rIB7N27t6NmjzaT8ywDhFtXYWGIc/MTvnKwOGgbVdwE3wLbhF6KUke3lhK5NSxKx44dBYMozE2RWeuvQGzHHdgogbD7QLXO7F63bl3Ztm2bc7mlXh4lkR43IWyBbUIvRakj94Do2ajW2VhzGc7YsWOdqxRQ06NZVOXYUCIDRwnknokRF6py+AwCUzaM1Fc5C2xFCUN9pDe6gROiPa+mcLWZSi9UqJAKOmp1Lt7Zvn27IA2BjQllpgd0Vic9mvP/CX7SAjvBBI/Hz2GJp97rZQv9119/CYcNVBnYFOxA1EED5NfYbiM2VZIRVRbTWBU2ybfANqm3ItQV81KVhUQD5QtKGqQhiPNgOTg9o8rgY7mHH81xuxTgj1bGr3kW2H7tmWzUixlXL479DKasSEMQ5+l57jBaSMR5XumYvLrTTYlbYJvSU1HqyT3WaCJVEcR3SEuQcmAh2LNnT2EDyekWrPw4lc53HbG75uoz2A+kI/qszj3YbELVO03zLbBN67EI9QW4mNvCP7NR5EwkdtWwEzhEfthYY/oKPw1ojzzySEEjifodm2/suZGKoLzBTDXCTxmRbIGd992UlDdyIqZTp06ydOlSYQZGWYOIr0KFCoLVX6RKAWYs+6ZNmyYoYpjlsRSMhQeP9E4/pFtg+6EX8qgOnLzhAK77dRwRYxZ3pxPPly+fY9Ou89mcs0Rq0qhRI+GIGOVMcxbYpvVYhPpilspBXK9s0t2KGL0cJ2l4Xgc3+QwS2BdWAmTcpJniLLBN6ako9WSjh62HuwgbSFgTLPPcee44fDczvhvclOOUO7P33r17iRrhLLCN6CbvSqIx5CgYvLG7BCp17vvg+4/uvEhxykYCNzw3d5dEetZv6RbYfuuRGOoDv4wUBPk1Ugz9EU6ZI8NGOhKN/dCf0cPRwM0Bak626+X9Gs4dsP3aqgDXC5tr7KaZkd3N5EYozi1WrFjRnZWtOOD24rl5CdaD+H53Fth+76GM+u3evVuQbmCVB7gzkh2P68kwfgLYGEU5ibn8A8/N7axunjvW69Ny+fO5ftwCO9ckjP8LuBeEiyY5nKt+DcAhreC0OteTZXWOUT2XHZ87ApFxA3L1XIECBVTQ174Ftq+757/KIfVA4VKqVCnnTj6uTMAOBE0j6vT/SsXnb/HixWXWrFnCndlYEaK5jM8v5e1bLbDzlp5xedvo0aOdu6q5vJ2ziRzEzcnGMKeVw8KPY2bcCRiPlSGn9Yr2nAV2NOr4JA/t4NFHHx2X2gT1pRbYQe3ZFG+XBXaKAyCozbfADmrPpni7LLBTHABBbb4FdlB7NsXblULATvGeTrHmW2CnWIenSnMtsFOlp1OsnRbYKdbhqdJcC+xU6ekUa6cFdop1uNHNzUblLbCzQSxb1BwKWGCb01e2ptmggAV2Nohli5pDAQtsc/rK1jQbFLDAzgaxbFFzKGCB7c++srXKJQUssHNJQPu4Pylgge3PfrG1yiUFLLBzSUD7uD8pYIHtz36xtcolBSywc0lA+7g/KZAlsLkAkYtZ4ua6dhX7bkuD7GAATGY1nLIE9sGDB2XgwIHWWRr4BgNgMtfA5rIWPmJpXT2xNPAHDcBkroHNl6W4DNy6GWJp4A8agEk3sA8fPhyWlCUrElbaRiwFDKGABbYhHeXnavqxbhbYfuwVW6dcU8ACO9cktC/wIwX+DwAA//8axDMwAAAABklEQVQDAAIZGkmwsTj1AAAAAElFTkSuQmCC";
  // '장단 쓰기'·'가사 쓰기' 단계의 예시 이미지 — 위와 같은 방법으로 뜬 캡처.
  // 재캡처: 선율 "황 | 태 | 중" + 장단 "덩 | 기덕 | 더러러러" + 가사 "달 | 아 | 라"를 넣고
  // 해당 칸을 클릭해 편집 하이라이트 rect(#ffe680)로 칸 좌표를 얻어 viewBox 크롭
  // (가사는 선율 정간 + 오른쪽 가사 줄까지 폭 16.3mm). 이하 데이터 URL은 16px/mm 렌더.
  // 정간 서식 '가로줄 모양' 예시 — 앱이 실제로 그린 악보의 캡처(정간 아래 가로줄에
  // 굵게/점선/이중선을 입힌 상태). 재캡처: cellStyles에 border를 넣은 상태로 렌더한 페이지
  // SVG를 경계선 중심으로 viewBox 크롭(칸폭+2.4mm x 칸높이 1.1배) → canvas PNG(16px/mm).
  const TOUR_BORDER_IMGS = {
    thick: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAABeCAYAAAAg/TovAAAChUlEQVR4AeyTMY4qMRAFRxsQQMAFSLgN3IM7wm1IuAAJAcns9kgTWnZbpu3H1tfv3dGO2/2mSv0zZ/5dLpd5mqZ5t9tlTvLaQ8B4Glfjm+v7+TvI/8EJIGlwQRYPSUZh8ELS4IIsHpKMwuCFpMEFWTwkGYXBC0mDC7J4SDIKroo/jKR45u6JSHIji29AUjxz90QkuZHFNyApnrl7IpLcyOIbkBTP3D0RSW5k8Q1Iimfunigvyf3Fgg1IEpCGJCQJEBCIyCYhSYCAQEQ2CUkCBAQisklIEiAgELHxJgl8sWBEJAlIQxKSBAgIRGSTkCRAQCAim4QkAQICEdkkJAkQ6B2xYD6bVACp9xEk9TZQMB9JBZB6H0FSbwMF85FUAKn3kWJJ2+22d9avmu/hmZX0eDwWOO/3e7rdblQjBsbTwK587TlVWUn3+33pfT6f0/l8phoxMJ4GduVrz6nKSko18vc4AllJx+NxSbPf76fr9frtFfZ9xtPArnztOVVZSYfDYendbDbT6XSiGjEwngZ25WvPqcpKWhtfr9f6yO8GBDw8iyU1yMUVlQSQVAkusg1JkbQrZyGpElxkG5IiaVfOQlIluMg2JEXSrpw1tqTKj/q2NiQJGEUSkgQICERkk5AkQEAgIpuEJAECAhHZJCQJEBCI6Nkkgc/5zohIEvCKJCQJEBCIyCYhSYCAQEQ2CUkCBAQisklIEiDw0YhtLmeT2nD86C1I+ijeNpcXS5rnuc1EblkIeHgWS1pu5kcXAkjqgt03FEk+Xl1OI6kLdt9QJPl4dTmNpC7YfUP/lSQfmnFOI2kcF8kkSEqiGecFksZxkUyCpCSacV4gaRwXySRISqIZ58UvAAAA//+WZl7nAAAABklEQVQDAJwMqeyel2XlAAAAAElFTkSuQmCC",
    dashed: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAABeCAYAAAAg/TovAAADSElEQVR4AeycXarqMBSFe86zgvjmNJyAOiUnII5MnYDT8E0EB+DJChRaSJvskuxmH9fFVNvsv34fgQsX7u8n8ud4PH6apvksFotIJLclBMATXME3lvfrAvmpnAAlVS4I41ESKFS+KKlyQRiPkkCh8kVJlQvCeMmS3F8TEc+ViYCEZ7KkTLOxzAQClCSGpp9ASfrMxR0pSYxMP4GS9JmLO1KSGJl+AiXpMxd3pCQxMv0EStJnLu5ISWJk+gmUpM9c3NG8JPEbG0ygJAPSKImSDBAwMCJPEiUZIGBgRJ4kSjJAwMCIPEmUZICAgREznyQDb2xwREoyII2SKMkAAQMj8iRRkgECBkbkSaIkAwQMjMiTREkGCMw9YkJ/nqQESHOHUNLcBhL6U1ICpLlDKGluAwn9KSkB0twhyZLW6/Xcs/6r/hKeUUmPx8PDeb/fzfV6DS4f4C7Xgf32uQvxn/Z+6NsHucvQfve5C/Of7rPQbx/kLqG97jMX4j/dZ0O/faC7DO23z12I/7T3+AZP/zDhkizp9Xo1h8MhuNAHjYf22+eIQez5fA7WaeOwj7jb7TYah3jEoS5+jy3EIPacuTdqjvXFXqg3eCL3fr/ja3RFJY1mc1OFQFTSdrv1g6xWq+ZyuQQXAvb7fXCvm4MYxJ5Op9HY3W6HsCYWh9oIRF38HluIQWykZiPtjZpjfbEX6g2eyN1sNvgaXVFJbfZyuWzQLLTamNBe91lqHHJSY3PHafUGT8yeVdLz+URNrkwEJDyTT1Km2VhmAgFKmgBNO4WStIlP6EdJE6Bpp1CSNvEJ/ShpAjTtFErSJj6hX92SJrzQf0yhpJmt/vz8RCegpCiisgEp/2EuJZV1kKU6JWXBWLYIJZXlm6U6JWXBWLYIJZXlm6U6JWXBWLYIJZXlm6W6RFKWhiwiJ0BJcmbqGZSkjlzekJLkzNQzKEkdubwhJcmZqWdQkjpyeUNKkjNTz6AkdeTyhpQkZybIyBNKSXk4Fq1CSUXx5imeLCnl3+LzjPQdVSQ8kyV9B7o635KS6vTSm4qSejjqvKGkOr30pqKkHo46byipTi+9qb5KUu/NDd1QkgFZlERJBggYGJEniZIMEDAwIk+SAUl/AAAA//9QB4cSAAAABklEQVQDACJgZUCa2BmJAAAAAElFTkSuQmCC",
    double: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAABeCAYAAAAg/TovAAACp0lEQVR4AeyWUaryMBBGg2/iqxtwDbokwT25JXUNbsB3EcT+/wR8DM2UdJrPey53SrFJ5us5DHQ1jPwdj8chpTRsNpuRlTz2EDCextX4ju1b/V/If+cEkNS5IIuHJKPQeSGpc0EWD0lGofNCUueCLB6SjELnhaTOBVk8JBkFV8UvRlI8c3dHJLmRxW9AUjxzd0ckuZHFb0BSPHN3RyS5kcVvQFI8c3dHJLmRxW9AUjxzd0d5Se43FtyAJAFpSEKSAAGBiEwSkgQICERkkpAkQEAgIpOEJAECAhEbT5LAGwtGRJKANCQhSYCAQEQmCUkCBAQiMklIEiAgEJFJQpIAgaUjVvSvnqTX65VOpxPViIHxrPCTl1RLer/f6Xw+U40YGM9soOJSLWm1WqXD4UA1YmA8K/zkJdWS1ut1ulwuVCMGxjMbqLhUS6o4iyUzEUDSTGBbHjsq6fF45H6fzyfdbjeqEQPjaWC/fO2+VKOS7vd73vt8PvloaPTRYB9gxtPAfvnafalGJZU28nscgVFJu90up7Gvkev1mn68wt7PeBrYL1+7L9WopO12m/fad/1+v09UGwbG08B++dp9qUYllTbyexwBJMWxntwJSZPRxW1EUhzryZ2QNBld3EYkxbGe3AlJk9HFbURSHOvJnfqWNPm1fmsjkgR8IglJAgQEIjJJSBIgIBCRSUKSAAGBiEwSkgQICET0TJLA6/xmRCQJeEUSkgQICERkkpAkQEAgIpOEJAECAhGZJCQJEJg1YpvDmaQ2HGc9BUmz4m1zeLWkYRjadOSUTMDDs1pSPpnLIgSQtAh2X1Mk+XgtshpJi2D3NUWSj9ciq5G0CHZf0z8lyYemn9VI6sdFMQmSimj6eYCkflwUkyCpiKafB0jqx0UxCZKKaPp58A8AAP//MY5iIwAAAAZJREFUAwChpKIK4SDXxwAAAABJRU5ErkJggg=="
  };
  const TOUR_JD_IMGS = {
    deong: "data:image/png;base64,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",
    gideok: "data:image/png;base64,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",
    deureo: "data:image/png;base64,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"
  };
  const TOUR_LY_IMGS = {
    dal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARAAAAC0CAYAAABc8HNZAAAQAElEQVR4AeydBbwVRRTGz30K2B3YLRb6s+MHCqiIigomNqgotiIqNoiKLQYGoGJiCyiCYvDs7sQCu8XArvdf3MfefXvz3bt1P37s293ZmdmZ7+z99sw5Z2br/tU/ISAEhECZCNSZ/gkBISAEykRABFImcComBISAWV0mk7FMRlsmIwwyGWGQyRSPQSajvNJA9BoRAkKgbAREIGVDp4JCQAiIQPQMCAEhUDYCIpCyoavtguq9EACBuvHjx5u7tWrVirSsbdiwYY3X3Xzaz8RMWISHxZgxY7KeTfdk1KhRekY9v+Mwn8m6Ll26mLvV1TVVSNq3b9943c2n/UzMhEV4WHTu3NnljKx9p06d9Ix6fsdhPpNNGSNLNDoRAkJACORGQASSG5ucV3RBCAiBGQiIQGbgoL9CQAiUgYAIpAzQVEQICIEZCIhAZuCgv0JACJSBQMkEUsY9VEQICIGUIiACSalg1S0hEAYCIpAwUNY9hEBKERCBpFSw6lYMEUhhk0QgKRSquiQEwkJABBIW0rqPEEghAiKQFApVXRICYSEgAgkL6Vq/j/qfSgREIKkUqzolBMJBQAQSDs66ixBIJQIikFSKVZ0SAuEgIAIJA2fdQwikFAERSEoFq24JgTAQEIGEgbLuIQRSioAIJKWCVbeEQBgIVJ9AwuiF7iEEhEAkCIhAIoFdNxUC6UBABJIOOaoXQiASBEQgkcCumwqBYhCIfx4RSPxlpBYKgdgiIAKJrWjUMCEQfwREIPGXkVooBGKLgAgktqKp9Yap/0lAQASSBCmpjUIgpgiIQGIqGDVLCCQBARFIEqSkNgqBmCIgAomlYNQoIZAMBEQgyZCTWikEYomACCSWYlGjhEAyEBCBJENOaqUQiCUCMSSQWOKkRgkBIRCAgAgkABQlCQEhUBwCIpDicFIuISAEAhAQgQSAoiQhkFAEQm+2CCR0yHVDIZAeBEQg6ZGleiIEQkdABBI65LqhEEgPAiKQ9Miy1nui/keAgAgkAtB1SyGQFgREIGmRpPohBCJAQAQSAei6pRBICwIikHRIUr0QApEgIAKJBHbdVAikAwERSDrkqF4IgUgQEIFEArtuKgTSgUAaCCQdklAvhEACERCBJFBoarIQiAsCIpC4SELtEAIJREAEEoHQvvjiC5s8ebJNnTo1grvrlkJgJgLNPRKBNBfBMspfeumlttFGG9naa69te+yxh7399ttl1KIiQiB6BEQgEcigbdu2jXedMGGCbbLJJnbttdc2pulACCQFARFIBJLq2rWrzTXXXFl3PuaYY2zs2LFZaToRAnFHQATSDAn99ddfdvjhh9t+++1nF154oT344IP266+/FqwR8thmm22a5Kuvr2+SpoTqIaCam4+ACKQZGP7zzz82ZswYGz16tJ1xxhm266672hJLLGEnnXSS/fbbb3lrJp8/w/bbb+9P0nmCEJg+fboNGjTIeamcffbZdvvtt9tnn32WoB6U3lQRSOmYNZZo2bKlDRgwoPHcPbjiiivszjvvdE8D97///ntW+uqrr26bbrppVppOkoXAo48+aqeeeqpddtlldsIJJzS+UDp37mw33nij+WWerN4Ft1YEEoxL0am9evWyTp06Nck/yyyzNEnzJnz66afeUzvuuOMsk8k4aT/88IO98cYb9v777zvn+pMMBDbeeGNbcsklmzR24sSJtvfee9uKK67oaKxNMiQ4QQTSTOFlMhkbMmRIk1pWXnnlJmnehPfee897alOmTLEDDzzQ1lhjDVtuueWsffv2tv766zvb8OHDjeFSVoFmnqh45RGYb7757JFHHrG55547sPJPPvnEunXr5tjLAjMkMFEEUgGh8dbZa6+9smpafPHFs84xrqJV4Gm54IILHA3Dm+G0006zO+64o8mYGS3k+OOPtyuvvNKbXccxRQAt45lnnrFFFlkkZwvxuE2bNi3n9SRdEIFUSFrbbrttVk3XX3+9DRw40Hr06OFoFRhN0Sp69uxpZ555ZlbeYk6kgRSDUjzyrLrqqoY9JB+JfPnll/FobDNbIQIpEUAMYYSiv/7660YQ2IgRIwztAcOptyqs8BdffLE98MADTbQKbz6OF154YScqlfgQbCpoHJAM5SGiJ554wg455BCyaksIAm3atDHklms4k49cEtJFp5k1SSBOz8v4g+q52GKL2WqrreZ4TAhDx/hJaDpvnKAqIYd27doZQ5xTTjnFIBxC2N28HTp0sHfeecceeughgywY3kAgBx98sGN4g1R4o9XVSVQuZlHsGX5effXVNnToUHv88cft33//LdgMhjOXX355YL75558/MD1piXoqS5AYblaCwIKK+NPPPfdc+/zzzx1y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",
    a: "data:image/png;base64,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"
  };
  // 둘러보기 장(章) — 카드 위 칩 줄로 늘 보이는 큰 목차. 단계마다 ch(장 번호 0~)를 달고
  // 표기는 1-2 꼴(대번호-소번호, TOUR_LABELS에서 자동 계산). 칩을 누르면 그 장 첫 단계로.
  // 장 이름·단계 문구는 js/tour-text.js(사람이 직접 고치는 파일)에서 온다 — 여기(TOUR_STEPS)는
  // 구조만: 어디를 비추나(sel·also)·창 열기(prep)·예시 그림(fig)·장 배속(ch)·잇는 열쇠(id).
  const TOUR_CHAPTERS = (window.TOUR_TEXT && window.TOUR_TEXT.chapters) || ["개요", "입력", "꾸미기", "마무리"];
  const TOUR_STEPS = [
    // 본문 규칙(2026-07-24): 각 단계 첫 줄은 '뭘 할 수 있는지' — 여는 위치(기능바 어느 버튼)는
    // 컷아웃·링이 이미 가리키므로 글로 되풀이하지 않는다. 예외는 장단·가사처럼 창을 연 뒤
    // 안의 체크를 한 번 더 켜야 하는 경우뿐(그 한 단계는 박스가 못 보여줘서 적는다).
    // 분량은 단계당 2~4줄 — 세부 문법·응용은 도움말·창의 ? 안내로 위임한다.
    // 장 구조: 1 개요(기능바·악보·레이아웃) → 2 입력(팔레트 6개 순서대로) → 3 꾸미기(정간 서식)
    // → 4 마무리(듣기·출력·도움말). 새 단계는 제 장 안에 넣고 ch를 맞출 것.
    // 에디터 모드 임시 비활성화 — #modeBox가 display:none이라 어차피 자동 건너뛰지만,
    // 그러면 단계 수(N / length)가 헛돌아서 배열에서 아예 뺀다. 되살릴 때 주석 해제:
    // { sel: "#modeBox", title: "입력 방식",
    //   body: "• 직접 입력 — 악보의 정간을 클릭해 그 자리에서 씁니다 (기본)\n• 에디터 — 곡 전체를 텍스트로 한 번에 고칩니다\n• 언제든 서로 바꿀 수 있습니다" },
    // 첫 단계는 '무슨 도구가 모인 곳인가'만 알리는 개요다 — 팔레트 쓰는 법(직접 타이핑/골라넣기)은
    // ④ 정간 입력·⑤~⑨ 각 팔레트에서, 정간 서식은 ⑪에서 자세히 다루므로 여기서 되풀이하지 않는다.
    // 다른 단계에 없는 것(각 삽입/삭제·내용 지우기·글자 크기)만 남긴다.
    // 첫 장은 '정간보란 무엇인가' — 앱 이야기를 꺼내기 전에 악보 읽는 법부터.
    // 한 각만 밝혔더니 나머지 악보가 너무 어두워 '이게 정간보'라는 그림이 안 보였다 —
    // 악보 전체를 밝히고, 정간·대강·각을 짚는 일은 아래 '악보' 단계의 이름표 상자가 맡는다.
    { ch: 0, sel: "#sheetArea", id: "Jeongganbo",
      // 글이 정간·각·대강을 말하므로 **바로 이 장에서** 셋을 상자로 짚는다 — 무엇을 가리키는
      // 말인지 모른 채 넘어가면 뒤가 다 헛돈다. 셋은 각기 다른 각에 있고 색도 다르다.
      also: [{ union: ".tour-lane-mel", label: "각" },
             { union: ".tour-lane-dg", label: "대강", labelPos: "side", tone: "b" },
             { union: ".tour-lane-cell", label: "정간", labelPos: "side", tone: "c" }] },
    { ch: 0, sel: "#melodyRibbon", id: "ribbon", },
    { ch: 0, sel: "#sheetArea", id: "sheet", },
    // 설정 — 정간 입력법보다 먼저. 악보의 짜임(정간·각 수·배치)과 문서(종이 방향·제목)를
    // 어디서 바꾸는지부터 알아야 내용을 채울 판이 선다. prep이 사이드바를 '레이아웃' 탭으로 연다.
    { ch: 0, sel: "#sidebar", id: "Setting", prep: tourEnsureLayoutTab,
      skipIf: function () { return document.body.classList.contains("sidebar-collapsed"); } },
    // 정간 입력 예시 — '무엇을 치면 무엇이 그려지는지'를 그림(fig)으로. 첫 방문자가 투어만
    // 보고 바로 써 볼 수 있게 악보 단계 바로 다음. 이미지는 손그림이 아니라 **앱이 실제로
    // 그린 악보**의 캡처다: 에디터에 "황 | 황 태 | 황태 | 황{미는표} | 황태 -황"을 넣고
    // 렌더된 페이지 SVG를 정간별로 viewBox 크롭 → canvas로 PNG 데이터 URL화(16px/mm,
    // 흰 배경, 편집 하이라이트 rect 제거). 렌더 모양이 바뀌면 같은 방법으로 다시 떠서 교체할 것.
    // 2장 시작 — 입력 그룹 팔레트 6개(律·飾·長·詞·文·章)를 기능바 순서대로 하나씩.
    // 첫 단계는 율명: 정간 입력 문법과 율명 팔레트를 함께 소개한다(팔레트를 열어 두고).
    // 구멍은 **악보의 첫 각(정간 줄) 자체**에 — '정간'이 어느 자리를 말하는지, 어디를 눌러
    // 적는지가 말이 아니라 화면으로 보여야 한다(render가 첫 각 칸에 .tour-lane-mel을 단다).
    // 악보가 아직 안 그려졌으면 예전처럼 악보 영역 전체로 물러선다.
    { ch: 1, sel: [{ union: ".tour-lane-mel" }, "#sheetArea"], id: "yul", prep: tourEnsureYulWin,
      // 율명·시김새는 한 버튼(井)·한 창이라 강조도 하나다 — 창 안의 '율명 | 시김새'
      // 토글까지 함께 가리켜 '여기서 갈아 끼운다'가 보이게 한다.
      also: ["#winToggleYul", "#paletteCol .pal-views", "#paletteCol"],
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
    // prep(tourEnsureOrnWin)이 팔레트를 열고 **시김새 보기로 바꿔** 두므로 also의 것들이 실제로 보인다.
    // 대상은 팔레트 머리줄(.pal-top) — 악기·크기 컨트롤이 다 이 줄에 있어 구멍 하나로 다
    // 밝아진다. 기능바의 여는 버튼은 also 링으로.
    { ch: 1, sel: "#paletteCol .pal-top", id: "ornPalette", prep: tourEnsureOrnWin,
      also: ["#winToggleYul", "#paletteCol .orn-instrument", "#paletteCol .size-ctl"], },
    { ch: 1, sel: "#paletteCol", id: "ornShortcut", prep: tourEnsureOrnWin,
      also: ["#ornMapToggle"], },
    { ch: 1, sel: "#ornEditToggleEd", id: "ornEdit", prep: tourEnsureOrnWin, },
    // 장단·가사 — '켜면 이렇게 되고 이렇게 쓴다'를 실제 렌더 캡처와 함께.
    // 정간 입력 다음 순서인 건 실제 작성 차례(선율 → 장단·가사)를 따라가는 것.
    // 구멍은 켜는 곳(기능바 버튼)에 — 예전엔 악보 전체였는데, 빈 문서 투어에선 장단·가사
    // 줄이 아직 없어 '어딜 누르라는 건지'가 안 보였다. 결과 모습은 fig 캡처가 보여준다.
    { ch: 1, sel: "#winToggleLyrics", id: "lyrics",
      // 곁줄이 정간 어느 쪽에 붙는지·어디를 더블클릭하면 되는지를 악보에서 함께 밝힌다.
      // .tour-lane-ly는 곁줄 칸에도, 곁줄이 아직 없을 때의 '진입로'(정간 오른쪽 빈 자리)에도
      // 붙어 있어 두 경우 다 가리킨다.
      also: [{ union: ".tour-lane-ly" }],
      fig: [
        { t: "달", cap: "황 옆에 '달'", img: TOUR_LY_IMGS.dal },
        { t: "아", cap: "태 옆에 '아'", img: TOUR_LY_IMGS.a }
      ] },
    { ch: 1, sel: "#winToggleJangdan", id: "jangdan",
      // 장단이 이미 켜져 있으면 악보의 **장단 줄**도 함께 밝혀 어디에 생기는지 보이게 한다.
      // 꺼져 있으면 그 줄이 없으니 rectOfSpec이 null을 주고 조용히 넘어간다.
      also: [{ union: ".tour-lane-jd" }],
      fig: [
        { t: "덩", img: TOUR_JD_IMGS.deong },
        { t: "기덕", img: TOUR_JD_IMGS.gideok },
        { t: "더러러러", img: TOUR_JD_IMGS.deureo }
      ] },
    // 빠르기 표기·각 이름 — 章 창(입력 그룹). #5 피드백: 빠르기 조절을 못 찾았고, '빠르기'가
    // 재생 설정(듣는 속도)과 여기(악보에 찍는 표기) 두 곳이라 헷갈렸다. 장단·가사와 같은
    // 켜는 자리(기능바 버튼)를 가리킨다.
    { ch: 1, sel: "#winToggleGakName", id: "gakName", },
    // 텍스트(文) — 팔레트 6개 중 유일하게 투어에 없던 창. 제목·부제 서식이 이리로
    // 온 뒤(2026-07-24)라 함께 소개한다. 창을 열어 두고(prep) 가리킨다.
    { ch: 1, sel: "#textArea", id: "text", prep: tourEnsureTextWin,
      also: ["#winToggleText"] },
    // 정간 서식 — 창을 열어 둔 채(prep) 배경색·정간·가로줄·초기화 네 구획을 짚는다.
    // #1 피드백: 각 끝/정간 위아래의 마디선·덧줄(이중선)을 어디서 긋는지 못 찾았다.
    // 내용(선율~각 이름)을 다 넣은 뒤 '꾸미는' 차례라 章 다음·들어보기 앞에 둔다.
    { ch: 2, sel: "#cellStyleWin", id: "cellStyle", prep: tourEnsureCellStyleWin,
      also: ["#winToggleCellStyle"],
      fig: [
        { t: "굵게", img: TOUR_BORDER_IMGS.thick },
        { t: "점선", img: TOUR_BORDER_IMGS.dashed },
        { t: "이중선", img: TOUR_BORDER_IMGS.double }
      ] },
    // 듣기 — 상단바 1급 버튼 셋(재생·정지·재생 설정)인데 예전 투어엔 통째로 빠져 있었다.
    // 악보 다음에 두는 건 '써 넣었으면 들어본다'는 차례라서(설정·인쇄보다 앞).
    { ch: 3, sel: "#playBar", id: "play", },
    // '설정' 단계는 뺐다(2026-07-17) — '레이아웃 잡기'가 이미 사이드바를 통째로 비춰
    // 겹쳤고, 문서 탭(제목·종이 방향)은 따로 가르칠 만큼 헷갈리지 않다. 보관 탭의
    // 임시 저장만 아래 '인쇄 · 파일' 단계에 한 줄로 흡수.
    { ch: 3, sel: "#outBox", id: "files", },
    { ch: 3, sel: "#btnHelp", id: "help", }
  ];
  let tourIdx = -1, tourOnEnd = null;
  // 말풍선이 지금 앉아 있는 자리(TOUR_SLOTS의 인덱스). 단계를 넘겨도 이 값을 그대로 들고
  // 가는 것이 핵심이다 — 자세한 규칙은 positionTour 머리말 참고. 투어를 새로 시작할 때만
  // null로 되돌린다(startTour).
  let tourSlot = null;
  // 하이라이트 대상 하나를 사각형으로. 세 가지 꼴을 받는다:
  //   "선택자"            — 첫 번째로 잡히는 요소(예전부터의 기본)
  //   { union: "선택자" } — 잡히는 것 **전부를 감싸는** 한 상자. 정간 줄·곁줄 줄처럼 칸이
  //                        여럿으로 쪼개져 그려지는 것을 '줄 하나'로 가리킬 때 쓴다.
  //   [스펙, 스펙, …]     — 앞에서부터 잡히는 첫 번째(악보가 비어 대상이 없을 때의 대비책)
  function rectOfSpec(spec) {
    if (!spec) return null;
    if (Array.isArray(spec)) {
      for (let i = 0; i < spec.length; i++) { const r = rectOfSpec(spec[i]); if (r) return r; }
      return null;
    }
    if (spec.union) {
      let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      document.querySelectorAll(spec.union).forEach(function (e) {
        const r = e.getBoundingClientRect();
        if (!r.width && !r.height) return;
        L = Math.min(L, r.left); T = Math.min(T, r.top);
        R = Math.max(R, r.right); B = Math.max(B, r.bottom);
      });
      return L === Infinity ? null : { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
    }
    const el = document.querySelector(spec);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width || r.height) ? r : null;   // rect 0 = 화면에 없음 → 그 단계는 건너뜀
  }
  function tourRect(step) { return rectOfSpec(step.sel); }
  // 단계 준비(prep) — 시김새 3단계처럼 '눌러야 하는 버튼'이 접힌 도구창 안에 있으면
  // 창을 먼저 열어 보여준다. 뭘 열었는지 기억해 뒀다가 endTour에서 원래 창으로 복원.
  // 문구 붙이기 — tour-text.js의 steps[id]에서 title·body를 가져온다. 파일이 빠졌거나
  // id가 어긋나면 제목 자리에 id가 그대로 보여 눈에 띄게 했다(조용히 사라지는 것보다 낫다).
  TOUR_STEPS.forEach(function (s) {
    const t = ((window.TOUR_TEXT && window.TOUR_TEXT.steps) || {})[s.id] || {};
    s.title = t.title || s.id;
    s.body = t.body || "";
  });
  // 단계 라벨(1-2 꼴) — ch가 바뀔 때 소번호가 1로 돌아간다. 배열 순서에서 한 번만 계산.
  // 건너뛴 단계도 번호를 유지한다(동적 재번호는 '아까 2-3이 지금은 2-2'가 되어 더 헷갈림).
  const TOUR_LABELS = (function () {
    const out = []; let prev = -1, minor = 0;
    TOUR_STEPS.forEach(function (s) {
      if (s.ch !== prev) { prev = s.ch; minor = 1; } else minor++;
      out.push((s.ch + 1) + "-" + minor);
    });
    return out;
  })();
  let tourPrevWin = null, tourTouchedWin = false;
  // 도구창 열기(공통) — prep에서 쓰며, 처음 연 시점의 '원래 열려 있던 창'을 기억해 뒀다가
  // endTour가 복원한다. 대상 창은 전부 .direct-win이라 복원 로직 하나로 충분.
  function tourEnsureWin(winId, toggleId) {
    const w = $(winId);
    if (!w || w.classList.contains("win-open")) return;
    if (!tourTouchedWin) {
      const open = document.querySelector(".direct-win.win-open");
      tourPrevWin = open ? open.id : null;
      tourTouchedWin = true;
    }
    $(toggleId).click();
  }
  function tourEnsureYulWin() { tourEnsureWin("paletteCol", "winToggleYul"); }
  // 시김새는 같은 창의 다른 **보기**라, 창을 여는 것에 더해 보기까지 시김새로 돌려놔야
  // 안내가 가리키는 악기·단축키·편집 버튼이 실제로 화면에 있다(.orn-only-tool은 시김새
  // 보기에서만 보인다). 원래 보기는 endTour가 tourPrevPalView로 되돌린다.
  function tourEnsureOrnWin() {
    tourEnsureWin("paletteCol", "winToggleYul");
    if (palView === "orn") return;
    if (!tourTouchedPalView) { tourPrevPalView = palView; tourTouchedPalView = true; }
    const b = document.querySelector('.pal-view[data-view="orn"]');
    if (b) b.click();
  }
  let tourPrevPalView = null, tourTouchedPalView = false;
  function tourEnsureTextWin() { tourEnsureWin("textArea", "winToggleText"); }
  function tourEnsureCellStyleWin() { tourEnsureWin("cellStyleWin", "winToggleCellStyle"); }
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
    const rects = [];
    (step.also || []).forEach(function (sel) {
      const r = rectOfSpec(sel);   // sel도 union·배열 꼴을 받는다(위 rectOfSpec 참고)
      if (!r) return;
      const d = document.createElement("div");
      // tone — 상자가 여럿일 때 색으로 갈라 준다(기본은 강조색). 정간·대강·각처럼 나란히
      // 놓이는 상자들이 한 색이면 이름표를 일일이 읽어야 한다.
      d.className = "tour-ring" + (sel && sel.tone ? " tone-" + sel.tone : "");
      // 이름표(label) — 상자가 무엇을 가리키는지 글로 붙인다. 겹치지 않게 자리를 고를 수 있다
      // (labelPos: "top" 기본 · "side"=오른쪽 바깥). 정간·대강처럼 상자가 포개질 때 쓴다.
      if (sel && sel.label) {
        const lab = document.createElement("span");
        lab.className = "tour-ring-lab" + (sel.labelPos === "side" ? " at-side" : "");
        lab.textContent = sel.label;
        d.appendChild(lab);
      }
      d.style.left = (r.left - 4) + "px";
      d.style.top = (r.top - 4) + "px";
      d.style.width = (r.width + 8) + "px";
      d.style.height = (r.height + 8) + "px";
      // 카드보다 '앞'에 끼워야(z 순서) 링이 말풍선 위로 그려지지 않는다
      $("tourLayer").insertBefore(d, $("tourCard"));
      rects.push({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 });
    });
    return rects;   // 보조 대상 사각형 — 이걸로 #tourSpot 마스크에도 밝은 구멍을 뚫는다
  }
  // 둘러보기 본문 렌더 — \n마다 div, 줄 앞 "## " 소제목·"!! " 팁, **굵게**.
  // innerHTML 없이 노드로 조립(본문에 황{미는표}·< 같은 문자가 그대로 들어가도 안전).
  // 단계 카드와 완료 축하 카드가 함께 쓴다.
  function renderTourBody(el, body) {
    el.textContent = "";
    (body || "").split("\n").forEach(function (ln) {
      const d = document.createElement("div");
      if (ln.slice(0, 3) === "## ") { d.className = "tour-sub"; ln = ln.slice(3); }
      else if (ln.slice(0, 3) === "!! ") { d.className = "tour-tip"; ln = ln.slice(3); }
      ln.split("**").forEach(function (seg, k) {
        if (!seg) return;
        if (k % 2) { const b = document.createElement("b"); b.textContent = seg; d.appendChild(b); }
        else d.appendChild(document.createTextNode(seg));
      });
      el.appendChild(d);
    });
  }
  // #tourSpot 마스크에 '밝은 구멍'(검은 사각형 = 그 자리 어둠을 뺌)을 다시 그린다.
  // 흰 배경 rect(마스크의 첫 자식)는 남기고 hole 클래스 사각형만 갈아끼운다.
  function buildSpotlight(holes) {
    const mask = document.getElementById("tourSpotMask");
    if (!mask) return;
    mask.querySelectorAll(".tour-spot-hole").forEach(function (n) { n.remove(); });
    const NS = "http://www.w3.org/2000/svg";
    holes.forEach(function (h) {
      const rc = document.createElementNS(NS, "rect");
      rc.setAttribute("class", "tour-spot-hole");
      rc.setAttribute("x", h.x); rc.setAttribute("y", h.y);
      rc.setAttribute("width", h.w); rc.setAttribute("height", h.h);
      rc.setAttribute("rx", "8"); rc.setAttribute("fill", "#000");
      mask.appendChild(rc);
    });
  }
  function positionTour() {
    if (tourIdx < 0) return;
    const r = tourRect(TOUR_STEPS[tourIdx]);
    if (!r) { endTour(); return; }
    const alsoRects = positionTourRings(TOUR_STEPS[tourIdx]);
    const pad = 6;
    const hole = $("tourHole");
    hole.style.left = (r.left - pad) + "px";
    hole.style.top = (r.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    // 어둠에 밝은 구멍 뚫기 — 메인 대상 + 보조(also) 대상 모두
    buildSpotlight([{ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }].concat(alsoRects));
    placeTourCard({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 },
                  alsoRects);
  }
  // 말풍선 자리 아홉 곳 — 화면 모서리·변에 붙는 고정 자리다. 화면 크기와 카드 크기로만
  // 정해지므로 대상이 어디로 가든 자리 자체는 그대로 있다.
  // ★ 차례가 곧 선호도다(앞이 먼저). 아래줄을 앞에 둔 건 카드 높이가 단계마다 달라지기
  //   때문 — 아래에 붙여 놓으면 본문이 길어져도 발(버튼줄)이 같은 높이에 남아 [다음]이
  //   제자리를 지킨다. 위에 붙이면 본문 길이만큼 버튼이 아래위로 뛴다.
  const TOUR_SLOTS = [
    { hx: "left", vy: "bottom" }, { hx: "right", vy: "bottom" }, { hx: "center", vy: "bottom" },
    { hx: "left", vy: "middle" }, { hx: "right", vy: "middle" },
    { hx: "left", vy: "top" },    { hx: "right", vy: "top" },
    { hx: "center", vy: "top" },  { hx: "center", vy: "middle" },
  ];
  const TOUR_SLOT_M = 8;   // 화면 가장자리에서 띄우는 여백
  // ★ 세로는 '카드 윗변을 어디에 두나'가 아니라 **'카드 밑변을 어디에 두나'**로 정한다.
  //    그래서 카드는 어느 줄에 앉든 늘 **위로 자란다** — 본문이 209px이든 753px이든 발
  //    (버튼줄)이 그 줄의 밑선에 남으므로 [다음] 버튼의 높이가 안 변한다.
  //    윗변 기준이던 때는 위줄에 앉는 순간 카드가 아래로 자라 [다음]이 254px~780px을
  //    오르내렸다(2026-08-11 실측). vy 값(bottom/middle/top)은 '줄 이름'이지 붙는 변이 아니다.
  //    밑선이 카드보다 높으면(아주 긴 카드) 위로 넘칠 수 없으니 화면 위에 붙여 클램프한다.
  function tourSlotBox(slot, cw, ch) {
    const m = TOUR_SLOT_M, vw = window.innerWidth, vh = window.innerHeight;
    const x = slot.hx === "left" ? m : slot.hx === "right" ? vw - cw - m : (vw - cw) / 2;
    const foot = slot.vy === "bottom" ? vh - m : slot.vy === "middle" ? vh * 0.62 : vh * 0.36;
    return { x: Math.max(m, x), y: Math.max(m, foot - ch), w: cw, h: ch };
  }
  function tourOverlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? w * h : 0;
  }
  // 말풍선 앉히기 — **머무는 것이 기본이고 옮기는 것이 예외**다.
  //
  // 예전엔 단계마다 '대상 아래 → 위 → 옆'을 새로 계산해 대상을 따라다녔다. 그러면 단계를
  // 넘길 때마다 카드가 화면을 가로질러 날아가고, 사람은 [다음] 버튼을 마우스로 쫓아다녀야
  // 한다 — 안내를 읽는 것보다 버튼 찾는 일이 더 힘들어진다(2026-08-11 사용자 지적).
  //
  // 그래서 자리를 아홉 곳으로 고정해 두고, 지금 앉은 자리가 '봐줄 만하면' 그냥 둔다.
  // 옮겨야 할 때도 아무 데로나 가지 않고 **지금 자리에서 가장 가까운** 쓸 만한 자리로 간다.
  // 가리는 정도는 두 가지로 나눠 센다:
  //   · also 상자(본문이 '이걸 누르세요'라고 짚는 것) — 가리면 그 단계가 통째로 무의미해지니
  //     1000배 무겁게 친다. 사실상 절대 안 가린다.
  //   · 주 대상(hole) — 가리면 아쉽지만 대상이 화면만큼 클 때(악보 전체 등)는 피할 자리가
  //     아예 없다. 그래서 넓이로만 세고, 카드 넓이의 STAY_TOL(15%)까지는 참고 머문다.
  const TOUR_STAY_TOL = 0.15;
  function placeTourCard(holeRect, alsoRects) {
    const card = $("tourCard");
    // 크기는 **실수 그대로**(offsetWidth/Height는 정수로 반올림된다) 재야 한다 — 밑변 기준으로
    // 앉히므로 높이가 1px만 어긋나도 카드 밑선이 그만큼 밀려 [다음] 버튼이 미세하게 떤다.
    const cr = card.getBoundingClientRect();
    const cw = cr.width, ch = cr.height;
    const cardArea = Math.max(1, cw * ch);
    // 허용치(카드 넓이의 15%) 안쪽 가림은 **0으로 친다**. 이 한 줄이 자리 차례(선호도)를
    // 살린다 — 안 그러면 아래줄 자리가 주 대상을 2천px²(허용치의 11%)만 스쳐도 위줄 자리에
    // 밀려, 카드가 화면 위에 붙고 본문 길이만큼 아래로 자란다. 그러면 자리는 안 옮겨도
    // [다음] 버튼이 세로로 500px씩 뛰어 결국 버튼을 쫓아다니게 된다(2026-08-11 실측).
    // 아래줄 자리라야 카드가 위로 자라 발이 제자리에 남는다(TOUR_SLOTS 차례 주석 참고).
    const tol = cardArea * TOUR_STAY_TOL;
    function cost(box, slot) {
      let a = 0, h = tourOverlap(box, holeRect);
      alsoRects.forEach(function (r) { a += tourOverlap(box, r); });
      // 아래줄이 아닌 자리에 무거운 벌점 — **[다음] 버튼을 제자리에 묶는 것이 이 벌점의 목적**이다.
      // 카드는 자리 안에서 위로 자라거나 아래로 자란다. 아래줄에 붙으면 카드 밑변이 늘
      // '화면 아래 8px'이라 본문이 209px이든 753px이든 발(버튼줄)이 같은 높이에 남지만,
      // 위줄·가운뎃줄에 붙으면 본문 길이만큼 발이 따라 내려간다(실측: 15단계 내내 [다음]이
      // 매번 다른 높이 — 176px에서 780px까지). 자리를 고정해도 버튼이 움직이면 결국
      // 버튼을 쫓아다니게 되므로, **위줄·가운뎃줄은 아래줄이 짚는 상자(also)를 가릴 때만** 쓴다.
      // 벌점을 카드 넓이로 잡은 것이 그 뜻이다 — 주 대상 가림(hole)은 아무리 커도 카드 넓이를
      // 못 넘으므로, hole 차이만으로는 절대 아래줄을 벗어나지 못한다. 넘어서는 건 1000배로
      // 세는 also뿐. 즉 '주 대상을 좀 가리더라도 버튼은 제자리'를 고른 것이고, 이건
      // "최대한 고정, 불가피하면 어쩔 수 없이"라는 사용자 주문 그대로다(2026-08-11).
      const pen = slot.vy === "bottom" ? 0 : cardArea;
      return { also: a, hole: h, score: a * 1000 + (h <= tol ? 0 : h) + pen };
    }
    const boxes = TOUR_SLOTS.map(function (s) { return tourSlotBox(s, cw, ch); });
    const costs = boxes.map(function (b, i) { return cost(b, TOUR_SLOTS[i]); });
    // ① 지금 자리가 '봐줄 만하면' 그대로 — 짚는 상자를 안 가리고, 주 대상도 조금만 가릴 때
    if (tourSlot != null && costs[tourSlot] &&
        costs[tourSlot].also === 0 && costs[tourSlot].hole <= tol) {
      card.style.left = boxes[tourSlot].x + "px";
      card.style.top = boxes[tourSlot].y + "px";
      return;
    }
    // ② 옮겨야 한다 — 덜 가리는 자리 중에서 **지금 자리와 가장 가까운** 곳으로(움직임 최소화).
    //    아직 앉은 적이 없으면(투어 첫 단계) 거리는 0으로 두고 위 선호 차례가 정한다.
    const cur = (tourSlot != null && boxes[tourSlot]) ? boxes[tourSlot] : null;
    let best = 0;
    for (let i = 1; i < boxes.length; i++) {
      const d = costs[i].score - costs[best].score;
      if (d < -0.5) { best = i; continue; }
      if (d > 0.5) continue;
      if (!cur) continue;   // 점수가 같고 기준점도 없으면 앞 차례(선호도)가 이긴다
      const di = Math.hypot(boxes[i].x - cur.x, boxes[i].y - cur.y);
      const db = Math.hypot(boxes[best].x - cur.x, boxes[best].y - cur.y);
      if (di < db) best = i;
    }
    tourSlot = best;
    card.style.left = boxes[best].x + "px";
    card.style.top = boxes[best].y + "px";
  }
  function tourGo(i, dir) {
    while (i >= 0 && i < TOUR_STEPS.length && !stepAvailable(i)) i += dir;
    if (i >= TOUR_STEPS.length) { showTourFinale(); return; }   // 마지막 '다음' = 완료 축하 화면
    if (i < 0) { endTour(); return; }
    tourIdx = i;
    $("tourFinale").style.display = "none";   // 뒤로 돌아오면 축하 카드 걷고 단계 카드로
    $("tourCard").style.display = "";
    $("tourHole").style.display = "";
    const s = TOUR_STEPS[i];
    $("tourStepNum").textContent = TOUR_LABELS[i] + " · " + TOUR_CHAPTERS[s.ch];
    // 장 칩(현재 장 강조)·전체 진행 바
    document.querySelectorAll("#tourChips button").forEach(function (b, ci) {
      b.classList.toggle("on", ci === s.ch);
    });
    if ($("tourProgressFill")) $("tourProgressFill").style.width = ((i + 1) / TOUR_STEPS.length * 100) + "%";
    $("tourTitle").textContent = s.title;
    // 본문은 \n마다 줄(div) 하나 — 통짜 textContent + pre-line이 아니라 줄 단위 블록이라야
    // 긴 글머리표가 접힐 때 둘째 줄이 • 밑이 아니라 글자 밑에 맞는다(내어쓰기, CSS #tourBody div).
    // 미니 문법 셋: **굵게**(짝수 번째 ** 사이만 <b>), 줄 앞 "## "은 소제목(.tour-sub —
    // 한 단계 안에서 글머리표 묶음이 둘일 때 나눔), 줄 앞 "!! "은 팁(.tour-tip — 기능 안내가
    // 아니라 권장 사용법, 연한 강조 배경 상자). innerHTML 대신 노드 조립 —
    // 본문에 황{미는표}·< 같은 문자가 그대로 들어가 이스케이프 사고를 피하려고.
    renderTourBody($("tourBody"), s.body);
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
    tourSlot = null;   // 자리는 투어를 새로 시작할 때만 다시 고른다(placeTourCard 참고)
    track("tour_start");
    $("tourLayer").style.display = "block";
    tourGo(0, 1);
  }
  // 마지막 단계에서 '다음'(완료)을 누르면 — 건너뛰기가 아니라 끝까지 본 사람에게만 —
  // 축하 카드를 띄운다. 전체 어둡게(구멍 0개)·단계 카드 숨김·가운데 축하 카드.
  // 문구는 tour-text.js의 finale에서 고친다. '시작하기'가 endTour로 마무리(→ 첫 방문이면 마법사).
  function showTourFinale() {
    const t = (window.TOUR_TEXT && window.TOUR_TEXT.finale) || {};
    tourIdx = -1;   // 단계 밖 — resize 시 positionTour가 안 돌게(가드 tourIdx<0)
    buildSpotlight([]);
    document.querySelectorAll(".tour-ring").forEach(function (n) { n.remove(); });
    $("tourHole").style.display = "none";
    $("tourCard").style.display = "none";
    if ($("tourFinaleTitle")) $("tourFinaleTitle").textContent = t.title || "축하합니다!";
    renderTourBody($("tourFinaleBody"), t.body || "");
    if ($("tourFinaleBtn")) $("tourFinaleBtn").textContent = t.button || "시작하기";
    const fin = $("tourFinale");
    fin.style.display = "";
    // 팝인 애니메이션 재시작(같은 카드를 두 번 봐도 매번 튀어오르게)
    fin.classList.remove("pop"); void fin.offsetWidth; fin.classList.add("pop");
    track("tour_done");
  }
  function endTour() {
    // 건너뛰기·Escape·완료(축하 카드의 시작하기)·모두 이 경로 — onEnd(첫 방문이면 마법사)는 딱 한 번
    tourIdx = -1;
    if ($("tourFinale")) $("tourFinale").style.display = "none";
    $("tourCard").style.display = "";
    $("tourHole").style.display = "";
    document.querySelectorAll(".tour-ring").forEach(function (n) { n.remove(); });
    // prep이 도구창(시김새/정간 서식)을 열었었다면 투어 전에 열려 있던 창으로 되돌린다
    // (작업 공간 존중). 도구창은 한 번에 하나만 열리므로 지금 열린 창이 곧 투어가 연 창.
    if (tourTouchedWin) {
      const cur = document.querySelector(".direct-win.win-open");
      const curId = cur ? cur.id : null;
      if (curId && curId !== tourPrevWin) {
        const cb = document.querySelector('.win-toggle[data-target="' + curId + '"]');
        if (cb) cb.click();   // 투어가 연 창을 닫는다
      }
      if (tourPrevWin) {
        const btn = document.querySelector('.win-toggle[data-target="' + tourPrevWin + '"]');
        const pw = $(tourPrevWin);
        if (btn && pw && !pw.classList.contains("win-open")) btn.click();
      }
      tourTouchedWin = false; tourPrevWin = null;
    }
    // prep이 팔레트를 시김새 보기로 돌렸었다면 원래 보기로 (창 복원과 같은 취지)
    if (tourTouchedPalView) {
      const b = document.querySelector('.pal-view[data-view="' + (tourPrevPalView || "yul") + '"]');
      if (b && !b.classList.contains("active")) b.click();
      tourTouchedPalView = false; tourPrevPalView = null;
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
  // 장 칩 만들기(한 번) — 누르면 그 장의 첫 단계로 이동(사용 불가 단계면 tourGo가 앞으로 건너뜀)
  (function () {
    const wrap = $("tourChips");
    if (!wrap) return;
    TOUR_CHAPTERS.forEach(function (name, ci) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = (ci + 1) + " " + name;
      b.addEventListener("click", function () {
        const first = TOUR_STEPS.findIndex(function (s) { return s.ch === ci; });
        if (first >= 0) tourGo(first, 1);
      });
      wrap.appendChild(b);
    });
  })();
  $("tourSkip").addEventListener("click", endTour);
  if ($("tourFinaleBtn")) $("tourFinaleBtn").addEventListener("click", endTour);   // 축하 카드 '시작하기'
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
  //  · 보관(jgb_snapshots_v1)과 화면 설정(jgb_dark_v1·jgb_theme_v1·jgb_staff_v1)은
  //    **일부러 남긴다** —
  //    온보딩과 무관한데 지우면 남의 자료·설정이 날아간다. 그래서 localStorage.clear()를 쓰지 않는다.
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
                 "• 보관함의 임시 저장과 색상 설정(색상 테마·다크)은 그대로 둡니다\n\n계속할까요?")) return;
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
  // 주소에 악보가 실려 왔는가 — 링크(#s=) 또는 게시물(#v=, js/cloud.js). **해시를 떼기 전에**
  // 봐 둬야 한다. 받은 악보가 실제로 화면에 들어오는 건 압축 풀이·서버 응답을 기다리느라 한
  // 박자 뒤인데, 그 사이에 아래 새 문서 마법사가 열리면 [만들기]를 누르는 순간
  // applyNewDocAnswers가 방금 받은 악보의 제목·정간 수·각 수를 덮어쓴다.
  const incomingDoc = /^#[sv]=/.test(location.hash);
  consumeShareHash(restored);   // 링크(#s=…)로 받은 악보 열기 — 비동기, 작업 중이면 confirm 후 교체
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
  // 저장된 작업이 없는 첫 화면은 **한 줄(8각)** 로 연다. 예전엔 페이지를 꽉 채워(20각·두 줄)
  // 시작했는데, 아직 아무것도 정하지 않은 사람에게 빈 격자가 두 줄이나 깔리면 '이걸 다 채워야
  // 하나' 싶어 부담스럽다. gakUserSet을 켜 두는 건 페이지 채움(capacity)이 이 값을 덮지 않게
  // 하려는 것 — 사용자가 총 각 수를 직접 적은 것과 같은 상태다.
  // 아래 마법사가 돌면 그쪽 답이 이 값을 덮는다(마법사도 기본 8각).
  if (!restored) { $("gakCount").value = 8; gakUserSet = true; }
  if (newDocPending) applyNewDocAnswers(newDocPending);
  else if (!restored && !firstVisit && !incomingDoc) openNewDocWizard(applyNewDocAnswers);

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
  // 악보를 받아 온 사람(공유 링크·게시물)에게는 환영 카드도 띄우지 않는다 — 어떤 선택을 해도
  // 새 문서 마법사로 수렴해 방금 받은 악보를 덮기 때문이다. 카드는 다음에 그냥 들어올 때 뜬다.
  if (firstVisit && !incomingDoc) showWelcome();
})();
