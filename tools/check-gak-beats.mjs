// 각별 정간 수(#gakBeats)가 제대로 도나 검사한다.
//
//   node tools/check-gak-beats.mjs
//
// 곡 안에서 각 길이가 바뀌는 악보가 있다 — 가곡은 곡이 각의 한가운데에서 시작해 한 바퀴
// 돌아 끝나고(5 + 16×14 + 11), 수제천·취타는 장이 바뀌는 자리에 짧은 각이 낀다.
// 기본은 #beats 하나, 다른 각만 #gakBeats에 '각 번호:정간 수'로 적는다.
//
// 여기서 보는 것은 그 값이 **세 군데에서 같은 답을 내는가**다: 정간을 한 줄로 편 번호(복사·
// 붙여넣기), 재생이 흐르는 시간(realizeMelody), 오선보의 마디 길이(MusicXML). 셋이 어긋나면
// 악보와 소리와 파일이 서로 다른 곡이 된다.
//
// js/app.js의 함수를 이름으로 떼어 와 그대로 돌린다(tools/lib/app-sandbox.mjs 참고).

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/musicxml.js");
await import("../js/staff-glyphs.js");
await import("../js/staff-view.js");

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "const:DAEGANG_PRESET",
   "parseDaegang", "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt", "daegangTextFor",
   "gakCellOffset", "melCellSeq", "seqToCell",
   "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffHwang", "staffFifths", "staffScoreOf", "buildStaffScores", "buildMusicXml"],
  { beats: "12", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", staffUnit: "dotted", staffKey: "auto", daegang: "" },
  `let parts = [{ name: "", abbr: "", melody: "", muted: false }];
   let activePart = 0;
   function stashActivePart() { parts[0].melody = melodyFull; }`
);
const beatsAt = app.fn("beatsAt");
const seqToCell = app.fn("seqToCell");
const melCellSeq = app.fn("melCellSeq");
const daegangTextFor = app.fn("daegangTextFor");
const realizeMelody = app.fn("realizeMelody");
const buildMusicXml = app.fn("buildMusicXml");

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function setup(beats, gakBeats, melody) {
  app.fields.beats = String(beats);
  app.fields.gakBeats = gakBeats;
  if (melody != null) app.setMelody(melody);
}
// 각 길이 목록대로 빈 각을 짓는다(" | " 꼴 — ||는 옛 각-구분으로 읽힌다)
const gakOf = (n, fill) => Array.from({ length: n }, (_, i) => (fill ? fill[i] || "" : "")).join(" | ");

console.log("예외 읽기 — '각 번호:정간 수'는 사람이 세는 1부터");
{
  setup(12, "1:5, 16:11");
  ok("1각이 5정간", beatsAt(0) === 5);
  ok("2각은 기본 12정간", beatsAt(1) === 12);
  ok("16각이 11정간", beatsAt(15) === 11);
  setup(12, "");
  ok("예외가 비면 전부 기본값", beatsAt(0) === 12 && beatsAt(99) === 12);
  setup(12, "2:0, 3:99, 헛소리, 4:7");
  ok("범위 밖·헛소리는 조용히 버린다", beatsAt(1) === 12 && beatsAt(2) === 12 && beatsAt(3) === 7);
}

console.log("\n한 줄로 편 정간 번호 — 복사·붙여넣기가 이 셈을 쓴다");
{
  setup(12, "1:5, 3:7");           // 5, 12, 7, 12, …
  ok("첫 각은 0부터", melCellSeq(0, 0) === 0 && melCellSeq(0, 4) === 4);
  ok("둘째 각은 5부터", melCellSeq(1, 0) === 5);
  ok("셋째 각은 17부터", melCellSeq(2, 0) === 17);
  ok("넷째 각은 24부터", melCellSeq(3, 0) === 24);
  const round = [0, 4, 5, 16, 17, 23, 24, 35].every((q) => {
    const c = seqToCell(q);
    return melCellSeq(c.gi, c.ci) === q;
  });
  ok("번호 ↔ (각,정간)이 서로 되돌아온다", round);
}

