// 오선보(MusicXML) 내보내기가 말이 되는 악보를 뱉는지 검사한다.
//
//   node tools/check-musicxml.mjs
//
// XML을 쓰는 것은 js/musicxml.js(순수 모듈)이고, 재료를 만드는 것은 js/app.js의
// buildStaffScores다 — 후자만 이름으로 떼어 와 돌린다(tools/lib/app-sandbox.mjs).
// 보는 것은 셋이다: ① 마디 길이가 딱 맞나(어긋나면 악보 프로그램이 마디를 다시 짠다)
// ② 음높이가 재생과 같은가(같은 realizeMelody를 보므로 어긋나면 어느 한쪽이 깨진 것)
// ③ 시김새가 제 꼴로 적히나(붙임=꾸밈음, 독립=제 자리를 나눈 실음).
// ④ 곁줄 가사가 제 음에 붙나(한글 음절만 · 기호 토큰 제외 · 가사 없는 문서는 한 글자도 그대로).
// ⑤ 곁줄 기호(사전에 있는 괄호 토큰)가 음표 위 <direction>으로 실리나(파일엔 표시 이름).
// ⑥ 음표로 안 바뀌는 선율 시김새(사전에 snd 없음)가 같은 길로 음표 위에 실리나.

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/musicxml.js");

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "parseDaegang", "const:DAEGANG_PRESET", "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt", "daegangTextFor", "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens", "stripSymBracket",
   "scaleNotes", "makeScale", "seqShare", "realizeMelody",
   "staffHwang", "staffFifths", "staffTimeType", "staffPerLine", "staffBarMode", "dgOf", "barsOfGak", "measurePlan", "staffScoreOf", "scoreViewOn", "jangguStaffMode", "jangguStaffOn", "jangguScoreOf", "jangguPartScore", "jangguLegendScore", "buildStaffScores", "buildMusicXml", "const:VRV_DIGIT_W", "vrvTimeNotes"],
  { beats: "4", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", staffUnit: "dotted", staffKey: "auto", staffTime: "auto", staffPerLine: "auto", staffBar: "auto", staffJanggu: "legend", wantJangdan: false, jangdan: "", daegang: "" },
  // 합주 파트는 이 검사의 관심 밖 — '악기 하나'로 세워 둔다(총보는 아래에서 따로 본다)
  `let parts = [{ name: "", abbr: "", melody: "", muted: false }];
   let activePart = 0;
   function stashActivePart() { parts[0].melody = melodyFull; }`
);
const buildMusicXml = app.fn("buildMusicXml");
const mxlFifths = app.fn("staffFifths");
const mxlPitch = globalThis.JGB_STAFF_CORE.pitchAt;
const JG = 2520;   // 정간 하나 = 점4분음표

function xmlOf(text, beats) {
  app.fields.beats = String(beats != null ? beats : text.split("|").length);
  app.setMelody(text);
  return buildMusicXml();
}

// 아주 작은 파서 — 마디마다 [{ step, alter, octave, dur, grace, rest, tie }]
function parseMeasures(xml) {
  return xml.split("<measure ").slice(1).map((chunk) =>
    chunk.split("<note>").slice(1).map((n) => ({
      grace: n.includes("<grace"),
      rest: n.includes("<rest/>"),
      step: (n.match(/<step>(\w)<\/step>/) || [])[1] || null,
      alter: Number((n.match(/<alter>(-?\d+)<\/alter>/) || [0, 0])[1]),
      octave: Number((n.match(/<octave>(\d+)<\/octave>/) || [0, 0])[1]),
      dur: Number((n.match(/<duration>(\d+)<\/duration>/) || [0, 0])[1]),
      tie: (n.match(/<tie type="(\w+)"\/>/g) || []).join(",")
    })));
}
// 오선의 자리 → midi (검사가 xml을 '읽어' 음높이를 되찾는다 — 쓰는 쪽 계산을 안 믿으려고)
const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n) => (n.octave + 1) * 12 + STEP_PC[n.step] + n.alter;

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(label, g === w, `나온 값: ${g}\n      바란 값: ${w}`);
}

const YUL = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
const P = (n) => 63 + YUL.indexOf(n);

console.log("마디 길이 — 각 하나가 딱 채워지는가 (정간 = 점4분음표 = 2520)");
[["4정간 · 한 음씩", "황|태|중|임", 4],
 ["분박 3등분", "황태중|임|남|황", 4],
 ["한 행에 두 음", "황태|중|임|남", 4],
 ["빈 정간(앞 음 지속)", "황| | |임", 4],
 ["쉼표 섞임", "황|쉼|중|임", 4],
 ["느나르나니(1:1:1:2:1 = 6등분)", "중{느나르나니}|임|남|황", 4],
 ["독립 느나르나니", "중|{느나르나니}|남|황", 4],
 ["7등분(나눠떨어지지 않는 분박)", "황태중임남황태|중|임|남", 4],
 ["여러 각", "황|태|중|임\n남|황|태|중", 4]
].forEach(([label, mel, beats]) => {
  const ms = parseMeasures(xmlOf(mel, beats));
  const sums = ms.map((m) => m.filter((n) => !n.grace).reduce((s, n) => s + n.dur, 0));
  ok(`${label} — 마디마다 ${beats * JG}`, sums.every((s) => s === beats * JG), `마디 길이: [${sums}]`);
});

console.log("\n음높이 — 오선보에서 되읽은 음이 시김새 규칙과 맞는가");
{
  const m = parseMeasures(xmlOf("중|{니}|중{니레}|중", 4))[0].filter((n) => !n.rest);
  eq("중 · {니}(→임) · {니레}중(꾸밈 임 + 중) · 중",
     m.map(midiOf), [P("중"), P("임"), P("임"), P("중"), P("중")]);
  eq("그중 꾸밈음은 셋째 것 하나뿐", m.map((n) => n.grace), [false, false, true, false, false]);
  ok("꾸밈음엔 길이가 없다", m.filter((n) => n.grace).every((n) => n.dur === 0));
}
{
  // 독립 시김새는 제 자리를 나눈 '실음'이라 길이가 있어야 한다. 느나르나니는 5등분이
  // 표준 음표로 안 나뉘어 길이 비 1:1:1:2:1(6등분)로 가른다(사전의 snd.w, 2026-10-01).
  const xml = xmlOf("중|{느나르나니}|황|황", 4);
  const m = parseMeasures(xml)[0];
  const five = m.slice(1, 6);
  eq("{느나르나니}는 다섯 실음으로", five.map(midiOf),
     [P("태"), P("중"), P("임"), P("중"), P("태")]);
  eq("길이 비 1:1:1:2:1 — 정간 하나를 6등분", five.map((n) => n.dur),
     [JG / 6, JG / 6, JG / 6, JG / 3, JG / 6]);
  const types = xml.split("<measure ")[1].split("<note>").slice(2, 7)
    .map((n) => (n.match(/<type>(\w+)<\/type>/) || [])[1] || null);
  eq("점4분음표 정간 → 16분음표 셋 + 8분음표 + 16분음표(모두 <type>이 붙는다)", types,
     ["16th", "16th", "16th", "eighth", "16th"]);
}
{
  // 붙임(att)으로 본음 자리를 가르는 seq가 길이 비 없이 와도 예전처럼 고르게 나뉜다
  const m = parseMeasures(xmlOf("중{나니나}|황|황|황", 4))[0].slice(0, 3);
  eq("{나니나}는 그대로 3등분", m.map((n) => n.dur), [JG / 3, JG / 3, JG / 3]);
}

console.log("\n각을 넘는 지속 — 소리가 끊기고 쉼표로 적히는가");
{
  // 2026-08-14 사용자 확정 — 빈 정간·이음은 **제 각(=한 장단) 안에서만** 앞 음을 잇는다.
  // 각이 바뀌면 지속이 끊기고 쉼표가 된다. 재생도 같은 realizeMelody를 보므로 소리도
  // 함께 끊긴다(그래서 마디를 넘는 붙임줄은 이제 안 나온다).
  const ms = parseMeasures(xmlOf("황| | | \n | | | \n태| | | ", 4));
  const first = ms[0].filter((n) => !n.grace);
  eq("첫 마디는 한 음이 제 각을 채우고 붙임줄 없이 끝난다",
     [first.length, first[0].dur, first[0].tie], [1, 4 * JG, ""]);
  const second = ms[1].filter((n) => !n.grace);
  ok("둘째 마디(빈 각)는 전부 쉼표", second.length > 0 && second.every((n) => n.rest),
     JSON.stringify(second));
  const third = ms[2].filter((n) => !n.grace)[0];
  eq("셋째 마디는 새 음(태)으로 시작", [third.rest, midiOf(third)], [false, P("태")]);
  // 같은 각 안의 빈 정간은 예전대로 잇는다 — 위 '빈 정간(앞 음 지속)' 검사와 짝.
  // 세 정간을 끄는 길이(7560)는 음표 하나로 안 떨어져 **붙임줄로 갈라** 적히므로(아래 절)
  // '음표가 몇 개인가'가 아니라 '이어진 조각의 합이 얼마인가'로 본다 — 소리는 한 음이다.
  const within = parseMeasures(xmlOf("황| | |임", 4))[0].filter((n) => !n.grace);
  const heldSum = within.slice(0, -1).reduce((a, n) => a + n.dur, 0);
  eq("제 각 안의 빈 정간은 그대로 잇는다(이어진 황 + 임)",
     [heldSum, within[within.length - 1].dur, within.every((n) => !n.rest)],
     [3 * JG, JG, true]);
}

