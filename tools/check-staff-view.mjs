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
await import("../js/staff-glyphs.js");
await import("../js/staff-view.js");
const CORE = globalThis.JGB_STAFF_CORE;
const STAFF = globalThis.JGB_STAFF;

const app = await loadApp(
  ["const:SC", "const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "parseDaegang", "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "scaleNotes", "makeScale", "realizeMelody",
   "staffFifths", "staffScoreOf", "buildStaffScores"],
  { beats: "4", tempoBpm: "60", hwangPitch: "63", joPreset: "hwang-pyeong",
    title: "검사용", subtitle: "", scoreView: false, staffUnit: "dotted", daegang: "" },
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
// Node엔 캔버스가 없어 staff-view도 글자 수로 어림한다 — 검사도 같은 어림을 써야 한다
const textWidth = (s, px) => s.length * px * 0.95;

// 악보 글리프는 이제 패스라 '무엇이 어디에' 놓였는지를 transform에서 읽는다.
// 잉크 상자를 글리프 데이터에서 그대로 가져오므로, 겹침 검사가 실제 잉크 기준이 된다.
const GLYPHS = globalThis.JGB_STAFF_GLYPHS;
function placed(svg, cls) {
  const re = new RegExp('<path class="' + cls +
    '"([^>]*?) transform="translate\\(([-\\d.]+) ([-\\d.]+)\\) scale\\(([\\d.]+)\\)"', "g");
  const out = [];
  let m;
  while ((m = re.exec(svg))) {
    const t = (m[1].match(/data-t="(\d)"/) || [])[1];
    out.push({ t, x: +m[2], y: +m[3], s: +m[4] });
  }
  return out;
}
// 놓인 글리프의 잉크 가로 범위 — key를 알아야 상자를 아니 함께 준다
const inkX = (g, key) => [g.x + GLYPHS[key].box[0] * g.s, g.x + GLYPHS[key].box[2] * g.s];

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
  const re = /<ellipse class="sv-[a-z]+" cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g;
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
  ok("마디줄이 각마다 하나씩", (svg.match(/class="sv-bar[ "]/g) || []).length === n);
  ok("각 번호가 각마다 하나씩", (svg.match(/class="sv-num"/g) || []).length === n);
  ok("SVG가 열고 닫힌다", svg.startsWith("<svg ") && svg.endsWith("</svg>"));
  const svg2 = STAFF.render(scoresOf("{느나르나니}|황|태|중", 4), { width: 1200, scale: 1.6 });
  const xs = [];
  let m;
  const re = /<ellipse class="sv-head" cx="([-\d.]+)" cy="[-\d.]+" rx="([\d.]+)"/g;
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
  ok("마디는 여전히 각 하나", (svg.match(/class="sv-bar[ "]/g) || []).length === scores[0].measures.length);
  // 4분음표 정간의 3분박 = 셋잇단 8분음표 자리라 꼬리가 하나 → 빔이 생긴다
  ok("3분박이 빔으로 묶인다", (svg.match(/<rect/g) || []).length >= 1);
  app.fields.staffUnit = "dotted";
}

console.log("\n박자표 — 각 = 한 마디이므로 여기 적히는 수가 곧 한 각의 박수");
{
  app.fields.staffUnit = "dotted";
  const d = STAFF.render(scoresOf("황|태|중|임", 4), { width: 1200, scale: 1.6 });
  const dt = placed(d, "sv-time").map((g) => g.t);
  ok("점4분음표 4정간 → 12/8", dt.join("") === "128", `나온 값: ${dt.join("")}`);
  app.fields.staffUnit = "plain";
  const q = STAFF.render(scoresOf("황|태|중|임", 4), { width: 1200, scale: 1.6 });
  const qt = placed(q, "sv-time").map((g) => g.t);
  ok("4분음표 4정간 → 4/4", qt.join("") === "44", `나온 값: ${qt.join("")}`);
  // 8분음표 — 2분박이면서 각이 길 때. 20정간 각이 4분음표로는 20/4이라 마디가 터무니없이
  // 길어지는데 8분음표로 보면 20/8이 된다.
  app.fields.staffUnit = "eighth";
  const e = STAFF.render(scoresOf("황|태|중|임", 4), { width: 1200, scale: 1.6 });
  const et = placed(e, "sv-time").map((g) => g.t);
  ok("8분음표 4정간 → 4/8", et.join("") === "48", `나온 값: ${et.join("")}`);
  const eScore = scoresOf("황|태|중|임", 4);
  ok("정간 길이가 8분음표(840)로 실린다", eScore[0].jg === CORE.JG.eighth);
  ok("8분음표로도 머리가 다 그려진다", drawn(e) === heads(eScore));
  ok("마디는 여전히 각 하나", (e.match(/class="sv-bar[ "]/g) || []).length === eScore[0].measures.length);
  app.fields.staffUnit = "dotted";
  // 줄이 여럿이면 박자표는 첫 줄에만(조판 관행) — 자리표는 줄마다 다시 나온다
  const many = STAFF.render(scoresOf("황|태|중|임\n남|황|태|중\n중|임|남|황", 4), { width: 420, scale: 1.6 });
  // 숫자가 여러 자면 글리프도 여러 개다 — 자릿수가 아니라 **몇 줄에 나오나**로 본다
  const timeRows = [...new Set(placed(many, "sv-time").map((g) => g.y))];
  ok("여러 줄이어도 박자표는 첫 줄에만",
     timeRows.length === 2 && placed(many, "sv-clef").length >= 2,
     `박자표가 놓인 높이 ${timeRows.length}개`);
}

