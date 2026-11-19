// 타악 정간보(percussion.html) — 꽹과리·장구·북·징을 한 장에 적는 가로형 정간보.
//
// 편집기(editor.html·app.js)와 별개 문서다. 세로쓰기·율명·시김새를 하나도 안 쓰므로 그 무거운
// 짐을 싣지 않는다. 그리는 단위는 mm이고 SVG viewBox = 종이 크기라 인쇄·PNG가 화면과 같다.
//
// 짜임: 시간은 왼쪽 → 오른쪽, 악기는 위 → 아래 한 줄씩. 장단 하나 = 정간 B칸,
// 한 줄(가로 단)에 장단 P개. 굵기: 정간 사이 가는 선 < 대강 경계 < 장단 경계.
// 칸 안 띄어쓰기는 칸을 좌우로 고르게 나눈다(`덩 덕` = 반 칸씩).
//
// 글자 크기는 세 겹이 곱해진다: 전체(fsGu) × 구음별(guSize, 「덩은 늘 크게」) × 낱 구음(`덕@80`).
// 낱 구음 크기를 칸 글자 끝에 붙여 적는 것은 일부러다 — 따로 저장하면 글자를 고치거나 [앞 장단
// 반복]으로 옮길 때 크기가 엉뚱한 구음에 붙는다. 입력칸에서 ⌥↑/⌥↓가 이 꼬리를 달고 뗀다.
//
// 저장은 이 브라우저(localStorage `jgb_perc_v1`)에만 — 편집기 문서와 섞이지 않게 열쇠를 따로 둔다.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEY = "jgb_perc_v1";
  const PAPERS = { A4: [210, 297], B4: [257, 364], A3: [297, 420], B5: [182, 257], Letter: [215.9, 279.4] };
  const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  // 악기마다 고르개에 띄울 구음. 이름은 녹음 음원(타악단음/<악기>/<구음>_<세기>.wav)에 맞췄고,
  // 음원이 없는 것도 표기에 쓰이면 넣었다(HAS_SOUND에 없으면 단추에 '음원 없음'이 뜬다). 근거:
  //   꽹과리 깽·개 = 갱의 강·약(전지환 2020, 『국악원논문집』 41, p.227) — 소리는 갱 강/약으로 낼 것
  //   장구 따 = 사물놀이 채편 기본(이상규 2023, 『동양음악』 53, p.145 표9)
  //   북 둥·두·딱 = 중학교 교과서 표기(윤명원 2016, 『국악원논문집』 34, p.109 표13)
  // 여기 없는 구음도 칸에 그냥 치면 된다.
  const GUEUM = {
    kkwaenggwari: ["갱", "깽", "개", "지", "갯", "객", "개-ㅅ", "지갱", "그랑", "그라갱", "게르르르"],
    janggu: ["덩", "쿵", "궁'", "덕", "따", "기덕", "다", "더러러러"],
    buk: ["둥", "두", "딱"],
    jing: ["징"],
  };
  // 단추에는 없지만 그 악기의 구음으로 인정하는 것 — 논문·교재에 나오는 이름(소리는 아직 없다).
  // 이 밖의 글자는 '그 악기의 구음이 아님'으로 보고 화면에서 빨갛게 짚는다(징 줄에 '개갠' 같은 것).
  //   장구: 이상규(2023) 표9·표11 · 꽹과리: 전지환(2020) 표5·6 · 북: 윤명원(2016) 표13
  const GUEUM_EXTRA = {
    janggu: ["궁", "딱", "더", "구", "기닥", "기덩", "구궁", "다르르르", "구르르르", "떵"],
    kkwaenggwari: ["찌", "듭", "찌깽", "끄랑", "자브라", "갠"],
    buk: ["쿵", "쿠"],
    jing: [],
  };
  // 음원이 있는 구음(js/perc-audio.js — soundKey가 고르는 이름과 같아야 한다). 음원을 늘리면 여기도.
  const HAS_SOUND = {
    janggu: ["덩", "쿵", "궁", "덕", "기덕", "다", "더러러러"],
    kkwaenggwari: ["갱", "깽", "개", "지", "갯", "객", "개-ㅅ", "지갱", "그랑", "그라갱", "게르르르"],
    buk: ["둥", "두", "쿵", "쿠"],   // 원본은 좌고 녹음(타악단음/북) — 두·쿠는 둥의 약
    jing: ["징"],
  };
  // 구음 하나를 그 악기에 견준다: "ok" 소리 남 · "nosnd" 구음은 맞지만 음원 없음 · "bad" 그 악기 구음 아님.
  // 빈 분박 표시(- ·)는 늘 ok. 그리기·기능바 경고·단추 표시가 모두 이것 하나를 본다.
  // 넘겨치는 궁 — 궁채를 채편으로 넘겨 친다(사물놀이 장구). 구음이 따로 없어(이상규 2023 p.139·144)
  // 칸에는 궁편 구음 뒤에 작은따옴표를 붙여 적는다: 궁' · 구궁' · 덩'(2026-11-16 사용자 확정).
  // 따옴표는 악보에 안 찍히고 설정의 표시(위 점 / 회색 칸)로 바뀐다. 장구에서만 뜻이 있다.
  const OVER_BASE = new Set(["궁", "쿵", "구", "구궁", "덩", "떵"]);
  function overBase(inst, t) {
    if (inst !== "janggu" || t.length < 2 || t[t.length - 1] !== "'") return null;
    const b = t.slice(0, -1);
    return OVER_BASE.has(b) ? b : null;
  }
  function tokKind(inst, t) {
    if (t === "-" || t === "·") return "ok";
    if (overBase(inst, t)) return "ok";   // 소리는 soundKey가 채편 소리로 낸다
    if ((HAS_SOUND[inst] || []).includes(t)) return "ok";
    if ((GUEUM[inst] || []).includes(t) || (GUEUM_EXTRA[inst] || []).includes(t)) return "nosnd";
    return "bad";
  }

  // 겹소리의 박 자리(onset). 앞글자가 박보다 먼저 나는 꾸밈이면 lead에 그 앞글자를 적는다 —
  // 그리기는 뒷글자를 칸의 박 자리에 두고 앞글자를 작게 그 앞에 붙이며(전지환 2020 p.219–220:
  // 꾸밈을 첫 소박 자리에 적으면 틀린 표기), 재생도 이 표를 보고 뒷글자 소리가 박에 오게 당긴다.
  // 그랑·그라갱은 '그'가 박이라(꾸밈이 아님) 표에 없다 — 보통 글자처럼 그린다.
  const GRACE = {
    "지갱": "지", "찌깽": "찌",            // 꽹과리
    "기덕": "기", "기닥": "기", "기덩": "기", "구궁": "구", // 장구
  };
  const GRACE_K = 0.6; // 꾸밈 글자 크기 = 본 글자의 0.6

  // ---------- 기호 표기 (설정 › 표기) ----------
  // 교과서식 기호 — 중학교 음악 교과서의 사물놀이·풍물 장단 악보에서 옮겼다:
  //   윤명원(2016) 『국악원논문집』 34, p.109 표13 '별달거리'(교과서 악보 모음 — 꽹과리·장구·북·징이
  //   한 장에 있는 유일한 꼴) + 전지환(2020) 『국악원논문집』 41, p.221 표1(박영사 교과서의 꽹과리 부호).
  //     꽹과리 갱 ○ · 개 ∘(작게 = 약하게) · 갯 ●(울림판을 막고 침)   ← 전지환 표1 · 윤명원 표13
  //       깽(갱의 강)은 교과서 부호가 없어 굵은 ○로, 객(막고 침)은 갯과 같은 ●로 본다(근거 없음 — 미루어 정함)
  //     장구는 교과서식을 쓰지 않는다 — 편집기와 같은 정악 장구 기호 하나(symFor, 2026-11-16 사용자 확정)
  //     북 둥 ○ · 두 ∘ (쿵·쿠는 같은 소리를 달리 적은 것 — 재생의 soundKey와 같은 대응)
  //     징 징 ○
  // 부호가 없는 구음(장구의 딱 …)은 기호 대신 글자로 적는다. 장구의 기덕·더러러러·다는
  // 정악 장구 기호로 적는다(symFor)
  // — 빈칸으로 두면 '안 친다'로 읽힌다. ⦶·◓ 같은 글리프는 OS마다 글꼴에 없어 도형으로 직접 그린다.
  const EDU_SYM = {
    // 꽹과리는 구음 전부를 기호로(2026-11-16 사용자 요청 — 겹소리·지까지). 교과서에 없는 것은 이렇게 정했다:
    //   지 = 작은 ∘(개와 같은 꼴, 2026-11-16 사용자 요청 — 예전엔 갱과 같은 ○였다). 개와는 막음새 ×로 갈린다(개에만 붙는다) · 찌·찌깽·끄랑(센 소리) = 굵은 ○
    //   듭(막고 침) = ● · 개-ㅅ(여리게 치고 막음) = 작은 ● · 게르르르(굴림) = 점점 작아지는 원 넷 ◯○○∘
    //   (2026-11-16 사용자 요청 — 예전엔 이상규 2023 표4의 굴림 부호 꼴 ○……였다. 소리가 잦아드는 것을 크기로)
    kkwaenggwari: { "갱": "O", "깽": "Obold", "개": "o", "갯": "dot", "객": "dot",
                    "지": "o", "갠": "O", "찌": "Obold", "듭": "dot", "개-ㅅ": "odot", "게르르르": "Oroll" },
    // 딱(북 테를 침) = 세로줄 | — 2026-11-16 사용자 요청. 녹음이 없어 소리는 안 나지만(회색 tk-nosnd) 기호로는 적힌다
    buk: { "둥": "O", "쿵": "O", "두": "o", "쿠": "o", "딱": "bar" },
    jing: { "징": "O" },
  };
  // 겹소리 기호 — 꾸밈은 작은 원(grace 개수), 본음은 큰 원. 본음이 박 자리(몫 가운데)에 서고 꾸밈은
  // 그 왼쪽에 붙는다(글자 표기의 겹소리와 같은 자리 규칙 · 오선보의 앞꾸밈과 같은 짜임).
  const KKW_SEQ = { "지갱": [1, "O"], "그랑": [1, "O"], "그라갱": [2, "O"], "찌깽": [1, "Obold"], "끄랑": [1, "Obold"] };
  // 도형마다 가운데에서 가로로 차지하는 반폭(기호 크기 s에 대한 비) — 겹소리의 앞글자를 붙일 자리
  const SHAPE_HW = { O: 0.43, Obold: 0.43, o: 0.21, odot: 0.18, dot: 0.27, bar: 0.06, Oroll: 0.6 };
  // 정악 장구 그림 — 편집기 장단 줄과 같은 그림(js/janggu-data.js, 키 = 편집기의 구음 이름).
  // 쿵 → 궁(같은 북편 소리 — tools/gen-janggu-audio.py 주석), 따 → 덕(채편 소리, 교과서식과 같은 판단).
  // 기덕·더러러러는 그림 하나에 앞소리까지 들어 있어 통째로 쓴다. 그림이 없는 구음은 글자로.
  // 다(열채로 채편을 침) → 덕의 세로줄 | (2026-11-16 사용자 요청). 예전엔 정악 '다' 그림(작은 점, 0.3배)을
  // 썼는데, 타악 정간보에서는 채편 소리를 모두 |로 읽게 한다. 그래서 기호만 보면 다와 덕이 같다 —
  // 둘을 가르려면 '기호 + 구음'으로 둔다.
  const JEONGAK_NAME = { "덩": "덩", "쿵": "궁", "궁": "궁", "덕": "덕", "따": "덕", "기덕": "기덕",
                         "다": "덕", "더러러러": "더러러러", "작은덩": "작은덩" };
  const JEONGAK_SCALE = {};
  // 구음 하나의 기호: { shape } · { img, scale } · null(기호 없음 → 글자로)
  // 정악 그림은 원의 바깥 지름이 상자의 0.786배(궁 viewBox 2459 중 1932)인데 도형 ○는 0.86배라, 같은
  // 크기로 그리면 장구 원만 9% 작았다. 이 비로 키워 **큰 원 크기를 악기끼리 같게** 한다(2026-11-16 사용자
  // 요청 — 기호 크기는 큰 원 기준으로 통일). 덕의 막대도 이 배율에서 원 지름과 높이가 같아진다(실측).
  const JG_IMG_K = 0.86 / 0.786;
  function jeongakSym(t) {
    const n = JEONGAK_NAME[t], href = n && (window.JANGGU_DATA || {})[n];
    return href ? { img: href, scale: (JEONGAK_SCALE[n] || 1) * JG_IMG_K } : null;
  }
  function symFor(inst, t) {
    // 장구는 **정악 장구 기호 하나**(편집기 장단 줄과 같은 그림, 2026-11-16 사용자 확정). 예전엔
    // 교과서식(덩 ⦶·쿵 ○·궁 ◓·따 |)과 고르게 했는데, 기덕·더러러러까지 정악 기호로 채우고 나니
    // 다른 것이 궁 ◓ 하나뿐이라 고를 까닭이 없었다(궁·쿵은 같은 소리이기도 하다).
    if (inst === "janggu") return jeongakSym(t);
    if (inst === "kkwaenggwari" && KKW_SEQ[t]) return { shape: KKW_SEQ[t][1], graces: KKW_SEQ[t][0] };
    const sh = (EDU_SYM[inst] || {})[t];
    return sh ? { shape: sh } : null;
  }
  // 기호 하나를 (x, y) 가운데, 크기 s(mm)로. 도형은 currentColor라 화면 전용 회색(tk-nosnd)이 g의 color로 먹는다.
  function symSvg(sym, x, y, s) {
    if (sym.img) {
      const b = s * sym.scale;
      return `<image href="${sym.img}" x="${f2(x - b / 2)}" y="${f2(y - b / 2)}" width="${f2(b)}" height="${f2(b)}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    const sw = s * 0.075, R = s * 0.43 - sw / 2;
    const circ = (r, w) => `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill="none" stroke="currentColor" stroke-width="${f2(w)}"/>`;
    switch (sym.shape) {
      case "O": return circ(R, sw);
      case "Obold": return circ(s * 0.43 - sw, sw * 2);
      case "o": return circ(s * 0.21 - sw * 0.4, sw * 0.8);
      case "dot": return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(s * 0.27)}" fill="currentColor"/>`;
      case "odot": return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(s * 0.18)}" fill="currentColor"/>`;
      case "Oroll": {   // 굴림 — 큰 원에서 점점 작아지는 원 넷(왼→오른쪽, 소리가 잦아드는 차례).
        // 반지름은 앞 원의 0.68배씩, 사이는 s*0.025. 묶음 전체(약 1.2s)를 박 자리(x) 가운데에 세운다 —
        // 예전 ○……(x−0.55s ~ x+0.6s)과 거의 같은 폭이라 이웃 몫을 더 침범하지 않는다(SHAPE_HW 0.6).
        // 선 굵기는 작은 원일수록 줄인다(안 줄이면 끝 원이 속이 막힌 점처럼 뭉친다).
        const rs = [0.23, 0.156, 0.106, 0.072].map((k) => s * k), gap = s * 0.025;
        let cx = x - (rs.reduce((a, r) => a + 2 * r, 0) + gap * (rs.length - 1)) / 2, d = "";
        for (const r of rs) {
          cx += r;
          d += `<circle cx="${f2(cx)}" cy="${f2(y)}" r="${f2(r)}" fill="none" stroke="currentColor" stroke-width="${f2(Math.min(sw, r * 0.45))}"/>`;
          cx += r + gap;
        }
        return d;
      }
      case "bar": return `<line x1="${f2(x)}" y1="${f2(y - s * 0.43)}" x2="${f2(x)}" y2="${f2(y + s * 0.43)}" stroke="currentColor" stroke-width="${f2(sw * 1.2)}"/>`;
    }
    return "";
  }
  // 기호 + 구음: 그 악기 줄을 BOTH_K배로 높이고 위 BOTH_SYM 몫에 기호, 나머지에 구음(교과서 별달거리처럼
  // 기호 줄 아래 구음 줄). 줄 높이를 안 늘리고 반씩 나누면 기호와 글자가 둘 다 절반 크기로 줄어 읽기 어렵다.
  const BOTH_K = 1.6, BOTH_SYM = 0.56;

  // 꽹과리 막음새 — 전지환(2020) p.222 악보7 · p.235 표6: 막음새를 넣고 치는 소리는 칸 왼쪽 위에
  // 빨간 ×, 막음새를 붙인 채 이어지는 '듭'은 × 뒤로 빨간 가로선을 그 박자만큼 긋는다. 지·찌(막음새
  // 없이 침)엔 안 붙는다. 표6이 ×를 단 구음이 갱·개·깽·지갱(찌깽)·그랑(끄랑)이다.
  const MAKEUM_HIT = new Set(["갱", "개", "깽", "지갱", "찌깽", "그랑", "끄랑"]);
  const MAKEUM_RED = "#d32f2f"; // 종이 위 고정색(악보는 늘 흰 종이 — styles.css 변수를 안 따른다)
  const DEFAULT_INSTS = [
    { id: "kkwaenggwari", name: "꽹과리", on: true },
    { id: "janggu", name: "장구", on: true },
    { id: "buk", name: "북", on: true },
    { id: "jing", name: "징", on: true },
  ];

  // 표기(설정 › 표기): 악기마다 "text" 구음 · "sym" 기호 · "both" 기호 + 구음. 옛 저장분엔 이 키가
  // 없으므로 불러올 때 빠진 악기를 기본값(구음 — 예전 그대로)으로 채운다.
  const NOTATION_MODES = ["text", "sym", "both"];
  function defaultNotation() { return Object.fromEntries(DEFAULT_INSTS.map((d) => [d.id, "text"])); }
  const notationOf = (id) => (S.notation && NOTATION_MODES.includes(S.notation[id]) ? S.notation[id] : "text");

  function freshState() {
    return { v: 1, title: "", subtitle: "", beats: 12, daegang: "3 3 3 3", perLine: 2, total: 8,
             paper: "A4", orient: "landscape", fsGu: 100, fsName: 100, fsTitle: 100, guSize: {}, cellFill: 100, cellRatio: null, bpm: 90, loop: false, vol: {},
             notation: defaultNotation(), makeum: false, overMark: "dot", insts: DEFAULT_INSTS.map((x) => ({ ...x })), cells: {} };
  }
  let S = freshState();
  // 저장분·게시 악보를 들일 때 같은 손질을 거친다(빠진 칸 채우기·옛 키 걷기). 형식이 아니면 null.
  function normState(raw) {
    if (!raw || raw.v !== 1) return null;
    const S = Object.assign(freshState(), raw);
    // 악기 목록이 깨졌거나 모자라면 빠진 것을 뒤에 붙인다(순서·이름은 저장분 그대로)
    const have = new Set((S.insts || []).map((x) => x.id));
    S.insts = (S.insts || []).filter((x) => x && GUEUM[x.id]);
    DEFAULT_INSTS.forEach((d) => { if (!have.has(d.id)) S.insts.push({ ...d }); });
    if (!S.cells || typeof S.cells !== "object") S.cells = {};
    if (!S.guSize || typeof S.guSize !== "object") S.guSize = {};
    if (!S.vol || typeof S.vol !== "object") S.vol = {};
    S.notation = Object.assign(defaultNotation(), S.notation && typeof S.notation === "object" ? S.notation : {});
    delete S.jangguSyms;   // 옛 저장분의 '장구 기호 체계' — 정악 하나로 합쳐 더는 안 쓴다
    S.makeum = !!S.makeum;
    if (S.overMark !== "shade") S.overMark = "dot";
    if (typeof S.pubId !== "string" || !S.pubId) S.pubId = null;
    return S;
  }
  try { S = normState(JSON.parse(localStorage.getItem(KEY) || "null")) || S; } catch (e) {}
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(flush, 250);
    histMark();
  }

  // ---------- 되돌리기 (⌘/Ctrl+Z · ⇧Z) ----------
  // 편집기와 같은 짜임: 바뀔 때마다 악보 전체를 떠 두되, 잇달아 바뀌는 것(글자 치기·슬라이더)은
  // HIST_MS 동안 한 덩이로 묶는다. 고치는 자리는 모두 save()를 지나므로 거기서 표시만 한다.
  // 되돌린 상태를 다시 들일 때는 기록하지 않는다(histRestoring).
  const HIST_MS = 600, HIST_MAX = 200;
  let histPast = [], histFuture = [], histT = 0, histRestoring = false;
  function histMark() {
    if (histRestoring) return;
    clearTimeout(histT);
    histT = setTimeout(histCommit, HIST_MS);
  }
  function histCommit() {
    clearTimeout(histT); histT = 0;
    const cur = JSON.stringify(S);
    if (histPast[histPast.length - 1] === cur) return;
    histPast.push(cur);
    if (histPast.length > HIST_MAX) histPast.shift();
    histFuture = [];
  }
  function histApply(snap) {
    histRestoring = true;
    S = JSON.parse(snap);
    if (sel && (!S.insts.some((x) => x.id === sel.id && x.on) || sel.b >= S.beats || sel.j >= S.total)) sel = null;
    input.value = sel ? getCell(sel.id, sel.j, sel.b) : "";
    if (!sel) card.hidden = true;
    syncFields(); buildInsts(); showFs();
    $("pcBpm").value = S.bpm; $("pcLoop").checked = !!S.loop;
    render();
    flush();
    histRestoring = false;
  }
  function undo() {
    if (histT) histCommit();          // 아직 묶는 중인 마지막 고침부터 기록에 넣고
    if (histPast.length < 2) return;
    histFuture.push(histPast.pop());
    histApply(histPast[histPast.length - 1]);
  }
  function redo() {
    if (!histFuture.length) return;
    const snap = histFuture.pop();
    histPast.push(snap);
    histApply(snap);
  }
  function flush() {
    clearTimeout(saveT); saveT = 0;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  // 고친 직후 곧바로 탭을 닫거나 새로 고치면 기다리던 저장이 날아간다 — 떠날 때 바로 적는다
  addEventListener("pagehide", () => { if (saveT) flush(); });

  // ---------- 칸 ----------
  const getCell = (id, j, b) => ((S.cells[id] || [])[j] || [])[b] || "";
  function setCell(id, j, b, v) {
    const a = S.cells[id] || (S.cells[id] = []);
    const row = a[j] || (a[j] = []);
    row[b] = v;
  }

  // 낱 구음 하나 = 글자 + 꼬리의 크기(%). `덕@80` → { t: "덕", pct: 80 }, `덕` → pct 100
  const TOK_RE = /^(.*?)@(\d{2,3})$/;
  function parseTok(raw) {
    raw = String(raw).replace(/[’′‘`]/g, "'");          // 맥 자판의 둥근 따옴표도 같은 표시로
    const m = TOK_RE.exec(raw);
    const r = m && m[1] ? { t: m[1], pct: +m[2] } : { t: raw, pct: 100 };
    if (/@\d{2,3}'$/.test(r.t)) return parseTok(r.t.replace(/(@\d{2,3})'$/, "'$1")); // 궁@80' → 궁'@80
    return r;
  }
  // 악보에 쓰인 구음(꼬리 뗀 글자) — 구음별 크기 목록에 띄운다. 악기 줄 순서 → 등장 순서.
  function usedGueum() {
    const seen = new Set(), out = [];
    S.insts.filter((x) => x.on).forEach((ins) => {
      (S.cells[ins.id] || []).forEach((row) => (row || []).forEach((v) => {
        String(v || "").trim().split(/\s+/).forEach((raw) => {
          const t0 = raw && parseTok(raw).t, t = t0 && (overBase(ins.id, t0) || t0);
          if (t && t !== "-" && t !== "·" && !seen.has(t)) { seen.add(t); out.push(t); }
        });
      }));
    });
    return out;
  }

  // 대강: "3 3 3 3"·"3,3,3,3" 모두 읽는다. 합이 정간 수와 다르면 장단 하나를 대강 하나로 본다.
  function daegangCuts() {
    const nums = String(S.daegang || "").split(/[\s,·]+/).filter(Boolean).map(Number);
    const ok = nums.length && nums.every((n) => Number.isInteger(n) && n > 0) &&
               nums.reduce((a, b) => a + b, 0) === S.beats;
    const warn = $("pcDgWarn");
    if (String(S.daegang || "").trim() && !ok) {
      warn.textContent = `대강의 합(${nums.reduce((a, b) => a + (b || 0), 0)})이 정간 수(${S.beats})와 다릅니다. 대강 없이 그립니다.`;
      warn.hidden = false;
    } else warn.hidden = true;
    const cuts = new Set();
    if (ok) { let s = 0; nums.slice(0, -1).forEach((n) => { s += n; cuts.add(s); }); }
    return cuts;
  }
  // 정간 수를 바꿨을 때 대강이 안 맞으면 흔한 꼴로 다시 채운다(3박 → 2박 → 통째)
  function suggestDaegang(B) {
    const unit = B % 3 === 0 ? 3 : B % 2 === 0 ? 2 : B;
    return Array(B / unit).fill(unit).join(" ");
  }

  // ---------- 배치 (mm) ----------
  const M = 12;            // 종이 여백
  const LABEL_W = 15;      // 악기 이름 칸
  const NUM_H = 4.2;       // 장단 번호 줄
  const SYS_GAP = 6;       // 단 사이
  function layout() {
    let [pw, ph] = PAPERS[S.paper] || PAPERS.A4;
    if (S.orient === "landscape") [pw, ph] = [ph, pw];
    const B = S.beats, P = S.perLine;
    const rows = S.insts.filter((x) => x.on);
    // 정간 모양 — 너비는 '정간 줄이 종이 폭을 얼마나 채우나'(cellFill %), 높이는 '가로의 몇 배'
    // (cellRatio). cellRatio가 null이면 자동: 가로의 1.05배를 7~13mm 안에서(예전 그대로).
    const fill = Math.min(100, Math.max(40, S.cellFill || 100)) / 100;
    const cellW = ((pw - 2 * M) * fill - LABEL_W) / (P * B);
    let rowH = S.cellRatio ? cellW * S.cellRatio : Math.max(7, Math.min(13, cellW * 1.05));
    const kt = S.fsTitle / 100;
    const titleH = (S.title ? 6 + 7 * kt : 0) + (S.subtitle ? 2.6 + 3.4 * kt : 0);
    // '기호 + 구음' 악기 줄만 BOTH_K배 높다. rowH는 보통 줄의 높이(정간 모양 설정이 정하는 값)이고
    // 높인 줄은 그 배수라, 세로 비율을 바꾸면 두 줄이 함께 움직인다.
    const rowF = rows.map((ins) => (notationOf(ins.id) === "both" ? BOTH_K : 1));
    const fSum = rowF.reduce((a, b) => a + b, 0);
    // 세로로 늘려도 한 단은 첫 쪽에 통째로 들어가야 한다 — 넘치면 그 높이에서 멈춘다
    if (rows.length) rowH = Math.min(rowH, (ph - 2 * M - titleH - NUM_H) / fSum);
    const rowHs = rowF.map((f) => rowH * f);
    const rowYs = rowHs.map((_, r) => rowHs.slice(0, r).reduce((a, b) => a + b, 0));
    const sysH = NUM_H + fSum * rowH;
    const gridW = LABEL_W + P * B * cellW;
    const left = (pw - gridW) / 2; // 폭을 줄이면 가운데에 선다
    const nSys = Math.ceil(S.total / P);
    const pages = [];
    let sys = 0;
    while (sys < nSys || pages.length === 0) {
      const top = M + (pages.length === 0 ? titleH : 0);
      const fit = Math.max(1, Math.floor((ph - M - top + SYS_GAP) / (sysH + SYS_GAP)));
      const list = [];
      for (let k = 0; k < fit && sys < nSys; k++, sys++) {
        const j0 = sys * P;
        list.push({ y: top + k * (sysH + SYS_GAP), j0, n: Math.min(P, S.total - j0) });
      }
      pages.push(list);
      if (!rows.length) break;
    }
    return { pw, ph, B, P, rows, cellW, rowH, rowHs, rowYs, sysH, titleH, pages, left, gridW };
  }

  // ---------- 그리기 ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const f2 = (n) => Math.round(n * 100) / 100;
  // 글자 폭 어림(em): 한글·한자 0.95, 그 밖 0.6
  const textEm = (s) => [...s].reduce((a, ch) => a + (/[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 0.95 : 0.6), 0);

  function line(x1, y1, x2, y2, w) {
    return `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#000" stroke-width="${w}" stroke-linecap="square"/>`;
  }

  // 구음 글자 하나를 (midX, midY) 가운데에 — 칸 높이 rh, 제 몫 폭 pw_, 배율 k. 몫 순번 q는 겹소리의
  // 앞글자가 칸 왼쪽 경계에 걸쳐도 되는지(첫 몫만) 가린다. kc = 화면 전용 색 class 속성.
  function textTok(out, t, kc, midX, midY, pw_, rh, k, q) {
    const lead = GRACE[t];
    if (lead) {
      // 겹소리: 뒷글자가 박 자리(몫의 가운데)에 보통 구음과 같은 크기로 서고, 앞글자는 작게
      // 그 왼쪽에 붙는다. 앞글자는 칸 왼쪽 경계에 조금 걸쳐도 된다(전지환 2020 표6이
      // 꾸밈을 칸 경계 왼쪽에 적는다) — 다만 칸 안 둘째 몫부터는 앞 몫의 구음과 겹치지
      // 않게 제 몫 안에서만. 그래도 모자라면 그때 뒷글자를 줄인다.
      const main = t.slice(lead.length);
      const emL = textEm(lead) * GRACE_K, emM = textEm(main);
      const leftRoom = pw_ / 2 + (q === 0 ? pw_ * 0.22 : -pw_ * 0.02);
      const fsPlain = Math.min(rh * 0.8, (pw_ * 0.96) / emM, Math.min(rh * 0.5, (pw_ * 0.9) / emM) * k);
      const fs = Math.max(1.2, Math.min(fsPlain, leftRoom / (emL + emM / 2 + 0.04)));
      const fl = fs * GRACE_K;
      out.push(`<text${kc} x="${f2(midX)}" y="${f2(midY)}" text-anchor="middle" dominant-baseline="central" font-size="${f2(fs)}" fill="#000">${esc(main)}</text>`);
      // 앞글자는 본 글자 아랫선 쪽으로 조금 내려 '딸린 글자'로 읽히게
      out.push(`<text x="${f2(midX - fs * emM / 2 - fs * 0.04)}" y="${f2(midY + fs * 0.12)}" text-anchor="end" dominant-baseline="central" font-size="${f2(fl)}" fill="#000"${kc}>${esc(lead)}</text>`);
      return fs;
    }
    const em = textEm(t);
    const fs = Math.max(1.2, Math.min(rh * 0.8, (pw_ * 0.96) / em, Math.min(rh * 0.5, (pw_ * 0.9) / em) * k));
    out.push(`<text${kc} x="${f2(midX)}" y="${f2(midY)}" text-anchor="middle" dominant-baseline="central" font-size="${f2(fs)}" fill="#000">${esc(t)}</text>`);
    return fs;
  }
  // 구음 하나를 기호로 — 기호가 없으면 아무것도 안 그리고 false(부르는 쪽이 글자로 대신한다).
  // 겹소리는 그림 하나로 통째인 것(정악 기덕)이 먼저이고, 아니면 뒷글자 기호를 박 자리에 두고
  // 앞글자를 작은 글자로 그 왼쪽에 붙인다(글자 표기의 겹소리와 같은 자리 규칙).
  function symTok(out, inst, t, kind, midX, midY, pw_, rh, k, q, sU) {
    let sym = symFor(inst, t), lead = null;
    if (!sym && GRACE[t]) { lead = GRACE[t]; sym = symFor(inst, t.slice(lead.length)); }
    if (!sym) return false;
    // 크기는 **악보 전체에서 하나**(sU, symBaseSize — 2026-11-16 사용자 요청): 칸을 나눠 기호가 작아지는
    // 자리에 맞춘 크기를 모든 기호가 쓴다. 예전엔 몫마다 제 폭에 맞춰 '덩 다'로 나눈 칸만 기호가
    // 작아졌다. 배율(전체 × 구음별 × 낱 구음)은 그 위에 곱하되 몫 폭·칸 높이는 넘지 않는다.
    const s = Math.max(1.2, Math.min(rh * 0.8, pw_ * 0.92, sU * k));
    const hw = sym.img ? 0.3 : SHAPE_HW[sym.shape];
    const cls = kind === "nosnd" ? ` class="tk-nosnd"` : "";
    let g = symSvg(sym, midX, midY, s);
    // 겹소리 꾸밈(작은 원) — 본음 왼쪽으로 차례로. 크기를 줄이지 않고 왼쪽으로 걸친다(크기 통일이 먼저).
    for (let i = 0, x = midX - s * hw; i < (sym.graces || 0); i++) {
      const r = s * 0.15;
      x -= s * 0.06 + r;
      g = `<circle cx="${f2(x)}" cy="${f2(midY)}" r="${f2(r)}" fill="none" stroke="currentColor" stroke-width="${f2(s * 0.06)}"/>` + g;
      x -= r;
    }
    out.push(`<g${cls} color="#000">${g}</g>`);
    if (lead) {
      const fl = s * 0.5;
      out.push(`<text x="${f2(midX - s * (hw + 0.06))}" y="${f2(midY + s * 0.1)}" text-anchor="end" dominant-baseline="central" font-size="${f2(fl)}" fill="#000"${kind === "nosnd" ? cls : ""}>${esc(lead)}</text>`);
    }
    return s;
  }
  // 꽹과리 막음새(× · 듭의 가로선) — 한 단의 그 악기 줄을 몫 단위로 펴 놓고 긋는다. 듭의 선은 다음 소리
  // 앞(또는 단 끝)까지 — 빈 칸·이음(-)은 막음새를 붙인 채 지나는 박이다(전지환 2020 악보7 ㉡).
  function makeumSvg(out, ins, sy, x0, cy, baseH, B, cellW) {
    if (!S.makeum || ins.id !== "kkwaenggwari") return;
    const sh = [];
    for (let k = 0; k < sy.n; k++) for (let b = 0; b < B; b++) {
      const cx = x0 + (k * B + b) * cellW, v = getCell(ins.id, sy.j0 + k, b).trim();
      if (!v) { sh.push({ x: cx, w: cellW, t: "" }); continue; }
      const parts = v.split(/\s+/), w = cellW / parts.length;
      parts.forEach((raw, q) => sh.push({ x: cx + w * q, w, t: parseTok(raw).t }));
    }
    // 크기는 보통 줄 높이(baseH) 기준 — '기호 + 구음'으로 줄을 높여도 ×가 따라 커지지 않게.
    // 세로 자리는 줄 윗선에서 조금 내려 테두리 굵은 선과 안 겹치게(표6도 윗선 바로 아래에 적는다).
    const xs = Math.min(baseH * 0.2, cellW * 0.32), sw = f2(Math.max(0.18, xs * 0.16));
    const ym = cy + xs * 0.95;
    sh.forEach((m, i) => {
      const hold = m.t === "듭";
      if (!hold && !MAKEUM_HIT.has(m.t)) return;
      // ×는 칸 왼쪽 경계에 걸쳐 선다(표6의 자리) — 박이 시작하기 '앞'에 막음새를 넣는다는 뜻
      const xc = m.x + xs * 0.1, h = xs / 2;
      out.push(`<path d="M${f2(xc - h)} ${f2(ym - h)}L${f2(xc + h)} ${f2(ym + h)}M${f2(xc - h)} ${f2(ym + h)}L${f2(xc + h)} ${f2(ym - h)}" stroke="${MAKEUM_RED}" stroke-width="${sw}" fill="none"/>`);
      if (hold) {
        let e = i + 1;
        while (e < sh.length && (!sh[e].t || sh[e].t === "-" || sh[e].t === "·")) e++;
        const x2 = e < sh.length ? sh[e].x - xs * 0.15 : sh[sh.length - 1].x + sh[sh.length - 1].w - xs * 0.15;
        if (x2 > xc + h) out.push(`<line x1="${f2(xc + h)}" y1="${f2(ym)}" x2="${f2(x2)}" y2="${f2(ym)}" stroke="${MAKEUM_RED}" stroke-width="${sw}"/>`);
      }
    });
  }

  // 기호 기본 크기 — 기호로 적는 악기들에서 **한 칸이 가장 많이 나뉜 자리**의 몫 폭과, 기호 자리의 가장
  // 낮은 높이로 정한다(악보 전체 한 값 — 쪽마다 다르면 넘길 때 크기가 바뀐다).
  function symBaseSize(L) {
    let maxParts = 1, hMin = Infinity;
    L.rows.forEach((ins) => {
      const mode = notationOf(ins.id);
      if (mode === "text") return;
      hMin = Math.min(hMin, mode === "both" ? L.rowH * BOTH_K * BOTH_SYM : L.rowH);
      (S.cells[ins.id] || []).forEach((row, j) => {
        if (j >= S.total) return;
        (row || []).forEach((v, b) => {
          if (b >= S.beats || !v || !String(v).trim()) return;
          maxParts = Math.max(maxParts, String(v).trim().split(/\s+/).length);
        });
      });
    });
    if (!isFinite(hMin)) hMin = L.rowH;
    return Math.min(hMin * 0.56, (L.cellW / maxParts) * 0.86);
  }

  function pageSvg(L, pi, withUi) {
    const { pw, ph, B, rows, cellW, rowHs, rowYs, left, gridW } = L;
    const cuts = daegangCuts();
    const sU = symBaseSize(L);
    const kt = S.fsTitle / 100, kg = S.fsGu / 100, kn = S.fsName / 100;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="pc-page" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}" font-family='${FONT}'>`);
    out.push(`<rect x="0" y="0" width="${pw}" height="${ph}" fill="#fff"/>`);
    if (pi === 0 && S.title) {
      out.push(`<text x="${pw / 2}" y="${f2(M + 7 * kt)}" text-anchor="middle" font-size="${f2(7 * kt)}" font-weight="700" fill="#000">${esc(S.title)}</text>`);
    }
    if (pi === 0 && S.subtitle) {
      out.push(`<text x="${f2(left + gridW)}" y="${f2(M + (S.title ? 6 + 7 * kt : 0) + 3.4 * kt)}" text-anchor="end" font-size="${f2(3.4 * kt)}" fill="#333">${esc(S.subtitle)}</text>`);
    }
    const h = rowHs.reduce((a, b) => a + b, 0);
    for (const sy of L.pages[pi]) {
      const x0 = left + LABEL_W, y0 = sy.y + NUM_H, w = sy.n * B * cellW;
      // 장단 번호
      for (let k = 0; k < sy.n; k++) {
        out.push(`<text x="${f2(x0 + k * B * cellW + 0.8)}" y="${f2(sy.y + NUM_H - 1.1)}" font-size="2.8" fill="#666">${sy.j0 + k + 1}</text>`);
      }
      // 칸 내용 + 누를 자리
      rows.forEach((ins, r) => {
        const cy = y0 + rowYs[r], rh = rowHs[r];
        const mode = notationOf(ins.id);
        // 기호 + 구음이면 위 몫이 기호 자리, 아래 몫이 구음 자리. 나머지 방식은 줄 전체가 한 자리다.
        const symH = mode === "both" ? rh * BOTH_SYM : rh, txtY = mode === "both" ? cy + symH : cy, txtH = rh - (mode === "both" ? symH : 0);
        // 기호 + 구음은 두 자리의 가운데에 두지 않고 서로 쪽으로 당긴다 — 기호는 조금 아래, 글자는 조금 위
        // (2026-11-16 사용자 요청: 기호와 글자 사이가 떠 보였다). 다른 표기는 줄 가운데 그대로다.
        const symMid = mode === "both" ? cy + symH * 0.6 : cy + symH / 2, txtMid = txtY + txtH * (mode === "both" ? 0.34 : 0.5);
        out.push(`<text x="${f2(left + LABEL_W / 2)}" y="${f2(cy + rh / 2)}" text-anchor="middle" dominant-baseline="central" font-size="${f2(Math.min((LABEL_W - 1.6) / Math.max(1, textEm(ins.name)), rh * 0.7, Math.min(3.6, rh * 0.62, (LABEL_W - 2) / Math.max(1, textEm(ins.name))) * kn))}" font-weight="700" fill="#000">${esc(ins.name)}</text>`);
        for (let k = 0; k < sy.n; k++) {
          const j = sy.j0 + k;
          for (let b = 0; b < B; b++) {
            const cx = x0 + (k * B + b) * cellW;
            const v = getCell(ins.id, j, b).trim();
            if (withUi && sel && sel.id === ins.id && sel.j === j && sel.b === b) {
              out.push(`<rect class="pc-sel" x="${f2(cx)}" y="${f2(cy)}" width="${f2(cellW)}" height="${f2(rh)}" fill="#ffe680" fill-opacity="0.6"/>`);
            }
            if (v) {
              const parts = v.split(/\s+/);
              const pw_ = cellW / parts.length;
              parts.forEach((raw, q) => {
                const { t: t0, pct } = parseTok(raw);
                if (t0 === "-" || t0 === "·") return; // 빈 분박 표시
                // 넘겨치는 궁(궁')은 따옴표를 뗀 구음으로 그리고 표시(위 점 / 회색 칸)를 따로 얹는다
                const ob = overBase(ins.id, t0), t = ob || t0;
                // 기본은 칸에 맞춘 크기, 배율(전체 × 구음별 × 낱 구음)은 그 위에 곱한다. 키워도 제 칸
                // (나눈 몫)의 폭과 칸 높이의 8할을 넘지 않는다 — 넘으면 옆 칸 구음과 겹쳐 무엇이 어느
                // 칸인지 흐려진다. 줄이는 쪽은 그대로 따른다. 기호도 같은 배율을 받는다.
                const k = kg * ((S.guSize[t] || 100) / 100) * (pct / 100);
                // 회색 칸: 그 몫만 옅게(정간 전체가 아니라 — '덩 궁'' 꼴에서 어느 쪽인지 보이게).
                // 검정 10%로 겹쳐 칠해 노란 선택 표시 위에서도 보인다. 인쇄·PNG에도 그대로 나간다.
                if (ob && S.overMark === "shade") out.push(`<rect x="${f2(cx + pw_ * q)}" y="${f2(cy)}" width="${f2(pw_)}" height="${f2(rh)}" fill="#000" fill-opacity="0.11"/>`);
                const midX = cx + pw_ * (q + 0.5);
                // 화면에서만 색으로 짚는다(인쇄는 CSS가 검정으로 되돌리고, PNG는 withUi가 꺼져 안 붙는다)
                const kind = withUi ? tokKind(ins.id, t0) : "ok";
                const kc = kind === "ok" ? "" : ` class="tk-${kind}"`;
                if (kind === "bad") out.push(`<rect class="tk-badbg" x="${f2(cx + pw_ * q + 0.3)}" y="${f2(cy + 0.3)}" width="${f2(pw_ - 0.6)}" height="${f2(rh - 0.6)}"/>`);
                // 그 악기의 구음이 아닌 것(bad)은 기호로 바꾸지 않고 빨간 글자로 둔다 — 무엇을 잘못 쳤는지 보여야 한다
                const drew = mode !== "text" && kind !== "bad" && symTok(out, ins.id, t, kind, midX, symMid, pw_, symH, k, q, sU);
                let fsT = 0;
                if (mode === "both") fsT = textTok(out, t, kc, midX, txtMid, pw_, txtH, k, q);
                else if (!drew) fsT = textTok(out, t, kc, midX, cy + rh / 2, pw_, rh, k, q);
                // 위 점: 맨 위에 적힌 것(기호가 있으면 기호, 없으면 글자) 바로 위에 — 『장구교본』의 '궁 위 점'.
                // 칸 윗선에 닿지 않게 칸 안으로 당긴다.
                if (ob && S.overMark === "dot") {
                  const sz = drew || fsT, top = drew ? symMid - drew * 0.45 : (mode === "both" ? txtMid : cy + rh / 2) - fsT * 0.5;
                  const r = Math.max(0.3, sz * 0.075);
                  const dy = Math.max(cy + r + 0.35, top - r * 2);
                  out.push(`<circle cx="${f2(midX)}" cy="${f2(dy)}" r="${f2(r)}" fill="#000"/>`);
                }
              });
            }
            if (withUi) out.push(`<rect class="hit" data-id="${ins.id}" data-j="${j}" data-b="${b}" x="${f2(cx)}" y="${f2(cy)}" width="${f2(cellW)}" height="${f2(rh)}"/>`);
          }
        }
        makeumSvg(out, ins, sy, x0, cy, L.rowH, B, cellW);
      });
      // 선: 가로(악기 사이) → 세로(정간·대강·장단) → 바깥
      for (let r = 1; r < rows.length; r++) out.push(line(left, y0 + rowYs[r], x0 + w, y0 + rowYs[r], 0.18));
      for (let k = 0; k < sy.n; k++) {
        for (let b = 1; b < B; b++) {
          const x = x0 + (k * B + b) * cellW;
          out.push(line(x, y0, x, y0 + h, cuts.has(b) ? 0.42 : 0.12));
        }
        if (k > 0) out.push(line(x0 + k * B * cellW, y0, x0 + k * B * cellW, y0 + h, 0.7));
      }
      out.push(line(x0, y0, x0, y0 + h, 0.7));
      out.push(`<rect x="${f2(left)}" y="${f2(y0)}" width="${f2(LABEL_W + w)}" height="${f2(h)}" fill="none" stroke="#000" stroke-width="0.7"/>`);
    }
    out.push(`</svg>`);
    return out.join("");
  }

  let L = null;
  function render() {
    L = layout();
    $("pcPageStyle").textContent = `@page { size: ${S.paper === "Letter" ? "letter" : S.paper} ${S.orient}; margin: 0; }`;
    // 입력칸은 종이 묶음(sheets) 밖에 산다 — 다시 그릴 때 함께 지워지면 포커스와 한글 조합이 끊긴다
    const host = sheets;
    if (!L.rows.length) {
      host.innerHTML = `<p class="pc-empty">켜 둔 악기가 없습니다. 설정 › 악기에서 하나 이상 켜십시오.</p>`;
    } else {
      host.innerHTML = L.pages.map((_, i) => pageSvg(L, i, true)).join("");
      applyZoom();
    }
    $("pcReadout").textContent = `정간 ${f2(L.cellW)} × ${f2(L.rowH)}mm · ${L.pages.length}쪽`;
    showCellShape();
    placeInput();
    refreshBar();
    scheduleStaff();   // 오선보 칸이 열려 있을 때만, 한 박자 늦게(글자마다 조판하면 타이핑이 무겁다)
  }

  // ---------- 고르기·입력 ----------
  let sel = null; // { id, j, b }
  // 정간 입력 카드 — 편집기(app.js openCellEditor)와 같은 꼴: 위 머리줄(자리 + [다음 ▶]) + 아래 입력칸.
  // 칸을 덮지 않고 **옆에 떠서** 열린다(2026-11-16 사용자 요청 — 칸 위에 겹쳐 옆으로 늘어나던 입력칸은
  // 지금 칸이 어디인지 가리고 이웃 정간까지 덮었다). 편집 중인 칸은 악보에서 노랗게 칠한다(pc-sel).
  // 이 카드는 종이 묶음(sheets) 밖에 산다 — 다시 그릴 때 함께 지워지면 포커스와 한글 조합이 끊긴다.
  const card = document.createElement("div");
  card.className = "pc-card"; card.hidden = true;
  const cardCap = document.createElement("div"); cardCap.className = "pc-card-cap";
  const cardLab = document.createElement("span");
  const cardNext = document.createElement("button");
  cardNext.type = "button"; cardNext.textContent = "다음 ▶"; cardNext.title = "다음 정간으로 (Enter)";
  cardNext.addEventListener("mousedown", (e) => e.preventDefault()); // 입력칸 포커스 유지
  cardNext.addEventListener("click", () => move(1));
  cardCap.append(cardLab, cardNext);
  const input = document.createElement("input");
  input.className = "pc-input"; input.type = "text"; input.autocomplete = "off";
  input.title = "칸 안 띄어쓰기 = 칸 나누기 (덩 덕)\nEnter·Tab·→ 다음 칸 · ⇧Enter·← 앞 칸 · ↑↓ 다른 악기\n⌥↑↓ 커서가 놓인 구음 크기 · ⌥0 원래대로";
  card.append(cardCap, input);
  const checkBox = document.createElement("div");  // 구음 점검 말풍선(showCellCheck)
  checkBox.className = "pc-check"; checkBox.hidden = true;
  const sheets = document.createElement("div");
  sheets.className = "pc-sheets";
  $("pcPages").append(sheets, card, checkBox);

  const measureCtx = document.createElement("canvas").getContext("2d");
  function hitEl(s) {
    return s && $("pcPages").querySelector(`.hit[data-id="${s.id}"][data-j="${s.j}"][data-b="${s.b}"]`);
  }
  function placeInput() {
    const el = hitEl(sel);
    if (!el) { card.hidden = true; return; }
    // 머리줄은 편집기처럼 자리만('1장단 · 6정간') — 악기 이름은 기능바 구음 이름표에 이미 있다
    cardLab.textContent = `${sel.j + 1}장단 · ${sel.b + 1}정간`;
    const hr = $("pcPages").getBoundingClientRect(), r = el.getBoundingClientRect();
    const svg = el.ownerSVGElement, sr = svg.getBoundingClientRect();
    // 크기는 편집기 카드와 같은 비례(칸 크기 × 1.6 / × 3.6, 최소 46×120px). 글자가 길면(@80 꼬리 등) 넓힌다.
    const cellPx = Math.min(r.width, r.height);
    const h = Math.max(cellPx * 1.6, 46);
    const fpx = h * 0.36;
    measureCtx.font = `500 ${fpx}px ${FONT}`;
    let w = Math.max(cellPx * 3.6, 120, measureCtx.measureText(input.value).width + h * 0.5);
    measureCtx.font = `600 ${h * 0.17}px ${FONT}`;   // 머리줄(자리 + [다음 ▶])이 잘리지 않을 만큼
    w = Math.max(w, measureCtx.measureText(cardLab.textContent + "    다음 ▶").width * 1.1 + h * 0.4);
    // 자리는 칸의 **왼쪽**(이미 지나온 박 쪽) — 시간이 왼→오른쪽으로 흐르므로 오른쪽을 덮으면 다음에
    // 칠 칸이 가려진다(편집기는 세로쓰기라 오른쪽이 지나온 쪽이다 — 같은 규칙을 이 방향에 맞춘 것).
    // 왼쪽에 자리가 없으면(단의 맨 앞) 오른쪽으로. 위아래는 칸 가운데에 맞추되 종이 밖으로 안 나가게.
    const gap = Math.max(4, cellPx * 0.25);
    let left = r.left - hr.left - gap - w;
    if (r.left - gap - w < Math.max(sr.left, $("sheetArea").getBoundingClientRect().left) + 2) left = r.right - hr.left + gap;
    let top = r.top - hr.top + r.height / 2 - h / 2;
    top = Math.max(sr.top - hr.top + 2, Math.min(sr.bottom - hr.top - h - 2, top));
    Object.assign(card.style, { left: left + "px", top: top + "px", width: w + "px", height: h + "px",
                               borderRadius: (h * 0.13) + "px" });
    cardCap.style.fontSize = (h * 0.17) + "px";
    cardCap.style.padding = `0 ${h * 0.16}px`;
    input.style.fontSize = fpx + "px";
    input.style.padding = `0 ${h * 0.12}px`;
    card.hidden = false;
  }
  function select(s, focus) {
    sel = s;
    if (s) { input.value = getCell(s.id, s.j, s.b); input._open = input.value; }
    render();
    if (s && focus !== false) {
      const el = hitEl(s);
      if (el && el.scrollIntoView) {
        const r = el.getBoundingClientRect(), a = $("sheetArea").getBoundingClientRect();
        if (r.top < a.top + 8 || r.bottom > a.bottom - 8 || r.left < a.left || r.right > a.right) el.scrollIntoView({ block: "center", inline: "center" });
        placeInput();
      }
      // 커서는 글자 맨 끝 — 편집기와 같다(통째로 고르면 덧붙이려다 첫 자에 다 지워진다). 통째로는 ⌘A.
      input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  function move(d) {
    if (!sel) return;
    const B = S.beats, n = S.total * B;
    const idx = Math.min(n - 1, Math.max(0, sel.j * B + sel.b + d));
    select({ id: sel.id, j: Math.floor(idx / B), b: idx % B });
  }
  function moveRow(d) {
    if (!sel) return;
    const rows = S.insts.filter((x) => x.on);
    const i = rows.findIndex((x) => x.id === sel.id);
    const nx = rows[Math.min(rows.length - 1, Math.max(0, i + d))];
    if (nx) select({ id: nx.id, j: sel.j, b: sel.b });
  }

  $("pcPages").addEventListener("mousedown", (e) => {
    const t = e.target.closest && e.target.closest(".hit");
    if (!t) return;
    e.preventDefault();
    select({ id: t.dataset.id, j: +t.dataset.j, b: +t.dataset.b });
  });
  input.addEventListener("input", () => {
    if (!sel) return;
    setCell(sel.id, sel.j, sel.b, input.value);
    save(); render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    // ⌥↑/⌥↓ = 커서가 있는 구음만 키우기·줄이기, ⌥0 = 그 구음만 원래 크기로(키 자리로 읽는다 —
    // 맥에서 ⌥0은 'º'를 친다)
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.code === "Digit0" || e.code === "Numpad0")) {
      e.preventDefault();
      nudgeTok(e.code === "Digit0" || e.code === "Numpad0" ? 0 : e.key === "ArrowUp" ? 10 : -10);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
    // ←/→ = 옆 정간 — 편집기 입력 카드와 같은 규칙으로, 커서가 글자 맨 앞(←)·맨 끝(→)에 있을 때만
    // 넘어간다. 그 밖에선 칸 안에서 글자 사이를 오간다(지갱@80처럼 고칠 글자가 칸 안에 있으므로).
    else if (e.key === "ArrowLeft" && !e.shiftKey && !e.metaKey && !e.ctrlKey &&
             input.selectionStart === 0 && input.selectionEnd === 0) { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowRight" && !e.shiftKey && !e.metaKey && !e.ctrlKey &&
             input.selectionStart === input.value.length && input.selectionEnd === input.value.length) { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveRow(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveRow(1); }
    else if (e.key === "Escape") { sel = null; input.blur(); render(); }
  });
  addEventListener("resize", () => { applyZoom(); placeInput(); placeSizePop(); });

  // 입력칸에서 커서가 놓인 구음의 크기 꼬리(@NN)를 바꾼다. d = ±10, 0이면 꼬리를 뗀다.
  // 커서가 구음 사이 빈칸에 있으면 바로 앞 구음, 맨 앞이면 첫 구음을 고른다.
  function nudgeTok(d) {
    if (!sel) return;
    const v = input.value, caret = input.selectionStart ?? v.length;
    const toks = [];
    v.replace(/\S+/g, (m, at) => { toks.push({ s: at, e: at + m.length, raw: m }); return m; });
    if (!toks.length) return;
    let i = toks.findIndex((x) => caret >= x.s && caret <= x.e);
    if (i < 0) { i = toks.length - 1; while (i > 0 && toks[i].s > caret) i--; }
    const tk = toks[i], { t, pct } = parseTok(tk.raw);
    const np = d === 0 ? 100 : Math.min(250, Math.max(40, pct + d));
    const nraw = np === 100 ? t : `${t}@${np}`;
    input.value = v.slice(0, tk.s) + nraw + v.slice(tk.e);
    const pos = tk.s + Math.min(caret - tk.s, t.length);
    input.setSelectionRange(pos, pos);
    setCell(sel.id, sel.j, sel.b, input.value);
    save(); render();
    showTokHint(t, np);
  }
  // 바꾼 크기를 입력 카드 머리줄에 잠깐 보여 준다(종이 위 글자만으로는 몇 %인지 모른다)
  let tokHintT = 0;
  function showTokHint(t, np) {
    cardLab.textContent = `${t} ${np}%`;
    clearTimeout(tokHintT);
    tokHintT = setTimeout(() => placeInput(), 1400);
  }

  // ---------- 배율 ----------
  // 'fit'이면 종이 폭을 #sheetArea에 맞추고, 숫자면 실제 크기(96dpi 기준 mm)의 그 배율.
  // 화면 배율일 뿐이라 악보가 아니라 이 브라우저에 기억한다(편집기와 같은 규칙).
  const PX_MM = 96 / 25.4;
  const ZOOM_KEY = "jgb_perc_zoom_v1";
  let zoom = "fit";
  try { const z = localStorage.getItem(ZOOM_KEY); if (z && z !== "fit" && +z > 0) zoom = +z; } catch (e) {}
  function zoomScale() {
    if (!L) return 1;
    if (zoom !== "fit") return zoom;
    const avail = $("sheetArea").clientWidth - 32;
    return Math.max(0.2, avail / (L.pw * PX_MM));
  }
  function applyZoom() {
    if (!L) return;
    const k = zoomScale();
    sheets.querySelectorAll(".pc-page").forEach((svg) => {
      svg.style.width = (L.pw * PX_MM * k) + "px";
      svg.style.height = (L.ph * PX_MM * k) + "px";
      svg.style.setProperty("--pw", L.pw + "mm");
      svg.style.setProperty("--ph", L.ph + "mm");
    });
    $("zoomVal").textContent = zoom === "fit" ? "맞춤 " + Math.round(k * 100) + "%" : Math.round(k * 100) + "%";
    placeInput();
  }
  function setZoom(z) {
    zoom = z === "fit" ? "fit" : Math.min(4, Math.max(0.25, Math.round(z * 100) / 100));
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch (e) {}
    applyZoom();
    if (sel) { const el = hitEl(sel); if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" }); placeInput(); }
  }
  const ZSTEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  $("zoomIn").addEventListener("click", () => { const k = zoomScale(); setZoom(ZSTEPS.find((z) => z > k + 0.001) || 4); });
  $("zoomOut").addEventListener("click", () => { const k = zoomScale(); setZoom([...ZSTEPS].reverse().find((z) => z < k - 0.001) || 0.25); });
  $("zoomVal").addEventListener("click", (e) => { e.stopPropagation(); $("zoomPop").classList.toggle("on"); $("zoomVal").classList.toggle("on"); });
  $("zoom100").addEventListener("click", () => setZoom(1));
  $("zoomFitW").addEventListener("click", () => setZoom("fit"));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#zoomBar")) { $("zoomPop").classList.remove("on"); $("zoomVal").classList.remove("on"); }
    if (!e.target.closest("#sizePop, #sizeToggle")) setSizePop(false);
  });
  // ⌘/Ctrl + 휠 = 배율 (편집기와 같은 손버릇)
  $("sheetArea").addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(zoomScale() * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  // ---------- 선택한 정간의 구음 점검 ----------
  // **문제가 있을 때만** 입력 카드 바로 아래에 말풍선으로 띄운다(2026-11-16 사용자 확정): 그 악기의
  // 구음이 아니면 빨갛게 + 쓸 수 있는 구음 목록, 음원이 없으면 회색으로. 예전엔 기능바 아래 줄에
  // 늘 '칸 자리 + 구음 목록'을 띄웠는데, 칸 자리는 카드 머리줄과·목록은 구음 단추와 겹쳤다.
  // 떠 있는 말풍선이라 나타나고 사라져도 기능바·악보가 들썩이지 않는다.
  function showCellCheck(ins) {
    const box = checkBox;
    input.classList.remove("bad");
    box.hidden = true;
    if (!ins || card.hidden) return;
    const toks = getCell(ins.id, sel.j, sel.b).trim().split(/\s+/).filter(Boolean).map((r) => parseTok(r).t);
    const bad = toks.filter((t) => tokKind(ins.id, t) === "bad");
    const quiet = toks.filter((t) => tokKind(ins.id, t) === "nosnd");
    const list = [...(GUEUM[ins.id] || []), ...(GUEUM_EXTRA[ins.id] || [])];
    if (bad.length) {
      input.classList.add("bad");
      box.className = "pc-check bad";
      box.innerHTML = `<b>${esc(bad.join(" · "))}</b> — ${esc(ins.name)}의 구음이 아닙니다.<br><span class="pc-check-list">쓸 수 있는 구음: ${esc(list.join(" · "))}</span>`;
    } else if (quiet.length) {
      box.className = "pc-check nosnd";
      box.innerHTML = `<b>${esc(quiet.join(" · "))}</b> — 녹음 음원이 없어 재생 때 소리가 나지 않습니다.`;
    } else return;
    box.hidden = false;
    // 카드 바로 아래, 카드 왼쪽 끝에 맞춘다. 아래 자리가 없으면 카드 위로.
    const ph = $("pcPages").offsetHeight;
    const top = card.offsetTop + card.offsetHeight + 6;
    box.style.left = card.offsetLeft + "px";
    box.style.top = (top + box.offsetHeight > ph ? card.offsetTop - box.offsetHeight - 6 : top) + "px";
  }

  // ---------- 구음 고르개 ----------
  function refreshBar() {
    const bar = $("pcRibbon"), gu = $("pcGu");
    const ins = sel && S.insts.find((x) => x.id === sel.id);
    bar.classList.toggle("idle", !ins);
    // 구음 단추가 어느 악기 것인지는 이름표가 말한다('장구 구음')
    $("pcGuCap").textContent = ins ? `${ins.name} 구음` : "구음";
    showCellCheck(ins);
    const key = ins ? ins.id : "";
    if (gu.dataset.inst !== key) {
      gu.dataset.inst = key;
      gu.innerHTML = "";
      (GUEUM[key] || GUEUM.janggu).forEach((g) => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.textContent = g; btn.dataset.g = g;
        if (tokKind(key, g) === "nosnd") { btn.classList.add("pc-nosnd"); btn.title = "녹음 음원 없음 — 표기용"; }
        if (overBase(key, g)) btn.title = "넘겨치는 궁 — 궁채로 채편을 칩니다(구궁'·덩'처럼 다른 구음 뒤에도 ' 를 붙여 적습니다)";
        gu.appendChild(btn);
      });
      const rest = document.createElement("button");
      rest.type = "button"; rest.textContent = "비움"; rest.className = "pc-rest"; rest.dataset.g = "";
      rest.title = "이 칸을 비우고 다음 칸으로";
      gu.appendChild(rest);
    }
    $("pcRepeat").disabled = !ins || sel.j === 0;
    $("pcClearJd").disabled = !ins;
  }
  $("pcGu").addEventListener("mousedown", (e) => e.preventDefault()); // 입력칸 포커스를 안 뺏는다
  $("pcGu").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !sel) return;
    const g = btn.dataset.g;
    if (e.shiftKey && g) {
      const cur = getCell(sel.id, sel.j, sel.b).trim();
      setCell(sel.id, sel.j, sel.b, cur ? cur + " " + g : g);
      input.value = getCell(sel.id, sel.j, sel.b);
      save(); render(); input.focus();
    } else {
      setCell(sel.id, sel.j, sel.b, g);
      save(); move(1);
    }
  });
  $("pcRepeat").addEventListener("click", () => {
    if (!sel || sel.j === 0) return;
    S.insts.filter((x) => x.on).forEach((ins) => {
      for (let b = 0; b < S.beats; b++) setCell(ins.id, sel.j, b, getCell(ins.id, sel.j - 1, b));
    });
    save();
    if (sel.j + 1 < S.total) select({ id: sel.id, j: sel.j + 1, b: 0 });
    else { input.value = getCell(sel.id, sel.j, sel.b); render(); }
  });
  $("pcClearJd").addEventListener("click", () => {
    if (!sel) return;
    S.insts.filter((x) => x.on).forEach((ins) => {
      for (let b = 0; b < S.beats; b++) setCell(ins.id, sel.j, b, "");
    });
    input.value = ""; save(); render();
  });

  // ---------- 악기 목록 ----------
  function buildInsts() {
    const box = $("pcInsts");
    box.innerHTML = "";
    S.insts.forEach((ins, i) => {
      const row = document.createElement("div");
      row.className = "pc-inst" + (ins.on ? "" : " off");
      row.innerHTML = `<input type="checkbox" ${ins.on ? "checked" : ""} title="악보에 넣기">` +
        `<input type="text" value="${esc(ins.name)}" aria-label="악기 이름">` +
        `<button type="button" title="위로" ${i === 0 ? "disabled" : ""}>↑</button>` +
        `<button type="button" title="아래로" ${i === S.insts.length - 1 ? "disabled" : ""}>↓</button>`;
      const [chk, name, up, dn] = row.children;
      chk.addEventListener("change", () => {
        ins.on = chk.checked;
        if (!ins.on && sel && sel.id === ins.id) { sel = null; card.hidden = true; }
        save(); buildInsts(); render();
      });
      name.addEventListener("input", () => {
        ins.name = name.value || " "; save(); render();
        const lab = $("pcNotation").querySelector(`[data-nt="${ins.id}"] .nt-name`);
        if (lab) lab.textContent = ins.name;
      });
      const swap = (d) => { const a = S.insts; [a[i], a[i + d]] = [a[i + d], a[i]]; save(); buildInsts(); render(); };
      up.addEventListener("click", () => swap(-1));
      dn.addEventListener("click", () => swap(1));
      box.appendChild(row);
    });
    buildNotation();
  }

  // ---------- 표기 (상단바 [표기] → #ntPop) ----------
  // 예전엔 설정 패널 › 표기의 고르개였다. 악보를 어떻게 읽히게 할지를 정하는 큰 갈림이라 상단바로
  // 올렸다(2026-11-16 사용자 요청) — 설정 패널에는 더 두지 않는다(같은 일을 하는 자리가 둘이 되지 않게).
  // 팝업 = [전체] 한 줄(켠 악기 전부를 한 번에) + 악기별 한 줄씩 + 막음새. 버튼 글씨는 지금 표기
  // (모두 같으면 그 이름, 다르면 '악기별') — 편집기 상단바의 '값이 있는 버튼은 지금 값을 보인다'와 같은 규칙.
  // 악기 목록과 같은 차례로 줄을 세운다 — 악기를 끄거나 순서·이름을 바꾸면 따라와야 해서
  // buildInsts가 부른다(되돌리기의 histApply도 buildInsts를 지나므로 저절로 다시 맞춰진다).
  const NT_LABEL = { text: "구음", sym: "기호", both: "기호 + 구음" };
  const ntSegHtml = () => `<div class="pal-seg nt-seg">` +
    NOTATION_MODES.map((m) => `<button type="button" class="seg-btn" data-mode="${m}">${NT_LABEL[m]}</button>`).join("") + `</div>`;
  // 켠 악기가 모두 같은 표기면 그 값, 아니면 null('악기별'). 끈 악기는 악보에 없으니 세지 않는다.
  function commonNotation() {
    const on = S.insts.filter((x) => x.on);
    const ms = new Set((on.length ? on : S.insts).map((x) => notationOf(x.id)));
    return ms.size === 1 ? [...ms][0] : null;
  }
  function setNotation(ids, mode) {
    ids.forEach((id) => { S.notation[id] = mode; });
    save(); syncNotationFields(); render();
  }
  function buildNotation() {
    const box = $("pcNotation");
    box.innerHTML = "";
    S.insts.forEach((ins) => {
      const row = document.createElement("div");
      row.className = "nt-row" + (ins.on ? "" : " off");
      row.dataset.nt = ins.id;
      row.innerHTML = `<span class="nt-name">${esc(ins.name)}</span>` + ntSegHtml();
      row.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setNotation([ins.id], b.dataset.mode)));
      box.appendChild(row);
    });
    syncNotationFields();
  }
  // [전체] — 켠 악기 모두(끈 악기도 함께 바꿔 둔다: 다시 켰을 때 혼자 딴 표기로 나타나지 않게)
  $("ntAll").innerHTML = `<span class="nt-name">전체</span>` + ntSegHtml();
  $("ntAll").querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setNotation(S.insts.map((x) => x.id), b.dataset.mode)));
  function syncNotationFields() {
    $("pcMakeum").checked = !!S.makeum;
    $("ovRow").querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.ov === S.overMark));
    const all = commonNotation();
    $("ntAll").querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === all));
    $("pcNotation").querySelectorAll(".nt-row").forEach((row) => {
      const m = notationOf(row.dataset.nt);
      row.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    });
    $("ntToggleLbl").textContent = all ? NT_LABEL[all] : "악기별";
  }
  $("pcMakeum").addEventListener("change", () => { S.makeum = $("pcMakeum").checked; save(); render(); });
  $("ovRow").querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
    S.overMark = b.dataset.ov; save(); syncNotationFields(); render();
  }));
  // 열고 닫기 — 재생 설정 팝업과 같은 문법(바깥을 누르면 닫힘). 자리는 버튼 아래 왼쪽 맞춤이고 화면
  // 밖으로 나가지 않게 당긴다(placePlayPop과 같은 까닭: 좁은 창에선 상단바가 두 줄로 꺾인다).
  function placeNtPop() {
    const pop = $("ntPop");
    if (!pop.classList.contains("on")) return;
    const r = $("ntToggle").getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + 8) + "px";
    pop.style.maxHeight = Math.max(160, innerHeight - r.bottom - 16) + "px";
  }
  $("ntToggle").addEventListener("click", (e) => {
    e.stopPropagation();
    $("ntPop").classList.toggle("on"); $("ntToggle").classList.toggle("on");
    placeNtPop();
  });
  document.addEventListener("click", (e) => {
    if ($("ntPop").classList.contains("on") && !e.target.closest("#ntPop, #ntToggle")) {
      $("ntPop").classList.remove("on"); $("ntToggle").classList.remove("on");
    }
  });
  addEventListener("resize", placeNtPop);

  // ---------- 설정 칸 ----------
  function clampInt(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  function syncFields() {
    $("pcTitle").value = S.title; $("pcSub").value = S.subtitle;
    $("pcBeats").value = S.beats; $("pcDaegang").value = S.daegang;
    $("pcPerLine").value = S.perLine; $("pcTotal").value = S.total;
    $("pcPaper").value = S.paper; $("pcOrient").value = S.orient;
  }
  // 글자 칸은 치는 대로, 개수를 정하는 숫자 칸은 확정(Enter·포커스 떠남) 때만 — 치는 도중의
  // 중간값(12를 치려다 1)에 배치가 통째로 뒤집히지 않게(편집기의 wireConfirm과 같은 규칙).
  $("pcTitle").addEventListener("input", () => { S.title = $("pcTitle").value; save(); render(); });
  $("pcSub").addEventListener("input", () => { S.subtitle = $("pcSub").value; save(); render(); });
  // 대강을 고치면 그 합이 곧 장단 정간 수다 — 정간 수를 따로 맞추러 가지 않게 함께 바꾼다.
  // 숫자로 안 읽히는 칸(빈칸·오타)이면 정간 수는 그대로 두고 경고만 낸다(daegangCuts).
  $("pcDaegang").addEventListener("change", () => {
    S.daegang = $("pcDaegang").value.trim();
    const nums = S.daegang.split(/[\s,·]+/).filter(Boolean).map(Number);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (nums.length && nums.every((n) => Number.isInteger(n) && n > 0) && sum >= 2 && sum <= 48 && sum !== S.beats) {
      S.beats = sum;
      if (sel && sel.b >= sum) sel.b = sum - 1;
      syncFields();
    }
    save(); render();
  });
  $("pcBeats").addEventListener("change", () => {
    const B = clampInt($("pcBeats").value, 2, 48, S.beats);
    if (B !== S.beats) {
      S.beats = B;
      const nums = String(S.daegang).split(/[\s,·]+/).filter(Boolean).map(Number);
      if (nums.reduce((a, b) => a + b, 0) !== B) S.daegang = suggestDaegang(B);
      if (sel && sel.b >= B) sel.b = B - 1;
    }
    syncFields(); save(); render();
  });
  $("pcPerLine").addEventListener("change", () => { S.perLine = clampInt($("pcPerLine").value, 1, 12, S.perLine); syncFields(); save(); render(); });
  $("pcTotal").addEventListener("change", () => {
    S.total = clampInt($("pcTotal").value, 1, 400, S.total);
    if (sel && sel.j >= S.total) { sel = null; card.hidden = true; }
    syncFields(); save(); render();
  });
  $("pcPaper").addEventListener("change", () => { S.paper = $("pcPaper").value; save(); render(); });
  $("pcOrient").addEventListener("change", () => { S.orient = $("pcOrient").value; save(); render(); });
  $("pcReset").addEventListener("click", () => {
    if (!confirm("적어 둔 구음을 모두 지웁니다. 정간 수·대강·악기 설정은 그대로입니다. 계속할까요?")) return;
    // 게시 id도 끊는다 — 비운 악보로 남들이 보는 게시물을 덮지 않게(편집기의 전체 초기화와 같은 규칙)
    S.cells = {}; S.pubId = null; input.value = ""; save(); render();
  });

  // ---------- 정간 모양 (설정 › 정간 모양) ----------
  // 눈으로 보며 맞추는 값이라 끄는 대로 바로 그린다(편집기의 wireLive와 같은 성격).
  function showCellShape() {
    $("pcCellFill").value = S.cellFill;
    $("pcCellFillV").textContent = S.cellFill + "%";
    const r = L ? L.rowH / L.cellW : 1;
    $("pcCellRatio").value = Math.round(r * 100) / 100;
    $("pcCellRatioV").textContent = (S.cellRatio ? "" : "자동 ") + r.toFixed(2) + "배";
    $("pcCellAuto").disabled = !S.cellRatio && S.cellFill === 100;
  }
  $("pcCellFill").addEventListener("input", () => { S.cellFill = clampInt($("pcCellFill").value, 40, 100, 100); save(); render(); });
  $("pcCellRatio").addEventListener("input", () => {
    const v = Number($("pcCellRatio").value);
    S.cellRatio = Number.isFinite(v) ? Math.min(3, Math.max(0.4, v)) : null;
    save(); render();
  });
  $("pcCellAuto").addEventListener("click", () => { S.cellFill = 100; S.cellRatio = null; save(); render(); });

  // ---------- 재생 ----------
  // 정간 하나 = 한 박(S.bpm 정간/분). 칸 안을 띄어 나눈 구음은 그 박을 고르게 나눈다(그리기와 같은 몫).
  // 소리는 js/perc-audio.js(tools/gen-perc-audio.py가 만든다)를 첫 재생 때 붙여 쓴다.
  //   · 어떤 구음이 어떤 음원인가는 soundKey() 한 곳 — 깽·개는 갱의 강·약, 징은 강(중이 없다),
  //     따·북은 음원이 없어 조용히 건너뛴다(HAS_SOUND와 같은 목록).
  //   · 겹소리(GRACE)는 음원의 lead(뒷소리 시각)만큼 당겨 뒷소리를 박에 놓는다. 지갱 녹음은 지와
  //     갱 사이가 0.8초가 넘어 그대로 당기면 앞 박을 덮으므로, 앞소리를 떼어 박 바로 앞
  //     (GRACE_PRE 안)에 따로 울린다 — 박에 오는 것은 언제나 뒷소리다.
  //   · 한 악기는 한 번에 한 소리 — 새로 치면 앞 소리의 울림을 짧게 걷는다(CHOKE). 안 그러면 꽹과리
  //     울림이 쌓여 뭉개진다. 악기끼리는 서로 안 끊는다.
  const CHOKE = 0.035, GRACE_PRE = 0.22;
  let percAudioReq = null;
  function loadPercAudio() {
    if (window.PERC_AUDIO) return Promise.resolve(window.PERC_AUDIO);
    if (!percAudioReq) percAudioReq = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "js/perc-audio.js";
      sc.onload = () => res(window.PERC_AUDIO || null);
      sc.onerror = () => { percAudioReq = null; res(null); };
      document.head.appendChild(sc);
    });
    return percAudioReq;
  }
  function soundKey(inst, t) {
    const A = window.PERC_AUDIO || {};
    if (inst === "janggu") {
      // 넘겨치는 궁은 채편 소리 — 따로 녹음한 것이 없어 덕(감아치면 기덕, 덩은 덩)으로 낸다
      const ob = overBase(inst, t);
      if (ob) t = ob === "구궁" ? "기덕" : ob === "덩" || ob === "떵" ? "덩" : "덕";
      const m = { "궁": "쿵" }[t] || t;
      return A.janggu && A.janggu[m + "_중"] ? m + "_중" : null;
    }
    if (inst === "kkwaenggwari") {
      if (t === "깽") return "갱_강";
      if (t === "개") return "갱_약";
      return A.kkwaenggwari && A.kkwaenggwari[t + "_중"] ? t + "_중" : null;
    }
    if (inst === "jing") return t === "징" ? "징_강" : null;
    // 북: 원본은 좌고 단음(2026-11-12 받음). 둥=중, 두=약(둥·두가 교과서의 강·약 짝 — 윤명원 2016 표13),
    // 쿵·쿠는 같은 소리를 달리 적은 것(교학사)으로 본다. 딱(테 치기)은 녹음이 없다.
    if (inst === "buk") return { "둥": "둥_중", "쿵": "둥_중", "두": "둥_약", "쿠": "둥_약" }[t] || null;
    return null;
  }
  // 악보 → 타점 [{ t(박), inst, key, j, b }]. 끈 악기는 안 울린다(악보에도 없다).
  function buildHits(fromBeat) {
    const B = S.beats, hits = [];
    S.insts.filter((x) => x.on).forEach((ins) => {
      for (let j = 0; j < S.total; j++) for (let b = 0; b < B; b++) {
        const v = getCell(ins.id, j, b).trim();
        if (!v) continue;
        const parts = v.split(/\s+/);
        parts.forEach((raw, q) => {
          const { t } = parseTok(raw);
          if (t === "-" || t === "·") return;
          const key = soundKey(ins.id, t);
          const beat = j * B + b + q / parts.length;
          if (key && beat >= fromBeat) hits.push({ beat: beat - fromBeat, inst: ins.id, key });
        });
      }
    });
    return hits.sort((a, b) => a.beat - b.beat);
  }
  let playCtx = null, playBufs = null, playing = null; // playing = { t0, spb, from, len, timer }
  function decodeAll(ctx) {
    const A = window.PERC_AUDIO, out = {};
    const jobs = [];
    Object.keys(A).forEach((inst) => Object.keys(A[inst]).forEach((k) => {
      const u = A[inst][k].url, bin = atob(u.slice(u.indexOf(",") + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      jobs.push(ctx.decodeAudioData(arr.buffer).then((buf) => { (out[inst] = out[inst] || {})[k] = { buf, lead: A[inst][k].lead || 0 }; }));
    }));
    return Promise.all(jobs).then(() => out);
  }
  // 타점을 한 컨텍스트에 짜 넣는다 — 실제 재생(AudioContext)과 음량 재기(OfflineAudioContext)가
  // 같은 이 함수를 쓴다. 따로 짜면 잰 봉우리와 울리는 소리가 어긋난다.
  function scheduleHits(ctx, dest, hits, t0, spb) {
    const instGain = {};
    S.insts.forEach((ins) => {
      const g = ctx.createGain(); g.gain.value = instVol(ins.id); g.connect(dest); instGain[ins.id] = g;
    });
    const last = {}; // 악기별 지금 울리는 소리(걷어 낼 gain)
    const play = (buf, when, off, dur, inst) => {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.connect(g); g.connect(instGain[inst] || dest);
      if (last[inst] && last[inst].end > when) {
        const p = last[inst].g.gain;
        p.setValueAtTime(1, when); p.linearRampToValueAtTime(0, when + CHOKE);
      }
      src.start(when, off, dur);
      last[inst] = { g, end: when + (dur || buf.duration - off) };
      return g;
    };
    hits.forEach((h) => {
      const s0 = (playBufs[h.inst] || {})[h.key];
      if (!s0) return;
      const at = t0 + h.beat * spb, lead = s0.lead;
      if (!lead) { play(s0.buf, at, 0, undefined, h.inst); return; }
      const pre = Math.min(lead, GRACE_PRE, spb * 0.45);
      if (pre >= lead - 0.005) { play(s0.buf, at - lead, 0, undefined, h.inst); return; }
      // 앞소리(0~pre)를 박 바로 앞에, 뒷소리(lead~)를 박에 — 둘 사이 녹음의 빈 울림은 건너뛴다
      const g = play(s0.buf, at - pre, 0, pre + 0.02, h.inst);
      g.gain.setValueAtTime(1, at - 0.004); g.gain.linearRampToValueAtTime(0, at + 0.02);
      play(s0.buf, at, lead, undefined, h.inst);
    });
    return instGain;
  }

  // ---------- 음량 맞추기 ----------
  // 합주면 같은 박에 네 악기가 겹쳐 봉우리가 커지고, 독주면 작다. 그래서 재생 직전에 이 악보를
  // 그대로(지금 음량 슬라이더까지) 소리 없이 한 번 합성해 봉우리를 재고, 그 값이 NORM_PEAK가 되게
  // 전체 음량을 정한다 — 합주는 줄고 독주는 커져 귀에 비슷한 크기로 들린다. 길게는 안 잰다
  // (NORM_SEC — 장단은 되풀이되므로 앞부분의 봉우리가 곧 곡의 봉우리다).
  // 그 뒤 재생 중에 음량을 올려 넘치는 순간은 소프트 클립(softClip)이 누른다: 무릎(SOFT_KNEE)
  // 아래는 그대로 통과라 평소 소리엔 손대지 않는다(편집기 app.js '출력 버스'와 같은 셈).
  const NORM_PEAK = 0.85, NORM_MIN = 0.2, NORM_MAX = 3, NORM_SEC = 60, NORM_SR = 22050;
  const SOFT_KNEE = 0.7;
  let softCurve = null;
  function softClip() {
    if (softCurve) return softCurve;
    // 입력을 0.5배로 줄여 넣으므로 곡선의 -1..1 = 실제 -2..2
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
      const y = a <= SOFT_KNEE ? a : SOFT_KNEE + (1 - SOFT_KNEE) * Math.tanh((a - SOFT_KNEE) / (1 - SOFT_KNEE));
      c[i] = Math.sign(x) * y;
    }
    return (softCurve = c);
  }
  async function measurePeak(hits, spb, lenBeats) {
    const dur = Math.min(lenBeats * spb, NORM_SEC) + 3;
    const off = new OfflineAudioContext(1, Math.ceil(dur * NORM_SR), NORM_SR);
    const t0 = GRACE_PRE + 0.02;
    scheduleHits(off, off.destination, hits.filter((h) => h.beat * spb < NORM_SEC), t0, spb);
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let pk = 0;
    for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; }
    return pk;
  }

  async function startPlay() {
    if (playing || startPlay.busy) return;
    startPlay.busy = true;
    if (window.jgbAudioSession) window.jgbAudioSession.begin();   // iOS 무음 모드에서도 들리게(js/ios-audio.js)
    try {
      const data = await loadPercAudio();
      if (!data) { alert("음원을 불러오지 못했습니다(js/perc-audio.js)."); return; }
      if (!playCtx || playCtx.state === "closed") { playCtx = new (window.AudioContext || window.webkitAudioContext)(); playBufs = null; }
      if (playCtx.state === "suspended") await playCtx.resume();
      if (!playBufs) playBufs = await decodeAll(playCtx);
      const ctx = playCtx, spb = 60 / Math.max(20, S.bpm || 90);
      const from = $("pcFromSel").checked && sel ? sel.j * S.beats + sel.b : 0;
      const len = S.total * S.beats - from;
      const hits = buildHits(from);
      let norm = 1;
      try {
        const pk = await measurePeak(hits, spb, len);
        norm = pk > 1e-4 ? Math.min(NORM_MAX, Math.max(NORM_MIN, NORM_PEAK / pk)) : 1;
      } catch (e) { norm = 0.5; } // 못 재면 넉넉히 줄여 둔다(소프트 클립이 나머지를 맡는다)
      // 타점 → 악기 음량 → bus(맞춘 음량) → 0.5배 → 소프트 클립 → 스피커
      const bus = ctx.createGain(); bus.gain.value = norm;
      const pre = ctx.createGain(); pre.gain.value = 0.5;
      const shaper = ctx.createWaveShaper(); shaper.curve = softClip(); shaper.oversample = "4x";
      bus.connect(pre); pre.connect(shaper); shaper.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.12 + GRACE_PRE;
      const instGain = scheduleHits(ctx, bus, hits, t0, spb);
      playing = { t0, spb, from, len, bus, instGain, norm };
      setPlayUi(true);
      tickPlay();
    } finally { startPlay.busy = false; }
  }
  function stopPlay(keepLoop) {
    if (!playing) return;
    clearTimeout(playing.timer);
    try { playing.bus.gain.setValueAtTime(playing.bus.gain.value, playCtx.currentTime); playing.bus.gain.linearRampToValueAtTime(0, playCtx.currentTime + 0.05); } catch (e) {}
    const b = playing.bus; setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 120);
    playing = null;
    if (window.jgbAudioSession) window.jgbAudioSession.end();
    playHi.hidden = true;
    setPlayUi(false);
  }
  function setPlayUi(on) {
    $("btnPlayIco").textContent = on ? "❚❚" : "▶";
    $("btnPlayLbl").textContent = on ? "멈춤" : "재생";
    $("btnStop").disabled = !on;
  }
  // 지금 울리는 박을 악보에 짚는다 — 모든 악기 줄을 덮는 세로 띠(no-print: 화면에만)
  const playHi = document.createElement("div");
  playHi.className = "pc-playhi"; playHi.hidden = true;
  $("pcPages").appendChild(playHi);
  function tickPlay() {
    if (!playing) return;
    const beat = (playCtx.currentTime - playing.t0) / playing.spb;
    if (beat >= playing.len) {
      // 끝의 울림(징 등)이 남도록 한 박 더 기다렸다가 끝낸다
      if (beat >= playing.len + 1.5 || S.loop) {
        const again = S.loop;
        stopPlay(); if (again) startPlay();
        return;
      }
      playHi.hidden = true;
    } else if (beat >= 0) {
      const idx = playing.from + Math.floor(beat);
      const j = Math.floor(idx / S.beats), b = idx % S.beats;
      const rows = S.insts.filter((x) => x.on);
      const top = hitEl({ id: rows[0].id, j, b }), bot = hitEl({ id: rows[rows.length - 1].id, j, b });
      if (top && bot) {
        const hr = $("pcPages").getBoundingClientRect(), r1 = top.getBoundingClientRect(), r2 = bot.getBoundingClientRect();
        Object.assign(playHi.style, { left: (r1.left - hr.left) + "px", top: (r1.top - hr.top) + "px",
          width: r1.width + "px", height: (r2.bottom - r1.top) + "px" });
        playHi.hidden = false;
        if (playHi._last !== idx) {
          playHi._last = idx;
          const a = $("sheetArea").getBoundingClientRect();
          if (r2.bottom > a.bottom - 10 || r1.top < a.top) top.scrollIntoView({ block: "center", inline: "nearest" });
        }
      }
    }
    playing.timer = setTimeout(tickPlay, 30);
  }
  $("btnPlay").addEventListener("click", () => { if (playing) stopPlay(); else startPlay(); });
  $("btnStop").addEventListener("click", () => stopPlay());
  // 스페이스바 = 재생/멈춤(편집기와 같은 손버릇) — 글자를 치는 중에는 비켜선다
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.isComposing) return;
    const tg = e.target;
    if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
    e.preventDefault();
    if (playing) stopPlay(); else startPlay();
  });
  $("playSettingsToggle").addEventListener("click", (e) => {
    e.stopPropagation();
    $("playPop").classList.toggle("on"); $("playSettingsToggle").classList.toggle("on");
  });
  document.addEventListener("click", (e) => {
    if ($("playPop").classList.contains("on") && !e.target.closest("#playPop, #playSettingsToggle")) {
      $("playPop").classList.remove("on"); $("playSettingsToggle").classList.remove("on");
    }
  });
  // ---------- 악기별 음량 (재생 설정) ----------
  // 0~150%, 기본 100. 악보가 아니라 듣는 법이지만 같은 악보를 다시 열 때 그대로 들리도록 문서에 둔다.
  const instVol = (id) => (S.vol[id] == null ? 100 : S.vol[id]) / 100;
  function buildVolRows() {
    const box = $("pcVols");
    box.innerHTML = "";
    S.insts.forEach((ins) => {
      const row = document.createElement("div");
      row.className = "pp-row pc-vol" + (ins.on ? "" : " off");
      const v = Math.round(instVol(ins.id) * 100);
      const quiet = "";
      row.innerHTML = `<label title="더블클릭 = 100%">${esc(ins.name)}${quiet}</label><input type="range" min="0" max="150" step="5" value="${v}"><span>${v}%</span>`;
      const [lab, rng, out] = row.children;
      const set = (n) => {
        if (n === 100) delete S.vol[ins.id]; else S.vol[ins.id] = n;
        rng.value = n; out.textContent = n + "%"; save();
        if (playing && playing.instGain[ins.id]) playing.instGain[ins.id].gain.setTargetAtTime(n / 100, playCtx.currentTime, 0.02);
      };
      rng.addEventListener("input", () => set(clampInt(rng.value, 0, 150, 100)));
      lab.addEventListener("dblclick", () => set(100));
      box.appendChild(row);
    });
  }
  $("playSettingsToggle").addEventListener("click", buildVolRows);
  // 재생 설정 팝업은 화면 안에 떠야 한다 — 버튼 아래 오른쪽 맞춤이 기본이고, 창이 좁아 상단바가
  // 두 줄로 꺾이면(600px 아래) 버튼 자리가 바뀌어 팝업이 화면 밖으로 나갔다(2026-11-16 실측).
  function placePlayPop() {
    const pop = $("playPop");
    if (!pop.classList.contains("on")) return;
    const r = $("playSettingsToggle").getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    pop.style.top = (r.bottom + 8) + "px";
    pop.style.maxHeight = Math.max(160, innerHeight - r.bottom - 16) + "px";
  }
  $("playSettingsToggle").addEventListener("click", placePlayPop);
  addEventListener("resize", placePlayPop);
  $("pcBpm").value = S.bpm; $("pcLoop").checked = !!S.loop;
  $("pcBpm").addEventListener("change", () => { S.bpm = clampInt($("pcBpm").value, 20, 400, 90); $("pcBpm").value = S.bpm; save(); });
  $("pcLoop").addEventListener("change", () => { S.loop = $("pcLoop").checked; save(); });

  // ---------- 시험 악보 (?sample=1) ----------
  // 음원·박 자리·겹소리·표기를 눈과 귀로 확인하려고 둔 더미 — 삼채 꼴 12정간(3·3·3·3) 16장단.
  // 악기마다 쓸 수 있는 구음을 고루 돌리고(겹소리·굴림·막고 치기·넘겨치는 궁·크기 꼬리 @·나눈 칸·
  // 이음 -), 앞 장단은 기본 꼴, 뒤로 갈수록 몰아치는 꼴이다. 지금 적힌 것이 있으면 묻고 덮는다.
  // 주소의 ?sample은 쓰자마자 뗀다.
  function loadSample() {
    const r = (s) => s.split("|").map((x) => x.trim());   // "갱 | | 지 | …" → 정간 12칸
    const K = [   // 꽹과리 — 첫 장단은 빈 칸 없이 꽉 채운다(악기마다 한눈에 여러 구음이 보이게)
      r("갱 | 지 | 지 | 깽 | 개 | 지 | 지갱 | 갯 | 지 | 그랑 | 갱 개 | 객"),
      r("갱 | | 지 | 갱 | | 지 | 갱 | | 지 | 갱 | 갱 | -"),
      r("깽 | | 개 | 깽 | | 개 | 깽 | | 개 | 깽 개 | | 깽"),
      r("지갱 | | | 지갱 | | | 갱 | | 지 | 지갱 | | 갱"),
      r("갱 | 갯 | 지 | 갱 | 갯 | 지 | 갱 | 객 | | 갱 | 지 | 갱"),
      r("그랑 | | | 그라갱 | | | 그랑 | | | 그라갱 | | -"),
      r("갱 지 | 갱 | 지 | 갱 지 | 갱 | 지 | 갱 지 | 갱 지 | 갱 | 개-ㅅ | | 갱"),
      r("게르르르 | - | - | 객 | | 갯 | 개-ㅅ | | 갯 | 객 | | 갱"),
      r("깽 | | 지 | 갱 | | 지 | 깽@120 | | 지 | 갱 | | 지"),
      r("지갱 | | 지 | 갱 | 지 | 갱 | 그랑 | | 지 | 그라갱 | | -"),
      r("갱 개 | 갱 개 | 갱 | 갱 개 | 갱 개 | 갱 | 깽 | 깽 | 깽 | 깽 | | 갯"),
      r("게르르르 | - | - | - | - | - | 게르르르 | - | - | 깽 | | 객"),
      r("갱 | | 지 | 갱 | | 지 | 갱 | | 지 | 갱 | | 갱"),
      r("깽 | | 개 | 깽 | | 개 | 지갱 | | | 지갱 | | 갱"),
      r("그라갱 | | | 그라갱 | | | 그랑 | | 그랑 | | 그랑 | -"),
      r("깽@130 | | | 깽@130 | | | 깽@130 | | | 객 | | "),
    ];
    const J = [   // 장구 — 궁'·구궁'·덩'은 넘겨치는 궁
      r("덩 | 다 | 덕 | 쿵 | 궁' | 덕 | 덩 덕 | 기덕 | 다 | 쿵 | 덩' | 덕"),
      r("덩 | | 기덕 | 쿵 | | 덕 | 덩 | | 기덕 | 쿵 | 덕 | "),
      r("덩 | | 덕 | 쿵 | | 덕 | 덩 | | 궁' | 쿵 | 궁' | "),
      r("덩 | 다 | 덕 | 쿵 | 다 | 덕 | 덩 | 다 | 덕 | 쿵 | 덕 | 다"),
      r("덩 | | 더러러러 | - | | 덕 | 덩 덕 | | 다 | 쿵 | 다 다 | 덕"),
      r("덩 | | 구궁 | 쿵 | | 덕 | 덩 | | 구궁' | 쿵 | 덕 | "),
      r("덩 | 궁' | 덕 | 쿵 | 궁' | 덕 | 덩 | 궁' | 덕 | 쿵 궁' | 덕 | "),
      r("덩' | | 덕 | 쿵 | | 덕 | 덩' | | 덕 | 쿵 | 기덕 | "),
      r("덩 | | 덕 | 쿵 | | 덕 | 덩@120 | | 덕 | 쿵 | 덕 | 다@80"),
      r("기덕 | 기덕 | 덕 | 쿵 | 쿵 | 덕 | 덩 | 덩 | | 덩 | | "),
      r("덩 | 따 | 따 | 덩 | 따 | 따 | 덩 | 따 | 따 | 덩 | 따 | 쿵"),
      r("더러러러 | - | - | - | - | - | 더러러러 | - | - | 덩 | | 덕"),
      r("덩 | | 덕 | 쿵 | | 덕 | 덩 | | 덕 | 쿵 | 덕 | "),
      r("덩 덕 | 쿵 | 덕 | 덩 덕 | 쿵 | 덕 | 덩 덕 | 쿵 | 덕 | 쿵 궁' | 덕 | 덕"),
      r("구궁 | | 덕 | 구궁' | | 덕 | 덩 | | 기덕 | 덩 | 기덕 | "),
      r("덩 | | | 덩 | | | 덩 | | | 덩' | | "),
    ];
    const B = [   // 북
      r("둥 | | | 둥 | | | 둥 | | | 둥 | | "),
      r("둥 | | | 둥 | | | 둥 | | | 둥 | | 딱"),
      r("둥 | | 두 | 둥 | | 두 | 둥 | | 두 | 둥 | | "),
      r("둥 | | | 둥 | | | 둥 | | | 둥 | 두 | 두"),
    ];
    const bk = (i) => (i === 0 ? r("둥 | 두 | 두 | 둥 | 두 | 딱 | 둥 | 두 | 두 | 둥 | 두 | 딱") : i === 15 ? r("둥 | | | 둥 | | | 둥 | | | 둥@130 | | ") : B[i % 4]);
    const jn = r("징 | | | | | | | | | | | ");
    const jn2 = r("징 | | | | | | 징 | | | | | ");
    const jn4 = r("징 | | | 징 | | | 징 | | | 징 | | ");
    const JN = [jn4, jn, jn, jn, jn2, jn, jn2, jn, jn, jn2, jn2, jn4, jn, jn2, jn4, jn4];
    S = Object.assign(freshState(), {
      title: "시험 악보 — 삼채 꼴", subtitle: "음원·표기 확인용 더미",
      beats: 12, daegang: "3 3 3 3", perLine: 2, total: 16, bpm: 150,
      insts: DEFAULT_INSTS.map((x) => ({ ...x })),
      cells: { kkwaenggwari: K, janggu: J, buk: K.map((_, i) => bk(i)), jing: JN },
    });
    // 같은 줄 배열을 여러 장단이 나눠 쓰고 있다 — 그대로 두면 한 칸을 고칠 때 같은 꼴의 장단이 다 바뀐다
    S.cells = JSON.parse(JSON.stringify(S.cells));
  }
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.has("sample")) {
      const has = Object.values(S.cells).some((a) => (a || []).some((r) => (r || []).some((v) => v && String(v).trim())));
      if (!has || confirm("시험 악보를 불러오면 지금 적어 둔 내용이 사라집니다. 계속할까요?")) { loadSample(); flush(); }
      history.replaceState(null, "", location.pathname);
    }
  } catch (e) {}

  // ---------- 오선보 (일선보) 보기 · MusicXML ----------
  // 악기마다 **한 줄짜리 보표(일선보)** 로 옮긴다 — 편집기의 장구 오선보와 같은 그릇(score)을 만들어
  // js/musicxml.js에 넘기고, 화면은 그 MusicXML을 Verovio에 그대로 먹여 그린다. 화면과 파일이 같은
  // XML을 보므로 둘이 어긋날 수 없다(편집기 '오선보 보기'와 같은 원칙).
  //   · 마디 = 장단 하나. 박자표·박 묶음은 staff-core의 timeSig·beatGroups — 정간 단위는 편집기의
  //     '자동'과 같은 규칙(12정간이면 8분음표 → 12/8, 그 밖은 점4분음표)이다.
  //   · 장구는 staff-core JANGGU 표 그대로(채편 = 위 성부·북편 = 아래 성부·덩 = 둘 다). 표에 없는
  //     장구 구음은 PERC_JANGGU_ALIAS·PERC_JANGGU_MORE로 그 표의 말에 옮긴다.
  //   · 꽹과리·북·징은 성부 하나(보통 음표머리, 기둥 위).
  //   · 셈여림·악센트·막음새 ×는 **넣지 않는다**(사용자 확정) — 세기는 구음 이름이 따로 말한다.
  //   · 이음(-)·빈 분박(·)·그 악기의 구음이 아닌 글자(tokKind "bad")는 새로 치지 않는다.
  // 타점 길이는 편집기 장구와 같다: **다음 타점까지, 길어도 한 박**(박 = beatGroups — 12/8이면 대강).
  // 넘는 자리는 쉼표가 된다. 북·징을 붙임줄로 끄는 악보는 없다.
  const SC = window.JGB_STAFF_CORE, MXL = window.JGB_MUSICXML;
  // 표에 이름만 다르게 적힌 장구 구음 — 같은 손·같은 자리라 같은 음표다(재생 soundKey·기호 표기와 같은 판단)
  const PERC_JANGGU_ALIAS = { "궁'": "덕", "쿵'": "덕", "구'": "덕", "구궁'": "기덕", "덩'": "덩", "떵'": "덩", "쿵": "궁", "구": "궁", "따": "덕", "딱": "덕", "더": "덕", "기닥": "기덕", "떵": "덩" };
  // JANGGU 표에 없는 꼴 — 꾸밈이 어느 손(성부)에 붙나를 따로 적는다(graceUp/graceDown = 꾸밈 알 수).
  //   기덩 = 채편 '기' + 덩 · 구궁 = 북편 '구' + 궁 · 다르르르 = 채편 굴림 · 구르르르 = 북편 굴림
  const PERC_JANGGU_MORE = {
    "기덩": { up: true, down: true, graceUp: 1 },
    "구궁": { down: true, graceDown: 1 },
    "다르르르": { up: true, trem: 3 },
    "구르르르": { down: true, trem: 3 },
  };
  // 꽹과리·북·징의 꾸밈·굴림. 겹소리(GRACE — 지갱·찌깽)와 그랑·끄랑은 앞꾸밈 하나, 그라갱은 둘(그·라 —
  // musicxml.js가 꾸밈음 둘 이상을 16분음표 빔으로 잇는다), 게르르르는 굴림(트레몰로 사선 셋).
  const PERC_GRACE_N = { "그랑": 1, "끄랑": 1, "그라갱": 2 };
  const PERC_TREM = new Set(["게르르르", "더러러러", "다르르르", "구르르르"]);
  // 구음 하나 → 성부마다의 타점 [{ lane, grace, trem }]. 치지 않는 것이면 빈 목록.
  function percStrokes(inst, t) {
    if (t === "-" || t === "·" || tokKind(inst, t) === "bad") return [];
    if (inst === "janggu") {
      const more = PERC_JANGGU_MORE[t];
      if (more) {
        const o = [];
        if (more.up) o.push({ lane: 0, grace: more.graceUp || 0, trem: more.trem || 0 });
        if (more.down) o.push({ lane: 1, grace: more.graceDown || 0, trem: more.trem || 0 });
        return o;
      }
      const k = SC.JANGGU[PERC_JANGGU_ALIAS[t] || t];
      if (!k) return [];   // 장구 구음이지만 오선 꼴이 없는 것(작은 소리 이름 등)은 건너뛴다
      const o = [];
      // 기덕의 앞꾸밈 '기'는 채편 것 — 덩(양손)처럼 둘 다 서는 구음은 꾸밈이 없다(표 그대로)
      if (k.up) o.push({ lane: 0, grace: k.grace || 0, trem: k.trem || 0 });
      if (k.down) o.push({ lane: 1, grace: k.up ? 0 : (k.grace || 0), trem: k.trem || 0 });
      return o;
    }
    return [{ lane: 0, grace: GRACE[t] ? 1 : (PERC_GRACE_N[t] || 0), trem: PERC_TREM.has(t) ? 3 : 0 }];
  }
  // 대강 분절(정간 수 목록) — 합이 정간 수와 안 맞으면 null(그리기의 daegangCuts와 같은 판단, 경고는 안 띄운다)
  function daegangGroups() {
    const nums = String(S.daegang || "").split(/[\s,·]+/).filter(Boolean).map(Number);
    const ok = nums.length && nums.every((n) => Number.isInteger(n) && n > 0) && nums.reduce((a, b) => a + b, 0) === S.beats;
    return ok ? nums : null;
  }
  // 켜진 악기마다 score 하나(편집기 jangguScoreOf와 같은 그릇 — perc·lanes·measures).
  function percStaffScores() {
    const B = S.beats, unit = B === 12 ? "eighth" : "dotted", jg = SC.JG[unit];
    const dg = daegangGroups();
    // 한 박이 끝나는 자리들(단위 값) — 타점을 여기서 끊는다
    const grp = SC.beatGroups(unit, B, dg), ends = [];
    for (let c = 1; c < B; c++) if (grp[c] !== grp[c - 1]) ends.push(c * jg);
    ends.push(B * jg);
    const end = B * jg;
    return S.insts.filter((x) => x.on).map((ins) => {
      const nLane = ins.id === "janggu" ? 2 : 1;
      const lanes = Array.from({ length: nLane }, () => []);
      for (let j = 0; j < S.total; j++) {
        const hits = lanes.map(() => []);
        for (let b = 0; b < B; b++) {
          const v = getCell(ins.id, j, b).trim();
          if (!v) continue;
          const parts = v.split(/\s+/);
          // 칸 안 띄어쓰기 = 그 정간을 고르게 나눈 자리(그리기·재생과 같은 몫)
          parts.forEach((raw, q) => percStrokes(ins.id, parseTok(raw).t).forEach((s) => {
            hits[s.lane].push({ at: b * jg + Math.round(jg * q / parts.length), grace: s.grace, trem: s.trem });
          }));
        }
        hits.forEach((hs, li) => {
          const notes = [];
          let at = 0;
          hs.forEach((h, i) => {
            if (h.at < at) return;   // 같은 자리에 두 번(덩 + 덕 따위 겹쳐 적음) — 앞 것만
            if (h.at > at) notes.push({ rest: true, units: h.at - at, graces: [], afters: [] });
            const beatEnd = ends.find((e) => e > h.at);
            const nxt = hs.slice(i + 1).find((x) => x.at > h.at);
            const nx = Math.min(nxt ? nxt.at : end, beatEnd != null ? beatEnd : end, end);
            notes.push({ perc: true, units: nx - h.at, trem: h.trem, afters: [],
                         // 음높이가 없으므로 꾸밈음 알맹이는 null — 개수만 뜻이 있다(편집기 장구와 같음)
                         graces: h.grace ? new Array(h.grace).fill(null) : [] });
            at = nx;
          });
          if (at < end) notes.push({ rest: true, units: end - at, graces: [], afters: [] });
          lanes[li].push(notes);
        });
      }
      return { perc: true, name: ins.name, abbr: ins.name, fifths: 0, clef: "G",
               beats: B, measBeats: new Array(S.total).fill(B), measDg: new Array(S.total).fill(dg),
               gakMeasStart: Array.from({ length: S.total + 1 }, (_, i) => i),
               bpm: Math.max(1, S.bpm || 90), unit, jg, timeType: null,
               // 줄 나눔은 정간보와 같게 — 한 줄 장단 수만큼 마디를 놓고 줄을 바꾼다
               perLine: Math.max(1, S.perLine || 1), daegang: dg,
               lanes, measures: lanes[0] };
    });
  }
  function percMusicXml(vrv) {
    return MXL.build(percStaffScores(), { title: S.title || "타악 정간보", subtitle: S.subtitle, vrv: !!vrv });
  }

  // ── 조판기(Verovio 6.2, 6.7MB) — 칸을 열 때만 불러온다(편집기 loadVerovio와 같은 수법) ──
  var vrvTk = null, vrvState = "";   // "" 안 불림 · "loading" · "failed"
  function loadVerovio() {
    if (vrvTk || vrvState) return;
    vrvState = "loading";
    const s = document.createElement("script");
    s.src = "js/vendor/verovio-toolkit-wasm.js";
    s.onload = () => {
      try {
        window.verovio.module.onRuntimeInitialized = () => {
          try { vrvTk = new window.verovio.toolkit(); vrvState = ""; }
          catch (e) { vrvState = "failed"; }
          scheduleStaff();
        };
      } catch (e) { vrvState = "failed"; scheduleStaff(); }
    };
    s.onerror = () => { vrvState = "failed"; scheduleStaff(); };
    document.head.appendChild(s);
  }

  var staffOpen = false, staffTimer = 0, staffW = 0;
  const STAFF_KEY = "jgb_perc_staff_v1";   // 칸 높이 — 앱 설정(이 브라우저에서 어떻게 보나). 열림은 안 기억한다
  let staffH = 240;
  try { const v = +JSON.parse(localStorage.getItem(STAFF_KEY) || "{}").h; if (v >= 120) staffH = v; } catch (e) {}
  function staffNote(msg) { $("staffBody").innerHTML = `<p class="staff-empty">${esc(msg)}</p>`; }
  // 글자 한 자에도 render()가 불리므로 **열려 있을 때만, 150ms 뒤에** 한 번 조판한다
  function scheduleStaff() {
    if (!staffOpen) return;
    clearTimeout(staffTimer);
    staffTimer = setTimeout(drawStaff, 150);
  }
  // 창에 우겨넣지 않는다 — 자연 폭을 먼저 재고 창보다 넓으면 그 폭으로 앉혀 가로로 스크롤한다
  // (편집기 vrvRender와 같은 두 번 조판). 조판기가 없거나 실패하면 칸에 안내 한 줄만 남긴다.
  function drawStaff() {
    if (!staffOpen) return;
    const body = $("staffBody");
    if (!S.insts.some((x) => x.on)) { staffNote("켜 둔 악기가 없습니다."); return; }
    if (vrvState === "failed") { staffNote("오선보 조판기를 불러오지 못했습니다. [출력] › MusicXML 파일은 그대로 쓸 수 있습니다."); return; }
    if (!vrvTk) { staffNote("오선보 조판기를 불러오는 중입니다…"); loadVerovio(); return; }
    try {
      const width = Math.max(320, body.clientWidth - 8);
      staffW = $("main").clientWidth;
      const scale = 40, units = (px) => Math.max(600, Math.round(px * 100 / scale));
      const common = { scale, adjustPageHeight: true, pageHeight: 60000, breaks: "line",
                       graceFactor: 0.6, header: "none", footer: "none" };
      vrvTk.setOptions(Object.assign({}, common, { pageWidth: units(width), adjustPageWidth: true, noJustification: true }));
      if (!vrvTk.loadData(percMusicXml(true))) throw new Error("조판기가 이 악보를 읽지 못했습니다");
      const m = vrvTk.renderToSVG(1, {}).match(/^<svg width="([\d.]+)px"/);
      const need = m ? parseFloat(m[1]) : 0;
      vrvTk.setOptions(Object.assign({}, common, { pageWidth: units(Math.max(width, need)), adjustPageWidth: false, noJustification: false }));
      vrvTk.redoLayout();
      let html = "";
      for (let i = 1, n = vrvTk.getPageCount(); i <= n; i++) html += vrvTk.renderToSVG(i, {});
      body.innerHTML = `<div class="vrv-out">${html}</div>`;
    } catch (err) {
      staffNote("오선보를 그리지 못했습니다 — " + ((err && err.message) || err));
    }
  }
  function setStaffOpen(on) {
    staffOpen = on;
    $("staffPane").hidden = !on;
    $("pcStaff").classList.toggle("on", on);
    $("pcStaff").setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { $("staffPane").style.height = staffH + "px"; drawStaff(); }
    else clearTimeout(staffTimer);
    applyZoom();   // '맞춤' 배율은 정간보 칸 폭을 보므로 다시 잰다
  }
  $("pcStaff").addEventListener("click", () => setStaffOpen(!staffOpen));
  // 마우스를 얹으면 미리 불러 둔다 — 누를 때쯤엔 대개 준비가 끝나 있다(편집기 #btnStaff와 같다)
  ["mouseenter", "touchstart"].forEach((ev) => $("pcStaff").addEventListener(ev, loadVerovio, { passive: true }));
  $("staffXml").addEventListener("click", () => {
    if (!S.insts.some((x) => x.on)) { alert("켜 둔 악기가 없어 내보낼 것이 없습니다."); return; }
    let xml;
    try { xml = percMusicXml(false); }
    catch (err) { alert("MusicXML로 내보내지 못했습니다 — " + ((err && err.message) || err)); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }));
    a.download = (S.title || "타악정간보").replace(/[\\/:*?"<>|]/g, "_") + ".musicxml";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  // 칸 높이 — 윗변 손잡이를 끌어 조절(편집기 #staffResizer와 같은 꼴). 정간보 칸이 너무 좁아지지 않게 막는다.
  $("staffResizer").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = $("staffPane").offsetHeight;
    const mv = (ev) => {
      const max = Math.max(140, $("main").clientHeight - 140);
      staffH = Math.round(Math.min(max, Math.max(120, h0 - (ev.clientY - y0))));
      $("staffPane").style.height = staffH + "px";
    };
    const up = () => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      try { localStorage.setItem(STAFF_KEY, JSON.stringify({ h: staffH })); } catch (e) {}
      applyZoom();
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  // 폭이 바뀌면(창 크기·설정 패널 여닫기) 다시 접는다 — 같은 폭이면 그대로 둔다
  if (window.ResizeObserver) new ResizeObserver(() => {
    if (staffOpen && Math.abs($("main").clientWidth - staffW) > 4) scheduleStaff();
  }).observe($("main"));
  // 검증 창구
  window.jgbPercStaff = { scores: percStaffScores, xml: () => percMusicXml(false), open: setStaffOpen };

  // ---------- 출력 ----------
  $("pcPrint").addEventListener("click", () => { input.blur(); window.print(); });
  $("pcPng").addEventListener("click", async () => {
    const lay = layout();
    if (!lay.rows.length) return;
    const DPMM = 300 / 25.4; // 300dpi
    const base = (S.title || "타악정간보").replace(/[\\/:*?"<>|]/g, "_");
    for (let i = 0; i < lay.pages.length; i++) {
      const svg = pageSvg(lay, i, false);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
        const cv = document.createElement("canvas");
        cv.width = Math.round(lay.pw * DPMM); cv.height = Math.round(lay.ph * DPMM);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = lay.pages.length > 1 ? `${base}-${i + 1}.png` : `${base}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } finally { URL.revokeObjectURL(url); }
    }
  });

  // ---------- 글자 크기 (기능바 [글자 크기] 팝업 — 편집기의 #sizePop과 같은 꼴) ----------
  const FS = [["pcFsGu", "fsGu"], ["pcFsName", "fsName"], ["pcFsTitle", "fsTitle"]];
  function showFs() { FS.forEach(([id, k]) => { $(id).value = S[k]; $(id + "V").textContent = S[k] + "%"; }); }
  FS.forEach(([id, k]) => {
    $(id).addEventListener("input", () => { S[k] = clampInt($(id).value, 50, 200, 100); showFs(); save(); render(); });
  });
  // 기본값으로 = 전체 배율과 구음별 크기를 되돌린다. 칸 안의 낱 구음 크기(@NN)는 남긴다 —
  // 하나하나 손으로 맞춘 것이라 한꺼번에 날리면 되살릴 길이 없다(⌥0으로 하나씩 뗀다).
  $("sizeReset").addEventListener("click", () => {
    FS.forEach(([, k]) => { S[k] = 100; }); S.guSize = {};
    showFs(); buildGuSizes(); save(); render();
  });
  // 구음별 크기 — 팝업을 열 때마다 지금 악보에 쓰인 구음으로 목록을 새로 짓는다
  function buildGuSizes() {
    const box = $("pcGuSizes"), list = usedGueum();
    // 쓰지 않게 된 구음의 값은 남겨 둔다(다시 쓰면 그대로 돌아온다) — 목록에만 안 띄운다
    box.innerHTML = list.length ? "" : `<p class="pc-pop-note">아직 적은 구음이 없습니다.</p>`;
    list.forEach((t) => {
      const row = document.createElement("div");
      row.className = "sp-row";
      const cur = S.guSize[t] || 100;
      row.innerHTML = `<label title="더블클릭 = 100%">${esc(t)}</label><input type="range" min="50" max="200" step="5" value="${cur}"><span>${cur}%</span>`;
      const [lab, rng, out] = row.children;
      const set = (n) => {
        if (n === 100) delete S.guSize[t]; else S.guSize[t] = n;
        rng.value = n; out.textContent = n + "%"; save(); render();
      };
      rng.addEventListener("input", () => set(clampInt(rng.value, 50, 200, 100)));
      lab.addEventListener("dblclick", () => set(100));
      box.appendChild(row);
    });
  }
  function placeSizePop() {
    const pop = $("sizePop");
    if (!pop.classList.contains("on")) return;
    const r = $("sizeToggle").getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + "px";
    pop.style.top = (r.bottom + 8) + "px";
  }
  function setSizePop(on) {
    $("sizePop").classList.toggle("on", on);
    $("sizeToggle").classList.toggle("on", on);
    if (on) buildGuSizes();
    placeSizePop();
  }
  $("sizeToggle").addEventListener("click", (e) => { e.stopPropagation(); setSizePop(!$("sizePop").classList.contains("on")); });
  showFs();

  // ---------- 오른쪽 레일 (편집기 #appRail과 같은 꼴) ----------
  // 레일 메뉴는 fixed로 떠 버튼 **왼쪽**에 붙고 위아래는 화면 안으로 누른다(편집기 wireTopMenu의
  // fixed 가지와 같은 셈 — 레일이 overflow-y:auto라 absolute면 상자 밖이 잘려 안 보인다).
  function wireRailMenu(btnId, popId) {
    const btn = $(btnId), pop = $(popId);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 레일 메뉴는 한 번에 하나 — 버튼이 클릭을 막아(stopPropagation) 다른 메뉴의 '바깥 클릭' 닫기가 안 돈다
      document.querySelectorAll("#appRail .tb-menu.on").forEach((m) => { if (m !== pop) m.classList.remove("on"); });
      document.querySelectorAll("#appRail .topbar-cmd.on").forEach((b) => { if (b !== btn) b.classList.remove("on"); });
      const on = pop.classList.toggle("on");
      btn.classList.toggle("on", on);
      if (!on) return;
      const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(8, r.left - w - 8) + "px";
      pop.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + "px";
    });
    pop.addEventListener("click", (e) => { if (e.target.closest("button")) { pop.classList.remove("on"); btn.classList.remove("on"); } });
    document.addEventListener("click", (e) => {
      if (pop.classList.contains("on") && !pop.contains(e.target) && !btn.contains(e.target)) { pop.classList.remove("on"); btn.classList.remove("on"); }
    });
  }
  wireRailMenu("outToggle", "outPop");
  wireRailMenu("screenToggle", "screenPop");
  $("outPrintPc").addEventListener("click", () => $("pcPrint").click());
  // 색상 — 편집기(app.js applyTheme·applyDark)와 같은 열쇠·같은 클래스. 편집기에서 바꾼 색이 여기서도,
  // 여기서 바꾼 색이 편집기에서도 그대로다(앱 설정이라 악보에는 안 들어간다).
  const THEMES = { hanji: { cls: "", btn: "themeHanji" }, crystal: { cls: "theme-crystal", btn: "themeCrystal" },
                   celadon: { cls: "theme-celadon", btn: "themeCeladon" } };
  function applyTheme(name) {
    if (!THEMES[name]) name = "hanji";
    Object.keys(THEMES).forEach((k) => {
      if (THEMES[k].cls) document.body.classList.toggle(THEMES[k].cls, k === name);
      $(THEMES[k].btn).classList.toggle("sel", k === name);
    });
    return name;
  }
  function applyDark(on) {
    document.body.classList.toggle("dark", !!on);
    $("darkModeItem").textContent = on ? "밝은 화면으로" : "어두운 화면으로";
  }
  try { applyTheme(localStorage.getItem("jgb_theme_v1") || "hanji"); applyDark(localStorage.getItem("jgb_dark_v1") === "1"); } catch (e) {}
  Object.keys(THEMES).forEach((k) => $(THEMES[k].btn).addEventListener("click", () => {
    const name = applyTheme(k);
    try { localStorage.setItem("jgb_theme_v1", name); } catch (e) {}
  }));
  $("darkModeItem").addEventListener("click", () => {
    const on = !document.body.classList.contains("dark");
    applyDark(on);
    try { localStorage.setItem("jgb_dark_v1", on ? "1" : "0"); } catch (e) {}
  });
  if (window.JGB_CLOUD && window.JGB_CLOUD.board) $("btnBoard").style.display = "";

  // ---------- BETA 배지 (편집기에서 옮겨 옴, 2026-11-16) ----------
  // 누르면 저장 안내 팝오버를 여닫는다. 왼쪽 정렬이라 좁은 창에서 오른쪽이 넘치면 그만큼 당긴다
  // (편집기 app.js에 있던 것과 같은 셈). [지금 PNG로 저장]은 상단바 [PNG]를 그대로 누른다.
  $("betaBadge").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = $("betaPop"), on = pop.classList.toggle("on");
    $("betaBadge").classList.toggle("on", on);
    if (!on) return;
    pop.style.left = "0";
    const over = pop.getBoundingClientRect().right - (innerWidth - 8);
    if (over > 0) pop.style.left = (-over) + "px";
  });
  $("betaSaveBtn").addEventListener("click", () => {
    $("betaPop").classList.remove("on"); $("betaBadge").classList.remove("on");
    $("pcPng").click();
  });
  document.addEventListener("click", (e) => {
    if ($("betaPop").classList.contains("on") && !e.target.closest("#betaBox")) {
      $("betaPop").classList.remove("on"); $("betaBadge").classList.remove("on");
    }
  });

  // ---------- 설정 패널 여닫기 (편집기의 setSidebarOpen과 같은 꼴) ----------
  // 처음엔 열어 둔다 — 이 악보는 정간 수·대강·한 줄 장단 수부터 정해야 시작할 수 있어서.
  const SIDE_KEY = "jgb_perc_side_v1";
  function setSidebarOpen(on, remember) {
    document.body.classList.toggle("sidebar-collapsed", !on);
    $("sidebarOpen").classList.toggle("on", on);
    if (remember) { try { localStorage.setItem(SIDE_KEY, on ? "1" : "0"); } catch (e) {} }
    applyZoom();
  }
  $("sidebarToggle").addEventListener("click", () => setSidebarOpen(false, true));
  $("sidebarOpen").addEventListener("click", () => setSidebarOpen(document.body.classList.contains("sidebar-collapsed"), true));
  // 좁은 창(900px 이하)에선 설정 패널이 악보 위에 떠서 열리므로, 기억해 둔 값이 없으면 닫힌 채
  // 시작한다 — 처음 연 사람에게 악보가 패널에 덮여 안 보이면 안 된다.
  try {
    const saved = localStorage.getItem(SIDE_KEY);
    setSidebarOpen(saved == null ? innerWidth > 900 : saved !== "0", false);
  } catch (e) {}

  // ---------- 게시 창구 (window.jgbDoc — js/cloud.js가 쓴다) ----------
  // 편집기의 app.js가 내놓는 창구와 같은 꼴이다(state·adopt·hasSavedWork·title·pubId·setPubId +
  // badCount·thumbSvg). cloud.js는 이것만 보고 서버와 말하므로 게시·갱신·내리기·주소로 열기·
  // 관리자 열기가 편집기와 **같은 코드**로 돈다. kind: "perc"가 서버에서 정악 악보와 가르는 표지다
  // (scores.kind — 공유마당 카드가 이 페이지로 연다).
  // 서버는 문서에 controls(제목)가 있어야 받으므로(check_doc) 제목만 그 자리에 한 벌 더 적는다 —
  // 서버가 목록·검색용 제목을 거기서 뽑는다. 악보 본문은 perc 안에 이 페이지의 상태 그대로다.
  // 수정 열쇠(토큰)는 문서에 안 넣는다(cloud.js가 localStorage에 따로 둔다). pubId만 문서에 산다.
  function hasWork() {
    return Object.values(S.cells).some((a) => (a || []).some((r) => (r || []).some((v) => v && String(v).trim())));
  }
  function adoptDoc(perc) {
    histCommit();
    sel = null; card.hidden = true; input.value = "";
    S = perc;
    syncFields(); buildInsts(); showFs();
    $("pcBpm").value = S.bpm; $("pcLoop").checked = !!S.loop;
    render(); flush();
    histPast.push(JSON.stringify(S)); histFuture = [];
  }
  window.jgbDoc = {
    kind: "perc",
    state() {
      const perc = JSON.parse(JSON.stringify(S));
      delete perc.pubId;
      return { v: 1, kind: "perc", controls: { title: S.title || "", subtitle: S.subtitle || "" }, perc };
    },
    // 남이 올린 악보를 들인다. 적어 둔 것이 있으면 묻는다 — 들인 뒤에도 ⌘Z로 되돌릴 수 있다.
    async adopt(doc, has, msg) {
      const perc = doc && doc.kind === "perc" && normState(doc.perc);
      if (!perc) { alert("타악 정간보 문서가 아닙니다."); return false; }
      if (has && !confirm((msg || "다른 악보를 엽니다.") + "\n지금 적어 둔 악보는 사라집니다(⌘Z로 되돌릴 수 있습니다). 계속할까요?")) return false;
      adoptDoc(perc);
      return true;
    },
    hasSavedWork: hasWork,
    title: () => S.title || "",
    pubId: () => S.pubId || null,
    setPubId(id) { S.pubId = id || null; flush(); histPast[histPast.length - 1] = JSON.stringify(S); },
    // 그 악기의 구음이 아닌 칸(화면에서 빨간 것)의 수 — 게시 창의 한 줄과 관리 화면의 '문법 오류'가 쓴다
    badCount() {
      let n = 0;
      S.insts.filter((x) => x.on).forEach((ins) => (S.cells[ins.id] || []).forEach((row, j) => {
        if (j >= S.total) return;
        (row || []).forEach((v, b) => {
          if (b >= S.beats || !v) return;
          String(v).trim().split(/\s+/).filter(Boolean).forEach((raw) => { if (tokKind(ins.id, parseTok(raw).t) === "bad") n++; });
        });
      }));
      return n;
    },
    // 공유마당 카드 그림 — 화면 표시(선택·누를 자리·경고 색)가 없는 첫 쪽을 새로 그린다
    thumbSvg() {
      try {
        return new DOMParser().parseFromString(pageSvg(layout(), 0, false), "image/svg+xml").documentElement;
      } catch (e) { return null; }
    },
  };

  syncFields();
  buildInsts();
  render();
  $("pcBpm").value = S.bpm; $("pcLoop").checked = !!S.loop;
  histPast = [JSON.stringify(S)];
  // 메뉴(편집 › 실행 취소)로 오는 되돌리기도 입력칸에선 같은 길로 돌린다
  input.addEventListener("beforeinput", (e) => {
    if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
      e.preventDefault();
      if (e.inputType === "historyUndo") undo(); else redo();
    }
  });
  // 정간 입력칸에서도 악보 전체를 되돌린다(친 글자는 HIST_MS 단위로 묶여 한 덩이씩 물러난다).
  // 브라우저 기본에 맡기면 안 된다 — 입력칸 하나를 여러 칸이 돌려 쓰므로, 앞서 다른 칸에서 쳤던
  // 글자가 지금 칸에 되살아났다(2026-11-16 실측). 제목 같은 글자 칸은 브라우저 기본 그대로.
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
    const k = e.key.toLowerCase();
    const isUndo = k === "z" && !e.shiftKey, isRedo = (k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey && !e.metaKey);
    if (!isUndo && !isRedo) return;
    const t = e.target;
    if (t === input) { /* 아래로 — 악보 전체 되돌리기 */ }
    else if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) && t.type !== "range" && t.type !== "checkbox") return;
    e.preventDefault();
    if (isUndo) undo(); else redo();
  });
  window.jgbPerc = { state: () => S, render,
    // 검증 창구 — 지금 재생의 맞춘 음량, 그리고 이 악보를 그 음량으로 냈을 때의 봉우리
    playInfo: () => playing && { norm: playing.norm },
    measure: async () => {
      await loadPercAudio();
      if (!playCtx) playCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (!playBufs) playBufs = await decodeAll(playCtx);
      const spb = 60 / Math.max(20, S.bpm || 90), hits = buildHits(0);
      const pk = await measurePeak(hits, spb, S.total * S.beats);
      const norm = Math.min(NORM_MAX, Math.max(NORM_MIN, NORM_PEAK / pk));
      const bufPk = Math.max(...Object.values(playBufs).flatMap((o) => Object.values(o).map((v) => {
        const d = v.buf.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; })));
      return { rawPeak: +pk.toFixed(3), norm: +norm.toFixed(3), after: +(pk * norm).toFixed(3), maxSamplePeak: +bufPk.toFixed(3) };
    } };
})();