console.log("\n음표꼴이 없는 길이 — 붙임줄로 갈라 적는가");
{
  // 조판기(Verovio)는 <type>이 없으면 **기둥도 꼬리도 없는 머리**만 그린다(2026-08-14
  // 사용자 제보). 그래서 음표 하나로 안 떨어지는 길이는 모음박(정간)을 기준으로 갈라
  // 붙임줄로 잇는다 — 셈은 js/staff-core.js의 tiedSplit 한 곳에 있다.
  const shape = (n) => (n.match(/<type>(\w+)<\/type>/) || [])[1] + ".".repeat((n.match(/<dot\/>/g) || []).length);
  const notesOf = (xml) => xml.split("<measure ")[1].split("<note>").slice(1);

  // 세 정간(7560)은 점2분 ⌒ 점4분 — 긴 것부터 집으면 온음표+8분음표가 되어 박을 가로지른다
  const n3 = notesOf(xmlOf("황| | |임", 4));
  eq("세 정간 지속 = 점2분음표 ⌒ 점4분음표",
     [shape(n3[0]), shape(n3[1]), shape(n3[2])], ["half.", "quarter.", "quarter."]);
  ok("가른 조각은 붙임줄로 이어진다",
     n3[0].includes("<tie type=\"start\"/>") && n3[0].includes("<tied type=\"start\"/>") &&
     n3[1].includes("<tie type=\"stop\"/>") && !n3[1].includes("<tie type=\"start\"/>"),
     n3[0] + n3[1]);
  ok("이어진 뒤 음은 같은 음높이", midiOf(parseMeasures(xmlOf("황| | |임", 4))[0][0]) === P("황"));

  // 딱 떨어지는 길이는 안 가른다 — 네 정간은 점온음표 하나 그대로
  const n4 = notesOf(xmlOf("황| | | ", 4));
  eq("네 정간 지속은 점온음표 하나(가르지 않는다)", [n4.length, shape(n4[0])], [1, "whole."]);

  // 박으로 **들어가는** 조각은 짧은 것부터 — 반 정간에서 시작해 두 정간을 더 끄는 음(6300)은
  // 점8분 ⌒ 점2분이라야 박이 보인다(점2분 ⌒ 점8분이면 박을 가로지른다)
  const nIn = notesOf(xmlOf("황태|  | |임", 4));
  eq("박에 들어가는 조각은 짧은 것부터", [shape(nIn[1]), shape(nIn[2])], ["eighth.", "half."]);

  // 2의 거듭제곱으로 안 나뉘는 길이는 붙임줄로도 못 적는다 — 예전대로 음표꼴을 비운다
  const n5 = notesOf(xmlOf("황태중임남|임|남|황", 4));
  ok("5분박은 여전히 음표꼴 없이 하나로", !n5[0].includes("<type>") && n5[0].includes("<duration>504</duration>"));

  // 갈라도 길이의 합은 그대로라야 한다 — 마디가 어긋나면 악보 프로그램이 마디를 다시 짠다
  [["세 정간 지속", "황| | |임", 4], ["다섯 정간 각을 통째로", "황| | | | ", 5],
   ["반 정간에서 시작", "황태|  | |임", 4]].forEach(([label, mel, beats]) => {
    const sums = parseMeasures(xmlOf(mel, beats))
      .map((m) => m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
    ok(`가른 뒤에도 마디가 딱 찬다 — ${label}`, sums.every((v) => v === beats * JG),
       `마디 길이: [${sums}]`);
  });

  // 임시표는 이어지는 뒤 조각에 다시 안 적힌다(같은 음이 이어지는 것뿐이다).
  // 대(E♮)는 황종 평조의 조표(♭4 = A♭장조) 밖이라 임시표가 붙는다.
  const nAcc = notesOf(xmlOf("대| | |임", 4));
  eq("임시표는 첫 조각에만",
     [nAcc[0].includes("<accidental>"), nAcc[1].includes("<accidental>")], [true, false]);
}

console.log("\n셋잇단과 붙임줄이 얽히는 자리 — 4분음표 정간(3분박)");
{
  // 취타 길타령에서 음표꼴이 통째로 비고 잇단이 정간을 넘었던 자리다(2026-08-14 사용자 제보).
  // 3분박 박에서는 값이 560의 배수라 2의 거듭제곱 값만으로는 못 적는다 — staff-core의
  // fragment가 3/2배 자리에서 갈라 되돌린다. 잇단 여부도 '한 박 안에 드는가'를 함께 본다.
  app.fields.staffUnit = "plain";
  const notesOf = (xml) => xml.split("<measure ")[1].split("<note>").slice(1)
    .filter((n) => !n.includes("<grace"));
  const shape = (n) => ((n.match(/<type>(\w+)<\/type>/) || [])[1] || "－") +
    ".".repeat((n.match(/<dot\/>/g) || []).length) + (n.includes("time-modification") ? "³" : "");
  const JGP = 1680;   // 4분음표 정간

  // ① 박을 걸친 지속 — 잇단 조각에서 끊고 붙임줄로 잇는다
  const a = notesOf(xmlOf("황태중|- 태|임|남", 4));
  eq("박을 걸친 지속은 3잇단 조각 ⌒ 표준값",
     [shape(a[2]), a[2].includes("<tie type=\"start\"/>"), shape(a[3])],
     ["eighth³", true, "eighth"]);
  // ② 두 정간을 더 끄는 지속 — 예전엔 '점점2분음표 3:2' 하나로 나왔다
  const b = notesOf(xmlOf("황태중| | |임", 4));
  eq("두 정간을 더 끌면 3잇단 8분 ⌒ 2분음표", [shape(b[2]), shape(b[3])], ["eighth³", "half"]);
  // ③ 박 한가운데서 시작해 박을 넘는 음은 한 음표로 떨어져도 가른다 — 안 그러면 걸친
  //    잇단 묶음이 반 토막으로 남는다
  const c = notesOf(xmlOf("황태중|- - 태|임|남", 4));
  eq("박 한가운데서 넘는 음도 박에서 가른다", [shape(c[2]), shape(c[3])], ["eighth³", "quarter³"]);

  const MELS = [["황태중|- 태|임|남", 4], ["황태중| | |임", 4], ["황태중|- - 태|임|남", 4]];
  MELS.forEach(([mel, bt]) => {
    const ns = notesOf(xmlOf(mel, bt));
    let off = 0, cross = 0, noType = 0;
    ns.forEach((n) => {
      const d = Number((n.match(/<duration>(\d+)</) || [0, 0])[1]);
      if (!n.includes("<type>")) noType++;
      if (n.includes("time-modification") && (off % JGP) + d > JGP + 1e-6) cross++;
      off += d;
    });
    ok(`잇단이 박을 안 넘고 음표꼴이 다 있다 — ${mel}`, !cross && !noType,
       `박을 넘는 잇단 ${cross} · 음표꼴 없음 ${noType}`);
    ok(`마디가 딱 찬다 — ${mel}`, off === bt * JGP, `마디 길이: ${off}`);
  });
  app.fields.staffUnit = "dotted";
}

console.log("\n정간 단위 '자동' — 각의 정간 수가 정한다");
{
  // 12정간을 점4분음표로 보면 36/8이라 한 마디가 터무니없이 길다(2026-08-14 사용자 확정).
  app.fields.staffUnit = "auto";
  const twelve = new Array(12).fill("황").join("|");
  const x12 = xmlOf(twelve, 12);
  ok("12정간 각은 8분음표 — 12/8, 정간 하나가 840",
     x12.includes("<beats>12</beats><beat-type>8</beat-type>") &&
     parseMeasures(x12)[0][0].dur === 840,
     `정간 길이: ${parseMeasures(x12)[0][0].dur}`);
  const x4 = xmlOf("황|태|중|임", 4);
  ok("그 밖의 각은 점4분음표 — 정간 하나가 2520",
     parseMeasures(x4)[0][0].dur === 2520, `정간 길이: ${parseMeasures(x4)[0][0].dur}`);
  // 문서에 적힌 값은 그대로 이긴다 — 옛 문서가 조용히 달라지지 않는다
  app.fields.staffUnit = "dotted";
  ok("고른 값이 있으면 그 값이 이긴다", parseMeasures(xmlOf(twelve, 12))[0][0].dur === 2520);
}

console.log("\n빔 — 꼬리 있는 음표를 한 박 안에서 잇는가");
{
  // 낱개 깃발로 두면 꼬리 숲이 되어 못 읽는다(2026-08-14 사용자 요청). 무엇이 한 박인지는
  // 정간 단위가 정하고(8분음표 단위면 대강이 곧 박) 그 셈은 staff-core의 beatGroups에
  // 있다 — 화면(staff-view)도 같은 표를 보므로 둘의 빔이 어긋날 수 없다.
  const notesOf = (xml) => xml.split("<measure ")[1].split("<note>").slice(1)
    .filter((n) => !n.includes("<grace"));
  const beamsOf = (n) => (n.match(/<beam number="(\d)">([^<]+)<\/beam>/g) || [])
    .map((b) => { const g = b.match(/number="(\d)">([^<]+)</); return g[1] + ":" + g[2]; });
  const allBeams = (mel, beats) => notesOf(xmlOf(mel, beats)).map(beamsOf);

  eq("3분박 8분음표 셋이 한 빔", allBeams("황태중|임|남|황", 4).slice(0, 3),
     [["1:begin"], ["1:continue"], ["1:end"]]);
  ok("꼬리 없는 음표(점4분)엔 빔이 없다",
     allBeams("황태중|임|남|황", 4).slice(3).every((b) => !b.length));

  // 박(=정간)을 넘겨 묶으면 정간보와 딴 그림이 된다 — 정간마다 새로 시작해야 한다
  eq("박 경계에서 끊고 새로 시작한다", allBeams("황태중|임남황|태중임|남", 4).map((b) => b.join()),
     ["1:begin", "1:continue", "1:end", "1:begin", "1:continue", "1:end",
      "1:begin", "1:continue", "1:end", ""]);

  // 쉼표가 끼면 끊는다
  const rest = allBeams("황태중|쉼|남황태|중", 4);
  eq("쉼표에서 끊긴다", [rest[3].length, rest[4].join(), rest[6].join()], [0, "1:begin", "1:end"]);

  // 8분+16분이 섞이면 첫 겹은 묶음 전체, 둘째 겹은 16분 쪽에만(조판 관행)
  eq("겹이 섞이면 둘째 빔은 짧은 쪽에만", allBeams("황{느나}태|임|남|황", 4).slice(0, 4),
     [["1:begin"], ["1:continue", "2:begin"], ["1:continue", "2:end"], ["1:end"]]);

  // 붙임줄로 가른 조각도 꼬리가 있으면 이웃과 묶인다(가르기와 빔이 한 목록 위에서 셈된다)
  eq("가른 조각도 이웃과 묶인다", allBeams("황태|  | |임", 4).map((b) => b.join()),
     ["1:begin", "1:end", "", ""]);

  // 혼자면 이을 데가 없다 — 제 깃발로 둔다
  ok("꼬리 있는 음표가 혼자면 빔을 안 단다",
     allBeams("황|태중임|남|황", 4)[0].length === 0);

  // 잇단도 함께 묶는다 — 빔으로 묶인 잇단에는 조판기가 숫자만 얹고, 안 묶으면 각진
  // 대괄호를 그린다(길타령에서 잇단 32개 중 26개가 괄호였다, 2026-08-14 사용자 제보)
  app.fields.staffUnit = "plain";
  eq("같은 꼴 셋잇단은 한 빔", allBeams("황태중|임|남|중", 4).slice(0, 3).map((b) => b.join()),
     ["1:begin", "1:continue", "1:end"]);
  // 겹이 섞여도 한 묶음·한 빔이라야 한다 — 예전엔 '꼴이 섞이면 안 잇는다'였고, 묶음도
  // 합이 떨어지는 자리(560+280=840)에서 두 음만에 갈렸다
  eq("겹이 섞인 셋잇단도 한 빔(둘째 겹은 짧은 쪽만)",
     allBeams("황{느나}태|임|남|중", 4).slice(0, 4),
     [["1:begin"], ["1:continue", "2:begin"], ["1:continue", "2:end"], ["1:end"]]);
  app.fields.staffUnit = "dotted";
  // 그래도 정간 통째로 한 묶음이 되면 안 된다 — 분박마다 셋씩 끊긴다
  eq("16분 셋잇단 아홉은 셋씩 끊긴다",
     allBeams("황태중 황태중 황태중|임|남|중", 4).slice(0, 9).map((b) => b[0]),
     ["1:begin", "1:continue", "1:end", "1:begin", "1:continue", "1:end",
      "1:begin", "1:continue", "1:end"]);

  // 8분음표 단위는 정간 하나가 한 박이 아니다 — 대강이 곧 박이라 대강으로 묶는다
  app.fields.staffUnit = "eighth";
  app.fields.daegang = "3 3";
  eq("8분음표 단위는 대강이 한 박", allBeams("황|태|중|임|남|황", 6).map((b) => b.join()),
     ["1:begin", "1:continue", "1:end", "1:begin", "1:continue", "1:end"]);
  app.fields.daegang = "";
  app.fields.staffUnit = "dotted";
}

console.log("\n조표 — 음계의 '도'를 으뜸음으로 삼는 조를 고르는가");
{
  // 5음 음계는 임시표 없이 적히는 조표가 셋이라(황종 평조면 ♭5·♭4·♭3) '임시표가 가장
  // 적은 것'으로는 못 고른다 — 셋 다 음정은 안 틀리고 무엇을 do로 선언하는가만 갈린다.
  // 평조를 솔라도레미로 읽으면 황종 평조의 '도'는 중려라 ♭4(세종 자료도 ♭4).
  // 이 '도'는 악조의 궁이 아니다 — 궁은 황종이고(그래서 '황종 평조'다) 도가 중려다.
  app.fields.joPreset = "hwang-pyeong";     // 황태중임남 = E♭ F A♭ B♭ C
  const f1 = mxlFifths(63);
  ok(`황=E♭ 평조 → 내림표 4개 (A♭장조, 도=중려)`, f1 === -4, `나온 값: ${f1}`);
  const scale = ["황", "태", "중", "임", "남"].map((n) => 63 + YUL.indexOf(n));
  ok("다섯 음 모두 임시표 없이 적힌다",
     scale.every((m) => mxlPitch(m, f1).acc === null),
     scale.map((m) => `${m}:${mxlPitch(m, f1).step}${mxlPitch(m, f1).alter}`).join(" "));
  app.fields.joPreset = "hwang-gyemyeon";   // 황협중임무 = 라·도·레·미·솔 → 협종이 do
  const f2 = mxlFifths(63);
  const gye = ["황", "협", "중", "임", "무"].map((n) => 63 + YUL.indexOf(n));
  ok(`계면조 → 내림표 6개 (G♭장조, 도=협종)`, f2 === -6, `나온 값: ${f2}`);
  ok("계면조도 임시표 없이", gye.every((m) => mxlPitch(m, f2).acc === null));
  app.fields.joPreset = "hwang-pyeong";
}

console.log("\n조표 고르기 — 사람이 정한 값이 자동을 이기는가");
{
  // 5음 음계는 임시표 없이 적히는 조표가 하나가 아니고 채보 관행도 갈린다(교과서 표준악보집은
  // 가야금 연주곡을 본청=사음으로 옮겨 ♯1개로 적는다). 그래서 자동으로 정해 주되 열어 둔다 —
  // 다만 조표를 바꿔도 **소리는 그대로**여야 한다(적는 방식만 달라지는 것이므로).
  const midisOf = (xml) => parseMeasures(xml).flat().filter((n) => !n.rest).map(midiOf);
  const auto = xmlOf("황|태|중|임", 4);
  app.fields.staffKey = "1";
  const sharp = xmlOf("황|태|중|임", 4);
  ok("♯1개를 고르면 그 값이 나간다", mxlFifths() === 1, `나온 값: ${mxlFifths()}`);
  ok("파일의 조표도 ♯1개", sharp.includes("<fifths>1</fifths>"));
  eq("조표를 바꿔도 음높이는 그대로", midisOf(sharp), midisOf(auto));
  ok("적는 방식만 달라진다 — 자동은 ♭4개", auto.includes("<fifths>-4</fifths>"));
  app.fields.staffKey = "99";     // 범위 밖 값은 자동으로 물러난다
  ok("모르는 값이면 자동", mxlFifths() === -4, `나온 값: ${mxlFifths()}`);
  app.fields.staffKey = "auto";
}

console.log("\n기준음 — 정간보에 적어 둔 황 음고를 그대로 따라가는가");
{
  // 정간보와 오선보가 같은 곡을 가리키는데 기준음이 갈리면 그건 다른 곡이다. 황을 C로 두고
  // 쓰는 악보면 오선보도 C로 적혀야 하고, 조표도 그 자리에서 다시 잡혀야 한다.
  ok("황=E♭이면 첫 음이 E♭", (() => {
    const n = parseMeasures(xmlOf("황|태|중|임", 4))[0].filter((x) => !x.grace)[0];
    return n.step === "E" && n.alter === -1;
  })());
  app.fields.hwangPitch = "60";     // 황 = C
  const c = xmlOf("황|태|중|임", 4);
  const n0 = parseMeasures(c)[0].filter((x) => !x.grace)[0];
  ok("황=C면 첫 음도 C", n0.step === "C" && n0.alter === 0, `나온 값: ${n0.step}${n0.alter}`);
  // 황=C 평조(황태중임남 = C D F G A) → 5도권 맨 아래가 F라 '도'는 중려, 조표는 ♭1개
  ok("조표도 따라 옮겨진다 — ♭1개(바장조, 도=중려)", c.includes("<fifths>-1</fifths>"),
     (c.match(/<fifths>-?\d+<\/fifths>/) || [])[0]);
  app.fields.hwangPitch = "63";
}

console.log("\n음이름 되읽기 — 옥타브가 밀리지 않는가");
[[60, "C", 0, 4], [63, "E", -1, 4], [51, "E", -1, 3], [75, "E", -1, 5]].forEach(([m, s, a, o]) => {
  const p = mxlPitch(m, -4);
  eq(`midi ${m} → ${s}${a < 0 ? "♭" : ""}${o}`, [p.step, p.alter, p.octave], [s, a, o]);
});

console.log("\n정간을 무엇으로 보나 — 박자표·빠르기가 따라 바뀌는가");
{
  app.fields.staffUnit = "dotted";
  const d = xmlOf("황|태|중|임", 4);
  ok("점4분음표 → 4정간 각이 12/8", d.includes("<beats>12</beats><beat-type>8</beat-type>"));
  ok("메트로놈에 점이 붙는다", d.includes("<beat-unit>quarter</beat-unit><beat-unit-dot/>"));
  ok("재생 빠르기는 4분음표 기준 1.5배", d.includes('<sound tempo="90"/>'));
  ok("정간 하나가 2520", parseMeasures(d)[0].filter((n) => !n.grace)[0].dur === JG);

  app.fields.staffUnit = "plain";
  const q = xmlOf("황|태|중|임", 4);
  ok("4분음표 → 4정간 각이 4/4", q.includes("<beats>4</beats><beat-type>4</beat-type>"));
  ok("메트로놈에 점이 없다",
     q.includes("<beat-unit>quarter</beat-unit><per-minute>") && !q.includes("<beat-unit-dot/>"));
  ok("재생 빠르기는 그대로", q.includes('<sound tempo="60"/>'));
  ok("정간 하나가 1680", parseMeasures(q)[0].filter((n) => !n.grace)[0].dur === 1680);
  const sums = parseMeasures(q).map((m) => m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
  ok("4분음표로 봐도 마디가 딱 찬다", sums.every((v) => v === 4 * 1680), `마디 길이: [${sums}]`);
  // 3분박은 4분음표로 보면 딱 안 떨어진다 → **셋잇단**(8분음표꼴 + 3:2)으로 적는다
  // (2026-08-14 사용자 요청 — 예전엔 음표꼴을 비웠는데 조판기가 머리만 그렸다).
  // 길이(<duration>)는 그대로 560이라 마디 합은 안 바뀐다.
  const t = xmlOf("황태중|임|남|중", 4);
  const first = parseMeasures(t)[0].filter((n) => !n.grace)[0];
  const n1 = t.split("<note>")[1];
  ok("3분박을 4분음표로 보면 셋잇단 — 8분음표꼴 + 3:2, 길이는 그대로",
     first.dur === 560 && n1.includes("<type>eighth</type>") &&
     n1.includes("<actual-notes>3</actual-notes><normal-notes>2</normal-notes>") &&
     n1.includes("<tuplet type=\"start\"/>"));
  // 잇단 괄호는 그 정간 안에서 닫힌다 — 셋째 음이 stop, 다음 정간(임)은 잇단이 아니다
  const n3 = t.split("<note>")[3], n4 = t.split("<note>")[4];
  ok("잇단 괄호가 정간 끝에서 닫힌다",
     n3.includes("<tuplet type=\"stop\"/>") && !n4.includes("time-modification"));
  // 5분박은 여전히 음표꼴 없이 — 억지 잇단보다 비워 두는 쪽(쓰지 않기로 확정)
  const f5 = xmlOf("황태중임남|임|남|황", 4).split("<note>")[1];
  ok("5분박은 음표꼴 없이 길이만 적는다", !f5.includes("<type>") && !f5.includes("time-modification"));

  // 8분음표 — 2분박이면서 각이 길 때. 20정간 각이 4분음표로는 20/4이라 한 마디가
  // 터무니없이 길어지는데, 8분음표로 보면 20/8이 된다.
  app.fields.staffUnit = "eighth";
  const e = xmlOf("황|태|중|임", 4);
  ok("8분음표 → 4정간 각이 4/8", e.includes("<beats>4</beats><beat-type>8</beat-type>"));
  ok("메트로놈 단위가 8분음표",
     e.includes("<beat-unit>eighth</beat-unit><per-minute>") && !e.includes("<beat-unit-dot/>"));
  ok("재생 빠르기는 4분음표 기준 절반", e.includes('<sound tempo="30"/>'));
  ok("정간 하나가 840", parseMeasures(e)[0].filter((n) => !n.grace)[0].dur === 840);
  const eSums = parseMeasures(e).map((m) => m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
  ok("8분음표로 봐도 마디가 딱 찬다", eSums.every((v) => v === 4 * 840), `마디 길이: [${eSums}]`);
  // 2분박이면 16분음표로 딱 떨어져 음표꼴이 적힌다 — 이게 8분음표를 고르는 값어치다
  const e2 = xmlOf("황태|중|임|남", 4);
  const eFirst = parseMeasures(e2)[0].filter((n) => !n.grace)[0];
  ok("8분음표의 2분박은 16분음표로 딱 떨어진다",
     eFirst.dur === 420 && e2.split("<note>")[1].includes("<type>16th</type>"));
  app.fields.staffUnit = "dotted";
}

console.log("\n박자표를 사람이 고르면 — 길이는 그대로, 세는 단위만 바뀌는가");
{
  // 20정간 각을 8분음표로 보면 자동이 20/8인데, 그런 표기를 쓰는 악보는 없다(관행은 10/4).
  // 아랫수만 고르게 열어 둔 자리다 — 윗수는 마디 길이에 맞춰 따라온다.
  const MEL20 = Array(20).fill("황").join("|");
  app.fields.staffUnit = "eighth";
  app.fields.staffTime = "auto";
  const auto = xmlOf(MEL20, 20);
  ok("자동은 예전 그대로 20/8", auto.includes("<beats>20</beats><beat-type>8</beat-type>"));
  const durOf = (xml) => parseMeasures(xml).map((m) =>
    m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
  const want = durOf(auto);

  [["4", 10], ["2", 5], ["16", 40]].forEach(([type, top]) => {
    app.fields.staffTime = type;
    const xml = xmlOf(MEL20, 20);
    ok(`아랫수 ${type} → ${top}/${type}`,
       xml.includes(`<beats>${top}</beats><beat-type>${type}</beat-type>`));
    eq(`아랫수 ${type} — 마디 길이는 그대로`, durOf(xml), want);
  });

  // 메트로놈은 **정간 하나**의 이름이라 박자표를 바꿔도 안 따라간다(빠르기가 달라지면 안 된다)
  app.fields.staffTime = "2";
  const m2 = xmlOf(MEL20, 20);
  ok("메트로놈 단위는 정간 그대로(8분음표)",
     m2.includes("<beat-unit>eighth</beat-unit><per-minute>") && m2.includes('<sound tempo="30"/>'));

  // 안 나눠떨어지는 아랫수는 조용히 자동으로 물러난다 — 5정간 각을 2분음표로는 못 센다
  app.fields.staffTime = "2";
  const odd = xmlOf(Array(5).fill("황").join("|"), 5);
  ok("5정간 각 + 아랫수 2 → 자동(5/8)으로 물러난다",
     odd.includes("<beats>5</beats><beat-type>8</beat-type>"));

  // 각마다 정간 수가 달라도 **같은 아랫수**로 제 윗수를 갖는다
  app.fields.staffTime = "4";
  app.fields.gakBeats = "1:8";
  const mixed = xmlOf(MEL20 + "||" + MEL20, 20);
  ok("첫 각 8정간 → 4/4, 둘째 각 20정간 → 10/4",
     mixed.includes("<beats>4</beats><beat-type>4</beat-type>") &&
     mixed.includes("<beats>10</beats><beat-type>4</beat-type>"));
  app.fields.gakBeats = "";
  app.fields.staffTime = "auto";
  app.fields.staffUnit = "dotted";
}

console.log("\n아랫수를 음표로(4/♩ · 4/♩.) — 숫자는 같은 길이, 보이는 것만 바뀌는가");
{
  const MEL12 = Array(12).fill("황").join("|");
  const durOf = (xml) => parseMeasures(xml).map((m) =>
    m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
  const C = globalThis.JGB_STAFF_CORE;
  // 점4분음표 단위 12정간 = 36/8 → ♩.로 세면 12 / ♩. (윗수 = 정간 수)
  app.fields.staffUnit = "dotted";
  app.fields.staffTime = "auto";
  const want = durOf(xmlOf(MEL12, 12));
  app.fields.staffTime = "dq";
  const dq = xmlOf(MEL12, 12);
  ok("♩. → <time symbol=\"dotted-note\"> 36/8 (보이는 것은 12/♩.)",
     dq.includes('<time symbol="dotted-note"><beats>36</beats><beat-type>8</beat-type></time>'));
  eq("♩. — 마디 길이는 그대로", durOf(dq), want);
  eq("♩. 항목 글씨", C.timeLabel(C.timeSig("dotted", 12, "dq")), "12/♩.");
  // 조판용 XML은 **진짜 박자표를 덧셈꼴로**(0+36 / 8) — 길이는 36/8 그대로, app.js vrvTimeNotes가 '+'를 보고
  // 12/♩.로 바꾼다. 예전 표지(아랫수 111)는 음표 위 기호를 마디 밖으로 밀어 마디가 늘어났다(2026-10-02)
  const vrv = globalThis.JGB_MUSICXML.build(app.fn("buildStaffScores")(), { vrv: true });
  ok("조판용은 0+36/8 (진짜 길이 · symbol 없음)", vrv.includes("<time><beats>0+36</beats><beat-type>8</beat-type></time>"));
  ok("조판용에 옛 표지(111)가 안 남는다", !/<beat-type>1{2,3}<\/beat-type>/.test(vrv));
  // 4분음표 단위 12정간 = 12/4 → 12 / ♩
  app.fields.staffUnit = "plain";
  app.fields.staffTime = "q";
  const q = xmlOf(MEL12, 12);
  ok("♩ → <time symbol=\"note\"> 12/4",
     q.includes('<time symbol="note"><beats>12</beats><beat-type>4</beat-type></time>'));
  // 4분음표 단위를 ♩.로 세면 12정간 = 8 / ♩. (나눠떨어짐) · 5정간은 못 세어 자동(5/4)
  app.fields.staffTime = "dq";
  ok("4분음표 단위 12정간 + ♩. → 8/♩. (24/8)",
     xmlOf(MEL12, 12).includes('<time symbol="dotted-note"><beats>24</beats><beat-type>8</beat-type>'));
  const odd = xmlOf(Array(5).fill("황").join("|"), 5);
  ok("4분음표 단위 5정간 + ♩. → 자동(5/4)으로 물러난다",
     odd.includes("<time><beats>5</beats><beat-type>4</beat-type></time>"));
  // 8분음표 단위 5정간을 ♩으로는 못 센다 → 자동(5/8), 조판용에서도 덧셈꼴이 안 나온다
  app.fields.staffUnit = "eighth";
  app.fields.staffTime = "q";
  xmlOf(Array(5).fill("황").join("|"), 5);
  const oddV = globalThis.JGB_MUSICXML.build(app.fn("buildStaffScores")(), { vrv: true });
  ok("물러난 마디는 조판용에서도 숫자 그대로(5/8)",
     oddV.includes("<time><beats>5</beats><beat-type>8</beat-type></time>"));
  // 음표 자동(na) — 정간 단위가 ♩·♩.을 고른다. 4분음표 단위면 ♩, 그 밖은 ♩.
  app.fields.staffTime = "na";
  app.fields.staffUnit = "plain";
  ok("음표 자동 + 4분음표 단위 12정간 → 12/♩",
     xmlOf(MEL12, 12).includes('<time symbol="note"><beats>12</beats><beat-type>4</beat-type>'));
  app.fields.staffUnit = "dotted";
  ok("음표 자동 + 점4분음표 단위 12정간 → 12/♩.",
     xmlOf(MEL12, 12).includes('<time symbol="dotted-note"><beats>36</beats><beat-type>8</beat-type>'));
  app.fields.staffUnit = "eighth";
  ok("음표 자동 + 8분음표 단위 12정간 → 4/♩.",
     xmlOf(MEL12, 12).includes('<time symbol="dotted-note"><beats>12</beats><beat-type>8</beat-type>'));
  // 아랫수가 음표면 **빠르기 표도 그 음표로 센다**(staff-core tempoMark) — 소리(<sound tempo>)는 그대로
  const e12 = xmlOf(MEL12, 12);
  ok("8분음표 정간 60 + 4/♩. → 빠르기 표 ♩. = 20, 소리는 그대로(4분음표 30)",
     e12.includes("<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>20</per-minute>") &&
     e12.includes('<sound tempo="30"/>'));
  app.fields.staffUnit = "plain";
  app.fields.staffTime = "dq";
  const p8 = xmlOf(MEL12, 12);
  ok("4분음표 정간 60 + 8/♩. → ♩. = 40, 소리 60",
     p8.includes("<beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>40</per-minute>") &&
     p8.includes('<sound tempo="60"/>'));
  app.fields.staffTime = "q";
  ok("4분음표 정간 60 + 12/♩ → ♩ = 60 (점 없음)",
     xmlOf(MEL12, 12).includes("<beat-unit>quarter</beat-unit><per-minute>60</per-minute>"));
  eq("tempoMark — 숫자 박자표면 정간 이름·bpm 그대로",
     JSON.stringify(C.tempoMark(C.timeSig("eighth", 12, 8), "eighth", 60)),
     JSON.stringify({ beatUnit: "eighth", dot: false, perMinute: 60 }));
  // 박자표 음표 그림은 머리가 위·기둥이 아래(2026-10-02) — 머리 중심이 기둥 위끝에, 기둥은 아래로 뻗는다
  const tn = C.timeNoteSvg(true, 0, 0, 10, "t");
  const hy = +/<ellipse[^>]*cy="([-\d.]+)"/.exec(tn)[1];
  const st = /<rect[^>]*y="([-\d.]+)"[^>]*height="([-\d.]+)"/.exec(tn);
  ok("박자표 음표 — 머리가 기둥 위에 있다(기둥이 아래로)", +st[1] === hy && +st[2] > 0);
  app.fields.staffUnit = "eighth";
  app.fields.staffTime = "na";
  // 8분음표 단위 4정간은 ♩.로 안 나눠떨어져(4/8) 다음 후보 ♩ → 2/♩
  ok("음표 자동 + 8분음표 단위 4정간 → ♩.이 안 되면 ♩ (2/♩)",
     xmlOf("황|태|중|임", 4).includes('<time symbol="note"><beats>2</beats><beat-type>4</beat-type>'));
  // 둘 다 안 되면 숫자 — 8분음표 단위 5정간 = 5/8
  ok("음표 자동 + 8분음표 단위 5정간 → 숫자(5/8)로 물러난다",
     xmlOf(Array(5).fill("황").join("|"), 5).includes("<time><beats>5</beats><beat-type>8</beat-type></time>"));
  // 한 곡에 ♩와 ♩.가 섞이면 조판용 박자표도 마디마다 다르다(아랫수 4 = ♩ · 8 = ♩.)
  app.fields.gakBeats = "1:4";
  xmlOf(MEL12 + "||" + MEL12, 12);
  const mixV = globalThis.JGB_MUSICXML.build(app.fn("buildStaffScores")(), { vrv: true });
  ok("섞인 곡: 첫 각 4정간 = 2/♩(0+2/4) · 둘째 각 12정간 = 4/♩.(0+12/8)",
     mixV.includes("<time><beats>0+2</beats><beat-type>4</beat-type></time>") &&
     mixV.includes("<time><beats>0+12</beats><beat-type>8</beat-type></time>"));
  // 그린 뒤 바꿔 끼우기 — 덧셈꼴 박자표(0+12 / 8)가 '4 + ♩.'으로, 숫자 박자표는 그대로
  const vtn = app.fn("vrvTimeNotes");
  const u = (id, x, y) => `<use xlink:href="#${id}-s1" transform="translate(${x}, ${y}) scale(0.72, 0.72)" />`;
  const sig = (body) => `<svg><symbol id="E084-s1"></symbol><g class="meterSig">${body}</g></svg>`;
  const out = vtn(sig(u("E080", 100, 720) + u("E08D", 400, 720) + u("E081", 582, 720) + u("E082", 823, 720) + u("E088", 600, 1080)));
  ok("바꿔 끼우기: 0+12/8 → 윗수 4 + 점4분음표", /#E084-s1/.test(out) && !/#E08D/.test(out) && /data-note="dq"/.test(out));
  const keep = sig(u("E086", 100, 720) + u("E088", 100, 1080));
  eq("바꿔 끼우기: 숫자 박자표(6/8)는 그대로", vtn(keep), keep);
  app.fields.gakBeats = "";
  app.fields.staffTime = "auto";
  app.fields.staffUnit = "dotted";
}

console.log("\n각을 대강마다 마디로 — 끊는 자리를 악보가 정하는가");
{
  // 각을 어디서 끊을 수 있나는 취향이 아니라 **대강**이 이미 답을 갖고 있다
  // (2026-08-16 사용자 확정 — 임의 등분은 고르게 나뉜 각에서만 우연히 맞았다).
  const sums = (xml) => parseMeasures(xml).map((m) =>
    m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0));
  const times = (xml) => (xml.match(/<beats>\d+<\/beats><beat-type>\d+<\/beat-type>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, " ").trim().replace(/\s+/g, "/"));
  const melOf = (n) => Array(n).fill("황").join("|");

  // ① 3,3,3,3 (12정간·8분음표) → 3/8 넷
  app.fields.staffUnit = "eighth";
  app.fields.daegang = "3 3 3 3";
  app.fields.staffBar = "auto";
  const whole = xmlOf(melOf(12), 12);
  eq("각 전체면 예전 그대로 — 12/8 한 마디", [times(whole)[0], sums(whole).length], ["12/8", 1]);

  app.fields.staffBar = "daegang";
  const d3 = xmlOf(melOf(12), 12);
  eq("대강 3,3,3,3 → 3/8 마디 넷", [times(d3)[0], sums(d3).length], ["3/8", 4]);
  eq("마디마다 3정간(840×3)", sums(d3), [2520, 2520, 2520, 2520]);
  eq("나눠도 곡 전체 길이는 그대로",
     sums(d3).reduce((a, b) => a + b, 0), sums(whole).reduce((a, b) => a + b, 0));

  // ② 11,5 (16정간·점4분음표) → 33/8 + 15/8
  app.fields.staffUnit = "dotted";
  app.fields.daegang = "11 5";
  const d11 = xmlOf(melOf(16), 16);
  eq("대강 11,5 → 33/8 + 15/8", times(d11), ["33/8", "15/8"]);
  eq("길이도 11:5로 갈린다", sums(d11), [11 * JG, 5 * JG]);

  // ③ 6,4,4,6 (20정간·점4분음표) → 18/8 · 12/8 · 12/8 · 18/8
  app.fields.daegang = "6 4 4 6";
  const d6 = xmlOf(melOf(20), 20);
  eq("대강 6,4,4,6 → 18/8·12/8·12/8·18/8", times(d6), ["18/8", "12/8", "18/8"]);
  eq("길이는 6:4:4:6", sums(d6), [6 * JG, 4 * JG, 4 * JG, 6 * JG]);

  // 각이 둘이면 각마다 새로 끊는다 — 각을 걸치는 마디는 없다
  const two = xmlOf(melOf(20) + "||" + melOf(20), 20);
  eq("각 둘 — 6:4:4:6이 각마다 되풀이된다",
     sums(two), [6 * JG, 4 * JG, 4 * JG, 6 * JG, 6 * JG, 4 * JG, 4 * JG, 6 * JG]);

  // 대강이 없으면 나눌 것이 없다 — 각 전체 그대로
  app.fields.daegang = "";
  const none = xmlOf(melOf(12), 12);
  eq("대강이 없으면 각 전체 한 마디", sums(none).length, 1);

  // 나눈 마디에도 박자표 아랫수 고르기가 그대로 걸린다
  app.fields.daegang = "6 4 4 6";
  app.fields.staffTime = "4";
  const t4 = xmlOf(melOf(20), 20);
  eq("6,4,4,6 + 아랫수 4 → 9/4·6/4", times(t4), ["9/4", "6/4", "9/4"]);

  app.fields.staffTime = "auto";
  app.fields.staffBar = "auto";
  app.fields.daegang = "";
  app.fields.staffUnit = "dotted";
}

console.log("\n한 줄에 몇 마디 — 줄바꿈이 악보에 적히는가");
{
  // 줄을 앱이 세지 않는다. <print new-system="yes"/>로 악보에 적어 두면 화면(Verovio)이든
  // 뮤즈스코어든 같은 자리에서 접는다 — 그래서 화면·인쇄·파일의 줄 나눔이 저절로 같다.
  const G = "황|태|중|임";
  const eight = Array(8).fill(G).join("||");
  const breaksAt = (xml) => xml.split("<measure ").slice(1)
    .map((m, i) => (m.includes('<print new-system="yes"/>') ? i : -1)).filter((i) => i >= 0);

  app.fields.staffPerLine = "auto";
  ok("자동이면 줄바꿈을 안 적는다 (조판기가 폭대로 채운다)",
     breaksAt(xmlOf(eight, 4)).length === 0);

  app.fields.staffPerLine = "2";
  eq("2마디마다 — 마디 2·4·6에서 줄이 바뀐다", breaksAt(xmlOf(eight, 4)), [2, 4, 6]);

  app.fields.staffPerLine = "4";
  eq("4마디마다 — 마디 4에서만", breaksAt(xmlOf(eight, 4)), [4]);

  app.fields.staffPerLine = "1";
  eq("1마디마다 — 첫 마디만 빼고 다", breaksAt(xmlOf(eight, 4)), [1, 2, 3, 4, 5, 6, 7]);

  // 마디 수보다 큰 값은 줄바꿈이 없다(한 줄에 다 들어간다)
  app.fields.staffPerLine = "8";
  ok("마디 수와 같으면 줄바꿈이 없다", breaksAt(xmlOf(eight, 4)).length === 0);

  // 줄바꿈은 <measure> 바로 다음이라야 한다 — <attributes>보다 뒤면 조판기가 무시한다
  app.fields.staffPerLine = "2";
  const x = xmlOf(eight, 4);
  const m3 = x.split("<measure ")[3];
  ok("<print>가 마디 맨 앞에 온다", m3.trimStart().split("\n")[1].includes("<print"));

  // 줄바꿈을 넣어도 음표·마디 길이는 안 바뀐다 — 적는 자리만 정하는 표시다
  app.fields.staffPerLine = "auto";
  const plain = parseMeasures(xmlOf(eight, 4));
  app.fields.staffPerLine = "3";
  const split = parseMeasures(xmlOf(eight, 4));
  eq("줄을 끊어도 마디 길이는 그대로",
     split.map((m) => m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0)),
     plain.map((m) => m.filter((n) => !n.grace).reduce((a, n) => a + n.dur, 0)));
  ok("줄을 끊어도 음표 수는 그대로",
     JSON.stringify(split.map((m) => m.length)) === JSON.stringify(plain.map((m) => m.length)));
  app.fields.staffPerLine = "auto";
}

console.log("\n곁줄 가사 — 한글 음절만, 그 행에서 시작하는 실음에 붙는가");
{
  // 음표마다 [가사, syllabic] — 꾸밈음은 빼고 쉼표는 남긴다(자리 셈이 어긋나지 않게)
  function lyricsOf(mel, ly, beats) {
    app.setLyrics(ly);
    const xml = xmlOf(mel, beats);
    app.setLyrics("");
    // 붙임줄로 이은 뒤 조각도 뺀다(같은 음이 이어지는 것뿐 — 따로 아래에서 본다)
    return xml.split("<note>").slice(1)
      .filter((n) => !n.includes("<grace") && !n.includes('<tie type="stop"/>'))
      .map((n) => {
        const t = n.match(/<lyric number="1"><syllabic>(\w+)<\/syllabic><text>([^<]*)<\/text><\/lyric>/);
        return n.includes("<rest/>") ? "쉼" : t ? t[2] + ":" + t[1] : "";
      });
  }
  eq("한 음에 한 음절", lyricsOf("황|태|중|임", "아 | 리 | 랑 | 가", 4),
     ["아:single", "리:single", "랑:single", "가:single"]);
  eq("기호 토큰({가로표}·{세로표}·{덩})과 문장부호는 안 싣는다",
     lyricsOf("황|태|중|임", "{가로표}아 | {세로표} | {덩} | 다!", 4),
     ["아:single", "", "", "다:single"]);
  eq("한 행에 붙여 쓴 두 음절 → 그 행의 두 음에 차례로 (begin/end)",
     lyricsOf("황태|중|임|남", "작은 | 새 | 야 | 아", 4),
     ["작:begin", "은:end", "새:single", "야:single", "아:single"]);
  eq("음절이 음보다 적으면 앞에서부터만 (뒤 음은 이어 부르는 자리)",
     lyricsOf("황태|중|임|남", "물 | 새 | 야 | 아", 4),
     ["물:single", "", "새:single", "야:single", "아:single"]);
  eq("곁줄 행 i는 선율 행 i에 (분박끼리 짝)",
     lyricsOf("황 태|중|임|남", "아 리 | 랑 | | 가", 4),
     ["아:single", "리:single", "랑:single", "", "가:single"]);
  eq("이음 자리의 글자는 같은 각의 다음 실음으로 넘어간다 · 각 끝 쉼표의 글자는 버린다",
     lyricsOf("황|-|중|쉼", "아 | 리 | 랑 | 가", 4),
     ["아:single", "리랑:single", "쉼"]);
  eq("이음 자리 행(- 청태)의 '-'는 싣지 않고 다음 행 음에 글자가",
     lyricsOf("황|- 태|중|임", "아 | - 노 | 랑 | 가", 4),
     ["아:single", "노:single", "랑:single", "가:single"]);
  {
    // 각을 넘겨 끌고 가지 않는다 — 앞 각 끝의 쉼표 자리 글자가 다음 각 첫 음을 안 밀어낸다
    const two = lyricsOf("황|태|중|쉼\n임|남|황|태", "가 | 나 | 다 | 라\n마 | 바 | 사 | 아", 4);
    eq("각이 바뀌면 넘어가던 글자는 버린다", two,
       ["가:single", "나:single", "다:single", "쉼", "마:single", "바:single", "사:single", "아:single"]);
  }
  {
    // 붙임줄로 이은 뒤 조각엔 안 붙는다 — 3정간을 끄는 황은 붙임줄로 갈린다
    app.setLyrics("아 | | | 리");
    const xml = xmlOf("황| | |임", 4);
    app.setLyrics("");
    const ns = xml.split("<note>").slice(1);
    const tied = ns.filter((n) => n.includes('<tie type="stop"/>'));
    ok("붙임줄 뒤 조각에는 가사가 없다", tied.length > 0 && tied.every((n) => !n.includes("<lyric")),
       `뒤 조각 ${tied.length}개`);
    ok("가사는 두 개뿐(황·임)", (xml.match(/<lyric /g) || []).length === 2);
    // 규격의 차례 — <lyric>은 <notations> 뒤
    const withBoth = ns.find((n) => n.includes("<lyric") && n.includes("<notations>"));
    ok("<lyric>이 <notations> 뒤에 온다",
       !withBoth || withBoth.indexOf("</notations>") < withBoth.indexOf("<lyric"));
  }
  {
    // 꾸밈음(붙임 시김새)에는 안 붙는다
    app.setLyrics("아 | 리 | 랑 | 가");
    const xml = xmlOf("중|{니}|중{니레}|중", 4);
    app.setLyrics("");
    const graces = xml.split("<note>").slice(1).filter((n) => n.includes("<grace"));
    ok("꾸밈음에는 가사가 없다", graces.length > 0 && graces.every((n) => !n.includes("<lyric")));
    ok("독립 시김새({니})는 실음이라 가사를 받는다", (xml.match(/<lyric /g) || []).length === 4);
  }
  {
    // 가사 없는 문서 · 비어 있는 곁줄 · 사전에 없는 토큰뿐인 곁줄 → MusicXML이 한 글자도 같다
    // (사전에 있는 기호는 이제 음표 위 기호로 실린다 — 아래 '곁줄 기호' 절)
    const mel = "황|태 중|{니}|중{니레}\n임|- 남|쉼|황";
    app.setLyrics("");
    const base = xmlOf(mel, 4);
    ok("가사가 없으면 <lyric>이 하나도 없다", !base.includes("<lyric"));
    [" |  |  | \n |  |  | ", "{없는기호} | [아무개] | (abc) | -\n | ! | | "].forEach((ly) => {
      app.setLyrics(ly);
      const x = xmlOf(mel, 4);
      ok(`곁줄 ${JSON.stringify(ly.slice(0, 14))}… → 가사 없는 문서와 한 글자도 같다`, x === base);
    });
    app.setLyrics("");
  }
  {
    // 장구(1선보)에는 안 붙는다 — 장단 줄은 곡에 하나뿐이고 곁줄과 무관하다
    Object.assign(app.fields, { wantJangdan: true, jangdan: "덩 | 덕 | 쿵 | 덕", staffJanggu: "part" });
    app.setLyrics("아 | 리 | 랑 | 가");
    const xml = xmlOf("황|태|중|임", 4);
    app.setLyrics("");
    Object.assign(app.fields, { wantJangdan: false, jangdan: "", staffJanggu: "legend" });
    const percPart = xml.split("<part id=").find((p) => p.includes("<unpitched>"));
    ok("장구 파트가 나왔다", !!percPart);
    ok("장구 파트에는 가사가 없다", percPart && !percPart.includes("<lyric"));
    ok("선율 파트에는 가사 넷", (xml.match(/<lyric /g) || []).length === 4);
  }
}

console.log("\n곁줄 기호 — 사전에 있는 괄호 토큰은 음표 위 기호로");
{
  // 음표마다 [위 기호들(표시 이름), 아래 가사] — 꾸밈음·붙임줄 뒤 조각은 뺀다.
  // <direction>은 그 음의 <note> 바로 앞에 선다(꾸밈음 뒤) — 그 차례로 읽는다.
  function marksOf(mel, ly, beats, opt) {
    app.setLyrics(ly);
    app.fields.beats = String(beats);
    app.setMelody(mel);
    const xml = opt && opt.vrv
      ? globalThis.JGB_MUSICXML.build(app.fn("buildStaffScores")(), { title: "검사용", vrv: true })
      : buildMusicXml();
    app.setLyrics("");
    const out = [];
    let pend = [];
    xml.split(/(?=<direction[ >]|<note>)/).forEach((ch) => {
      if (/^<direction[ >]/.test(ch)) {
        if (ch.includes("<metronome>")) return;
        if (!ch.startsWith('<direction placement="above">')) out.push("아래?");
        pend = pend.concat([...ch.matchAll(/<words>([^<]*)<\/words>/g)].map((m) => m[1]));
        return;
      }
      if (!ch.startsWith("<note>")) return;
      if (ch.includes("<grace")) return;
      const t = ch.match(/<lyric number="1"><syllabic>\w+<\/syllabic><text>([^<]*)<\/text>/);
      const tied = ch.includes('<tie type="stop"/>');
      if (tied) { ok("붙임줄 뒤 조각 앞에는 기호가 없다", pend.length === 0); return; }
      out.push((ch.includes("<rest/>") ? "쉼" : "") + (pend.length ? "^" + pend.join("+") : "") +
               (t ? "_" + t[1] : ""));
      pend = [];
    });
    return out;
  }
  eq("괄호 토큰 → 위 기호(표시 이름) · 한글 → 아래 가사 · 같은 음이면 둘 다",
     marksOf("황|태|중|임", "{가로표}아 | {세로표} | {덩} | 다", 4),
     ["^가로표_아", "^세로표", "^덩", "_다"]);
  eq("사전에 없는 괄호 토큰은 싣지 않는다 · 별칭(s02·옛 가로막대)은 사전 이름으로",
     marksOf("황|태|중|임", "{없는기호} | {s02} | {가로막대} | [뜰]", 4),
     ["", "^s02", "^가로표", "^뜰"]);
  eq("한 행에 기호 둘 → 그 음 하나에 둘 다",
     marksOf("황|태|중|임", "{덩}{가로표} | | | ", 4),
     ["^덩+가로표", "", "", ""]);
  eq("기호는 그 행의 첫 실음에 · 행 짝은 가사와 같다",
     marksOf("황 태|중태|임|남", "{가로표} {세로표} | {덩}작은 | | ", 4),
     ["^가로표", "^세로표", "^덩_작", "_은", "", ""]);
  eq("이음·쉼표 자리의 기호는 같은 각의 다음 실음으로 · 각 끝이면 버린다",
     marksOf("황|-|중|쉼\n임|남|황|태", "{가로표} | {세로표} | 랑 | {덩}\n | | | ", 4),
     ["^가로표", "^세로표_랑", "쉼", "", "", "", ""]);
  {
    // 붙임줄 — 3정간을 끄는 황(붙임줄로 갈린다): 기호는 첫 조각 앞에만
    const r = marksOf("황| | |임", "{가로표} | | | {세로표}", 4);
    eq("붙임줄로 이은 음 — 첫 조각에만", r, ["^가로표", "^세로표"]);
  }
  {
    // 꾸밈음 뒤·본음 앞에 선다 — 꾸밈음 앞에 두면 다른 프로그램이 꾸밈음에 걸어 버린다
    app.setLyrics("{가로표} | | | ");
    app.fields.beats = "4";
    app.setMelody("중{니레}|중|중|중");
    const xml = buildMusicXml();
    app.setLyrics("");
    const d = xml.indexOf('<direction placement="above"><direction-type><words>가로표');
    const g = xml.indexOf("<grace");
    const n = xml.indexOf("<note>", d);
    ok("기호 direction은 꾸밈음 뒤, 본음 바로 앞", d > g && g > 0 && !xml.slice(d, n).includes("<grace"));
  }
  {
    // 화면 조판용(vrv)은 표지 글자 한 자(U+F0000 + 사전 차례) — vrvPage가 그림으로 바꾼다
    const r = marksOf("황|태|중|임", "{가로표} | {덩} | | ", 4, { vrv: true });
    const L = globalThis.JGB_SYM.list;
    const mk = (id) => "&#x" + (0xF0000 + L.findIndex((e) => e.id === id)).toString(16).toUpperCase() + ";";
    eq("조판용 XML은 표지 글자", r, ["^" + mk("가로표"), "^" + mk("덩"), "", ""]);
  }
  {
    // 장구(1선보)에는 안 붙는다
    Object.assign(app.fields, { wantJangdan: true, jangdan: "덩 | 덕 | 쿵 | 덕", staffJanggu: "part" });
    app.setLyrics("{가로표} | {덩} | 아 | ");
    app.fields.beats = "4";
    app.setMelody("황|태|중|임");
    const xml = buildMusicXml();
    app.setLyrics("");
    Object.assign(app.fields, { wantJangdan: false, jangdan: "", staffJanggu: "legend" });
    const percPart = xml.split("<part id=").find((p) => p.includes("<unpitched>"));
    ok("장구 파트에는 기호가 없다", percPart && !percPart.includes("<words>"));
    eq("선율 파트에 기호 둘", (xml.match(/<words>/g) || []).length, 2);
  }
  {
    // 무변화 회귀 — 가사도 기호도 없는 곁줄이면 곁줄이 아예 없는 문서와 한 글자도 같다
    const mel = "황|태 중|{니}|중{니레}\n임|- 남|쉼|황";
    app.setLyrics(""); app.fields.beats = "4"; app.setMelody(mel);
    const base = buildMusicXml();
    ok("곁줄 없는 문서엔 기호 direction이 없다", !base.includes("<words>"));
    app.setLyrics("{없는기호} | (x) | - | \n | | | ");
    ok("사전에 없는 토큰뿐인 곁줄 → 한 글자도 같다", buildMusicXml() === base);
    app.setLyrics("");
  }
}

console.log("\n선율 시김새 — 음표로 안 바뀌는 것(사전에 snd 없음)은 음표 위 기호로");
{
  // 음표마다 "^위 기호들" — 붙임줄 뒤 조각은 앞에 ⌒를 붙여 그대로 센다(칸 시김새는 거기 설 수 있다).
  function ornOf(mel, beats, ly, opt) {
    app.setLyrics(ly || "");
    app.fields.beats = String(beats);
    app.setMelody(mel);
    const xml = opt && opt.vrv
      ? globalThis.JGB_MUSICXML.build(app.fn("buildStaffScores")(), { title: "검사용", vrv: true })
      : buildMusicXml();
    app.setLyrics("");
    const out = [];
    let pend = [];
    xml.split(/(?=<direction[ >]|<note>)/).forEach((ch) => {
      if (/^<direction[ >]/.test(ch)) {
        if (ch.includes("<metronome>")) return;
        pend = pend.concat([...ch.matchAll(/<words>([^<]*)<\/words>/g)].map((m) => m[1]));
        return;
      }
      if (!ch.startsWith("<note>") || ch.includes("<grace")) return;
      out.push((ch.includes('<tie type="stop"/>') ? "⌒" : "") + (ch.includes("<rest/>") ? "쉼" : "") +
               (pend.length ? "^" + pend.join("+") : ""));
      pend = [];
    });
    return { out, xml };
  }
  // 기호 direction 줄만 걷은 XML — 이것이 기호 없는 문서와 같으면 음 길이·마디 합계가 그대로다
  const bare = (xml) => xml.replace(/\n\s*<direction placement="above"><direction-type><words>.*?<\/direction>/g, "");
  const sameNotes = (a, b) => bare(ornOf(a, 4).xml) === bare(ornOf(b, 4).xml);
  const R = globalThis.JGB_SYM;

  eq("판정은 사전의 snd 하나 — snd 없는 att/cell 시김새 수 = 사전에서 센 수",
     R.list.filter((e) => globalThis.JGB_STAFF_CORE.ornMark(e.id)).length,
     R.list.filter((e) => !e.snd && e.at && !("tempo" in e.at) && ("att" in e.at || "cell" in e.at)).length);
  ok("snd 있는 시김새·빠르기·사전 밖 기호는 대상이 아니다",
     ["nire", "ni", "nanina", "repeat", "점점느리게", "pause_007", "가로표", "덩"]
       .every((id) => globalThis.JGB_STAFF_CORE.ornMark(id) === null));
  eq("붙임 시김새 → 제가 붙은 본음 위",
     ornOf("황{흘림표}|태{미는표}|중{농음표}{끊는표}|임", 4).out,
     ["^흘림표", "^미는표", "^농음표+끊는표", ""]);
  eq("snd 있는 시김새는 음표로 둘 뿐 위 기호로 겹쳐 그리지 않는다",
     ornOf("중{니레}|{니}|황{나니나}|임{노네}", 4).xml.includes("<words>"), false);
  eq("빠르기 기호는 대상이 아니다",
     ornOf("황{점점느리게}|태|중|임", 4).xml.includes("<words>"), false);
  eq("독립 시김새가 가른 음 + 붙임 시김새 — 그 자리의 첫 음에",
     ornOf("황|{니나}{흘림표}|중|임", 4).out, ["", "^흘림표", "", "", ""]);
  eq("칸 시김새(요성표) — 앞 음이 이어지므로 그 음 머리 위(갈린 조각이 없을 때)",
     ornOf("황|{요성표}|중|임", 4).out, ["^요성표", "", ""]);
  eq("칸 시김새 — 붙임줄로 갈린 조각이 그 시각에 서면 그 조각 위",
     ornOf("황| |{요성표}|임", 4).out, ["", "⌒^요성표", ""]);
  eq("칸 시김새 — 그 시각에 서는 조각이 없으면 그 시각을 덮는 조각(앞서 시작한 가장 가까운 머리) 위",
     ornOf("황 태| |{요성표}|임", 4).out, ["", "", "⌒^요성표", ""]);
  eq("퇴성·추성을 칸으로 쓴 것도 같은 규칙 · 붙임으로 쓰면 본음 위",
     ornOf("황|{퇴성}|중{추성}|임", 4).out, ["^퇴성", "^추성", ""]);
  eq("쉼표 자리(이을 앞 음 없음)·각이 바뀐 자리의 칸 시김새는 버린다",
     ornOf("쉼|{요성표}|중|임\n{요성표}|태|중|임", 4).out.filter((x) => x.includes("^")), []);
  eq("한 음에 시김새 기호와 곁줄 기호가 함께 — 시김새가 앞, 나란히",
     ornOf("황{흘림표}|태|중|임", 4, "{가로표} | | | ").out, ["^흘림표+가로표", "", "", ""]);
  {
    const L = R.list;
    const mk = (id) => "&#x" + (0xF0000 + L.findIndex((e) => e.id === id)).toString(16).toUpperCase() + ";";
    eq("조판용 XML은 표지 글자(곁줄 기호와 같은 길)",
       ornOf("황{흘림표}|{요성표}|중|임", 4, "", { vrv: true }).out, ["^" + mk("flow") + "+" + mk("shake"), "", ""]);
  }
  ok("음 길이·마디 합계 불변 — 시김새를 뺀(칸 시김새는 이음으로 둔) 문서와 기호 줄 말고는 같다",
     sameNotes("황{흘림표}|태{미는표} 중|중{요성표}|임", "황|태 중|중 -|임"));
  ok("음 길이·마디 합계 불변 — 칸 시김새 자리를 빈 정간으로 둔 문서와 같다",
     sameNotes("황| |{요성표}|임\n황 태| |{요성표}|임", "황| | |임\n황 태| | |임"));
  {
    // 시김새가 없거나 snd 있는 것뿐인 문서는 예전과 한 글자도 같다(기호 줄이 아예 없다)
    const a = ornOf("황|태 중|{니}|중{니레}\n임|- 남|쉼|황", 4).xml;
    ok("시김새 없는/snd 시김새뿐인 문서 → 기호 direction 없음", !a.includes("<words>"));
  }
  {
    // 마디 경계로 갈린 조각 — '대강마다' 마디 나눔(4정간 = 대강 2·2)에서 셋째 정간의 요성표는
    // 둘째 마디 첫 조각 위로 간다
    Object.assign(app.fields, { staffBar: "daegang", daegang: "2 2" });
    const r = ornOf("황| |{요성표}|임", 4);
    Object.assign(app.fields, { staffBar: "auto", daegang: "" });
    eq("마디 경계로 갈린 조각에도 같은 규칙", r.out, ["", "⌒^요성표", ""]);
    ok("마디는 둘", (r.xml.match(/<measure /g) || []).length === 2);
  }
}

console.log("\n곁줄 가사 — 총보는 파트마다 제 곁줄");
{
  // 활성 파트(0)는 작업 사본 lyricsFull, 나머지는 parts[i].lyrics에서 온다
  const tot = await loadApp(
    ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
     "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
     "parseDaegang", "const:DAEGANG_PRESET", "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt", "daegangTextFor", "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens", "stripSymBracket",
     "scaleNotes", "makeScale", "seqShare", "realizeMelody",
     "staffHwang", "staffFifths", "staffTimeType", "staffPerLine", "staffBarMode", "dgOf", "barsOfGak", "measurePlan", "staffScoreOf", "scoreViewOn", "partLabel", "jangguStaffMode", "jangguStaffOn", "jangguScoreOf", "jangguPartScore", "jangguLegendScore", "buildStaffScores", "buildMusicXml", "const:VRV_DIGIT_W", "vrvTimeNotes"],
    { beats: "4", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
      title: "검사용", subtitle: "", scoreView: true, staffUnit: "dotted", staffKey: "auto", staffTime: "auto", staffPerLine: "auto", staffBar: "auto", staffJanggu: "legend", wantJangdan: false, jangdan: "", daegang: "" },
    `let parts = [{ name: "소리", abbr: "", melody: "", lyrics: "", muted: false },
                  { name: "대금", abbr: "", melody: "임|남|황|태", lyrics: "가 | 나 | {가로표} | 라", muted: false }];
     let activePart = 0;
     function stashActivePart() { parts[0].melody = melodyFull; parts[0].lyrics = lyricsFull; }`);
  tot.setMelody("황|태|중|임");
  tot.setLyrics("아 | 리 | 랑 | 가");
  const xml = tot.fn("buildMusicXml")();
  const textsOf = (part) => [...part.matchAll(/<text>([^<]*)<\/text>/g)].map((m) => m[1]);
  const ps = xml.split("<part id=").slice(1);
  eq("두 파트", ps.length, 2);
  eq("파트 1(활성) — 제 곁줄", textsOf(ps[0]), ["아", "리", "랑", "가"]);
  eq("파트 2 — 제 곁줄(기호 토큰은 빠짐)", textsOf(ps[1]), ["가", "나", "라"]);
}

console.log("\n곁줄 가사 — 예시 악보");
{
  const fs = await import("node:fs");
  const keep = Object.assign({}, app.fields);
  [["늴리리야", "samples/늴리리야.jgb.json"], ["새야새야", "samples/새야새야.jgb.json"]].forEach(([nm, f]) => {
    const d = JSON.parse(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"));
    const c = d.controls || {};
    ["beats", "gakBeats", "daegang", "hwangPitch", "joPreset", "tempoBpm"].forEach((k) => {
      if (c[k] != null) app.fields[k] = String(c[k]);
    });
    const mel = d.parts ? d.parts[d.activePart || 0].melody : d.melody;
    const ly = d.parts ? d.parts[d.activePart || 0].lyrics : d.lyrics;
    app.setLyrics(ly);
    app.setMelody(mel);
    const xml = buildMusicXml();
    app.setLyrics("");
    const got = [...xml.matchAll(/<text>([^<]*)<\/text>/g)].map((m) => m[1]);
    // 곁줄에 적힌 한글 음절 수(기대값) — 검사가 원문을 따로 세어 견준다
    const want = ly.replace(/\{[^{}]*\}|\[[^\[\]]*\]|\([^()]*\)/g, "").match(/[가-힣]/g) || [];
    const joined = got.join("");
    console.log(`    ${nm}: 곁줄 음절 ${want.length} · 실린 가사 ${got.length}개 — ${got.slice(0, 16).join(" ")} …`);
    ok(`${nm} — 가사가 실린다`, got.length > 0);
    // 이 두 곡은 음 없는 자리에 글자가 없어 하나도 안 버려진다 — 곁줄 음절이 차례 그대로 다 실려야 한다
    ok(`${nm} — 곁줄의 한글 음절이 차례 그대로 빠짐없이 실린다`,
       joined === want.join(""), `${joined.slice(0, 30)} / ${want.join("").slice(0, 30)}`);
  });
  Object.keys(app.fields).forEach((k) => { app.fields[k] = keep[k]; });
}

console.log("\n악보 꼴 — 열고 닫는 짝이 맞는가");
{
  const xml = xmlOf("황|태|중|임", 4);
  ok("XML 선언·루트가 있다", xml.startsWith("<?xml") && xml.trimEnd().endsWith("</score-partwise>"));
  ok("박자표는 3N/8 (4정간 → 12/8)", xml.includes("<beats>12</beats><beat-type>8</beat-type>"));
  ok("divisions는 1680", xml.includes("<divisions>1680</divisions>"));
  const tags = {};
  // 자체로 닫는 태그(<sound tempo="90"/>·<grace slash="yes"/>)를 놓치지 않으려면 태그
  // 전체를 봐야 한다 — 이름만 떼면 뒤의 />를 못 본다.
  let mt;
  const re = /<(\/?)([a-z-]+)([^>]*)>/g;
  while ((mt = re.exec(xml))) {
    if (mt[3].endsWith("/")) continue;          // 자체 닫힘
    tags[mt[2]] = (tags[mt[2]] || 0) + (mt[1] ? -1 : 1);
  }
  const unbalanced = Object.keys(tags).filter((k) => tags[k] !== 0);
  ok("모든 태그가 닫힌다", unbalanced.length === 0, `안 닫힌 태그: ${unbalanced}`);
  ok("제목이 실린다", xml.includes("<work-title>검사용</work-title>"));
}

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