console.log("\n8분음표로 보면 빔은 대강으로 묶인다 (정간 하나는 더 이상 한 박이 아니다)");
{
  // 정간마다 8분음표 하나씩이면 꼬리가 정간 수만큼 따로 붙어 '꼬리 숲'이 된다.
  // 그때 한 박은 대강이므로 대강으로 묶어야 12/8 악보의 꼴이 된다.
  const beams = (svg) => (svg.match(/class="sv-beam"/g) || []).length;
  const flags = (svg) => (svg.match(/class="sv-flag"/g) || []).length;
  const mel = "황|태|중|임|남|황";
  app.fields.staffUnit = "eighth";

  app.fields.daegang = "3 3";
  const dg = STAFF.render(scoresOf(mel, 6), { width: 1600, scale: 1.6 });
  ok("대강이 3 3이면 빔이 둘(꼬리는 없다)", beams(dg) === 2 && flags(dg) === 0,
     `빔 ${beams(dg)} · 꼬리 ${flags(dg)}`);

  app.fields.daegang = "2 2 2";
  const dg2 = STAFF.render(scoresOf(mel, 6), { width: 1600, scale: 1.6 });
  ok("대강이 2 2 2면 빔이 셋", beams(dg2) === 3 && flags(dg2) === 0,
     `빔 ${beams(dg2)} · 꼬리 ${flags(dg2)}`);

  // 대강을 안 적은 악보도 꼬리 숲이 되면 안 된다 — 셋으로 나뉘면 셋씩
  app.fields.daegang = "";
  const none = STAFF.render(scoresOf(mel, 6), { width: 1600, scale: 1.6 });
  ok("대강이 없어도 셋씩 묶는다", beams(none) === 2 && flags(none) === 0,
     `빔 ${beams(none)} · 꼬리 ${flags(none)}`);

  // 점4분음표로 돌아가면 정간이 곧 한 박이라 대강을 안 본다
  app.fields.staffUnit = "dotted";
  app.fields.daegang = "3 3";
  const back = STAFF.render(scoresOf(mel, 6), { width: 1600, scale: 1.6 });
  ok("점4분음표에서는 대강을 넘겨 묶지 않는다", beams(back) === 0,
     `빔 ${beams(back)}`);
  app.fields.daegang = "";
}

