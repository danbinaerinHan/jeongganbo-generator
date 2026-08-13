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
      if (!o.rest && !o.grace) {
        const acc = C.pitchAt(o.midi, fifths).acc;
        if (acc != null) out.push("        <accidental>" + C.ACC[acc] + "</accidental>");
      }
      if (o.tup) {
        out.push("        <time-modification><actual-notes>" + o.tup.actual +
                 "</actual-notes><normal-notes>" + o.tup.normal +
                 "</normal-notes></time-modification>");
      }
      // 꼬리를 빔으로 잇는다 — 꾸밈음 묶음(16분음표꼴 = 두 겹)과 셋잇단 묶음이 쓴다.
      // 낱개 꼬리로 두면 음마다 깃발이 따로 붙어 어수선하다(2026-08-14 사용자 확정).
      // beamN = 빔 겹 수(음표꼴이 정한다: 8분=1, 16분=2, …).
      if (o.beam) {
        for (let b = 1; b <= (o.beamN || 1); b++) {
          out.push("        <beam number=\"" + b + "\">" + o.beam + "</beam>");
        }
      }
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
      s.measures.forEach(function (m, mi) {
        out.push("    <measure number=\"" + ((meta.measStart || 1) + mi) + "\">");
        if (mi === 0) {
          out.push("      <attributes>");
          out.push("        <divisions>" + C.DIV + "</divisions>");
          out.push("        <key><fifths>" + s.fifths + "</fifths></key>");
          // 각 하나가 한 마디다 — 박자표는 staff-core가 정한다(화면과 같은 답이라야 한다).
          const ts = C.timeSig(s.unit, s.beats);
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
        }
        // 꾸밈음 묶음 — 둘 이상이면 begin/continue/end로 빔을 잇는다(하나면 빔 없음)
        function graceRun(list) {
          list.forEach(function (g, i) {
            noteEl({ midi: g, grace: true, beamN: 2,
                     beam: list.length < 2 ? null
                       : i === 0 ? "begin" : i === list.length - 1 ? "end" : "continue" },
                   s.fifths);
          });
        }
        // 셋잇단 — 표준 음표값으로 안 떨어지되(4분음표 정간의 3분박 등) 3/2배가 딱 떨어지면
        // 그 꼴에 3:2를 달아 적는다(음길이·마디 합은 그대로). 괄호(숫자 3)는 같은 정간에서
        // 난 이웃끼리 한 묶음 — cell 꼬리표가 그 경계다. 5·7분박은 여전히 음표꼴 없이 간다
        // (쓰지 않기로 확정, 2026-08-14 — 억지 잇단보다 비워 두는 쪽이 정직하다).
        const tups = m.map(function (n) {
          if (C.exactValue(n.units) || (n.units * 3) % 2) return null;
          const ty = C.exactValue(n.units * 3 / 2);
          return ty ? { actual: 3, normal: 2, ty: ty } : null;
        });
        // 잇단 묶음 안에서 꼬리 있는 같은 꼴끼리는 빔으로 잇는다(8분 셋잇단이 낱개
        // 깃발 셋으로 흩어지지 않게). 꼴이 섞인 묶음은 안 잇는다 — 겹 수가 다른 빔의
        // 부분 연결(hook)까지 적으려면 셈이 한 층 더 필요한데 그런 악보가 아직 없다.
        const FLAG_N = { eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
        const beams = new Array(m.length).fill(null);
        let run = [];
        function flushRun() {
          if (run.length >= 2) {
            beams[run[0]] = "begin";
            beams[run[run.length - 1]] = "end";
            for (let k = 1; k < run.length - 1; k++) beams[run[k]] = "continue";
          }
          run = [];
        }
        m.forEach(function (n, i) {
          const t = tups[i];
          const beamable = t && !n.rest && FLAG_N[t.ty.type] && !t.ty.dots;
          const joins = run.length && beamable &&
            m[run[0]].cell === n.cell && tups[run[0]].ty.type === t.ty.type;
          if (!joins) flushRun();
          if (beamable) run.push(i);
        });
        flushRun();
        m.forEach(function (n, i) {
          graceRun(n.graces);
          const t = tups[i];
          const joinPrev = t && i > 0 && tups[i - 1] && m[i - 1].cell === n.cell;
          const joinNext = t && i < m.length - 1 && tups[i + 1] && m[i + 1].cell === n.cell;
          noteEl(Object.assign({}, n, {
            tup: t, tupStart: t && !joinPrev, tupStop: t && !joinNext,
            beam: beams[i], beamN: t ? FLAG_N[t.ty.type] : 1
          }), s.fifths);
          graceRun(n.afters);
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
