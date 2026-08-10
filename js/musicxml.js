// 오선보를 MusicXML 4.0으로 적는다.
//
// app.js를 한 줄도 안 본다 — app.js의 buildStaffScores()가 만든 그릇들과 제목만 받는다.
// 화면에 그리는 js/staff-view.js와 **같은 재료**를 받으므로, 보이는 것과 파일로 나가는 것이
// 어긋날 수 없다.
//
//   build(scores, meta) → XML 문자열
//   scores = [{ name, fifths, clef:"G"|"F", beats, bpm, unit, jg, measures:[[음표…]] }] (악기 하나면 길이 1)
//   음표   = { midi, rest, units, graces:[midi], afters:[midi], tieStart, tieStop }
//   meta   = { title, subtitle }
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
      // <note> 안의 차례는 규격이 정해 두었다: 음표꼴 → 점 → 임시표 → 표현. 지킬 것.
      const ty = o.grace ? { type: "16th", dots: 0 } : C.exactValue(o.units);
      if (ty) {
        out.push("        <type>" + ty.type + "</type>");
        for (let d = 0; d < ty.dots; d++) out.push("        <dot/>");
      }
      if (!o.rest && !o.grace) {
        const acc = C.pitchAt(o.midi, fifths).acc;
        if (acc != null) out.push("        <accidental>" + C.ACC[acc] + "</accidental>");
      }
      if (o.tieStart || o.tieStop) {
        out.push("        <notations>");
        if (o.tieStop) out.push("          <tied type=\"stop\"/>");
        if (o.tieStart) out.push("          <tied type=\"start\"/>");
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
        out.push("    <measure number=\"" + (mi + 1) + "\">");
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
        m.forEach(function (n) {
          n.graces.forEach(function (g) { noteEl({ midi: g, grace: true }, s.fifths); });
          noteEl(n, s.fifths);
          n.afters.forEach(function (g) { noteEl({ midi: g, grace: true }, s.fifths); });
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