console.log("\n머리단이 겹치지 않는가 — 자리표 → 조표 → 박자표 → 첫 음");
{
  // 조 프리셋을 바꿔 임시표 수를 늘려 가며 본다. 예전엔 조표 간격이 0.62칸 고정이라
  // 내림표끼리 겹치고(잉크 폭이 0.82칸) 박자표까지 파고들었다 — 눈으로만 보이던 버그다.
  // 이제 글리프가 제 잉크 상자를 갖고 있으므로 **실제 잉크로** 견준다.
  const scores = scoresOf("황|태|중|임", 4);
  [-7, -3, 0, 4, 7].forEach((fifths) => {
    const s = scores.map((x) => ({ ...x, fifths }));
    const svg = STAFF.render(s, { width: 1400, scale: 1.6 });
    const SP = 1.6 * 7;
    const accKey = fifths < 0 ? "flat" : "sharp";
    const keys = placed(svg, "sv-key").map((g) => inkX(g, accKey));
    const clef = placed(svg, "sv-clef").map((g) => inkX(g, "gClef"));
    const times = placed(svg, "sv-time").map((g) => inkX(g, "time" + g.t));
    let bad = "";

    for (let i = 1; i < keys.length; i++) {
      if (keys[i][0] < keys[i - 1][1]) bad = `조표 ${i + 1}번째가 앞것과 겹침`;
    }
    const right = (a) => a.reduce((m, r) => Math.max(m, r[1]), -Infinity);
    const left = (a) => a.reduce((m, r) => Math.min(m, r[0]), Infinity);
    if (keys.length && left(keys) < right(clef)) bad = "조표가 자리표를 파고듦";
    if (keys.length && left(times) < right(keys)) bad = "박자표가 조표를 파고듦";
    else if (!keys.length && left(times) < right(clef)) bad = "박자표가 자리표를 파고듦";

    // 첫 음표머리의 왼끝
    const head = /<ellipse class="sv-head" cx="([-\d.]+)"[^>]*rx="([\d.]+)"/.exec(svg);
    const headL = +head[1] - +head[2];
    if (headL < right(times) + SP * 0.4) bad = "첫 음이 박자표에 붙음";
    ok(`임시표 ${Math.abs(fifths)}개 — 자리표·조표·박자표·첫 음이 안 겹친다`, !bad, bad);
  });
}

console.log("\n악보 글리프 — 진짜 악보 글꼴에서 떠 온 패스인가");
{
  // 예전엔 자리표·임시표를 유니코드 글자로 찍어 시스템 폰트에서 빌려 왔다(맥이면 𝄞는
  // Apple Symbols, ♭은 Times) — 악보가 손글씨처럼 보이던 까닭이다.
  const svg = STAFF.render(scoresOf("황|쉼|태중|임", 4), { width: 1200, scale: 1.6 });
  ok("자리표·조표·박자표·쉼표가 <text>가 아니다",
     !/<text class="sv-(clef|key|time|acc|rest)"/.test(svg));
  ok("자리표가 패스로 놓인다", placed(svg, "sv-clef").length === 1);
  ok("쉼표도 패스로 놓인다", placed(svg, "sv-rest").length === 1);
  // 높은음자리표는 G선(아래서 둘째 줄)에 기준점이 놓여야 한다 — 그 줄이 곧 '솔'이라서
  const clefY = placed(svg, "sv-clef")[0].y;
  const lines = [...new Set([...svg.matchAll(/class="sv-staff" x1="[-\d.]+" y1="([-\d.]+)"/g)]
    .map((m) => +m[1]))].sort((a, b) => a - b);
  ok("높은음자리표 기준점이 G선에 놓인다", Math.abs(clefY - lines[3]) < 0.5,
     `자리표 ${clefY} · G선 ${lines[3]}`);
  // 글리프가 통째로 빠지면 조용히 아무것도 안 그려지므로 개수로 지켜본다
  ok("글리프 데이터가 다 실려 있다",
     ["gClef", "fClef", "flat", "sharp", "natural", "restWhole", "restQuarter",
      "flag8thUp", "flag16thDown", "time0", "time9"].every((k) => GLYPHS[k] && GLYPHS[k].d));
}

console.log("\n기둥 길이 — 빔이 붙어도 짧지도 터무니없이 길지도 않은가");
{
  // 한 정간을 잘게 쪼갠 데다 도약이 크면 빔이 가락을 못 따라가 기둥이 통째로 길어졌었다
  const svg = STAFF.render(scoresOf("태 중 임 남 황|황|중청황 황 태 중 임|임", 4),
                           { width: 1600, scale: 1.6 });
  const SP = 1.6 * 7;
  const lens = [];
  let m;
  const re = /class="sv-stem" x1="([-\d.]+)" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)"/g;
  while ((m = re.exec(svg))) lens.push(Math.abs(+m[3] - +m[2]) / SP);
  const min = Math.min(...lens), max = Math.max(...lens);
  ok("가장 짧은 기둥이 2.5칸 이상", min >= 2.5, `${min.toFixed(2)}칸`);
  ok("가장 긴 기둥이 9칸 이하", max <= 9, `${max.toFixed(2)}칸`);
}

