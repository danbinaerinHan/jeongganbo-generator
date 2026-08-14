// 오선보를 MusicXML 4.0으로 적는다.
//
// app.js를 한 줄도 안 본다 — app.js의 buildStaffScores()가 만든 그릇들과 제목만 받는다.
// 화면에 그리는 js/staff-view.js와 **같은 재료**를 받으므로, 보이는 것과 파일로 나가는 것이
// 어긋날 수 없다.
//
//   build(scores, meta) → XML 문자열
//   scores = [{ name, fifths, clef:"G"|"F", beats, bpm, unit, jg, measures:[[음표…]] }] (악기 하나면 길이 1)
//   음표   = { midi, rest, units, graces:[midi], afters:[midi], tieStart, tieStop }
//   meta   = { title, subtitle, measStart }
//            measStart = 첫 마디 번호(없으면 1) — 나란히 인쇄가 각 범위를 잘라 쪽마다
//            따로 만들 때 마디 번호가 쪽마다 1로 되돌지 않게 하는 용도.
//
// ── 환산 ─────────────────────────────────────────────────────────────
//   정간 하나 = 점4분음표(3/8) 또는 4분음표(1/4) — 악보가 unit으로 알려 준다.
//   각(=한 마디)의 박자표가 거기서 정해진다: 점4분음표면 3N/8, 4분음표면 N/4.
//   각 = 마디. 마디를 넘는 음은 붙임줄(tie)로 잇는다(그 자르기는 app.js가 이미 해 둔다).
//   음표 하나로 안 떨어지는 길이(세 정간을 끄는 음 등)도 붙임줄로 가른다 — 셈은
//   staff-core의 tiedSplit이 하고, 여기는 그 조각들을 이어 적기만 한다.
//   붙임 시김새 = 꾸밈음(<grace>, 길이를 안 먹음) · 독립 시김새 = 제 자리를 나눈 실음.
// 정간을 점4분음표로 보는 환산은 MALerLab/SejongMusic 자료와 같게 맞춘 것이라 그쪽 악보와
// 나란히 놓고 견줄 수 있다 — 바꿀 땐 그 점을 생각할 것.
(function (root) {
  "use strict";

  const C = root.JGB_STAFF_CORE;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  function build(scores, meta) {
    if (!C) throw new Error("js/staff-core.js가 먼저 실려 있어야 합니다");
    const list = Array.isArray(scores) ? scores : [scores];
    meta = meta || {};
    const out = [];

    function noteEl(o, fifths) {
      out.push("      <note>");
      if (o.grace) out.push("        <grace slash=\"yes\"/>");
      if (o.rest) out.push("        <rest/>");
      else {
        const p = C.pitchAt(o.midi, fifths);
        out.push("        <pitch>");
        out.push("          <step>" + p.step + "</step>");
        if (p.alter) out.push("          <alter>" + p.alter + "</alter>");
        out.push("          <octave>" + p.octave + "</octave>");
        out.push("        </pitch>");
      }
      if (!o.grace) out.push("        <duration>" + o.units + "</duration>");
      if (o.tieStop) out.push("        <tie type=\"stop\"/>");
      if (o.tieStart) out.push("        <tie type=\"start\"/>");
      out.push("        <voice>1</voice>");
      // <note> 안의 차례는 규격이 정해 두었다: 음표꼴 → 점 → 임시표 → 잇단 → 표현. 지킬 것.
      // 잇단이면 음표꼴은 '적히는 꼴'(tup.ty — 실제 길이의 3/2배 자리)이다.
      const ty = o.grace ? { type: "16th", dots: 0 } : o.tup ? o.tup.ty : C.exactValue(o.units);
      if (ty) {
        out.push("        <type>" + ty.type + "</type>");
        for (let d = 0; d < ty.dots; d++) out.push("        <dot/>");
      }
      // 임시표는 붙임줄로 이어지는 뒤 조각엔 안 적는다 — 같은 음이 이어지는 것뿐이라
      // 다시 적으면 마디 안에서 임시표가 두 번 찍힌다(noAcc).
      if (!o.rest && !o.grace && !o.noAcc) {
        const acc = C.pitchAt(o.midi, fifths).acc;
        if (acc != null) out.push("        <accidental>" + C.ACC[acc] + "</accidental>");
      }
      if (o.tup) {
        out.push("        <time-modification><actual-notes>" + o.tup.actual +
                 "</actual-notes><normal-notes>" + o.tup.normal +
                 "</normal-notes></time-modification>");
      }
      // 꼬리를 빔으로 잇는다 — 낱개 꼬리로 두면 음마다 깃발이 따로 붙어 어수선하다
      // (2026-08-14 사용자 확정). o.beams = 겹마다의 값 배열([1겹, 2겹, …]) — 8분과 16분이
      // 한 묶음에 섞이면 겹마다 값이 달라야 하므로 한 값이 아니라 배열로 받는다.
      (o.beams || []).forEach(function (v, i) {
        if (v) out.push("        <beam number=\"" + (i + 1) + "\">" + v + "</beam>");
      });
      const nots = [];
      if (o.tieStop) nots.push("          <tied type=\"stop\"/>");
      if (o.tieStart) nots.push("          <tied type=\"start\"/>");
      if (o.tupStart) nots.push("          <tuplet type=\"start\"/>");
      if (o.tupStop) nots.push("          <tuplet type=\"stop\"/>");
      if (nots.length) {
        out.push("        <notations>");
        nots.forEach(function (n) { out.push(n); });
        out.push("        </notations>");
      }
      out.push("      </note>");
    }

    const title = (meta.title || "").trim() || "정간보";
    const sub = (meta.subtitle || "").trim();

    out.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    out.push("<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 4.0 Partwise//EN\" " +
             "\"http://www.musicxml.org/dtds/partwise.dtd\">");
    out.push("<score-partwise version=\"4.0\">");
    out.push("  <work><work-title>" + esc(title) + "</work-title></work>");
    if (sub) out.push("  <movement-title>" + esc(sub) + "</movement-title>");
    out.push("  <identification><encoding><software>우물사이</software></encoding></identification>");

    out.push("  <part-list>");
    list.forEach(function (s, i) {
      out.push("    <score-part id=\"P" + (i + 1) + "\">");
      out.push("      <part-name>" + esc(s.name || (list.length > 1 ? "악기 " + (i + 1) : "선율")) +
               "</part-name>");
      if (s.abbr) out.push("      <part-abbreviation>" + esc(s.abbr) + "</part-abbreviation>");
      out.push("    </score-part>");
    });
    out.push("  </part-list>");

    list.forEach(function (s, pi) {
      const clef = C.CLEF[s.clef] || C.CLEF.G;
      out.push("  <part id=\"P" + (pi + 1) + "\">");
      // 각 하나가 한 마디인데 **각마다 정간 수가 다를 수 있다** — 그러면 박자표가 마디마다
      // 바뀐다. 안 바뀌는 곡에서는 예전처럼 첫 마디에만 적힌다.
      let prevMb = null;
      s.measures.forEach(function (m, mi) {
        const mb = (s.measBeats && s.measBeats[mi]) || s.beats;
        out.push("    <measure number=\"" + ((meta.measStart || 1) + mi) + "\">");
        if (mi === 0) {
          out.push("      <attributes>");
          out.push("        <divisions>" + C.DIV + "</divisions>");
          out.push("        <key><fifths>" + s.fifths + "</fifths></key>");
          // 각 하나가 한 마디다 — 박자표는 staff-core가 정한다(화면과 같은 답이라야 한다).
          const ts = C.timeSig(s.unit, mb);
          out.push("        <time><beats>" + ts.beats +
                   "</beats><beat-type>" + ts.type + "</beat-type></time>");
          out.push("        <clef><sign>" + clef.sign + "</sign><line>" + clef.line + "</line></clef>");
          out.push("      </attributes>");
          // 빠르기 표시는 첫 악기에만 — 악기마다 붙이면 같은 말이 겹쳐 찍힌다.
          // bpm은 '정간 하나에 몇'이라 단위가 곧 정간이다(점4분음표면 점을 붙인다).
          // <sound tempo>는 4분음표 기준이라 정간이 4분음표의 몇 배인지를 곱한다 —
          // 여기가 어긋나면 악보 프로그램에서 재생만 딴 빠르기로 돈다.
          if (pi === 0) {
            out.push("      <direction placement=\"above\"><direction-type><metronome>" +
                     "<beat-unit>" + ts.beatUnit + "</beat-unit>" + (ts.dot ? "<beat-unit-dot/>" : "") +
                     "<per-minute>" + s.bpm + "</per-minute></metronome></direction-type>" +
                     "<sound tempo=\"" + (s.bpm * C.quarterRatio(s.unit)) + "\"/></direction>");
          }
        } else if (mb !== prevMb) {
          // 각 길이가 바뀌는 자리 — 박자표만 다시 적는다(조표·자리표는 그대로다)
          const ts2 = C.timeSig(s.unit, mb);
          out.push("      <attributes><time><beats>" + ts2.beats +
                   "</beats><beat-type>" + ts2.type + "</beat-type></time></attributes>");
        }
        prevMb = mb;
        // 꾸밈음 묶음 — 둘 이상이면 begin/continue/end로 빔을 잇는다(하나면 빔 없음).
        // 꾸밈음은 16분음표꼴로 적으므로 두 겹이고, 겹마다 같은 값이다.
        function graceRun(list) {
          (list || []).forEach(function (g, i) {
            const v = (list.length < 2) ? null
              : i === 0 ? "begin" : i === list.length - 1 ? "end" : "continue";
            noteEl({ midi: g, grace: true, beams: v ? [v, v] : null }, s.fifths);
          });
        }
        // 셋잇단 — 표준 음표값으로 안 떨어지되(4분음표 정간의 3분박 등) 3/2배가 딱 떨어지면
        // 그 꼴에 3:2를 달아 적는다(음길이·마디 합은 그대로). 5·7분박은 여전히 음표꼴 없이
        // 간다(쓰지 않기로 확정, 2026-08-14 — 억지 잇단보다 비워 두는 쪽이 정직하다).
        const tups = m.map(function (n) {
          if (C.exactValue(n.units) || (n.units * 3) % 2) return null;
          const ty = C.exactValue(n.units * 3 / 2);
          return ty ? { actual: 3, normal: 2, ty: ty } : null;
        });
        // 잇단 묶음(괄호·숫자 3)의 경계 — 같은 정간 안에서 **길이 합이 표준 음표값이 되는
        // 자리**에서 닫는다. 정간 통째로 한 묶음이면 3분박×3(16분 셋잇단 아홉 개)이 9개짜리
        // 한 묶음이 되어 3:2라는 비율과 안 맞고 조판기가 못 그린다(2026-08-14 사용자 제보) —
        // 280×3=840(8분음표)에서 닫아야 분박마다 제 괄호가 붙는다.
        const groups = [];
        let run = [], runSum = 0;
        function closeRun() { if (run.length) groups.push(run); run = []; runSum = 0; }
        m.forEach(function (n, i) {
          const t = tups[i];
          if (!t) { closeRun(); return; }
          if (run.length && m[run[0]].cell !== n.cell) closeRun();
          run.push(i); runSum += n.units;
          if (C.exactValue(runSum)) closeRun();
        });
        closeRun();
        // 묶음마다 tuplet 시작/끝을, 꼬리 있는 같은 꼴로만 채워진 묶음이면 빔도 잇는다
        // (8분 셋잇단이 낱개 깃발로 흩어지지 않게). 꼴이 섞인 묶음은 안 잇는다 — 겹 수가
        // 다른 빔의 부분 연결(hook)까지 적으려면 셈이 한 층 더 필요한데 그런 악보가 아직 없다.
        const FLAG_N = { eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
        const marks = new Array(m.length).fill(null);
        groups.forEach(function (g) {
          const beamOk = g.length >= 2 && g.every(function (i) {
            return !m[i].rest && FLAG_N[tups[i].ty.type] && !tups[i].ty.dots &&
                   tups[i].ty.type === tups[g[0]].ty.type;
          });
          g.forEach(function (i, k) {
            marks[i] = {
              tupStart: k === 0, tupStop: k === g.length - 1,
              beam: !beamOk ? null : k === 0 ? "begin" : k === g.length - 1 ? "end" : "continue"
            };
          });
        });
        // ── 낼 음표로 펴기 ──
        // 음표꼴이 없는 길이는 **붙임줄로 갈라** 적는다 — 조판기는 음표꼴을 모르면 기둥도
        // 꼬리도 없는 머리만 그린다. 가르는 자리는 모음박(정간 = s.jg)이 정하고, 셈은
        // staff-core의 tiedSplit 한 곳에 있다(2026-08-14 사용자 요청).
        // 잇단으로 적히는 것(tups)은 이미 제 꼴이 있으므로 대상이 아니고, 2의 거듭제곱으로
        // 안 나뉘는 5·7분박은 tiedSplit이 null을 주어 예전처럼 음표꼴 없이 나간다.
        // 가른 조각까지 여기서 다 펴 두어야 **그 위에 빔을 얹을 수 있다** — 조각도 꼬리가
        // 있으면 이웃과 묶여야 하므로, 가르기와 빔을 한 벌의 목록 위에서 잇달아 셈한다.
        const beat = s.jg || C.JG[s.unit] || C.JG.dotted;
        const items = [];
        let off = 0;
        m.forEach(function (n, i) {
          const t = tups[i], mk = marks[i] || {};
          const cut = (!t && !n.rest && !C.exactValue(n.units))
            ? C.tiedSplit(n.units, off, beat) : null;
          if (cut) {
            let at = off;
            cut.forEach(function (u, k) {
              items.push({ src: n, off: at, units: u, rest: false,
                // 조각 사이는 늘 이어지고, 양 끝은 원래 음이 지고 있던 붙임줄을 물려받는다
                tieStop: k > 0 || n.tieStop,
                tieStart: k < cut.length - 1 || n.tieStart,
                noAcc: k > 0,
                graces: k === 0 ? n.graces : null,
                afters: k === cut.length - 1 ? n.afters : null });
              at += u;
            });
          } else {
            items.push({ src: n, off: off, units: n.units, rest: !!n.rest,
                         tup: t, tupStart: t && mk.tupStart, tupStop: t && mk.tupStop,
                         tupBeam: mk.beam, tupN: t ? FLAG_N[t.ty.type] : 0,
                         tieStart: n.tieStart, tieStop: n.tieStop,
                         graces: n.graces, afters: n.afters });
          }
          off += n.units;
        });

        // ── 빔 ──
        // 꼬리 있는 음표(8분음표 이하)를 **한 박 안에서** 잇는다 — 낱개 깃발로 두면 꼬리
        // 숲이 되어 못 읽는다(2026-08-14 사용자 요청). 무엇이 한 박인지는 정간 단위가
        // 정하고(8분음표 단위면 대강이 곧 박) 그 셈은 staff-core의 beatGroups에 있다 —
        // 화면(staff-view)도 같은 표를 보므로 둘의 빔이 어긋날 수 없다.
        // 끊는 자리 넷: 쉼표 · 꼬리 없는 음표(4분음표 이상) · 박 경계 · 잇단(제 빔이 따로 있다).
        const jgGroup = C.beatGroups(s.unit, mb, s.daegang);
        const beatOf = function (o) {
          const j = Math.floor(o / beat + 1e-6);
          return jgGroup[Math.max(0, Math.min(jgGroup.length - 1, j))];
        };
        const beamRuns = [];
        let openRun = null;
        items.forEach(function (it) {
          const ty = it.tup ? null : C.exactValue(it.units);
          it.flags = (!it.rest && ty) ? (FLAG_N[ty.type] || 0) : 0;
          if (!it.flags) { openRun = null; return; }
          if (openRun && beatOf(openRun[0].off) === beatOf(it.off)) openRun.push(it);
          else { openRun = [it]; beamRuns.push(openRun); }
        });
        beamRuns.forEach(function (r) {
          if (r.length < 2) return;   // 혼자면 묶을 데가 없다 — 제 깃발로 둔다
          r.forEach(function (it) { it.beams = []; });
          const deep = Math.max.apply(null, r.map(function (it) { return it.flags; }));
          // 첫 겹은 묶음 전체를 가로지르고, 둘째 겹부터는 **그만큼 짧은 음표가 이어지는
          // 자리에만** 얹힌다(8분+16분이 섞이면 16분 쪽에만 둘째 빔이 붙는 조판 규칙).
          // 그 자리가 혼자면 이을 데가 없으므로 몽당빔(hook)으로 적는다 — 앞이 있으면
          // 뒤쪽으로, 없으면 앞쪽으로 내민다.
          for (let L = 1; L <= deep; L++) {
            let i = 0;
            while (i < r.length) {
              if (r[i].flags < L) { i++; continue; }
              let j = i;
              while (j + 1 < r.length && r[j + 1].flags >= L) j++;
              if (i === j) r[i].beams[L - 1] = i > 0 ? "backward hook" : "forward hook";
              else for (let k = i; k <= j; k++) {
                r[k].beams[L - 1] = k === i ? "begin" : k === j ? "end" : "continue";
              }
              i = j + 1;
            }
          }
        });

        items.forEach(function (it) {
          graceRun(it.graces);
          noteEl(Object.assign({}, it.src, {
            units: it.units, rest: it.rest, noAcc: it.noAcc,
            tup: it.tup, tupStart: it.tupStart, tupStop: it.tupStop,
            tieStart: it.tieStart, tieStop: it.tieStop,
            // 잇단은 제 묶음이 정한 빔을 겹 수만큼 그대로 쓴다(겹마다 값이 같다)
            beams: it.tup
              ? (it.tupBeam ? new Array(it.tupN || 1).fill(it.tupBeam) : null)
              : it.beams
          }), s.fifths);
          graceRun(it.afters);
        });
        out.push("    </measure>");
      });
      out.push("  </part>");
    });
    out.push("</score-partwise>");
    return out.join("\n");
  }

  root.JGB_MUSICXML = { build: build };
})(typeof window !== "undefined" ? window : globalThis);