console.log("\n재생 — 각마다 제 길이만큼 시간이 흐른다");
{
  setup(12, "1:5, 3:7", [gakOf(5), gakOf(12), gakOf(7)].join("\n"));
  const slots = realizeMelody(63, undefined, {});
  const total = slots.reduce((a, s) => a + s.dur, 0);
  ok("빈 악보의 총 길이 = 5 + 12 + 7 = 24정간", Math.abs(total - 24) < 1e-9, `총 ${total}`);
  setup(12, "", [gakOf(12), gakOf(12), gakOf(12)].join("\n"));
  const flat = realizeMelody(63, undefined, {}).reduce((a, s) => a + s.dur, 0);
  ok("예외가 없으면 각 수 × 정간 수 그대로", Math.abs(flat - 36) < 1e-9, `총 ${flat}`);
  // 짧은 각의 마지막 음이 다음 각으로 새지 않는가 — 자리(beat)로 확인한다
  setup(12, "1:2", ["황 | 태", "중 | 임 | 남"].join("\n"));
  const s2 = realizeMelody(63, undefined, {});
  ok("2정간 각 다음 각은 2에서 시작", s2.filter((s) => s.gak === 1)[0].beat === 2,
     JSON.stringify(s2.map((s) => [s.gak, s.beat])));
}

console.log("\n오선보 — 각 = 마디라 마디 길이·박자표가 마디마다 바뀐다");
{
  const JG = 2520;   // 정간 하나 = 점4분음표
  setup(12, "1:5, 3:7", [gakOf(5, ["황"]), gakOf(12, ["태"]), gakOf(7, ["중"])].join("\n"));
  const xml = buildMusicXml();
  const durs = xml.split("<measure ").slice(1).map((m) =>
    (m.match(/<duration>(\d+)<\/duration>/g) || [])
      .map((d) => Number(d.replace(/\D/g, "")))
      .reduce((a, b) => a + b, 0));
  ok("마디 길이가 5·12·7정간", JSON.stringify(durs) === JSON.stringify([5 * JG, 12 * JG, 7 * JG]),
     JSON.stringify(durs.map((d) => d / JG)));
  const times = (xml.match(/<time><beats>(\d+)<\/beats>/g) || []).map((t) => Number(t.replace(/\D/g, "")));
  ok("박자표가 15/8 → 36/8 → 21/8로 바뀐다", JSON.stringify(times) === JSON.stringify([15, 36, 21]),
     JSON.stringify(times));
  setup(12, "", [gakOf(12, ["황"]), gakOf(12, ["태"])].join("\n"));
  const xml2 = buildMusicXml();
  ok("길이가 다 같으면 박자표는 첫 마디에만",
     (xml2.match(/<time>/g) || []).length === 1);
}

console.log("\n오선보 화면 — 바뀌는 자리에 박자표를 다시 적는가");
{
  setup(12, "1:5, 3:7", [gakOf(5, ["황"]), gakOf(12, ["태"]), gakOf(7, ["중"])].join("\n"));
  const svg = globalThis.JGB_STAFF.render(app.fn("buildStaffScores")(), { width: 4000 });
  const digits = (svg.match(/class="sv-time"[^>]*data-t="(\d)"/g) || [])
    .map((t) => t.slice(-2, -1)).join("");
  // 15/8(줄머리) → 36/8 → 21/8 : 숫자 여섯 벌
  ok("박자표가 세 번 적힌다(15·8 / 36·8 / 21·8)", digits === "158368218", digits);
  setup(12, "", [gakOf(12, ["황"]), gakOf(12, ["태"])].join("\n"));
  const svg2 = globalThis.JGB_STAFF.render(app.fn("buildStaffScores")(), { width: 4000 });
  const digits2 = (svg2.match(/class="sv-time"[^>]*data-t="(\d)"/g) || [])
    .map((t) => t.slice(-2, -1)).join("");
  ok("길이가 같으면 줄머리에 한 번만(36/8)", digits2 === "368", digits2);
}

console.log("\n대강 — '각 번호'가 아니라 '각 길이'가 정한다");
{
  app.fields.beats = "12"; app.fields.gakBeats = "1:5";
  app.fields.daegang = "3 3 3 3, 5: 3 2";
  ok("기본 각(12정간)은 앞머리 분절", daegangTextFor(12) === "3 3 3 3");
  ok("5정간 각은 제 분절", daegangTextFor(5) === "3 2");
  ok("안 적은 길이는 대표 패턴", daegangTextFor(20) === "6 4 4 6");
  ok("대표 패턴도 없으면 대강 없음", daegangTextFor(7) === "");
  app.fields.daegang = "3,3,3,3";   // 옛 문서 — 쉼표로 나눈 숫자
  ok("옛 문서의 '3,3,3,3'이 그대로 읽힌다", daegangTextFor(12) === "3 3 3 3");
}

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
