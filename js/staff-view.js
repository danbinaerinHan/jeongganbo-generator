// 오선보 그리기 — app.js의 buildStaffScores()가 만든 재료를 SVG로 그린다.
// 외부 라이브러리 없이 직접 그리는 건 이 리포의 원칙(링크 공유의 압축과 같은 이유) —
// 악보 그리기 라이브러리는 하나같이 수백 KB이고, 여기서 그릴 것은 홑가락 몇 줄뿐이다.
//
// app.js를 한 줄도 안 본다. 음이름·조표·음표꼴은 js/staff-core.js와 나눠 쓰므로
// 파일로 내보내는 MusicXML(js/musicxml.js)과 **같은 셈에서 나온 같은 악보**다.
//
//   render(scores, opts) → SVG 문자열
//   scores = [{ name, abbr, fifths, clef:"G"|"F", beats, jg, measures:[[음표…]] }]  (악기 하나면 길이 1)
//   음표   = { midi, rest, units, graces:[midi], afters:[midi], tieStart, tieStop }
//   opts   = { width, scale }
//
// ── 왜 '비례 간격'인가 ────────────────────────────────────────────────
// 정간보의 분박은 5등분·7등분처럼 서양 음표값으로 안 떨어지는 것이 흔하다. 그걸 억지로
// 음표값에 맞추면 없는 쉼표·잇단음표를 지어내야 한다. 그래서 **음표꼴은 가장 가까운 것으로
// 그리되 가로 자리는 실제 길이에 비례**해 놓는다 — 길이의 진실은 자리가, 대강의 모양은
// 음표꼴이 말한다. 파일로 내보내는 MusicXML은 길이를 정확히 적으므로 거기서 진짜 값을 본다.
//
// ── 글리프 ───────────────────────────────────────────────────────────
// 자리표(𝄞 𝄢)와 임시표(♭ ♯ ♮)는 유니코드 글자를 쓴다(macOS·Windows·주요 리눅스에 있음).
// 쉼표(U+1D13D~)는 **macOS에도 글리프가 없어**(빈 네모로 나옴) 직접 그린다. 자리표가
// 안 나오는 환경이 확인되면 그때 자리표도 패스로 옮길 것.
(function (root) {
  "use strict";

  const C = root.JGB_STAFF_CORE;
  // 오선 맨 아랫줄의 음이름 자리 — 높은음자리표는 E4, 낮은음자리표는 G2.
  const CLEF = { G: { dia: 4 * 7 + 2, glyph: "𝄞", y: 3, size: 4.4 },
                 F: { dia: 2 * 7 + 4, glyph: "𝄢", y: 1, size: 4.0 } };
  // 조표에서 임시표가 붙는 자리(높은음자리표 기준, 맨 아랫줄을 0으로 센 반칸 수).
  // 내림표 B♭4는 가운뎃줄(4), 올림표 F♯5는 맨 윗줄(8)에서 시작한다.
  // 올림표 G♯이 오선 위(9)로 올라가는 건 관행이 그래서다 — 낮춰 적으면 안 된다.
  const FLAT_ROWS = [4, 7, 3, 6, 2, 5, 1];    // B E A D G C F
  const SHARP_ROWS = [8, 5, 9, 6, 3, 7, 4];   // F C G D A E B

  function f(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function render(scores, opts) {
    if (!C) return "";
    opts = opts || {};
    const list = (Array.isArray(scores) ? scores : [scores]).filter(Boolean);
    if (!list.length) return "";
    const multi = list.length > 1;
    const jgUnits = list[0].jg || C.JG.dotted;   // 정간 하나의 길이(악보가 실어 온다)
    const SP = Math.max(4, (opts.scale || 1) * 7);   // 오선 칸 하나
    const staffH = SP * 4;
    const beats = list[0].beats;

    // 정간 하나가 먹는 가로 자리 — **가장 빽빽한 정간**에 맞춘다. 비례 간격이라 자리는 늘
    // 길이에 비례하는데, 한 정간에 다섯이 들어가는 곡(느나르나니 같은 시김새)에서 좁게 잡으면
    // 음표머리가 서로 겹쳐 아무것도 안 읽힌다. 넓힐 때 곡 전체를 함께 넓혀야 비례가 안 깨진다.
    // 총보에서는 어느 악기든 가장 빽빽한 것에 맞춘다 — 악기마다 다르면 세로로 안 맞는다.
    let dense = 1;
    list.forEach(function (s) {
      s.measures.forEach(function (m) {
        let cum = 0;
        const cnt = {};
        m.forEach(function (n) {
          const jg = Math.floor(cum / jgUnits + 1e-6);
          cnt[jg] = (cnt[jg] || 0) + 1;
          cum += n.units;
        });
        Object.keys(cnt).forEach(function (k) { if (cnt[k] > dense) dense = cnt[k]; });
      });
    });
    const jgW = Math.max(SP * 3.6, dense * SP * 1.6);
    const pxPer = jgW / jgUnits;
    const measW = beats * jgUnits * pxPer;

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
        // 고정분 3.0칸 = 기둥이 오선 밖으로 나가는 최대치(가운뎃줄 언저리에서 3.4칸이면
        // 오선 밖 1.4칸)에 각 번호 글자와 여백을 더한 값. 예전 4.6은 넉넉하다 못해
        // 총보에서 오선 사이가 손바닥만큼 벌어졌다.
        padTop: (maxDia - (base.dia + 8)) * (SP / 2) + SP * 3.0,
        padBot: (base.dia - minDia) * (SP / 2) + SP * 3.0
      };
    });
    const laneGap = multi ? SP * 0.8 : 0;
    const sysH = lanes.reduce(function (a, L) { return a + L.padTop + staffH + L.padBot; }, 0)
                 + laneGap * (lanes.length - 1);

    // 왼쪽: 악기 이름칸 + 이음선(총보일 때만) → 자리표 → 조표
    const labelW = multi ? SP * 3.6 : 0;
    const nAcc = Math.max.apply(null, list.map(function (s) { return Math.abs(s.fifths); }));
    const headW = SP * 3.6 + nAcc * SP * 0.62;
    const pad = SP * 1.6;
    const leftX = pad + labelW + (multi ? SP * 0.9 : 0);

    // ── 마디를 줄(system)로 묶기 ──
    // 각 하나가 창보다 넓으면 줄을 못 나눈다 — 그때는 SVG가 창보다 넓어지고 창이 가로로
    // 스크롤한다. 각을 쪼개 두 줄에 걸치게 하지 않는 건 '각 = 마디'가 이 악보의 뼈대라서다.
    const width = Math.max(320, Math.max(opts.width || 900, leftX + headW + measW + pad));
    const perSys = Math.max(1, Math.floor((width - leftX - headW - pad) / measW));
    const nMeas = Math.max.apply(null, list.map(function (s) { return s.measures.length; }));
    const systems = [];
    for (let i = 0; i < nMeas; i += perSys) systems.push(i);
    if (!systems.length) systems.push(0);

    const out = [];
    const H = sysH * systems.length + SP;
    out.push("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + Math.round(width) +
             "\" height=\"" + Math.round(H) + "\" viewBox=\"0 0 " + Math.round(width) + " " +
             Math.round(H) + "\" class=\"staff-svg\">");

    systems.forEach(function (m0, si) {
      const count = Math.min(perSys, nMeas - m0);
      const right = leftX + headW + count * measW;
      let y = SP * 0.5 + si * sysH;
      const laneTops = [];

      lanes.forEach(function (L, li) {
        const top = y + L.padTop, bottom = top + staffH;
        laneTops.push({ top: top, bottom: bottom });
        y = bottom + L.padBot + laneGap;
        const yOf = function (dia) { return bottom - (dia - L.base.dia) * (SP / 2); };

        for (let k = 0; k < 5; k++) {
          out.push("<line x1=\"" + f(leftX) + "\" y1=\"" + f(top + k * SP) + "\" x2=\"" + f(right) +
                   "\" y2=\"" + f(top + k * SP) + "\" stroke=\"currentColor\" stroke-width=\"1\"/>");
        }
        out.push("<text x=\"" + f(leftX + SP * 0.3) + "\" y=\"" + f(top + L.base.y * SP) +
                 "\" font-size=\"" + f(SP * L.base.size) + "\" fill=\"currentColor\" " +
                 "font-family=\"Bravura,'Noto Music','Segoe UI Symbol','Apple Symbols',serif\">" +
                 L.base.glyph + "</text>");
        const rows = L.s.fifths < 0 ? FLAT_ROWS : SHARP_ROWS;
        const glyph = L.s.fifths < 0 ? "♭" : "♯";
        for (let k = 0; k < Math.abs(L.s.fifths); k++) {
          // 낮은음자리표는 조표 자리가 오선 두 칸(한 도) 아래로 내려간다
          const row = rows[k] - (L.s.clef === "F" ? 2 : 0);
          out.push("<text x=\"" + f(leftX + SP * 3.4 + k * SP * 0.62) + "\" y=\"" +
                   f(bottom - row * (SP / 2) + SP * 0.42) + "\" font-size=\"" + f(SP * 2.3) +
                   "\" fill=\"currentColor\" font-family=\"serif\">" + glyph + "</text>");
        }
        // 악기 이름 — 첫 줄은 온이름, 둘째 줄부터 약어(정간보의 곡 머리·둘째 줄 규칙과 같다)
        if (multi) {
          const label = si === 0 ? (L.s.name || "악기 " + (li + 1)) : (L.s.abbr || L.s.name || "");
          if (label) {
            out.push("<text x=\"" + f(leftX - SP * 0.9) + "\" y=\"" + f(top + staffH / 2 + SP * 0.4) +
                     "\" text-anchor=\"end\" font-size=\"" + f(SP * 1.15) + "\" fill=\"currentColor\" " +
                     "opacity=\".75\" font-family=\"system-ui,sans-serif\">" + esc(label) + "</text>");
          }
        }

        // ── 마디 안 음표 ──
        for (let mi = 0; mi < count; mi++) {
          const meas = L.s.measures[m0 + mi];
          const mx = leftX + headW + mi * measW;
          // 각 번호는 맨 위 악기에만 — 악기마다 붙이면 같은 숫자가 세로로 겹쳐 찍힌다.
          if (li === 0) {
            out.push("<text x=\"" + f(mx + SP * 0.2) + "\" y=\"" + f(top - SP * 0.6) +
                     "\" font-size=\"" + f(SP * 1.1) + "\" fill=\"currentColor\" opacity=\".55\" " +
                     "font-family=\"system-ui,sans-serif\">" + (m0 + mi + 1) + "</text>");
          }
          if (meas) {
            let cum = 0;
            const laid = [];
            meas.forEach(function (n) {
              laid.push({ n: n, x: mx + cum * pxPer, jg: Math.floor(cum / jgUnits + 1e-6),
                          v: C.nearestValue(n.units) });
              cum += n.units;
            });
            drawNotes(out, laid, yOf, SP, L.s.fifths, L.base);
          }
          out.push("<line x1=\"" + f(mx + measW) + "\" y1=\"" + f(top) + "\" x2=\"" + f(mx + measW) +
                   "\" y2=\"" + f(bottom) + "\" stroke=\"currentColor\" stroke-width=\"1.4\"/>");
        }
      });

      // 총보 이음선 — 악기들이 한 벌임을 보이는 왼쪽 세로줄
      if (multi) {
        const a = laneTops[0].top, b = laneTops[laneTops.length - 1].bottom;
        out.push("<line x1=\"" + f(leftX) + "\" y1=\"" + f(a) + "\" x2=\"" + f(leftX) + "\" y2=\"" +
                 f(b) + "\" stroke=\"currentColor\" stroke-width=\"2\"/>");
      }
    });

    out.push("</svg>");
    return out.join("");
  }

  // 한 마디의 음표를 그린다. 빔은 **정간 하나 안에서만** 묶는다 — 정간이 곧 한 박이라
  // 그 안이 자연스러운 묶음이고, 박을 넘겨 묶으면 정간보와 견주기 어려워진다.
  function drawNotes(out, laid, yOf, SP, fifths, base) {
    const midDia = base.dia + 4;   // 가운뎃줄
    laid.forEach(function (L) {
      const n = L.n;
      if (n.rest) {
        drawRest(out, L.x, yOf(midDia), SP, L.v);
        for (let d = 0; d < L.v.dots; d++) {
          out.push("<circle cx=\"" + f(L.x + SP * (0.95 + d * 0.45)) + "\" cy=\"" +
                   f(yOf(midDia) - SP * 0.5) + "\" r=\"" + f(SP * 0.16) + "\" fill=\"currentColor\"/>");
        }
        return;
      }
      const p = C.pitchAt(n.midi, fifths);
      L.y = yOf(p.dia); L.dia = p.dia; L.acc = p.acc;
      L.up = p.dia < midDia;   // 가운뎃줄보다 아래면 기둥이 위로
    });

    // 빔 묶음 — 같은 정간 안에서 꼬리가 있는 음표가 둘 이상 이어질 때
    const groups = [];
    let g = null;
    laid.forEach(function (L) {
      if (L.n.rest || !L.v.flags) { g = null; return; }
      if (g && g.jg === L.jg) g.items.push(L);
      else { g = { jg: L.jg, items: [L] }; groups.push(g); }
    });
    groups.forEach(function (grp) {
      if (grp.items.length < 2) return;
      const up = grp.items.filter(function (L) { return L.up; }).length * 2 >= grp.items.length;
      grp.items.forEach(function (L) { L.up = up; L.beamed = grp; });
      grp.max = Math.max.apply(null, grp.items.map(function (L) { return L.v.flags; }));
    });

    laid.forEach(function (L) { if (!L.n.rest) drawNote(out, L, SP, yOf, base, fifths); });

    groups.forEach(function (grp) {
      if (grp.items.length < 2) return;
      const a = grp.items[0], b = grp.items[grp.items.length - 1];
      // 둘째 빔부터는 **머리 쪽으로** 쌓인다 — 기둥이 위면 아래로, 아래면 위로.
      const dir = a.up ? 1 : -1;
      // 기둥 끝은 묶음 안에서 가장 멀리 나간 것에 맞춰 가지런히 — 빔이 기울지 않게 평평히
      const tip = grp.items.reduce(function (m, L) {
        return a.up ? Math.min(m, L.y - SP * 3.4) : Math.max(m, L.y + SP * 3.4);
      }, a.up ? Infinity : -Infinity);
      grp.items.forEach(function (L) {
        out.push("<line x1=\"" + f(L.stemX) + "\" y1=\"" + f(L.y) + "\" x2=\"" + f(L.stemX) +
                 "\" y2=\"" + f(tip) + "\" stroke=\"currentColor\" stroke-width=\"1.2\"/>");
      });
      // 첫 빔은 묶음 전체를 가로지르고, 둘째부터는 **그만큼 짧은 음표가 이어지는 자리에만**
      // 얹힌다(8분+16분이 섞이면 16분 쪽에만 둘째 빔이 붙는 조판 규칙). 짧은 음표가 홀로면
      // 이을 데가 없으므로 몽당빔을 앞쪽으로 조금 내민다.
      for (let k = 0; k < grp.max; k++) {
        const y = tip + dir * k * SP * 0.62;
        const bar = function (x1, x2) {
          out.push("<rect x=\"" + f(x1) + "\" y=\"" + f(a.up ? y : y - SP * 0.38) + "\" width=\"" +
                   f(Math.max(SP * 0.5, x2 - x1)) + "\" height=\"" + f(SP * 0.38) +
                   "\" fill=\"currentColor\"/>");
        };
        if (k === 0) { bar(a.stemX, b.stemX); continue; }
        let run = null;
        grp.items.forEach(function (L, i) {
          const on = L.v.flags > k;
          if (on && !run) run = { a: L, b: L };
          else if (on) run.b = L;
          if ((!on || i === grp.items.length - 1) && run) {
            if (run.a === run.b) bar(run.a.stemX - SP * 0.6, run.a.stemX);
            else bar(run.a.stemX, run.b.stemX);
            run = null;
          }
        });
      }
    });

    // 붙임줄 — 이어지는 짝이 같은 줄에 있으면 거기까지, 아니면 짧게 내민다
    laid.forEach(function (L, i) {
      if (L.n.rest || !L.n.tieStart) return;
      const nx = laid[i + 1] && !laid[i + 1].n.rest ? laid[i + 1] : null;
      const x1 = L.x + SP * 0.7, x2 = nx ? nx.x - SP * 0.7 : L.x + SP * 2.2;
      const y = L.y + (L.up ? SP * 0.9 : -SP * 0.9);
      out.push("<path d=\"M" + f(x1) + " " + f(y) + " Q" + f((x1 + x2) / 2) + " " +
               f(y + (L.up ? SP * 0.7 : -SP * 0.7)) + " " + f(x2) + " " + f(y) +
               "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.1\"/>");
    });
  }

  function drawNote(out, L, SP, yOf, base, fifths) {
    const n = L.n;
    // 꾸밈음 — 붙임 시김새다. 길이를 안 먹으므로 본음 앞뒤에서 자리만 빌린다.
    const gs = (n.graces || []);
    gs.forEach(function (m, k) {
      drawGrace(out, L.x - (gs.length - k) * SP * 1.25, yOf(C.pitchAt(m, fifths).dia), SP);
    });
    (n.afters || []).forEach(function (m, k) {
      drawGrace(out, L.x + SP * (1.5 + k * 1.25), yOf(C.pitchAt(m, fifths).dia), SP);
    });
    if (L.acc != null) {
      out.push("<text x=\"" + f(L.x - SP * 1.5) + "\" y=\"" + f(L.y + SP * 0.42) +
               "\" font-size=\"" + f(SP * 2.3) + "\" fill=\"currentColor\" font-family=\"serif\">" +
               (L.acc > 0 ? "♯" : L.acc < 0 ? "♭" : "♮") + "</text>");
    }
    ledgers(out, L, SP, yOf, base);
    const rx = SP * 0.6, ry = SP * 0.46;
    const filled = L.v.head === "q";
    out.push("<ellipse cx=\"" + f(L.x) + "\" cy=\"" + f(L.y) + "\" rx=\"" + f(rx) + "\" ry=\"" +
             f(ry) + "\" transform=\"rotate(-18 " + f(L.x) + " " + f(L.y) + ")\" " +
             (filled ? "fill=\"currentColor\"" : "fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"") +
             "/>");
    L.stemX = L.x + (L.up ? rx * 0.92 : -rx * 0.92);
    if (L.v.head !== "whole" && !L.beamed) {
      const tip = L.y + (L.up ? -SP * 3.4 : SP * 3.4);
      out.push("<line x1=\"" + f(L.stemX) + "\" y1=\"" + f(L.y) + "\" x2=\"" + f(L.stemX) +
               "\" y2=\"" + f(tip) + "\" stroke=\"currentColor\" stroke-width=\"1.2\"/>");
      for (let k = 0; k < L.v.flags; k++) {
        const y = tip + (L.up ? 1 : -1) * k * SP * 0.62;
        out.push("<path d=\"M" + f(L.stemX) + " " + f(y) + " q" + f(SP * 1.1) + " " +
                 f((L.up ? 1 : -1) * SP * 0.7) + " " + f(SP * 0.25) + " " +
                 f((L.up ? 1 : -1) * SP * 1.7) + "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/>");
      }
    }
    for (let d = 0; d < L.v.dots; d++) {
      out.push("<circle cx=\"" + f(L.x + SP * (1.1 + d * 0.45)) + "\" cy=\"" +
               f(L.y - (Math.round((L.dia - base.dia)) % 2 === 0 ? SP * 0.5 : 0)) +
               "\" r=\"" + f(SP * 0.16) + "\" fill=\"currentColor\"/>");
    }
  }

  function ledgers(out, L, SP, yOf, base) {
    const w = SP * 1.05;
    const lo = base.dia, hi = base.dia + 8;    // 오선이 덮는 자리(맨 아랫줄~맨 윗줄)
    const line = function (dia) {
      out.push("<line x1=\"" + f(L.x - w) + "\" y1=\"" + f(yOf(dia)) + "\" x2=\"" + f(L.x + w) +
               "\" y2=\"" + f(yOf(dia)) + "\" stroke=\"currentColor\" stroke-width=\"1\"/>");
    };
    for (let d = lo - 2; d >= L.dia; d -= 2) line(d);
    for (let d = hi + 2; d <= L.dia; d += 2) line(d);
  }

  function drawGrace(out, x, y, SP) {
    const rx = SP * 0.42, ry = SP * 0.31;
    out.push("<ellipse cx=\"" + f(x) + "\" cy=\"" + f(y) + "\" rx=\"" + f(rx) + "\" ry=\"" +
             f(ry) + "\" transform=\"rotate(-18 " + f(x) + " " + f(y) + ")\" fill=\"currentColor\"/>");
    out.push("<line x1=\"" + f(x + rx * 0.9) + "\" y1=\"" + f(y) + "\" x2=\"" + f(x + rx * 0.9) +
             "\" y2=\"" + f(y - SP * 2.2) + "\" stroke=\"currentColor\" stroke-width=\"1\"/>");
    // 빗금 — 꾸밈음임을 알리는 표
    out.push("<line x1=\"" + f(x + rx * 0.1) + "\" y1=\"" + f(y - SP * 1.4) + "\" x2=\"" +
             f(x + rx * 1.9) + "\" y2=\"" + f(y - SP * 2.3) +
             "\" stroke=\"currentColor\" stroke-width=\"1\"/>");
  }

  // 쉼표는 유니코드에 기댈 수 없어(글리프가 없는 환경이 많다) 직접 그린다.
  function drawRest(out, x, midY, SP, v) {
    if (v.head === "whole") {   // 온쉼표 — 넷째 줄에 매달린 막대
      out.push("<rect x=\"" + f(x - SP * 0.6) + "\" y=\"" + f(midY - SP) + "\" width=\"" +
               f(SP * 1.2) + "\" height=\"" + f(SP * 0.5) + "\" fill=\"currentColor\"/>");
      return;
    }
    if (v.head === "half") {    // 이분쉼표 — 가운뎃줄 위에 얹힌 막대
      out.push("<rect x=\"" + f(x - SP * 0.6) + "\" y=\"" + f(midY - SP * 0.5) + "\" width=\"" +
               f(SP * 1.2) + "\" height=\"" + f(SP * 0.5) + "\" fill=\"currentColor\"/>");
      return;
    }
    if (!v.flags) {             // 사분쉼표 — 지그재그
      out.push("<path d=\"M" + f(x - SP * 0.3) + " " + f(midY - SP * 1.5) +
               " l" + f(SP * 0.62) + " " + f(SP * 0.9) +
               " l" + f(-SP * 0.72) + " " + f(SP * 0.95) +
               " l" + f(SP * 0.8) + " " + f(SP * 0.85) +
               "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"" + f(SP * 0.3) +
               "\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>");
      return;
    }
    // 팔분·십육분쉼표 — 비스듬한 기둥에 갈고리를 flags 수만큼
    const topY = midY - SP * (0.5 + v.flags * 0.5);
    out.push("<line x1=\"" + f(x + SP * 0.42) + "\" y1=\"" + f(topY) + "\" x2=\"" +
             f(x - SP * 0.28) + "\" y2=\"" + f(midY + SP * 1.1) +
             "\" stroke=\"currentColor\" stroke-width=\"" + f(SP * 0.16) + "\"/>");
    for (let k = 0; k < v.flags; k++) {
      const y = topY + k * SP * 0.72;
      out.push("<circle cx=\"" + f(x - SP * 0.18) + "\" cy=\"" + f(y) + "\" r=\"" + f(SP * 0.22) +
               "\" fill=\"currentColor\"/>");
      out.push("<path d=\"M" + f(x - SP * 0.18) + " " + f(y) + " q" + f(SP * 0.5) + " " +
               f(SP * 0.05) + " " + f(SP * 0.62) + " " + f(-SP * 0.28) +
               "\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"" + f(SP * 0.14) + "\"/>");
    }
  }

  root.JGB_STAFF = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
