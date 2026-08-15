// 오선보의 밑감 — 음이름 적기·조표 고르기·음표값 표.
//
// 그리기(js/staff-view.js) · 파일로 내보내기(js/musicxml.js) · 앱(js/app.js) 셋이 이 한 벌을
// 나눠 쓴다. 예전엔 app.js의 mxlPitch와 staff-view.js의 pitchAt에 **같은 셈이 두 벌** 있었고
// 검사(1155자리 대조)로 겨우 맞춰 두고 있었다 — 한 벌이 되면서 그 대조가 필요 없어졌다.
//
// 여기 있는 것은 전부 순수한 셈이다: 앱 상태도 DOM도 안 본다.
(function (root) {
  "use strict";

  // 길이의 단위. 4분음표 하나를 DIV로 나눠 센다.
  // DIV를 1680으로 고른 건 정간이 점4분음표(2520)든 4분음표(1680)든 8분음표(840)든 잘게
  // 나눠떨어져서 — 분박을 몇으로 쪼개든 길이가 정수로 떨어진다.
  const DIV = 1680;
  // 정간 하나를 무엇으로 볼 것인가. 이건 취향이 아니라 **그 곡이 정간을 몇으로 쪼개느냐**와
  // **한 각이 몇 정간인가**에 달렸다.
  //   점4분음표 — 3분박이라야 분박이 8분음표로 딱 떨어진다. 정악에 흔해 **기본**.
  //   4분음표   — 2분박일 때.
  //   8분음표   — 2분박이면서 **각이 길 때**. 20정간 각을 4분음표로 보면 20/4이 되어 한
  //               마디가 서양 악보에서 터무니없이 길어지는데, 8분음표로 보면 20/8이 된다.
  //               민요·산조처럼 정간이 잘게 흐르는 악보에서 이쪽이 읽힌다.
  // 안 맞는 쪽을 고르면 음표꼴(<type>)이 딱 안 떨어져 비게 된다.
  const JG = { dotted: DIV * 3 / 2, plain: DIV, eighth: DIV / 2 };

  // 박자표 — **각 하나가 한 마디**이므로 '한 각이 몇 박인가'가 곧 여기 적히는 수다.
  // 화면(staff-view)과 파일(musicxml)이 같은 답을 써야 하므로 셈은 여기 한 곳에만 둔다.
  //   beats = 아랫수 단위로 센 한 각의 박수 · type = 아랫수
  //   beatUnit·dot = MusicXML <metronome>이 쓰는 '정간 하나'의 이름
  //
  // 세 번째 인자 type은 **사람이 고른 아랫수**(#staffTime, 없으면 자동). 이때도 마디의
  // **총 길이는 손대지 않는다** — 윗수를 그 아랫수에 맞춰 다시 셀 뿐이다(20/8 ↔ 10/4 ↔ 5/2).
  // 그래서 고를 수 있는 박자표는 사실상 아랫수 하나로 정해진다: 마디 총 길이가 정간 수로
  // 이미 정해져 있으므로 윗수를 따로 고르면 마디 길이가 어긋나 악보 프로그램이 마디를
  // 다시 짠다. 나눠떨어지지 않으면(5정간 각을 2분음표로 세는 등) 조용히 자동으로 물러난다.
  const TIME_TYPES = [2, 4, 8, 16];   // 고를 수 있는 아랫수 — index.html #staffTime과 같은 목록
  function autoType(unit) { return unit === "plain" ? 4 : 8; }
  // 윗수 = 마디 총 길이 ÷ 아랫수 음표 하나의 길이. 정수가 아니면 그 아랫수로는 못 적는다.
  function timeTop(unit, beats, type) {
    const total = beats * (JG[unit] || JG.dotted);
    const one = DIV * 4 / type;
    return total % one ? null : total / one;
  }
  function timeSig(unit, beats, type) {
    const u = JG[unit] ? unit : "dotted";
    const beatUnit = u === "eighth" ? "eighth" : "quarter";
    const dot = u === "dotted";
    const pick = TIME_TYPES.indexOf(+type) >= 0 ? timeTop(u, beats, +type) : null;
    if (pick != null) return { beats: pick, type: +type, beatUnit: beatUnit, dot: dot };
    const t = autoType(u);
    return { beats: timeTop(u, beats, t), type: t, beatUnit: beatUnit, dot: dot };
  }
  // 정간 하나가 4분음표의 몇 배인가 — <sound tempo>가 4분음표 기준이라 필요하다.
  function quarterRatio(unit) { return (JG[unit] || JG.dotted) / DIV; }

  const LETTERS = "CDEFGAB";
  // MusicXML의 <accidental> 이름. 0(제자리표)도 적을 것이 있으므로 '없음'은 null로만 나타낸다.
  const ACC = { "-2": "flat-flat", "-1": "flat", "0": "natural", "1": "sharp", "2": "double-sharp" };

  // 자리표 — 화면(staff-view)·파일(musicxml)·고르는 쪽(app.js)이 같은 표를 봐야 한다.
  //   dia   = 오선 맨 아랫줄의 음이름 자리(높은음자리표는 E4, 낮은음자리표는 G2)
  //   at    = 그 자리표가 가리키는 줄(맨 아랫줄을 0으로 센 반칸 수) = 글리프의 기준점
  //   glyph = js/staff-glyphs.js의 키 · sign·line = MusicXML <clef>
  const CLEF = {
    G: { dia: 4 * 7 + 2, at: 2, glyph: "gClef", sign: "G", line: 2 },
    F: { dia: 2 * 7 + 4, at: 6, glyph: "fClef", sign: "F", line: 4 }
  };

  // 음 하나가 그 자리표에서 먹는 덧줄 수. 오선은 base ~ base+8을 덮는다.
  function ledgersFor(dia, base) {
    if (dia < base) return Math.floor((base - dia) / 2);
    if (dia > base + 8) return Math.floor((dia - base - 8) / 2);
    return 0;
  }

  // 자리표 고르기 — **덧줄이 적은 쪽**. 거문고처럼 낮은 음만으로 된 악보를 높은음자리표에
  // 얹으면 덧줄만 잔뜩 생겨 읽을 수가 없다.
  // 예전엔 '평균 음높이 < 57이면 낮은음자리표'였다. 대개 같은 답이 나오지만 그건 대리 지표일
  // 뿐이라, 여기서는 **정말로 재려는 것**(덧줄이 몇 줄이나 생기나)을 직접 센다. 같으면
  // 높은음자리표 — 둘이 비긴다면 더 흔한 쪽이 낫다.
  // dias = 음이름 자리 목록(pitchAt(...).dia). 음이 없으면 높은음자리표.
  function pickClef(dias) {
    let g = 0, f = 0;
    for (let i = 0; i < dias.length; i++) {
      g += ledgersFor(dias[i], CLEF.G.dia);
      f += ledgersFor(dias[i], CLEF.F.dia);
    }
    return f < g ? "F" : "G";
  }

  // 5도권에서 i번째 자리의 음높이(도=0 기준). -1=F, 0=C, 1=G … 6=F♯, -2=B♭.
  function fifthPc(i) { return (((7 * i) % 12) + 12) % 12; }

  // 조표 고르기 — **그 음계의 '도'가 어느 음인가**로 정한다. 잉크가 가장 적은 조표가 아니다.
  //
  // 5음 음계는 임시표 없이 적을 수 있는 조표가 하나가 아니라 **셋**이다(황종 평조면
  // ♭5·♭4·♭3이 다 된다). 셋 다 같은 다섯 음을 적으므로 음정은 어느 쪽이든 안 틀리고,
  // 갈리는 것은 **무엇을 도(do)로 선언하는가**뿐이다. 그러니 표기 경제의 문제가 아니라
  // 악조 해석의 문제다 — 5음 음계를 평조는 솔라도레미, 계면조는 라도레미솔로 읽고
  // 그 **'도'를 으뜸음 삼는 장조 조표**를 쓴다.
  //   황종 평조(황태중임남) = 솔라도레미 → 도가 중려(A♭)라 ♭4
  //   중려 평조(중임무황태)              → 도가 무역(D♭)이라 ♭5
  //   황종 계면조(황협중임무) = 라도레미솔 → 도가 협종(G♭)이라 ♭6
  // **여기서 '도'는 그 악조의 궁(宮)이 아니다.** 악조 이름이 말하는 궁은 황종이고(그래서
  // '황종 평조'다) 도는 중려다. 정간보는 악조를 궁으로 이름 붙이는데 서양 조표는 장조의
  // 으뜸음을 선언하므로, 옮기면 **중심음과 조표의 으뜸음이 어긋난다** — 조표만 보고
  // 중려를 이 곡의 중심음으로 읽지 말 것(2026-08-13 사용자 정정).
  // 예전엔 '임시표가 가장 적은 것'을 골라 셋 다 한 겹씩 모자랐다(각각 ♭3·♭4·♭5).
  // 음이 하나도 안 틀려 검사로는 안 잡히고 악보를 읽는 사람 눈에만 보이던 오류다.
  //
  // 그 '도'는 **5도권에서 가장 낮은 음계음**이다 — 곧 그 음은 음계에 있는데 한 겹 더
  // 내림쪽 음은 음계에 없는 자리. 평조·계면조가 이 규칙 하나로 함께 맞는다.
  // 음계가 5도권에서 이어지지 않으면(빈도로 추정한 음계, 반음계적 선율) 궁을 못 짚는다.
  // 그때는 **조표 없음(다장조)으로 물러나 임시표로 적는다** — 예전엔 '임시표가 가장 적은
  // 조표'로 물러났는데, 그건 방금 버린 표기 경제 기준을 뒷문으로 되살리는 데다 더 나쁘게는
  // **못 짚은 자리에서 아무 조나 선언해 버린다**(읽는 사람은 그 조라고 믿는다). 조표 없음은
  // '조를 못 정했다'는 정직한 표시이고, 대신 임시표가 늘어나는 대가만 치른다.
  // 어차피 여기까지 온 선율은 어느 조표로도 임시표가 남는다(2026-08-13 사용자 확정).
  // pcs = 음높이(0~11) 목록.
  function fifthsFor(pcs) {
    const has = {};
    pcs.forEach(function (p) { has[(((p % 12) + 12) % 12)] = true; });

    // ① 임시표 없이 다 담기는 조표 중, 으뜸음이 궁인 것
    const fits = [];
    for (let f = -7; f <= 7; f++) {
      const inKey = {};
      for (let i = f - 1; i <= f + 5; i++) inKey[fifthPc(i)] = true;
      if (pcs.some(function (p) { return !inKey[(((p % 12) + 12) % 12)]; })) continue;
      if (has[fifthPc(f)] && !has[fifthPc(f - 1)]) fits.push(f);   // 도 = 5도권 맨 아래 음계음
    }
    if (fits.length) {                       // 딴이름한소리(♭6↔♯6)가 함께 걸리면 내림표 쪽
      return fits.sort(function (a, b) { return Math.abs(a) - Math.abs(b) || a - b; })[0];
    }

    // ② 궁을 못 짚으면 조표 없음 — 임시표로 적는다(위 머리말)
    return 0;
  }

  // midi 하나 → 오선의 자리. 조표 안 음이면 임시표 없이 적히고, 밖의 음이면 조표가 기운
  // 쪽(내림조면 내림표)으로 한 칸 더 나가 적는다.
  //   dia  = '도'를 0으로 센 음이름 자리(옥타브×7 + 글자). 오선의 높이가 이걸로 정해진다.
  //   acc  = 적어야 할 임시표(null이면 조표에 이미 들어 안 적는다). 0은 제자리표라 null과 다르다.
  function pitchAt(midi, fifths) {
    const pc = (((midi % 12) + 12) % 12);
    const order = [];
    for (let i = fifths - 1; i <= fifths + 5; i++) order.push(i);
    for (let k = 1; k <= 8; k++) {
      order.push(fifths < 0 ? fifths - 1 - k : fifths + 5 + k);
      order.push(fifths < 0 ? fifths + 5 + k : fifths - 1 - k);
    }
    let found = 0;
    for (let n = 0; n < order.length; n++) if (fifthPc(order[n]) === pc) { found = order[n]; break; }
    const alter = Math.floor((found + 1) / 7);
    const step = "FCGDAEB"[(((found + 1) % 7) + 7) % 7];
    return {
      step: step,
      alter: alter,
      // 변화음만큼 되돌려 놓고 세야 B♯·C♭에서 옥타브가 안 밀린다
      octave: Math.floor((midi - alter) / 12) - 1,
      dia: (Math.floor((midi - alter) / 12) - 1) * 7 + LETTERS.indexOf(step),
      acc: (found >= fifths - 1 && found <= fifths + 5) ? null : alter
    };
  }

  // ── 음표꼴 ────────────────────────────────────────────────────────────
  // 쓰는 곳이 둘인데 바라는 것이 다르다:
  //   exactValue  내보내기용 — **딱 떨어질 때만** 준다. 틀린 음표꼴을 적느니 비워 두면
  //               악보 프로그램이 <duration>을 보고 알아서 고른다(<type>은 없어도 되는 항목).
  //   nearestValue 그리기용 — 늘 무언가는 그려야 하므로 **가장 가까운 것**을 준다. 비례
  //               간격이라 길이의 진실은 가로 자리가 말하므로 가까운 꼴로 그려도 거짓이 아니다.
  const TYPES = [["breve", 2], ["whole", 1], ["half", 1 / 2], ["quarter", 1 / 4],
                 ["eighth", 1 / 8], ["16th", 1 / 16], ["32nd", 1 / 32], ["64th", 1 / 64]];
  function exactValue(units) {
    for (let i = 0; i < TYPES.length; i++) {
      const base = TYPES[i][1] * 4 * DIV;
      for (let dots = 0; dots <= 2; dots++) {
        if (Math.abs(base * (2 - Math.pow(0.5, dots)) - units) < 1e-9) {
          return { type: TYPES[i][0], dots: dots };
        }
      }
    }
    return null;
  }

  // head: "whole" 속 빔·기둥 없음 · "half" 속 빈 머리에 기둥 · "q" 꽉 찬 머리에 기둥
  const SHAPES = [
    { r: 4, head: "whole", flags: 0, dots: 0 }, { r: 3, head: "half", flags: 0, dots: 1 },
    { r: 2, head: "half", flags: 0, dots: 0 }, { r: 1.5, head: "q", flags: 0, dots: 1 },
    { r: 1, head: "q", flags: 0, dots: 0 }, { r: 0.75, head: "q", flags: 1, dots: 1 },
    { r: 0.5, head: "q", flags: 1, dots: 0 }, { r: 0.375, head: "q", flags: 2, dots: 1 },
    { r: 0.25, head: "q", flags: 2, dots: 0 }, { r: 0.125, head: "q", flags: 3, dots: 0 }
  ];
  function nearestValue(units) {
    const r = units / DIV;
    let best = SHAPES[4], bestD = Infinity;
    SHAPES.forEach(function (v) {
      const d = Math.abs(Math.log(r / v.r));
      if (d < bestD) { bestD = d; best = v; }
    });
    return best;
  }

  // ── 빔 묶음의 단위 ───────────────────────────────────────────────────
  // 꼬리 있는 음표는 **한 박 안에서만** 빔으로 잇는다. 무엇이 한 박인지는 **정간 단위**가
  // 정한다: 점4분음표·4분음표면 정간 하나가 곧 한 박이지만, **8분음표면 정간 하나는 한
  // 박이 아니다** — 정간마다 8분음표 하나씩 따로 꼬리가 붙어 꼬리 숲이 되고, 12/8을 그렇게
  // 적는 악보는 없다. 그때는 **대강이 곧 박**이다(정간보가 이미 갖고 있는 정보라 새로 물을
  // 것이 없다). 대강이 안 적힌 악보는 셋씩, 셋으로 안 나뉘면 둘씩 — 정악에 세 박이 흔해서다.
  //
  // 돌려주는 것은 **정간 번호 → 묶음 번호** 표. 화면(staff-view)과 파일(musicxml)이 같은
  // 답을 봐야 빔이 어긋나지 않으므로, 이 셈을 어느 한쪽에 다시 적지 말 것.
  //   unit = "dotted"|"plain"|"eighth" · beats = 셀 정간 수 · daegang = 대강 분절(없으면 null)
  // off = 이 마디가 제 각에서 몇 번째 정간부터인가. 각 하나를 여러 마디로 나눈 경우
  // (#staffBar) 대강 분절은 여전히 **각**의 것이므로, 그만큼 건너뛴 자리에서 세어야
  // 빔이 대강 경계에서 끊긴다. 안 나누면 늘 0이라 예전과 같은 답이 나온다.
  function beatGroups(unit, beats, daegang, off) {
    const n = Math.max(1, Math.floor(beats) || 1);
    const out = [];
    if (unit !== "eighth") {
      for (let i = 0; i < n; i++) out[i] = i;      // 정간 하나 = 한 박
      return out;
    }
    const gs = (daegang && daegang.length) ? daegang : [n % 3 === 0 ? 3 : 2];
    const at = function (i) { return gs[i] || gs[gs.length - 1]; };
    let gi = 0, k = 0;
    for (let skip = Math.max(0, Math.floor(off) || 0); skip > 0; skip--) {
      if (++k >= at(gi)) { k = 0; gi++; }
    }
    const base = gi;
    for (let i = 0; i < n; i++) {
      out[i] = gi - base;   // 묶음 번호는 이 마디 안에서 0부터 — 받는 쪽이 마디 단위로 쓴다
      if (++k >= at(gi)) { k = 0; gi++; }
    }
    return out;
  }

  // ── 셋잇단 ────────────────────────────────────────────────────────────
  // 표준 음표값으로 안 떨어지되 **3/2배가 딱 떨어지면** 그 꼴에 3:2를 달아 적는다
  // (4분음표 정간의 3분박이 이 경우다 — 560은 값이 없지만 840은 8분음표다).
  // 길이(<duration>)는 그대로이므로 마디 합은 안 바뀐다.
  function tupletValue(units) {
    if (!(units > 0) || (units * 3) % 2) return null;
    const ty = exactValue(units * 3 / 2);
    return ty ? { actual: 3, normal: 2, ty: ty } : null;
  }

  // ── 붙임줄로 가르기 ───────────────────────────────────────────────────
  // 음표 하나로 안 떨어지는 길이를 **붙임줄로 이을 음표값 목록**으로 가른다.
  // 이런 길이는 잇고 있는 음에서 흔하다 — 한 음을 세 정간 끌면 점4분음표 셋(7560)인데
  // 어떤 음표에 점을 둘까지 붙여도 그 값이 없다. 예전엔 <type>을 비워 두고 악보
  // 프로그램에 맡겼는데, 조판기(Verovio)는 음표꼴을 모르면 **기둥도 꼬리도 없는 머리**만
  // 그린다(2026-08-14 사용자 제보). 길이는 맞아도 악보로는 못 읽는 그림이다.
  //
  // 가르는 자리는 **모음박(beat = 정간 하나)** 이 정한다. 그냥 긴 것부터 집으면
  // 7560이 온음표(6720) + 8분음표(840)가 되어 박을 가로지르는데, 12/8에서 세 박을
  // 그렇게 적는 악보는 없다 — 점2분음표 ⌒ 점4분음표라야 박이 보인다.
  //   ① 박에 **들어가는** 첫 조각은 경계까지 끊고 **짧은 것부터**(관행: 박 앞은 짧게)
  //   ② 경계에 올라선 뒤로는 **온전한 박을 한 음표로 최대한 길게**(3박은 안 되니 2박+1박)
  //   ③ 남는 꼬리는 긴 것부터
  // 2의 거듭제곱으로 안 나뉘는 길이(5·7분박)는 붙임줄로도 못 적으므로 null을 준다 —
  // 그때는 부르는 쪽이 예전처럼 음표꼴을 비운다(억지로 적느니 비워 두는 쪽이 정직하다).
  //   units = 가를 길이 · off = 마디 안에서 이 음이 시작하는 자리 · beat = 모음박(정간) 길이
  const VALUES = (function () {
    // 길이가 정수인 음표값만 후보다 — <duration>은 정수라야 한다(점 붙은 64분음표는 탈락).
    const v = [];
    TYPES.forEach(function (t) {
      for (let d = 0; d <= 2; d++) {
        const u = t[1] * 4 * DIV * (2 - Math.pow(0.5, d));
        if (Number.isInteger(u) && v.indexOf(u) < 0) v.push(u);
      }
    });
    return v.sort(function (a, b) { return b - a; });
  })();

  function greedyValues(len) {
    const out = [];
    let r = len;
    while (r > 0) {
      let v = 0;
      for (let i = 0; i < VALUES.length; i++) if (VALUES[i] <= r) { v = VALUES[i]; break; }
      if (!v || out.length >= 32) return null;   // 못 적는 길이
      out.push(v); r -= v;
    }
    return out;
  }

  // 박 안에 드는 조각 하나를 적을 수 있는 꼴로. 표준 음표값 → 셋잇단 → 표준값 여럿 →
  // **셋잇단 여럿** 순으로 시도한다. 마지막 갈래가 필요한 것은 3분박 박에서다: 4분음표
  // 정간의 3분박은 값이 560의 배수라 2의 거듭제곱 값만으로는 1400(2.5분박) 같은 길이를
  // 못 적는다(실제로 취타 길타령에서 음표꼴이 통째로 비었다 — 2026-08-14 사용자 제보).
  // 3/2배 자리에서 갈라 되돌리면 1400 = 1120(3잇단 4분) + 280(3잇단 16분)이 된다.
  function fragment(len) {
    if (exactValue(len)) return [{ units: len, tup: false }];
    if (tupletValue(len)) return [{ units: len, tup: true }];
    const bin = greedyValues(len);
    if (bin) return bin.map(function (v) { return { units: v, tup: false }; });
    if ((len * 3) % 2 === 0) {
      const tri = greedyValues(len * 3 / 2);
      // 값은 전부 DIV/16의 배수이고 DIV가 3으로 나뉘므로 되돌린 길이도 정수다
      if (tri && tri.every(function (v) { return (v * 2) % 3 === 0; })) {
        return tri.map(function (v) { return { units: v * 2 / 3, tup: true }; });
      }
    }
    return null;
  }

  function tiedSplit(units, off, beat) {
    const out = [];
    let r = units;
    const o = ((off % beat) + beat) % beat;
    const into = o ? beat - o : 0;      // 다음 모음박 경계까지 남은 길이
    if (into && r > into) {             // ① 경계까지 끊는다(경계를 못 넘으면 ③이 맡는다)
      const head = fragment(into);
      if (!head) return null;
      head.reverse();                   // 박으로 들어가는 쪽은 짧은 것부터
      head.forEach(function (p) { out.push(p); });
      r -= into;
    }
    while (r >= beat) {                 // ② 온전한 박 — 한 음표로 적히는 가장 긴 묶음부터
      let k = Math.floor(r / beat), v = 0;
      for (; k >= 1; k--) if (exactValue(k * beat)) { v = k * beat; break; }
      if (!v) break;                    // beat 자체가 음표값이라 실제로는 안 걸린다
      out.push({ units: v, tup: false }); r -= v;
    }
    if (r > 0) {                        // ③ 꼬리 — 긴 것부터
      const tail = fragment(r);
      if (!tail) return null;
      tail.forEach(function (p) { out.push(p); });
    }
    return out.length ? out : null;
  }

  // **길이 하나를 실제로 어떻게 적을 것인가** — 내보내기가 쓰는 창구.
  //   [{ units, tup }] · 적을 길이가 아니면 null(부르는 쪽이 음표꼴 없이 하나로 낸다).
  // 차례가 곧 규칙이다: ① 음표 하나로 떨어지면 그대로 ② **한 박 안에 들면서** 셋잇단으로
  // 떨어지면 셋잇단 ③ 아니면 박을 기준으로 갈라 붙임줄로 잇는다.
  // ②의 '한 박 안에' 조건이 없으면 정간을 걸친 음이 통째로 셋잇단이 되어(길타령에서
  // '점점2분음표 3:2'가 나왔다) 잇단이 박을 가로지른다 — 셋잇단은 한 박 안의 일이다.
  function writeAs(units, off, beat) {
    if (!(units > 0) || !(beat > 0)) return null;
    const o = ((off % beat) + beat) % beat;
    // **박 한가운데서 시작해 박을 넘는 음은 한 음표로 떨어지더라도 박에서 가른다.**
    // 안 그러면 그 음이 걸치고 있던 잇단 묶음이 반 토막으로 남아 박이 안 보인다 —
    // 3분박 박의 셋째 자리에서 시작해 다음 박까지 끄는 음이 4분음표 하나로 적히면,
    // 남은 두 음만으로 '3' 괄호가 쳐지고 다음 박에도 외톨이 잇단이 생겼다.
    // 박 머리에서 시작하는 음은 그대로 둔다 — 12/8의 점2분음표(두 정간)는 제 꼴이다.
    const crossesFromMid = o > 0 && o + units > beat + 1e-6;
    if (!crossesFromMid && exactValue(units)) return [{ units: units, tup: false }];
    if (o + units <= beat + 1e-6 && tupletValue(units)) return [{ units: units, tup: true }];
    return tiedSplit(units, off, beat);
  }

  root.JGB_STAFF_CORE = {
    DIV: DIV, JG: JG, ACC: ACC, CLEF: CLEF,
    timeSig: timeSig, timeTop: timeTop, TIME_TYPES: TIME_TYPES, quarterRatio: quarterRatio,
    ledgersFor: ledgersFor, pickClef: pickClef,
    fifthsFor: fifthsFor, pitchAt: pitchAt,
    exactValue: exactValue, nearestValue: nearestValue,
    beatGroups: beatGroups, tupletValue: tupletValue, writeAs: writeAs
  };
})(typeof window !== "undefined" ? window : globalThis);
