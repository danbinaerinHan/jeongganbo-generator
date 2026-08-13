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
  function timeSig(unit, beats) {
    if (unit === "plain") return { beats: beats, type: 4, beatUnit: "quarter", dot: false };
    if (unit === "eighth") return { beats: beats, type: 8, beatUnit: "eighth", dot: false };
    return { beats: beats * 3, type: 8, beatUnit: "quarter", dot: true };
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

  root.JGB_STAFF_CORE = {
    DIV: DIV, JG: JG, ACC: ACC, CLEF: CLEF,
    timeSig: timeSig, quarterRatio: quarterRatio,
    ledgersFor: ledgersFor, pickClef: pickClef,
    fifthsFor: fifthsFor, pitchAt: pitchAt,
    exactValue: exactValue, nearestValue: nearestValue
  };
})(typeof window !== "undefined" ? window : globalThis);
