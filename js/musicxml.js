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
//   **길이 하나를 어떻게 적을지(그대로·셋잇단·붙임줄로 가르기)는 staff-core의 writeAs가
//   정하고**, 여기는 그 조각들을 펴서 잇단 묶음과 빔을 얹어 적기만 한다.
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
        // 한 줄에 몇 마디를 놓을지 사람이 정했으면(#staffPerLine) 그 자리마다 줄바꿈을
        // **악보에 적어 둔다**. 조판은 화면(Verovio)이든 뮤즈스코어든 이 표시를 보고 접는다 —
        // 우리가 줄을 세지 않는다(Verovio 쪽은 breaks:"line"이라야 이 표시를 따른다).
        // 자리는 이 score가 품은 마디 안에서 센다 — 인쇄가 쪽마다 마디를 잘라 넘기므로,
        // 곡 전체 번호로 세면 쪽 첫 줄만 토막 나는 일이 생긴다.
        if (s.perLine > 0 && mi > 0 && mi % s.perLine === 0) {
          out.push("      <print new-system=\"yes\"/>");
        }
        if (mi === 0) {
          out.push("      <attributes>");
          out.push("        <divisions>" + C.DIV + "</divisions>");
          out.push("        <key><fifths>" + s.fifths + "</fifths></key>");
          // 각 하나가 한 마디다 — 박자표는 staff-core가 정한다(화면과 같은 답이라야 한다).
          const ts = C.timeSig(s.unit, mb, s.timeType);
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
          const ts2 = C.timeSig(s.unit, mb, s.timeType);
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
        const FLAG_N = { eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
        // ── 낼 음표로 펴기 ──
        // **길이 하나를 어떻게 적을 것인가는 staff-core의 writeAs가 정한다** — 음표 하나로
        // 떨어지면 그대로, 한 박 안에 들면서 3/2배가 떨어지면 셋잇단, 아니면 박을 기준으로
        // 갈라 붙임줄로 잇는다. 여기서 그 답을 **펴 두어야** 잇단 묶음과 빔을 그 위에 얹을
        // 수 있다 — 가르기를 내는 도중에 하면 조각이 잇단 묶음에도 빔에도 안 잡힌다.
        // 못 적는 길이(5·7분박)는 null이 오므로 예전처럼 음표꼴 없이 하나로 낸다.
        const beat = s.jg || C.JG[s.unit] || C.JG.dotted;
        const items = [];
        let off = 0;
        m.forEach(function (n) {
          const pieces = C.writeAs(n.units, off, beat) || [{ units: n.units, tup: false }];
          let at = off;
          pieces.forEach(function (p, k) {
            items.push({
              src: n, off: at, units: p.units, rest: !!n.rest,
              tup: p.tup ? C.tupletValue(p.units) : null,
              // 조각 사이는 늘 이어지고, 양 끝은 원래 음이 지고 있던 붙임줄을 물려받는다.
              // 쉼표는 이을 것이 없으므로 갈라도 붙임줄을 안 단다.
              tieStop: n.rest ? false : (k > 0 || n.tieStop),
              tieStart: n.rest ? false : (k < pieces.length - 1 || n.tieStart),
              noAcc: k > 0,
              graces: k === 0 ? n.graces : null,
              afters: k === pieces.length - 1 ? n.afters : null
            });
            at += p.units;
          });
          off += n.units;
        });

        // ── 잇단 묶음 ──
        // 괄호(숫자 3)의 경계는 **같은 박 안에서 길이 합이 표준 음표값이 되는 자리마다**
        // 닫는다. 박 통째로 한 묶음이면 3분박×3(16분 셋잇단 아홉)이 9개짜리 3:2 묶음이 되어
        // 비율과 안 맞고 조판기가 못 그린다(2026-08-14 사용자 제보) — 280×3=840(8분음표)에서
        // 닫아야 분박마다 제 괄호가 붙는다.
        // 꼬리 있는 같은 꼴로만 채워진 묶음이면 빔도 잇는다(8분 셋잇단이 낱개 깃발로
        // 흩어지지 않게). 꼴이 섞인 묶음은 안 잇는다 — 겹 수가 다른 빔의 부분 연결까지
        // 적으려면 셈이 한 층 더 필요한데 그런 악보가 아직 없다.
        const beatNo = function (o) { return Math.floor(o / beat + 1e-6); };
        let run = [], runSum = 0, grpNo = 0;
        function closeRun() {
          if (run.length) {
            const id = grpNo++;
            run.forEach(function (it, k) {
              it.grp = id;   // 빔이 묶음 경계를 안 넘게 하는 표(아래 '빔')
              it.tupStart = k === 0; it.tupStop = k === run.length - 1;
            });
          }
          run = []; runSum = 0;
        }
        items.forEach(function (it) {
          if (!it.tup) { closeRun(); return; }
          if (run.length && beatNo(run[0].off) !== beatNo(it.off)) closeRun();
          run.push(it); runSum += it.units;
          // **셋 이상 모였을 때만** 일찍 닫는다. '합이 떨어지면 무조건'으로 두면 길이가
          // 섞인 박에서 두 음만에 닫혀 묶음이 한가운데서 갈린다(560+280=840에서 끊겨
          // [8분³ 16분³][16분³ 8분³]가 됐다) — 그러면 빔도 따라 갈라진다. 셋을 채우기 전에는
          // 박 끝까지 가고, 박이 바뀌거나 잇단이 끊기면 위에서 닫힌다.
          if (run.length >= 3 && C.exactValue(runSum)) closeRun();
        });
        closeRun();

        // ── 빔 ──
        // 꼬리 있는 음표(8분음표 이하)를 **한 박 안에서** 잇는다 — 낱개 깃발로 두면 꼬리
        // 숲이 되어 못 읽는다(2026-08-14 사용자 요청). 무엇이 한 박인지는 정간 단위가
        // 정하고(8분음표 단위면 대강이 곧 박) 그 셈은 staff-core의 beatGroups에 있다 —
        // 화면(staff-view)도 같은 표를 보므로 둘의 빔이 어긋날 수 없다.
        // 끊는 자리 넷: 쉼표 · 꼬리 없는 음표(4분음표 이상) · 박 경계 · 잇단 묶음 경계.
        // **잇단도 여기서 함께 묶는다** — 예전엔 '꼴이 섞인 잇단은 안 잇는다'며 미뤄 뒀는데,
        // 그러면 조판기가 빔 대신 **각진 대괄호**를 그린다(빔으로 묶인 잇단에는 숫자만 얹는
        // 것이 조판 관행이라 저들도 그렇게 한다 — 길타령에서 잇단 32개 중 26개가 괄호였다,
        // 2026-08-14 사용자 제보). 겹이 다른 자리를 잇는 몽당빔 셈이 아래에 이미 있으므로
        // 갈래를 나눌 까닭이 없어졌다. 잇단과 보통 음표를 한 빔에 섞지는 않는다(it.grp).
        const jgGroup = C.beatGroups(s.unit, mb, (s.measDg && s.measDg[mi]) || s.daegang);
        const beatOf = function (o) {
          const j = Math.floor(o / beat + 1e-6);
          return jgGroup[Math.max(0, Math.min(jgGroup.length - 1, j))];
        };
        const runKey = function (it) { return beatOf(it.off) + "/" + (it.grp == null ? "-" : it.grp); };
        const beamRuns = [];
        let openRun = null;
        items.forEach(function (it) {
          const ty = it.tup ? it.tup.ty : C.exactValue(it.units);
          it.flags = (!it.rest && ty) ? (FLAG_N[ty.type] || 0) : 0;
          if (!it.flags) { openRun = null; return; }
          if (openRun && runKey(openRun[0]) === runKey(it)) openRun.push(it);
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
          // 빔은 위 절이 잇단·보통 음표를 가리지 않고 한 벌로 얹었다
          noteEl(Object.assign({}, it.src, {
            units: it.units, rest: it.rest, noAcc: it.noAcc,
            tup: it.tup, tupStart: it.tupStart, tupStop: it.tupStop,
            tieStart: it.tieStart, tieStop: it.tieStop, beams: it.beams
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
