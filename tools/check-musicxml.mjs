// 오선보(MusicXML) 내보내기가 말이 되는 악보를 뱉는지 검사한다.
//
//   node tools/check-musicxml.mjs
//
// XML을 쓰는 것은 js/musicxml.js(순수 모듈)이고, 재료를 만드는 것은 js/app.js의
// buildStaffScores다 — 후자만 이름으로 떼어 와 돌린다(tools/lib/app-sandbox.mjs).
// 보는 것은 셋이다: ① 마디 길이가 딱 맞나(어긋나면 악보 프로그램이 마디를 다시 짠다)
// ② 음높이가 재생과 같은가(같은 realizeMelody를 보므로 어긋나면 어느 한쪽이 깨진 것)
// ③ 시김새가 제 꼴로 적히나(붙임=꾸밈음, 독립=제 자리를 나눈 실음).

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/musicxml.js");

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "parseDaegang", "const:DAEGANG_PRESET", "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt", "daegangTextFor", "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffHwang", "staffFifths", "staffTimeType", "staffScoreOf", "scoreViewOn", "buildStaffScores", "buildMusicXml"],
  { beats: "4", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", staffUnit: "dotted", staffKey: "auto", staffTime: "auto", daegang: "" },
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
 ["5등분 시김새", "중{느나르나니}|임|남|황", 4],
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
  // 독립 시김새는 제 자리를 고르게 나눈 '실음'이라 길이가 있어야 한다
  const m = parseMeasures(xmlOf("중|{느나르나니}|황|황", 4))[0];
  const five = m.slice(1, 6);
  eq("{느나르나니}는 다섯 실음으로", five.map(midiOf),
     [P("태"), P("중"), P("임"), P("중"), P("태")]);
  ok("다섯이 정간 하나를 고르게 나눈다", five.every((n) => n.dur === JG / 5),
     `길이: [${five.map((n) => n.dur)}]`);
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
