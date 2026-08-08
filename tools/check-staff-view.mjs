// 오선보 보기(js/staff-view.js)가 제대로 그리는지 검사한다.
//
//   node tools/check-staff-view.mjs
//
// 그림이 '예쁜가'는 눈으로 볼 일이고, 여기서 보는 것은 눈으로 놓치기 쉬운 것들이다:
// ① 밑감(js/staff-core.js)이 음이름·조표를 옳게 푸는가 — 예전엔 app.js와 staff-view에
//    같은 셈이 두 벌이라 '둘이 같은가'를 봤는데, 한 벌로 합치면서 '값이 맞는가'로 바뀌었다.
// ② 그림 밖으로 삐져나간 음표가 없는가 — 하배 음역이 통째로 잘린 적이 있다.
// ③ 재료에 있는 음표가 다 그려지는가 · 빽빽한 정간에서 머리가 겹치지 않는가.
// ④ 총보(악기 여럿)가 악기 수만큼 오선을 그리는가.

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/staff-view.js");
const CORE = globalThis.JGB_STAFF_CORE;
const STAFF = globalThis.JGB_STAFF;

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffFifths", "staffScoreOf", "buildStaffScores"],
  { beats: "4", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", scoreView: false, staffUnit: "dotted" },
  `let parts = [{ name: "", abbr: "", melody: "", muted: false }];
   let activePart = 0;
   function stashActivePart() { parts[activePart].melody = melodyFull; }`
);
const buildStaffScores = app.fn("buildStaffScores");
const staffScoreOf = app.fn("staffScoreOf");

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function scoresOf(mel, beats) {
  app.fields.beats = String(beats);
  app.setMelody(mel);
  return buildStaffScores();
}
const heads = (scores) => scores.reduce((a, s) => a + s.measures.reduce((b, m) =>
  b + m.filter((n) => !n.rest).reduce((c, n) => c + 1 + n.graces.length + n.afters.length, 0), 0), 0);
const drawn = (svg) => (svg.match(/<ellipse/g) || []).length;

console.log("밑감 — 음이름과 조표를 옳게 푸는가");
{
  const YUL = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
  // 황=E♭ 평조(황태중임남) → E♭장조(♭3), 다섯 음 모두 임시표 없이
  const pyeong = ["황", "태", "중", "임", "남"].map((n) => (63 + YUL.indexOf(n)) % 12);
  const f1 = CORE.fifthsFor(pyeong);
  ok(`황=E♭ 평조 → 내림표 ${-f1}개(E♭장조)`, f1 === -3, `나온 값: ${f1}`);
  ok("평조 다섯 음이 임시표 없이 적힌다",
     ["황", "태", "중", "임", "남"].every((n) => CORE.pitchAt(63 + YUL.indexOf(n), f1).acc === null));
  const gye = ["황", "협", "중", "임", "무"].map((n) => (63 + YUL.indexOf(n)) % 12);
  const f2 = CORE.fifthsFor(gye);
  ok(`계면조도 임시표 없이(내림표 ${-f2}개)`,
     ["황", "협", "중", "임", "무"].every((n) => CORE.pitchAt(63 + YUL.indexOf(n), f2).acc === null));
  [[60, "C", 0, 4], [63, "E", -1, 4], [51, "E", -1, 3], [75, "E", -1, 5], [39, "E", -1, 2]]
    .forEach(([m, st, al, oc]) => {
      const p = CORE.pitchAt(m, -3);
      ok(`midi ${m} → ${st}${al < 0 ? "♭" : ""}${oc} (옥타브가 안 밀린다)`,
         p.step === st && p.alter === al && p.octave === oc, `나온 값: ${p.step}${p.alter}/${p.octave}`);
    });
  ok("점4분음표(정간 하나)는 딱 떨어진다",
     JSON.stringify(CORE.exactValue(CORE.JG.dotted)) === '{"type":"quarter","dots":1}');
  ok("정간의 5등분은 딱 안 떨어진다(비워 둔다)", CORE.exactValue(CORE.JG.dotted / 5) === null);
  ok("그리기용은 늘 무언가를 준다(5등분 → 16분음표)",
     CORE.nearestValue(CORE.JG.dotted / 5).flags === 2);
}

console.log("\n음표 수 — 재료에 있는 것이 다 그려지는가");
[["보통 가락", "황|태중|임|남", 4],
 ["시김새·꾸밈음", "중{니레}|{느나르나니}|황{느니르}|임", 4],
 ["쉼표·이음", "황|쉼|-|중", 4],
 ["여러 각", "황|태|중|임\n남|황|태|중\n중|임|남|황", 4]
].forEach(function (t) {
  const scores = scoresOf(t[1], t[2]);
  const want = heads(scores);
  ok(`${t[0]} — 머리 ${want}개가 다 그려짐`,
     drawn(STAFF.render(scores, { width: 1200, scale: 1.6 })) === want);
});

