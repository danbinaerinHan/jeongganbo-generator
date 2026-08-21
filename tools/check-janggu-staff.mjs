// 장단이 오선보(1선보)로 제대로 옮겨지는지 검사한다.
//
//   node tools/check-janggu-staff.mjs
//
// 보는 것은 다섯이다:
//   ① 마디 길이 — 두 성부(채편·북편)가 저마다 마디를 딱 채우나(어긋나면 악보 프로그램이
//      마디를 다시 짠다). <backup>이 마디 총 길이와 같은가도 함께 본다.
//   ② 손 → 기둥 — 궁은 아래, 채편은 위, 덩은 둘 다. 이것이 곧 '무엇으로 쳤나'라서
//      뒤바뀌면 다른 장단이 된다.
//   ③ 타점 자리 — 분박이 선율과 같은 규칙으로 나뉘고, 타점 길이가 다음 타점까지인가.
//   ④ 겹채·굴림 — 기덕은 앞꾸밈 하나, 더러러러는 트레몰로.
//   ⑤ 모드 — '안 그림/첫 마디만/파트로 반복'이 각각 몇 마디를 내나.
//
// 셈을 여기 한 벌 더 적지 않는다 — js/app.js의 함수를 이름으로 떼어 와 그대로 돌린다
// (tools/lib/app-sandbox.mjs). 검사가 보는 것이 곧 배포되는 코드다.

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/musicxml.js");

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "const:DAEGANG_PRESET",
   "parseDaegang", "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt", "daegangTextFor",
   "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens", "stripSymBracket",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffHwang", "staffFifths", "staffTimeType", "staffPerLine", "staffBarMode", "dgOf",
   "barsOfGak", "measurePlan", "staffScoreOf", "scoreViewOn",
   "jangguStaffMode", "jangguStaffOn", "jangguScoreOf", "jangguPartScore", "jangguLegendScore",
   "buildStaffScores", "buildMusicXml"],
  { beats: "12", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", staffUnit: "eighth", staffKey: "auto", staffTime: "auto",
    staffPerLine: "auto", staffBar: "auto", daegang: "3 3 3 3",
    staffJanggu: "legend", wantJangdan: true, jangdan: "" },
  `let parts = [{ name: "", abbr: "", melody: "", muted: false }];
   let activePart = 0;
   function stashActivePart() { parts[0].melody = melodyFull; }`
);
const F = app.fields;
const jangguScoreOf = app.fn("jangguScoreOf");
const jangguLegendScore = app.fn("jangguLegendScore");
const jangguPartScore = app.fn("jangguPartScore");
const buildMusicXml = app.fn("buildMusicXml");
const JG8 = 840;   // 정간 하나 = 8분음표

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(label, g === w, `나온 값: ${g}\n      바란 값: ${w}`);
}

// 한 성부의 마디 → [{ at, units, rest, grace, trem }] (at = 마디 머리에서의 자리)
function laneOf(score, lane, mi) {
  let at = 0;
  return score.lanes[lane][mi].map(function (n) {
    const o = { at: at, units: n.units, rest: !!n.rest,
                grace: (n.graces || []).length, trem: n.trem || 0 };
    at += n.units;
    return o;
  });
}
const hits = (score, lane, mi) => laneOf(score, lane, mi).filter((n) => !n.rest);
const totalOf = (score, lane, mi) =>
  score.lanes[lane][mi].reduce((a, n) => a + n.units, 0);

// ── ① 마디 길이 ──────────────────────────────────────────────────────
console.log("마디 길이 — 두 성부가 저마다 마디를 딱 채우는가 (12정간 × 8분음표 = 10080)");
F.jangdan = "덩| | |기덕| | |궁| | |더러러러| | ";
{
  const s = jangguScoreOf([12]);
  eq("채편(위) 총 길이", totalOf(s, 0, 0), 12 * JG8);
  eq("북편(아래) 총 길이", totalOf(s, 1, 0), 12 * JG8);
  eq("마디 수", s.lanes[0].length, 1);
  eq("measBeats", s.measBeats, [12]);
}
// 각 길이가 다르면 그 길이만큼만 — 장단은 늘 표준 정간 수라 짧은 각에서는 잘린다
{
  const s = jangguScoreOf([12, 5]);
  eq("각 둘(12·5) 마디 수", s.lanes[0].length, 2);
  eq("둘째 각 총 길이", totalOf(s, 0, 1), 5 * JG8);
  eq("gakMeasStart", s.gakMeasStart, [0, 1, 2]);
}
// '대강마다'로 끊으면 각 하나가 마디 넷 — 선율과 **같은 measurePlan**을 봐야 나란히 선다
{
  F.staffBar = "daegang";
  const s = jangguScoreOf([12]);
  eq("대강마다 마디 수", s.lanes[0].length, 4);
  eq("대강마다 measBeats", s.measBeats, [3, 3, 3, 3]);
  eq("마디마다 3정간씩 채운다",
     [0, 1, 2, 3].map((mi) => totalOf(s, 0, mi)), [2520, 2520, 2520, 2520]);
  eq("셋째 마디(궁)는 채편이 통째로 쉼표", hits(s, 0, 2).length, 0);
  eq("셋째 마디에 북편 타점 하나", hits(s, 1, 2).length, 1);
  F.staffBar = "auto";
}

