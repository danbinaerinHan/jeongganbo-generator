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
   "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffFifths", "staffScoreOf", "buildStaffScores", "buildMusicXml"],
  { beats: "4", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", staffUnit: "dotted" },
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

console.log("\n마디를 넘는 긴 음은 붙임줄로 잇는가");
{
  const ms = parseMeasures(xmlOf("황| | | \n | | | \n태| | | ", 4));
  const first = ms[0].filter((n) => !n.grace);
  eq("첫 마디는 한 음이 마디를 꽉 채우고 tie 시작", [first.length, first[0].dur, first[0].tie],
     [1, 4 * JG, '<tie type="start"/>']);
  // 황은 두 마디를 채우고 셋째 마디에서 태로 바뀌므로, 둘째 마디는 받기만 하고 안 넘긴다
  const second = ms[1].filter((n) => !n.grace);
  eq("둘째 마디는 이어받고 거기서 끝난다", [second.length, second[0].tie],
     [1, '<tie type="stop"/>']);
  eq("셋째 마디는 새 음(태)으로 시작", [ms[2].filter((n) => !n.grace)[0].tie], [""]);
}

console.log("\n조표 — 음계 다섯 음이 임시표 없이 적히는 조를 고르는가");
{
  app.fields.joPreset = "hwang-pyeong";     // 황태중임남 = E♭ F A♭ B♭ C
  const f1 = mxlFifths(63);
  // 세종 자료는 ♭4개로 박아 두었지만 우리는 음계에서 끌어낸다 → E♭장조(♭3). 소리는 같다.
  ok(`황=E♭ 평조 → 내림표 ${-f1}개 (E♭장조)`, f1 === -3, `나온 값: ${f1}`);
  const scale = ["황", "태", "중", "임", "남"].map((n) => 63 + YUL.indexOf(n));
  ok("다섯 음 모두 임시표 없이 적힌다",
     scale.every((m) => mxlPitch(m, f1).acc === null),
     scale.map((m) => `${m}:${mxlPitch(m, f1).step}${mxlPitch(m, f1).alter}`).join(" "));
  app.fields.joPreset = "hwang-gyemyeon";   // 황협중임무
  const f2 = mxlFifths(63);
  const gye = ["황", "협", "중", "임", "무"].map((n) => 63 + YUL.indexOf(n));
  ok(`계면조도 임시표 없이 (내림표 ${-f2}개)`,
     gye.every((m) => mxlPitch(m, f2).acc === null));
  app.fields.joPreset = "hwang-pyeong";
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
  // 3분박은 4분음표로 보면 딱 안 떨어진다 → 음표꼴을 비우고 길이만 정확히 적는다
  const t = xmlOf("황태중|임|남|중", 4);
  const first = parseMeasures(t)[0].filter((n) => !n.grace)[0];
  ok("3분박을 4분음표로 보면 길이는 정확하되 음표꼴은 비운다",
     first.dur === 560 && !t.split("<note>")[1].includes("<type>"));
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