console.log("\n잘림 — 그림 상자를 벗어난 음표가 없는가");
[["보통 음역", "황|태|중|임", 4],
 ["아주 낮은 음(하배황)", "하배황|하배태|황|중", 4],
 ["아주 높은 음(중청황)", "중청황|청남|청중|황", 4],
 ["위아래로 넓은 곡", "하배황|중청황|황|청황", 4]
].forEach(function (t) {
  const svg = STAFF.render(scoresOf(t[1], t[2]), { width: 1200, scale: 1.6 });
  const wh = svg.match(/width="(\d+)" height="(\d+)"/);
  const W = Number(wh[1]), H = Number(wh[2]);
  const bad = [];
  let m;
  const re = /<ellipse cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g;
  while ((m = re.exec(svg))) {
    if (+m[2] - +m[4] < 0 || +m[2] + +m[4] > H || +m[1] - +m[3] < 0 || +m[1] + +m[3] > W) bad.push(m[0]);
  }
  ok(`${t[0]} — 모두 상자 안 (${W}×${H})`, !bad.length, bad[0]);
});

console.log("\n짜임새");
{
  const scores = scoresOf("황|태|중|임\n남|황|태|중", 4);
  const svg = STAFF.render(scores, { width: 1200, scale: 1.6 });
  const n = scores[0].measures.length;
  ok("마디줄이 각마다 하나씩", (svg.match(/stroke-width="1.4"/g) || []).length === n);
  ok("각 번호가 각마다 하나씩", (svg.match(/opacity="\.55"/g) || []).length === n);
  ok("SVG가 열고 닫힌다", svg.startsWith("<svg ") && svg.endsWith("</svg>"));
  const svg2 = STAFF.render(scoresOf("{느나르나니}|황|태|중", 4), { width: 1200, scale: 1.6 });
  const xs = [];
  let m;
  const re = /<ellipse cx="([-\d.]+)"[^/]*rx="([\d.]+)"/g;
  while ((m = re.exec(svg2))) xs.push([+m[1], +m[2]]);
  let overlap = 0;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i][0] - xs[i - 1][0] < (xs[i][1] + xs[i - 1][1]) * 0.9) overlap++;
  }
  ok("빽빽한 정간에서도 음표머리가 겹치지 않는다", overlap === 0, `겹친 짝 ${overlap}개`);
}

console.log("\n정간을 4분음표로 봐도 그림이 성립하는가");
{
  app.fields.staffUnit = "plain";
  const scores = scoresOf("황태중|임 남|중|임", 4);
  const svg = STAFF.render(scores, { width: 1200, scale: 1.6 });
  ok("정간 길이가 4분음표(1680)로 실린다", scores[0].jg === CORE.JG.plain);
  ok("머리가 다 그려진다", drawn(svg) === heads(scores));
  ok("마디는 여전히 각 하나", (svg.match(/stroke-width="1.4"/g) || []).length === scores[0].measures.length);
  // 4분음표 정간의 3분박 = 셋잇단 8분음표 자리라 꼬리가 하나 → 빔이 생긴다
  ok("3분박이 빔으로 묶인다", (svg.match(/<rect/g) || []).length >= 1);
  app.fields.staffUnit = "dotted";
}

console.log("\n총보 — 악기가 여럿이면 오선도 여럿");
{
  // 악기 둘을 손으로 세워 재료를 만든다(파트 목록은 app.js 쪽 일이라 여기선 재료만 본다)
  app.fields.beats = "4";
  app.setMelody("황|태|중|임");
  const a = staffScoreOf("황|태|중|임", { name: "대금", abbr: "대" });
  const b = staffScoreOf("하배황|하배태|하배중|하배임", { name: "거문고", abbr: "거" });
  const one = STAFF.render([a], { width: 1200, scale: 1.6 });
  const two = STAFF.render([a, b], { width: 1200, scale: 1.6 });
  ok("악기 둘이면 오선이 두 벌(자리표도 둘)",
     (two.match(/𝄞|𝄢/g) || []).length === 2 && (one.match(/𝄞|𝄢/g) || []).length === 1);
  ok("악기 이름이 왼쪽에 붙는다", two.includes(">대금<") && two.includes(">거문고<"));
  ok("음역이 낮은 악기는 낮은음자리표", b.clef === "F" && a.clef === "G");
  ok("둘 다 그리면 더 높아진다", Number(two.match(/height="(\d+)"/)[1]) >
                                  Number(one.match(/height="(\d+)"/)[1]));
  ok("각 번호는 맨 위 악기에만(겹쳐 찍히지 않는다)",
     (two.match(/opacity="\.55"/g) || []).length === a.measures.length);
  ok("머리 수는 둘을 합친 만큼", drawn(two) === heads([a]) + heads([b]));
  {   // 총보에서도 상자를 벗어나면 안 된다 — 악기마다 여백을 따로 재어 쌓으므로 어긋나기 쉽다
    const W = Number(two.match(/width="(\d+)"/)[1]), H = Number(two.match(/height="(\d+)"/)[1]);
    const bad = [];
    let m;
    const re = /<ellipse cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g;
    while ((m = re.exec(two))) {
      if (+m[2] - +m[4] < 0 || +m[2] + +m[4] > H || +m[1] - +m[3] < 0 || +m[1] + +m[3] > W) bad.push(m[0]);
    }
    ok(`총보도 모두 상자 안 (${W}×${H})`, !bad.length, bad[0]);
  }
}

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