console.log("\n덧줄이 이웃과 이어 붙지 않는가");
{
  // 시김새가 한 정간을 다섯으로 가르면 음 사이가 덧줄 폭보다 좁아진다 — 그대로 두면
  // 덧줄 여러 줄이 이어 붙어 검은 판이 됐다(중청 음역에서 실제로 그랬다).
  const svg = STAFF.render(scoresOf("{느나르나니}중청황|황|중청황 중청태 중청황 중청태 중청황|임", 4),
                           { width: 1600, scale: 1.6 });
  const seg = [...svg.matchAll(/class="sv-ledger" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)"/g)]
    .map((m) => ({ x1: +m[1], y: +m[2], x2: +m[3] }));
  let touch = 0;
  seg.forEach((a) => seg.forEach((b) => {
    if (a !== b && Math.abs(a.y - b.y) < 0.5 && a.x1 < b.x1 && a.x2 >= b.x1) touch++;
  }));
  ok(`덧줄 ${seg.length}개가 서로 안 겹친다`, touch === 0, `겹친 짝 ${touch}`);
  ok("그래도 머리는 덮는다", seg.every((s) => s.x2 - s.x1 >= 1.6 * 7 * 1.2));
  // 겹침의 뿌리는 정간 폭이다 — 시김새가 **앞 분박만** 다섯으로 가르면 음이 정간 한쪽에
  // 몰리는데, '한 정간에 몇 개'로 폭을 잡으면 실제 간격이 그 셈의 절반이 된다.
  const xs = [...svg.matchAll(/<ellipse class="sv-head" cx="([-\d.]+)"/g)].map((m) => +m[1]);
  let step = Infinity;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) step = Math.min(step, xs[i] - xs[i - 1]);
  ok("음이 한쪽에 몰려도 머리 사이가 1.5칸 이상", step >= 1.6 * 7 * 1.5,
     `가장 좁은 곳 ${(step / (1.6 * 7)).toFixed(2)}칸`);
}

console.log("\n굵기가 오선 칸에 비례하는가 (고정 px면 크게 볼수록 실처럼 가늘어진다)");
{
  // 덧줄까지 보려면 오선 밖 음이 있어야 한다(하배황은 한참 아래)
  const a = STAFF.render(scoresOf("하배황|태|중|임", 4), { width: 1200, scale: 1 });
  const b = STAFF.render(scoresOf("하배황|태|중|임", 4), { width: 2400, scale: 2 });
  const w = (svg, cls) => Number((svg.match(new RegExp('class="' + cls + '"[^>]*stroke-width="([\\d.]+)"')) || [])[1]);
  ["sv-staff", "sv-stem", "sv-ledger"].forEach((cls) => {
    ok(`${cls} 굵기가 배율 2배에 2배`, Math.abs(w(b, cls) / w(a, cls) - 2) < 0.05,
       `${w(a, cls)} → ${w(b, cls)}`);
  });
}

console.log("\n자리표 고르기 — 낮은 악보는 낮은음자리표로 (덧줄이 적은 쪽)");
{
  // 거문고처럼 낮은 음만으로 된 악보를 높은음자리표에 얹으면 덧줄만 잔뜩 생긴다.
  // 고르는 기준은 **덧줄 수**다 — 예전엔 '평균 음높이 < 57'이라는 대리 지표였다.
  const clefOf = (mel) => scoresOf(mel, 4)[0].clef;
  const ledgerCount = (mel) => {
    const svg = STAFF.render(scoresOf(mel, 4), { width: 1600, scale: 1.6 });
    return (svg.match(/class="sv-ledger"/g) || []).length;
  };
  ok("거문고 음역(하배)은 낮은음자리표", clefOf("하배황|하배태|하배중|하배임") === "F");
  ok("배 음역도 낮은음자리표", clefOf("배황|배태|배중|배임") === "F");
  ok("보통 음역은 높은음자리표", clefOf("황|태|중|임") === "G");
  ok("높은 음역도 높은음자리표", clefOf("청황|청태|청중|청임") === "G");
  // 평균으로 고르던 때 어긋나던 경계 — 평균은 59.3이라 높은음자리표였는데 덧줄은 F가 적다
  ok("경계에서도 덧줄이 적은 쪽으로", clefOf("배중|배임|배남|황") === "F");
  // 고른 자리표가 정말 덧줄을 줄이는가 — 규칙이 뒤집혀도 위 항목들은 통과할 수 있다
  ok("낮은 악보의 덧줄이 몇 줄 안 된다", ledgerCount("하배황|하배태|하배중|하배임") <= 4,
     `덧줄 ${ledgerCount("하배황|하배태|하배중|하배임")}줄`);
  // 음이 하나도 없으면 기본값
  ok("빈 악보는 높은음자리표", CORE.pickClef([]) === "G");
  // 자리표 표가 셋(고르는 쪽·화면·파일)에서 한 벌인지
  ok("자리표 표가 staff-core 한 곳에 있다",
     CORE.CLEF.G.sign === "G" && CORE.CLEF.F.line === 4 &&
     CORE.CLEF.G.glyph === "gClef" && CORE.CLEF.F.dia === 2 * 7 + 4);
}