// ── ② 손 → 기둥 ─────────────────────────────────────────────────────
console.log("\n손 → 기둥 — 북편(궁)은 아래, 채편은 위, 덩은 둘 다");
F.jangdan = "덩| | |궁| | |덕| | |다| | ";
{
  const s = jangguScoreOf([12]);
  eq("채편 타점 자리", hits(s, 0, 0).map((n) => n.at / JG8), [0, 6, 9]);
  eq("북편 타점 자리", hits(s, 1, 0).map((n) => n.at / JG8), [0, 3]);
  const xml = globalThis.JGB_MUSICXML.build([s], {});
  ok("1선보로 적힌다", xml.includes("<staff-lines>1</staff-lines>"));
  ok("타악 자리표", xml.includes("<sign>percussion</sign>"));
  ok("조표를 안 적는다", !xml.includes("<fifths>"));
  ok("음높이가 아니라 자리로 적는다", xml.includes("<unpitched>") && !xml.includes("<pitch>"));
  ok("성부 둘", xml.includes("<voice>1</voice>") && xml.includes("<voice>2</voice>"));
  ok("backup이 마디 총 길이", xml.includes("<backup><duration>10080</duration></backup>"));
  const up = (xml.match(/<stem>up<\/stem>/g) || []).length;
  const dn = (xml.match(/<stem>down<\/stem>/g) || []).length;
  eq("기둥 위 셋(덩·덕·다) · 아래 둘(덩·궁)", [up, dn], [3, 2]);
  ok("붙임줄이 없다 — 북 한 번은 이어지지 않는다", !xml.includes("<tie "));
  ok("쉼표엔 기둥을 안 적는다 (규격 위반이자 조판기가 헷갈린다)",
     !/<rest\/>[\s\S]*?<stem>/.test(xml.split("<note>").filter((n) => n.includes("<rest/>"))
       .join("")));
  ok("타악기라고 말해 둔다", xml.includes("<midi-channel>10</midi-channel>"));
}
// 작은덩·다는 덩·덕과 **같은 음표**다(2026-08-21 사용자 확정) — 크기로 가르지 않는다
{
  F.jangdan = "덩| | |작은덩| | | | | | | | ";
  const a = jangguScoreOf([12]);
  eq("작은덩도 양손", [hits(a, 0, 0).length, hits(a, 1, 0).length], [2, 2]);
  const xml = globalThis.JGB_MUSICXML.build([a], {});
  ok("작은덩에 꾸밈음·트레몰로가 안 붙는다",
     !xml.includes("<grace") && !xml.includes("<tremolo"));
}

// ── ③ 타점 자리·길이 ────────────────────────────────────────────────
console.log("\n타점 — 분박은 선율과 같은 규칙, 길이는 다음 타점까지");
{
  // 한 정간을 셋으로 나눈 칸: 덩 - 덕  →  0 · (2/3)정간 자리에 타점
  F.jangdan = "덩 - 덕| | | | | | | | | | | ";
  const s = jangguScoreOf([12]);
  eq("분박 셋 중 첫·셋째", hits(s, 0, 0).map((n) => n.at), [0, 560]);
  eq("첫 타점은 다음 타점까지", hits(s, 0, 0)[0].units, 560);
  // 8분음표 단위라 한 박 = 대강(3정간) — 타점은 거기서 끊기고 남는 자리는 쉼표다
  eq("끝 타점은 그 박(대강) 끝까지", hits(s, 0, 0)[1].units, 3 * JG8 - 560);
}
{
  // 이음(-)은 새로 치지 않는다 — 앞 타점이 그만큼 길어질 뿐
  F.jangdan = "덕|-|-|덕| | | | | | | | ";
  const s = jangguScoreOf([12]);
  eq("이음은 타점이 아니다", hits(s, 0, 0).length, 2);
  eq("첫 타점이 제 박(대강 3정간)을 채운다", hits(s, 0, 0)[0].units, 3 * JG8);
}
{
  // 타점 앞의 빈 자리는 쉼표
  F.jangdan = " | |덕| | | | | | | | | ";
  const s = jangguScoreOf([12]);
  const lane = laneOf(s, 0, 0);
  ok("앞이 쉼표로 메워진다", lane[0].rest && lane[0].units === 2 * JG8);
}

