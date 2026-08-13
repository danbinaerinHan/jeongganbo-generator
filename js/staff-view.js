// 오선보 그리기 — app.js의 buildStaffScores()가 만든 재료를 SVG로 그린다.
// 외부 라이브러리 없이 직접 그리는 건 이 리포의 원칙(링크 공유의 압축과 같은 이유) —
// 악보 그리기 라이브러리는 하나같이 수백 KB이고, 여기서 그릴 것은 홑가락 몇 줄뿐이다.
//
// app.js를 한 줄도 안 본다. 음이름·조표·음표꼴은 js/staff-core.js와 나눠 쓰므로
// 파일로 내보내는 MusicXML(js/musicxml.js)과 **같은 셈에서 나온 같은 악보**다.
//
//   render(scores, opts) → SVG 문자열
//   scores = [{ name, abbr, fifths, clef:"G"|"F", beats, jg, unit, measures:[[음표…]] }]
//   음표   = { midi, rest, units, graces:[midi], afters:[midi], tieStart, tieStop }
//   opts   = { width, scale }
//
// ── 왜 '비례 간격'인가 ────────────────────────────────────────────────
// 정간보의 분박은 5등분·7등분처럼 서양 음표값으로 안 떨어지는 것이 흔하다. 그걸 억지로
// 음표값에 맞추면 없는 쉼표·잇단음표를 지어내야 한다. 그래서 **음표꼴은 가장 가까운 것으로
// 그리되 가로 자리는 실제 길이에 비례**해 놓는다 — 길이의 진실은 자리가, 대강의 모양은
// 음표꼴이 말한다. 파일로 내보내는 MusicXML은 길이를 정확히 적으므로 거기서 진짜 값을 본다.
//
// ── 굵기·크기는 전부 '오선 한 칸(SP)'의 비율 ─────────────────────────
// 조판에서 모든 치수는 오선 칸을 단위로 정해져 있다(Behind Bars·SMuFL의 값). 예전엔 선을
// 고정 px(오선 1px·기둥 1.2px)로 그려서 크게 볼수록 실처럼 가늘어지고 작게 보면 뭉갰다.
// **새 요소를 그릴 때도 px를 직접 쓰지 말고 아래 metrics()의 값을 쓸 것.**
//
// ── 글리프 ───────────────────────────────────────────────────────────
// 자리표·임시표·쉼표·꼬리·박자표는 **Bravura에서 떠 온 패스**다(js/staff-glyphs.js, 생성 파일).
// 예전엔 유니코드 글자로 찍었는데 그러면 시스템 폰트에서 빌려오게 되고, 악보 글꼴이 없는
// 컴퓨터에서는 𝄞가 Apple Symbols·♭이 Times에서 나왔다 — 악보용으로 그려진 글자가 아니라
// 획 굵기가 음표와 안 맞고 모양도 조판 관행과 달라, 악보가 '손글씨처럼' 보이던 까닭이다.
// 패스는 기준점이 SMuFL 규약대로 박혀 있어 놓을 자리에 translate하고 SP로 scale하면 끝이라,
// 폰트마다 다른 잉크 상자를 재던 일도 함께 없어졌다.
//
// **음표머리만 아직 회전한 타원**이다 — 실물과 거의 같은 데다 기둥 붙는 자리·점·덧줄 길이가
// 전부 headRx 하나를 기준으로 짜여 있어, 패스로 바꾸면 그 셈이 통째로 흔들린다.
(function (root) {
  "use strict";

  const C = root.JGB_STAFF_CORE;
  const G = root.JGB_STAFF_GLYPHS || {};
  // 자리표 표는 staff-core에 있다 — 고르는 쪽(app.js)·파일(musicxml)과 같은 것을 봐야 한다.
  const CLEF = C.CLEF;
  // 조표에서 임시표가 붙는 자리(높은음자리표 기준, 맨 아랫줄을 0으로 센 반칸 수).
  // 내림표 B♭4는 가운뎃줄(4), 올림표 F♯5는 맨 윗줄(8)에서 시작한다.
  // 올림표 G♯이 오선 위(9)로 올라가는 건 관행이 그래서다 — 낮춰 적으면 안 된다.
  const FLAT_ROWS = [4, 7, 3, 6, 2, 5, 1];    // B E A D G C F
  const SHARP_ROWS = [8, 5, 9, 6, 3, 7, 4];   // F C G D A E B

  // 오선 한 칸을 1로 본 치수표. 이 값들이 '악보처럼 보이는가'를 거의 다 결정한다.
  function metrics(SP) {
    return {
      SP: SP,
      line: SP * 0.13,        // 오선 줄
      stem: SP * 0.12,        // 기둥
      beam: SP * 0.5,         // 빔 두께
      beamGap: SP * 0.25,     // 빔 사이 틈(두께 + 틈 = 다음 빔까지)
      ledger: SP * 0.16,      // 덧줄
      ledgerOut: SP * 0.4,    // 덧줄이 머리 밖으로 나가는 길이(Bravura legerLineExtension)
      bar: SP * 0.16,         // 마디줄
      barThick: SP * 0.5,     // 마침줄의 굵은 쪽
      tie: SP * 0.12,         // 붙임줄 가운데 두께
      headRx: SP * 0.59,      // 음표머리 — 폭 1.18칸이 표준
      headRy: SP * 0.5,
      headAngle: -20,
      hollow: SP * 0.16,      // 속 빈 머리의 테두리
      stemLen: SP * 3.5,
      // 빔으로 묶인 음표는 **가장 가까운 것**이 이만큼만 되면 된다(조판의 최소 기둥).
      // 여기에도 3.5칸을 요구하면 빔이 통째로 밀려나 오선에서 손바닥만큼 떨어진다.
      stemBeam: SP * 2.6,
      dot: SP * 0.2,
      dotGap: SP * 0.38,      // 머리 오른쪽 끝에서 점까지
      graceScale: 0.62        // 꾸밈음은 본음의 62%
    };
  }

  // ── 악보 글리프 ───────────────────────────────────────────────────────
  // 자리표·임시표·쉼표·꼬리·박자표는 **Bravura에서 떠 온 패스**다(js/staff-glyphs.js).
  // 예전엔 유니코드 글자로 찍었는데, 악보 글꼴이 없는 컴퓨터에서는 𝄞가 Apple Symbols,
  // ♭이 Times에서 나왔다 — 악보용으로 그려진 글자가 아니라 획 굵기가 음표와 안 맞고
  // 모양도 조판 관행과 달라, 악보가 '손글씨처럼' 보이던 까닭이 이것이었다. 게다가 폰트마다
  // baseline이 딴판이라 크기·자리를 잡으려면 잉크 상자를 실시간으로 재야 했다.
  //
  // 패스는 **오선 한 칸을 1로 본 좌표**이고 기준점이 SMuFL 규약대로 박혀 있으므로,
  // 놓을 자리에 translate하고 SP로 scale하기만 하면 된다 — 잰다는 일 자체가 없다.
  const NO_GLYPH = { d: "", box: [0, 0, 0, 0], w: 0 };
  function gbox(key) { return G[key] || NO_GLYPH; }
  function gw(key) { return gbox(key).w; }               // 보내는 폭(칸)
  function gink(key) { const b = gbox(key).box; return b[2] - b[0]; }   // 잉크 폭(칸)
  function glyph(out, cls, key, x, y, SP, scale, attr) {
    const g = G[key];
    if (!g || !g.d) return;
    const s = SP * (scale == null ? 1 : scale);
    out.push("<path class=\"" + cls + "\"" + (attr || "") + " transform=\"translate(" + f(x) +
             " " + f(y) + ") scale(" + f(s) + ")\" d=\"" + g.d + "\" fill=\"currentColor\"/>");
  }

  // 글자 한 줄의 폭. 잉크 상자와 같은 이유로 브라우저에서는 재고, 못 재면 글자 수로 어림한다.
  const twCache = {};
  function textW(str, px, font) {
    if (!str) return 0;
    const key = str + "@" + px + "@" + font;
    if (twCache[key] != null) return twCache[key];
    let w = str.length * px * 0.95;
    try {
      const doc = root.document;
      const cx = doc && doc.createElement("canvas").getContext("2d");
      if (cx) {
        cx.font = px + "px " + font;
        const m = cx.measureText(str);
        if (m.width > 0) w = m.width;
      }
    } catch (e) { /* 어림값 그대로 */ }
    twCache[key] = w;
    return w;
  }

  // 악기 이름만 여전히 보통 글자다 — 한글이라 악보 글꼴에 있을 리 없다.
  const NAME_FONT = "system-ui,sans-serif";

  function f(v) { return Math.round(v * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function line(out, cls, x1, y1, x2, y2, w) {
    out.push("<line class=\"" + cls + "\" x1=\"" + f(x1) + "\" y1=\"" + f(y1) + "\" x2=\"" +
             f(x2) + "\" y2=\"" + f(y2) + "\" stroke=\"currentColor\" stroke-width=\"" + f(w) + "\"/>");
  }

  function render(scores, opts) {
    if (!C) return "";
    opts = opts || {};
    const list = (Array.isArray(scores) ? scores : [scores]).filter(Boolean);
    if (!list.length) return "";
    const multi = list.length > 1;
    const jgUnits = list[0].jg || C.JG.dotted;   // 정간 하나의 길이(악보가 실어 온다)
    const SP = Math.max(4, (opts.scale || 1) * 7);
    const M = metrics(SP);
    const staffH = SP * 4;
    const beats = list[0].beats;

    // 정간 하나가 먹는 가로 자리 — **가장 짧은 음이 제 자리를 갖도록** 잡는다. 비례 간격이라
    // 자리는 늘 길이에 비례하므로, 가장 짧은 음이 MIN_STEP만큼 벌어지면 나머지는 저절로 그보다
    // 넓다. 넓힐 때 곡 전체를 함께 넓혀야 비례가 안 깨지고, 총보에서는 어느 악기든 가장 짧은
    // 음에 맞춘다(악기마다 다르면 세로로 안 맞는다).
    //
    // 예전엔 '한 정간에 음표가 몇 개인가'로 셌는데, 그 셈은 음들이 정간에 **고르게 퍼져
    // 있다고 본 것**이라 한쪽으로 몰리면 어긋났다. 시김새가 앞 분박만 다섯으로 가르면
    // (`{느나르나니}황` — 앞 반 칸에 다섯, 뒤 반 칸에 하나) 실제 간격이 셈의 절반이 되어
    // 음표머리와 덧줄이 서로 겹쳤다.
    const MIN_STEP = SP * 1.75;
    const SPLIT_MAX = 16;      // 한 정간을 이보다 잘게 가르면 그 이상 넓히지 않는다
    let shortest = jgUnits;
    list.forEach(function (s) {
      s.measures.forEach(function (m) {
        m.forEach(function (n) { if (n.units > 0 && n.units < shortest) shortest = n.units; });
      });
    });
    const jgW = Math.max(SP * 4, Math.min(jgUnits / shortest, SPLIT_MAX) * MIN_STEP);
    const pxPer = jgW / jgUnits;
    const measW = beats * jgUnits * pxPer;
    const noteInset = SP * 0.9;                              // 마디줄과 첫 음 사이
    const pxIn = (measW - noteInset) / (beats * jgUnits);    // 남은 폭을 다시 비례로

    // ── 빔 묶음의 단위는 '한 박'이다 ──
    // 정간을 점4분음표·4분음표로 보면 정간 하나가 곧 한 박이라 그 안이 묶음이다. 그런데
    // **8분음표로 보면 정간 하나는 한 박이 아니다** — 정간마다 8분음표 하나씩 따로 꼬리가
    // 붙어 꼬리 숲이 되고, 12/8을 그렇게 적는 악보는 없다. 그때는 **대강이 곧 박**이므로
    // 대강으로 묶는다(정간보가 이미 갖고 있는 정보라 새로 물을 것이 없다).
    // 대강이 안 적힌 악보는 셋씩, 셋으로 안 나뉘면 둘씩 — 정악에 세 박이 흔해서다.
    const jgGroup = [];
    if (list[0].unit === "eighth") {
      const dg = list[0].daegang;
      const gs = (dg && dg.length) ? dg : [beats % 3 === 0 ? 3 : 2];
      let gi = 0, k = 0;
      for (let i = 0; i < beats; i++) {
        jgGroup[i] = gi;
        if (++k >= (gs[gi] || gs[gs.length - 1])) { k = 0; gi++; }
      }
    } else {
      for (let i = 0; i < beats; i++) jgGroup[i] = i;
    }
    const beamKey = function (cum) {
      const jg = Math.floor(cum / jgUnits + 1e-6);
      return jgGroup[Math.max(0, Math.min(beats - 1, jg))];
    };

    // 악기마다 제 자리표·음역이 있으므로 잴 것도 악기마다다. 위아래 여백을 **음역을 재서**
    // 잡는 건 고정값으로는 하배 음역이 통째로 잘리기 때문(실제로 그랬다).
    const lanes = list.map(function (s) {
      const base = CLEF[s.clef] || CLEF.G;
      let maxDia = base.dia + 8, minDia = base.dia;
      s.measures.forEach(function (m) {
        m.forEach(function (n) {
          if (n.rest) return;
          [n.midi].concat(n.graces || [], n.afters || []).forEach(function (mi) {
            const d = C.pitchAt(mi, s.fifths).dia;
            if (d > maxDia) maxDia = d;
            if (d < minDia) minDia = d;
          });
        });
      });
      return {
        s: s, base: base,
        // 고정분 3.0칸 = 기둥이 오선 밖으로 나가는 최대치에 각 번호 글자와 여백을 더한 값.
        padTop: (maxDia - (base.dia + 8)) * (SP / 2) + SP * 3.0,
        padBot: (base.dia - minDia) * (SP / 2) + SP * 3.0
      };
    });
    const laneGap = multi ? SP * 0.8 : 0;
    const sysH = lanes.reduce(function (a, L) { return a + L.padTop + staffH + L.padBot; }, 0)
                 + laneGap * (lanes.length - 1);

    // 왼쪽에 놓이는 것: 악기 이름칸 + 이음선(총보) → 자리표 → 조표 → 박자표.
    // **박자표는 첫 줄에만** 붙인다(조판 관행). 그래서 줄마다 머리 폭이 달라진다.
    // 악기 이름칸 — **총보만이 아니라 파트보에도** 낸다. 위에서 고른 악기가 오선보에도
    // 보여야 '같은 것을 보고 있다'가 되기 때문. 이름이 아예 없으면(악기 무지정 파트보)
    // 자리를 안 낸다. 폭은 가장 긴 이름을 재서 잡는다 — 3.6칸 고정이던 때는 긴 이름이
    // 왼쪽으로 삐져나갔다. 첫 줄은 온이름, 둘째 줄부터 약어(정간보의 곡 머리 규칙과 같다).
    const nameSize = SP * 1.15;
    const labels = list.map(function (s, i) {
      return { full: s.name || (multi ? "악기 " + (i + 1) : ""), abbr: s.abbr || "" };
    });
    const labelW = labels.reduce(function (m, L) {
      return Math.max(m, textW(L.full, nameSize, NAME_FONT), textW(L.abbr, nameSize, NAME_FONT));
    }, 0);
    const labelPad = labelW ? SP * 0.5 : 0;
    const nAcc = Math.max.apply(null, list.map(function (s) { return Math.abs(s.fifths); }));

    // 자리표 — 글리프가 제 기준점(가리키는 줄)을 갖고 있으므로 놓을 자리만 정하면 된다.
    // 악기마다 자리표가 다를 수 있으므로(총보) 폭은 가장 넓은 것에 맞춘다.
    const clefLead = SP * 0.55;
    const clefW = clefLead + Math.max.apply(null, list.map(function (s) {
      return gink((CLEF[s.clef] || CLEF.G).glyph);
    })) * SP + SP * 0.7;

    // 조표 — 임시표 잉크 폭에 틈을 더해 한 칸씩 나아간다.
    const accKey = list[0].fifths < 0 ? "flat" : "sharp";
    const accStep = (gink(accKey) + 0.1) * SP;
    const keyW = nAcc ? nAcc * accStep + SP * 0.4 : 0;

    // 박자표 — 각 하나가 한 마디이므로 여기 적히는 수가 곧 '한 각이 몇 박인가'다.
    // 셈은 staff-core에 있다(파일로 나가는 MusicXML과 같은 답이라야 한다).
    const ts = C.timeSig(list[0].unit, beats);
    const timeTop = String(ts.beats);
    const timeBot = String(ts.type);
    const digitsW = function (s) {
      let w = 0;
      for (let i = 0; i < s.length; i++) w += gw("time" + s[i]);
      return w * SP;
    };
    const timeInkW = Math.max(digitsW(timeTop), digitsW(timeBot));
    const timeW = timeInkW + SP * 1.2;
    const pad = SP * 1.6;
    const leftX = pad + labelW + labelPad + (multi ? SP * 0.9 : 0);
    const headW = function (si) { return clefW + keyW + (si === 0 ? timeW : 0); };

    // ── 마디를 줄(system)로 묶기 ──
    // 각 하나가 창보다 넓으면 줄을 못 나눈다 — 그때는 SVG가 창보다 넓어지고 창이 가로로
    // 스크롤한다. 각을 쪼개 두 줄에 걸치게 하지 않는 건 '각 = 마디'가 이 악보의 뼈대라서다.
    const width = Math.max(320, Math.max(opts.width || 900, leftX + headW(0) + measW + pad));
    const perSys = Math.max(1, Math.floor((width - leftX - headW(0) - pad) / measW));
    const nMeas = Math.max.apply(null, list.map(function (s) { return s.measures.length; }));
    const systems = [];
    for (let i = 0; i < nMeas; i += perSys) systems.push(i);
    if (!systems.length) systems.push(0);

    const out = [];
    const H = sysH * systems.length + SP;
    // 줄(system) 높이와 줄 수를 붙여 내보낸다 — 인쇄가 이 그림을 **줄 경계에서** 잘라 쪽을
    // 나눈다(app.js '오선보 인쇄'). 줄마다 높이가 같으므로 자를 자리를 밖에서 셀 수 있고,
    // 그리기 셈을 인쇄 쪽에 한 벌 더 적지 않아도 된다.
    out.push("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + Math.round(width) +
             "\" height=\"" + Math.round(H) + "\" viewBox=\"0 0 " + Math.round(width) + " " +
             Math.round(H) + "\" class=\"staff-svg\" data-sys-h=\"" + f(sysH) +
             "\" data-sys-count=\"" + systems.length + "\" data-top=\"" + f(SP * 0.5) + "\">");

    systems.forEach(function (m0, si) {
      // 줄 경계 표시 — 인쇄가 이 자리에서 그림을 갈라 쪽마다 제 줄만 싣는다(app.js
      // staffSheetPages). 주석인 까닭은 <g>로 묶으면 안쪽 <g>와 짝이 헷갈리기 때문이고,
      // 브라우저·PNG·인쇄 어디서도 그려지지 않아 그림에 영향이 없다.
      out.push("<!--sys-->");
      const count = Math.min(perSys, nMeas - m0);
      const musicX = leftX + headW(si);
      const right = musicX + count * measW;
      const lastSys = m0 + count >= nMeas;
      let y = SP * 0.5 + si * sysH;
      const laneTops = [];

      lanes.forEach(function (L, li) {
        const top = y + L.padTop, bottom = top + staffH;
        laneTops.push({ top: top, bottom: bottom });
        y = bottom + L.padBot + laneGap;
        const yOf = function (dia) { return bottom - (dia - L.base.dia) * (SP / 2); };

        for (let k = 0; k < 5; k++) line(out, "sv-staff", leftX, top + k * SP, right, top + k * SP, M.line);

        // 자리표 — 기준점이 '이 자리표가 가리키는 줄'이라 그 줄에 그대로 놓는다.
        glyph(out, "sv-clef", L.base.glyph,
              leftX + clefLead - gbox(L.base.glyph).box[0] * SP,
              bottom - L.base.at * (SP / 2), SP);

        const rows = L.s.fifths < 0 ? FLAT_ROWS : SHARP_ROWS;
        const accG = L.s.fifths < 0 ? "flat" : "sharp";
        for (let k = 0; k < Math.abs(L.s.fifths); k++) {
          // 낮은음자리표는 조표 자리가 오선 두 칸(한 도) 아래로 내려간다
          const row = rows[k] - (L.s.clef === "F" ? 2 : 0);
          glyph(out, "sv-key", accG, leftX + clefW + k * accStep,
                bottom - row * (SP / 2), SP);
        }

        // 박자표 — 위아래 숫자를 오선의 위쪽 절반·아래쪽 절반 한가운데에.
        // 숫자 글리프가 제 줄에 세로로 가운데 맞춰져 있어 그 줄에 놓기만 하면 된다.
        if (si === 0) {
          const cx = leftX + clefW + keyW + timeW / 2;
          const num = function (s, cy) {
            let x = cx - digitsW(s) / 2;
            for (let i = 0; i < s.length; i++) {
              // 어느 숫자인지는 패스만 봐서는 알 수 없다 — 검사와 디버깅용으로 적어 둔다
              glyph(out, "sv-time", "time" + s[i], x, cy, SP, 1, " data-t=\"" + s[i] + "\"");
              x += gw("time" + s[i]) * SP;
            }
          };
          num(timeTop, top + SP);
          num(timeBot, top + SP * 3);
        }

        // 악기 이름 — 첫 줄은 온이름, 둘째 줄부터 약어(정간보의 곡 머리·둘째 줄 규칙과 같다).
        // 약어가 없으면 둘째 줄부터는 안 적는다 — 솔로 악보에서 줄마다 이름이 되풀이되면
        // 알려 주는 것 없이 눈만 붙든다(조판에서도 이름은 첫 줄에만 적는 것이 보통이다).
        if (labelW) {
          const label = si === 0 ? labels[li].full : labels[li].abbr;
          if (label) {
            out.push("<text class=\"sv-name\" x=\"" + f(leftX - labelPad - (multi ? SP * 0.9 : 0)) +
                     "\" y=\"" + f(top + staffH / 2 + SP * 0.4) + "\" text-anchor=\"end\" font-size=\"" +
                     f(nameSize) + "\" fill=\"currentColor\" opacity=\".75\" " +
                     "font-family=\"" + NAME_FONT + "\">" + esc(label) + "</text>");
          }
        }

        for (let mi = 0; mi < count; mi++) {
          const meas = L.s.measures[m0 + mi];
          const mx = musicX + mi * measW;
          // 각 번호는 맨 위 악기에만 — 악기마다 붙이면 같은 숫자가 세로로 겹쳐 찍힌다.
          if (li === 0) {
            out.push("<text class=\"sv-num\" x=\"" + f(mx + SP * 0.2) + "\" y=\"" + f(top - SP * 0.7) +
                     "\" font-size=\"" + f(SP * 1.1) + "\" fill=\"currentColor\" opacity=\".55\" " +
                     "font-family=\"system-ui,sans-serif\">" + (m0 + mi + 1) + "</text>");
          }
          if (meas) {
            let cum = 0;
            const laid = [];
            meas.forEach(function (n) {
              // 마디 첫 음은 마디줄에서 조금 띄운다 — 그냥 두면 머리 왼쪽 반이 줄에 물린다.
              // 띄운 만큼 남은 폭을 다시 비례로 나누므로 '길이 = 자리'는 그대로다.
              laid.push({ n: n, x: mx + noteInset + cum * pxIn, jg: beamKey(cum),
                          v: C.nearestValue(n.units) });
              cum += n.units;
            });
            drawNotes(out, laid, yOf, M, L.s.fifths, L.base);
          }
          // 마디줄 — 곡의 맨 끝은 마침줄(가는 줄 + 굵은 줄)
          const bx = mx + measW;
          if (lastSys && mi === count - 1) {
            // 마침줄의 가는 쪽은 다른 이름을 준다 — 마디 수를 셀 때 한 마디가 둘로 세어지지 않게
            line(out, "sv-bar-thin", bx - M.barThick - SP * 0.3, top, bx - M.barThick - SP * 0.3, bottom, M.bar);
            out.push("<rect class=\"sv-bar sv-bar-end\" x=\"" + f(bx - M.barThick) + "\" y=\"" + f(top) +
                     "\" width=\"" + f(M.barThick) + "\" height=\"" + f(staffH) + "\" fill=\"currentColor\"/>");
          } else {
            line(out, "sv-bar", bx, top, bx, bottom, M.bar);
          }
        }
      });

      // 총보 이음선 — 악기들이 한 벌임을 보이는 왼쪽 세로줄
      if (multi) {
        out.push("<rect class=\"sv-brace\" x=\"" + f(leftX - M.barThick) + "\" y=\"" +
                 f(laneTops[0].top) + "\" width=\"" + f(M.barThick) + "\" height=\"" +
                 f(laneTops[laneTops.length - 1].bottom - laneTops[0].top) + "\" fill=\"currentColor\"/>");
      }
    });

    out.push("</svg>");
    return out.join("");
  }

  // 한 마디의 음표를 그린다. 빔은 **한 박 안에서만** 묶는다 — 박을 넘겨 묶으면 정간보와
  // 견주기 어려워진다. 무엇이 한 박인지(정간이냐 대강이냐)는 render가 정해 `L.jg`로 준다.
  function drawNotes(out, laid, yOf, M, fifths, base) {
    const SP = M.SP;
    const midDia = base.dia + 4;   // 가운뎃줄
    laid.forEach(function (L) {
      const n = L.n;
      if (n.rest) {
        drawRest(out, L.x, yOf(midDia), M, L.v);
        for (let d = 0; d < L.v.dots; d++) {
          out.push("<circle class=\"sv-dot\" cx=\"" +
                   f(L.x + M.headRx + M.dotGap + M.dot + d * SP * 0.45) + "\" cy=\"" +
                   f(yOf(midDia) - SP * 0.5) + "\" r=\"" + f(M.dot) + "\" fill=\"currentColor\"/>");
        }
        return;
      }
      const p = C.pitchAt(n.midi, fifths);
      L.y = yOf(p.dia); L.dia = p.dia; L.acc = p.acc;
      L.up = p.dia < midDia;   // 가운뎃줄보다 아래면 기둥이 위로
    });

    // 이웃까지의 거리 — 덧줄 길이를 여기에 맞춰 줄인다(아래 ledgers 참고)
    laid.forEach(function (L, i) {
      let room = Infinity;
      if (i > 0) room = Math.min(room, L.x - laid[i - 1].x);
      if (i < laid.length - 1) room = Math.min(room, laid[i + 1].x - L.x);
      L.room = room;
    });

    // 빔 묶음 — 같은 정간 안에서 꼬리가 있는 음표가 둘 이상 이어질 때.
    // 다만 **묶음이 다루는 음역이 너무 넓으면 거기서 끊는다**: 빔은 묶음의 가장 낮은(높은)
    // 음 바깥에 놓여야 하므로, 옥타브를 훌쩍 넘는 도약을 한 묶음에 담으면 반대쪽 음의
    // 기둥이 오선을 통째로 가로지른다(중청황과 황을 함께 묶었을 때 9칸이 나왔다).
    // 조판에서도 그런 자리는 빔을 끊고 꼬리로 적는다.
    const SPAN_MAX = 9;   // 음이름 자리 수(한 칸 = 2) — 9면 옥타브를 조금 넘는 폭
    const groups = [];
    let g = null;
    laid.forEach(function (L) {
      if (L.n.rest || !L.v.flags) { g = null; return; }
      const wide = g && Math.max(g.hi, L.dia) - Math.min(g.lo, L.dia) > SPAN_MAX;
      if (g && g.jg === L.jg && !wide) {
        g.items.push(L);
        g.lo = Math.min(g.lo, L.dia); g.hi = Math.max(g.hi, L.dia);
      } else {
        g = { jg: L.jg, items: [L], lo: L.dia, hi: L.dia };
        groups.push(g);
      }
    });
    groups.forEach(function (grp) {
      if (grp.items.length < 2) return;
      // 묶음의 기둥 방향은 머릿수가 아니라 **가운뎃줄에서 가장 먼 음**이 정한다(조판 관행).
      // 머릿수로 정하면 한 음만 멀리 떨어져 있을 때 빔이 그 음 너머로 밀려나, 나머지 기둥이
      // 오선을 통째로 가로지를 만큼 길어진다.
      const far = grp.items.reduce(function (m, L) {
        return Math.abs(L.dia - midDia) > Math.abs(m.dia - midDia) ? L : m;
      });
      const up = far.dia < midDia;
      grp.items.forEach(function (L) { L.up = up; L.beamed = grp; });
      grp.max = Math.max.apply(null, grp.items.map(function (L) { return L.v.flags; }));
    });

    laid.forEach(function (L) { if (!L.n.rest) drawNote(out, L, M, yOf, base, fifths); });

    groups.forEach(function (grp) {
      if (grp.items.length < 2) return;
      const a = grp.items[0], b = grp.items[grp.items.length - 1];
      const dir = a.up ? 1 : -1;

      // 빔은 **음높이를 따라 기울인다** — 평평한 빔만 쓰면 오르내리는 가락이 뻣뻣해 보인다.
      // 기울기는 조판 관행대로 얕게 누른다(양 끝 음높이 차의 0.5배, 최대 2칸). 더 눕히면
      // 도약이 큰 묶음에서 빔이 가락을 못 따라가 나머지 기둥이 통째로 길어진다.
      const rise = Math.max(-SP * 2, Math.min(SP * 2, (b.y - a.y) * 0.5));
      const span = (b.stemX - a.stemX) || 1;
      // 어느 음표에서도 기둥이 제 길이보다 짧아지지 않게 빔 전체를 밀어 준다
      let shift = 0;
      grp.items.forEach(function (L) {
        const t = a.y + rise * ((L.stemX - a.stemX) / span);
        const need = L.y + (a.up ? -M.stemBeam : M.stemBeam);
        shift = a.up ? Math.min(shift, need - t) : Math.max(shift, need - t);
      });
      const beamY = function (x) { return a.y + shift + rise * ((x - a.stemX) / span); };

      grp.items.forEach(function (L) {
        line(out, "sv-stem", L.stemX, L.y, L.stemX, beamY(L.stemX), M.stem);
      });
      // 첫 빔은 묶음 전체를 가로지르고, 둘째부터는 **그만큼 짧은 음표가 이어지는 자리에만**
      // 얹힌다(8분+16분이 섞이면 16분 쪽에만 둘째 빔이 붙는 조판 규칙). 짧은 음표가 홀로면
      // 이을 데가 없으므로 몽당빔을 앞쪽으로 조금 내민다.
      for (let k = 0; k < grp.max; k++) {
        const off = dir * k * (M.beam + M.beamGap);
        const bar = function (x1, x2) {
          const h = a.up ? 0 : -M.beam;
          const y1 = beamY(x1) + off + h, y2 = beamY(x2) + off + h;
          out.push("<path class=\"sv-beam\" d=\"M" + f(x1) + " " + f(y1) + " L" + f(x2) + " " + f(y2) +
                   " L" + f(x2) + " " + f(y2 + M.beam) + " L" + f(x1) + " " + f(y1 + M.beam) +
                   " Z\" fill=\"currentColor\"/>");
        };
        if (k === 0) { bar(a.stemX, b.stemX); continue; }
        let run = null;
        grp.items.forEach(function (L, i) {
          const on = L.v.flags > k;
          if (on && !run) run = { a: L, b: L };
          else if (on) run.b = L;
          if ((!on || i === grp.items.length - 1) && run) {
            if (run.a === run.b) bar(run.a.stemX - SP * 0.8, run.a.stemX);
            else bar(run.a.stemX, run.b.stemX);
            run = null;
          }
        });
      }
    });

    // 붙임줄 — 이어지는 짝이 같은 줄에 있으면 거기까지, 아니면 짧게 내민다.
    // 가운데가 두툼한 초승달 꼴이라야 악보처럼 보인다(한 줄 곡선은 실처럼 보인다).
    laid.forEach(function (L, i) {
      if (L.n.rest || !L.n.tieStart) return;
      const nx = laid[i + 1] && !laid[i + 1].n.rest ? laid[i + 1] : null;
      const x1 = L.x + M.headRx * 1.15, x2 = nx ? nx.x - M.headRx * 1.15 : L.x + SP * 2.2;
      if (x2 <= x1) return;
      const dir = L.up ? 1 : -1;
      const y = L.y + dir * SP * 0.85;
      const cx = (x1 + x2) / 2, bulge = dir * Math.min(SP * 1.0, (x2 - x1) * 0.35);
      out.push("<path class=\"sv-tie\" d=\"M" + f(x1) + " " + f(y) +
               " Q" + f(cx) + " " + f(y + bulge) + " " + f(x2) + " " + f(y) +
               " Q" + f(cx) + " " + f(y + bulge - dir * M.tie * 2) + " " + f(x1) + " " + f(y) +
               " Z\" fill=\"currentColor\"/>");
    });
  }

  function drawNote(out, L, M, yOf, base, fifths) {
    const SP = M.SP, n = L.n;
    // 꾸밈음 — 붙임 시김새다. 길이를 안 먹으므로 본음 앞뒤에서 자리만 빌린다.
    const gs = (n.graces || []);
    gs.forEach(function (m, k) {
      drawGrace(out, L.x - (gs.length - k) * SP * 1.3, yOf(C.pitchAt(m, fifths).dia), M);
    });
    (n.afters || []).forEach(function (m, k) {
      drawGrace(out, L.x + SP * (1.6 + k * 1.3), yOf(C.pitchAt(m, fifths).dia), M);
    });
    if (L.acc != null) {
      const ak = L.acc > 0 ? "sharp" : L.acc < 0 ? "flat" : "natural";
      glyph(out, "sv-acc", ak, L.x - M.headRx - SP * 0.28 - gink(ak) * SP, L.y, SP);
    }
    ledgers(out, L, M, yOf, base);
    const filled = L.v.head === "q";
    out.push("<ellipse class=\"sv-head\" cx=\"" + f(L.x) + "\" cy=\"" + f(L.y) + "\" rx=\"" +
             f(M.headRx) + "\" ry=\"" + f(M.headRy) + "\" transform=\"rotate(" + M.headAngle + " " +
             f(L.x) + " " + f(L.y) + ")\" " +
             (filled ? "fill=\"currentColor\""
                     : "fill=\"none\" stroke=\"currentColor\" stroke-width=\"" + f(M.hollow) + "\"") +
             "/>");
    L.stemX = L.x + (L.up ? M.headRx - M.stem / 2 : -M.headRx + M.stem / 2);
    if (L.v.head !== "whole" && !L.beamed) {
      const tip = L.y + (L.up ? -M.stemLen : M.stemLen);
      line(out, "sv-stem", L.stemX, L.y, L.stemX, tip, M.stem);
      // 꼬리는 **개수마다 제 글리프가 따로 있다** — 8분음표 꼬리를 겹쳐 쌓는 게 아니다.
      // 기준점이 기둥 끝이라 기둥의 바깥쪽 모서리에 그대로 놓는다.
      flag(out, L.stemX + (L.up ? -M.stem / 2 : M.stem / 2), tip, L.up, L.v.flags, M);
    }
    for (let d = 0; d < L.v.dots; d++) {
      // 점은 칸 안에 놓는다 — 음표가 줄 위에 있으면 반 칸 올린다
      const onLine = Math.abs((L.dia - base.dia) % 2) < 0.01;
      out.push("<circle class=\"sv-dot\" cx=\"" +
               f(L.x + M.headRx + M.dotGap + M.dot + d * SP * 0.45) + "\" cy=\"" +
               f(L.y - (onLine ? SP * 0.5 : 0)) + "\" r=\"" + f(M.dot) + "\" fill=\"currentColor\"/>");
    }
  }

  // 꼬리(flag) — 꼬리 수마다 글리프가 따로 있다(8분·16분·32분·64분). 기준점이 기둥 끝이다.
  const FLAG_KEYS = ["flag8th", "flag16th", "flag32nd", "flag64th"];
  function flag(out, x, y, up, count, M, scale) {
    const key = FLAG_KEYS[Math.min(FLAG_KEYS.length, Math.max(1, count)) - 1] + (up ? "Up" : "Down");
    glyph(out, "sv-flag", key, x, y, M.SP, scale);
  }

  // 덧줄은 머리보다 조금 길어야 하지만 **이웃과 맞붙으면 안 된다** — 시김새가 한 정간을
  // 다섯으로 가르면 음 사이가 덧줄 폭보다 좁아져, 여러 음의 덧줄이 이어 붙어 검은 판으로
  // 뭉쳤다. 이웃까지의 거리에 맞춰 줄이되, 머리는 덮을 만큼은 남긴다.
  function ledgers(out, L, M, yOf, base) {
    const room = (L.room || Infinity) / 2 - M.SP * 0.08;
    const w = Math.max(M.headRx * 1.05, Math.min(M.headRx + M.ledgerOut, room));
    const lo = base.dia, hi = base.dia + 8;    // 오선이 덮는 자리(맨 아랫줄~맨 윗줄)
    const put = function (dia) { line(out, "sv-ledger", L.x - w, yOf(dia), L.x + w, yOf(dia), M.ledger); };
    for (let d = lo - 2; d >= L.dia; d -= 2) put(d);
    for (let d = hi + 2; d <= L.dia; d += 2) put(d);
  }

  function drawGrace(out, x, y, M) {
    const g = M.graceScale, SP = M.SP;
    out.push("<ellipse class=\"sv-grace\" cx=\"" + f(x) + "\" cy=\"" + f(y) + "\" rx=\"" +
             f(M.headRx * g) + "\" ry=\"" + f(M.headRy * g) + "\" transform=\"rotate(" +
             M.headAngle + " " + f(x) + " " + f(y) + ")\" fill=\"currentColor\"/>");
    const sx = x + M.headRx * g - M.stem / 2;
    const tip = y - M.stemLen * g;
    line(out, "sv-stem", sx, y, sx, tip, M.stem * 0.85);
    flag(out, sx - M.stem / 2, tip, true, 1, M, g);
    // 빗금 — 꾸밈음임을 알리는 표
    line(out, "sv-slash", sx - SP * 0.45 * g, tip + SP * 1.25 * g, sx + SP * 1.0 * g,
         tip + SP * 0.15 * g, M.stem * 0.9);
  }

  // 쉼표 — 꼴마다 글리프가 따로 있다. 기준점은 그 쉼표가 걸리는 줄이라, 온쉼표는 넷째 줄에
  // 매달리고 이분쉼표는 가운뎃줄에 얹히는 것이 저절로 맞는다(midY = 가운뎃줄).
  const REST_KEYS = ["restQuarter", "rest8th", "rest16th", "rest32nd", "rest64th"];
  function drawRest(out, x, midY, M, v) {
    let key, y = midY;
    if (v.head === "whole") { key = "restWhole"; y = midY - M.SP; }        // 넷째 줄에 매달린다
    else if (v.head === "half") { key = "restHalf"; }                      // 가운뎃줄에 얹힌다
    else key = REST_KEYS[Math.min(REST_KEYS.length - 1, v.flags)];
    glyph(out, "sv-rest", key, x - gink(key) * M.SP / 2, y, M.SP);
  }

  root.JGB_STAFF = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