console.log("\n악기 이름 — 파트보에도 보이는가 (위에서 고른 악기와 같은 것을 가리켜야 한다)");
{
  const name = (svg) => (svg.match(/class="sv-name"[^>]*>([^<]*)</g) || [])
    .map((t) => t.match(/>([^<]*)<$/)[1]);
  const one = scoresOf("황|태|중|임\n남|황|태|중", 4)[0];

  const solo = STAFF.render([{ ...one, name: "가야금", abbr: "" }], { width: 1200, scale: 1.6 });
  ok("악기 하나여도 이름이 붙는다", name(solo).join(",") === "가야금", `나온 값: ${name(solo)}`);
  ok("약어가 없으면 둘째 줄부터는 안 되풀이한다",
     name(STAFF.render([{ ...one, name: "가야금", abbr: "" }], { width: 300, scale: 1.6 })).length === 1);
  ok("약어가 있으면 둘째 줄부터 약어",
     name(STAFF.render([{ ...one, name: "가야금", abbr: "가야" }], { width: 300, scale: 1.6 }))
       .join(",") === "가야금,가야");

  // 이름도 악기도 없으면 자리를 안 낸다 — '파트 1'이라 적히면 알려 주는 것 없이 자리만 먹는다
  const blank = STAFF.render([{ ...one, name: "", abbr: "" }], { width: 1200, scale: 1.6 });
  ok("이름이 없으면 아무것도 안 적는다", name(blank).length === 0, `나온 값: ${name(blank)}`);
  const x0 = (svg) => +svg.match(/class="sv-staff" x1="([\d.]+)"/)[1];
  ok("이름이 없으면 왼쪽 자리도 안 먹는다", x0(blank) < x0(solo), `${x0(blank)} vs ${x0(solo)}`);

  // 폭은 재서 잡는다 — 3.6칸 고정이던 때는 긴 이름이 오선 왼쪽으로 삐져나갔다
  const long = STAFF.render([{ ...one, name: "제1 가야금 (조율)", abbr: "" }], { width: 1200, scale: 1.6 });
  const nx = +long.match(/class="sv-name" x="([\d.]+)"/)[1];
  ok("긴 이름도 그림 안에 들어온다", nx - textWidth("제1 가야금 (조율)", 1.6 * 7 * 1.15) > 0,
     `이름 오른끝 ${nx}`);
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
     placed(two, "sv-clef").length === 2 && placed(one, "sv-clef").length === 1);
  ok("악기 이름이 왼쪽에 붙는다", two.includes(">대금<") && two.includes(">거문고<"));
  ok("음역이 낮은 악기는 낮은음자리표", b.clef === "F" && a.clef === "G");
  ok("둘 다 그리면 더 높아진다", Number(two.match(/height="(\d+)"/)[1]) >
                                  Number(one.match(/height="(\d+)"/)[1]));
  ok("각 번호는 맨 위 악기에만(겹쳐 찍히지 않는다)",
     (two.match(/class="sv-num"/g) || []).length === a.measures.length);
  ok("머리 수는 둘을 합친 만큼", drawn(two) === heads([a]) + heads([b]));
  {   // 총보에서도 상자를 벗어나면 안 된다 — 악기마다 여백을 따로 재어 쌓으므로 어긋나기 쉽다
    const W = Number(two.match(/width="(\d+)"/)[1]), H = Number(two.match(/height="(\d+)"/)[1]);
    const bad = [];
    let m;
    const re = /<ellipse class="sv-[a-z]+" cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g;
    while ((m = re.exec(two))) {
      if (+m[2] - +m[4] < 0 || +m[2] + +m[4] > H || +m[1] - +m[3] < 0 || +m[1] + +m[3] > W) bad.push(m[0]);
    }
    ok(`총보도 모두 상자 안 (${W}×${H})`, !bad.length, bad[0]);
  }
}

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