// ── ④ 겹채·굴림 ─────────────────────────────────────────────────────
console.log("\n겹채(기덕)·굴림(더러러러)");
{
  F.jangdan = "기덕| | |더러러러| | | | | | | | ";
  const s = jangguScoreOf([12]);
  eq("기덕은 앞꾸밈 하나", hits(s, 0, 0)[0].grace, 1);
  eq("더러러러는 트레몰로 사선 셋", hits(s, 0, 0)[1].trem, 3);
  const xml = globalThis.JGB_MUSICXML.build([s], {});
  eq("꾸밈음 하나가 실린다", (xml.match(/<grace slash="yes"\/>/g) || []).length, 1);
  eq("트레몰로 하나가 실린다",
     (xml.match(/<tremolo type="single">3<\/tremolo>/g) || []).length, 1);
  ok("꾸밈음도 음높이가 아니라 자리로", !xml.includes("<pitch>"));
}

// ── ⑤ 모드 ──────────────────────────────────────────────────────────
console.log("\n모드 — 안 그림 / 첫 마디만 / 파트로 반복");
F.jangdan = "덩| | |궁| | |덕| | |덕| | ";
app.setMelody("황| | |태| | |중| | |임| | \n황| | |태| | |중| | |임| | \n황| | |태| | |중| | |임| | ");
{
  eq("범례는 한 마디", jangguLegendScore().lanes[0].length, 1);
  eq("파트는 각 수만큼(3각)", jangguPartScore().lanes[0].length, 3);

  F.staffJanggu = "off";
  ok("안 그림 — 파일에 장구가 없다", !buildMusicXml().includes("percussion"));

  F.staffJanggu = "legend";
  const lg = buildMusicXml();
  // 범례는 '종이에 몇 번 그릴까'라 파일에는 안 걸린다 — MusicXML은 곡 자체를 담는 형식이고
  // 장단은 실제로 곡 내내 치므로, 한 마디만 넣으면 '첫 각에만 장단이 있는 곡'이 된다.
  ok("첫 마디만 — 파일엔 장구가 실린다", lg.includes("percussion"));
  eq("파일의 장구 파트는 곡 전체(3각)", lg.split('<part id="P1">')[1].split("</part>")[0]
       .split("<measure ").length - 1, 3);
  ok("장구가 맨 위 파트(P1)",
     lg.indexOf("<part-name>장구</part-name>") < lg.indexOf('<score-part id="P2">'));
  // 이름 없는 선율은 장구가 붙어도 '선율'이다 — 장구까지 세면 '악기 2'가 된다
  ok("장구가 파트 수 셈에 안 낀다", lg.includes("<part-name>선율</part-name>"));

  F.staffJanggu = "part";
  const pt = buildMusicXml();
  eq("파트로 반복 — 각 수만큼 마디",
     pt.split('<part id="P1">')[1].split("</part>")[0].split("<measure ").length - 1, 3);
  ok("빠르기 표시는 맨 위(장구) 파트에 한 번",
     (pt.match(/<metronome>/g) || []).length === 1);

  // 장단 줄을 꺼 두면 어느 모드든 안 나온다 — 정간보에 없는 것이 오선보에 있을 수 없다
  F.wantJangdan = false;
  ok("장단 줄이 꺼져 있으면 안 그린다", !buildMusicXml().includes("percussion"));
  F.wantJangdan = true;
  // 적힌 것이 이음뿐이면 그릴 것이 없다
  F.jangdan = "-|-|-| | | | | | | | | ";
  ok("타점이 없으면 안 그린다", !buildMusicXml().includes("percussion"));
  F.jangdan = "덩| | |궁| | |덕| | |덕| | ";
  F.staffJanggu = "legend";
}

console.log(fail ? `\n✗ ${fail}개 실패 (통과 ${pass})` : `\n✓ ${pass}개 통과`);
process.exit(fail ? 1 : 0);
