// 정악 장단 모음(js/jangdan-presets.js)이 말이 되는지 검사한다.
//
//   node tools/check-jangdan-presets.mjs
//
// 이 파일은 사람이 손으로 옮겨 적는 표라(정악보를 보고 판독한다) 오타가 나기 쉽다.
// 보는 것은 다섯이다:
//   ① 칸 수 = beats — 하나만 어긋나도 장단이 각을 못 채우거나 넘친다.
//   ② 적힌 구음이 **기호 사전에 있는 것**뿐인가(js/symbols-registry.js의 장구 7종).
//   ③ 대강 분절의 합 = beats.
//   ④ 이름이 겹치지 않는가(칸에서 고를 수 없게 된다).
//   ⑤ 그 장단이 **오선보로도 풀리는가** — 타점이 하나 이상 잡히고 마디를 딱 채우는지
//      실제로 jangguScoreOf에 먹여 본다(tools/check-janggu-staff.mjs와 같은 상자).

import { loadApp } from "./lib/app-sandbox.mjs";
await import("../js/staff-core.js");
await import("../js/jangdan-presets.js");
await import("../js/symbols-registry.js");

const LIST = globalThis.JGB_JANGDAN;
const SC = globalThis.JGB_STAFF_CORE;
const JANGGU = new Set(Object.keys(SC.JANGGU));

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}

console.log(`정악 장단 모음 — ${LIST.length}개`);
ok("목록이 비어 있지 않다", LIST.length > 0);

const seen = new Set();
LIST.forEach(function (p) {
  const cells = p.jangdan.split("|");
  ok(`${p.name} — 칸 ${cells.length}개 = ${p.beats}정간`, cells.length === p.beats,
     `칸: ${cells.length} · beats: ${p.beats}`);
  const bad = [];
  cells.forEach(function (c) {
    c.trim().split(/\s+/).filter(Boolean).forEach(function (w) {
      if (!JANGGU.has(w) && w !== "-") bad.push(w);
    });
  });
  ok(`${p.name} — 구음이 모두 사전에 있다`, bad.length === 0, `모르는 말: ${bad.join(", ")}`);
  const dg = (p.daegang || "").split(/\s+/).filter(Boolean).map(Number);
  ok(`${p.name} — 대강 ${p.daegang || "(없음)"}`,
     dg.length === 0 || dg.reduce((a, b) => a + b, 0) === p.beats,
     `합: ${dg.reduce((a, b) => a + b, 0)} · beats: ${p.beats}`);
  const label = (p.group ? p.group + " " : "") + p.name;
  ok(`${label} — 이름이 겹치지 않는다`, !seen.has(label));
  seen.add(label);
  ok(`${p.name} — 타점이 있다`, cells.some((c) => JANGGU.has(c.trim())));
});

// ── ⑤ 오선보로도 풀리는가 ────────────────────────────────────────────
console.log("\n오선보(1선보)로 풀어 보기 — 두 성부가 마디를 딱 채우는가");
const app = await loadApp(
  ["const:SC", "const:DAEGANG_PRESET", "parseDaegang", "defBeats", "parseGakBeats",
   "gakBeatsMap", "beatsAt", "daegangTextFor", "parseMelodyOffsets", "stripSymBracket",
   "const:ORN_BRACKET_CLOSE", "staffTimeType", "staffPerLine", "staffBarMode", "dgOf",
   "barsOfGak", "jangguStaffMode", "jangguStaffOn", "jangguScoreOf"],
  { beats: "12", gakBeats: "", tempoBpm: "60", daegang: "", staffUnit: "auto",
    staffTime: "auto", staffPerLine: "auto", staffBar: "auto",
    staffJanggu: "legend", wantJangdan: true, jangdan: "" });
const jangguScoreOf = app.fn("jangguScoreOf");

LIST.forEach(function (p) {
  app.fields.beats = String(p.beats);
  app.fields.daegang = p.daegang || "";
  app.fields.jangdan = p.jangdan;
  const sc = jangguScoreOf([p.beats]);
  if (!sc) { ok(`${p.name} — 오선보 재료가 만들어진다`, false); return; }
  const want = p.beats * sc.jg;
  const sum = (lane) => sc.lanes[lane][0].reduce((a, n) => a + n.units, 0);
  ok(`${p.name} — 채편·북편이 저마다 ${want}을 채운다`,
     sum(0) === want && sum(1) === want, `위 ${sum(0)} · 아래 ${sum(1)} · 바람 ${want}`);
});

console.log(fail ? `\n✗ ${fail}개 실패 (통과 ${pass})` : `\n✓ ${pass}개 통과`);
process.exit(fail ? 1 : 0);
