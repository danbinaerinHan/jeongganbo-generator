// **합주가 최대치를 넘지 않는가** — 재생 음량이 파트 수에 맞춰 정규화되고, 그래도 넘는
// 자리는 소프트 클립으로 눌리는지 검사한다.
//
//   node tools/check-play-mix.mjs
//
// 왜 이 검사가 있나: 마스터가 0.25 고정이던 시절, 총보 합주에서 지지직 소리가 났다
// (2026-08-15 사용자 제보). 정악은 헤테로포니라 악기들이 같은 가락을 같은 시각에 내고,
// 소리가 전부 순수 사인파에 osc.start(on)이라 시작 위상까지 같아서 진폭이 √N이 아니라
// **그대로 N배**로 더해진다 — 실측 봉우리가 정확히 0.25 × 파트 수였고(5파트 1.249),
// Web Audio의 destination이 [-1,1]로 하드 클립하며 사인 꼭대기가 평평해진 것이 그 소리였다.
//
// 그래서 여기서 보는 것은 셋이다:
//   ① buildAudioEvents가 '실제로 소리 나는 파트 수'(voices)를 옳게 세나
//   ② 그 값으로 나눈 마스터로 합성했을 때 봉우리가 1을 안 넘나 (표본으로 실제 재현)
//   ③ 소프트 클립 곡선이 평소 소리엔 손을 안 대고 넘치는 자리만 누르나
//
// 검사는 js/app.js의 함수·상수를 이름으로 떼어 와 그대로 돌린다(tools/lib/app-sandbox.mjs) —
// 같은 셈을 여기 한 벌 더 적으면 app.js를 고쳐도 옛 답을 계속 맞다 하기 때문이다.

import { loadApp } from "./lib/app-sandbox.mjs";

const app = await loadApp(
  ["const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "matchSpecialNote", "tokenizeNotes", "const:DAEGANG_PRESET", "defBeats", "parseGakBeats",
   "gakBeatsMap", "beatsAt", "daegangTextFor", "parseDaegang", "parseMelodyOffsets",
   "groupRowTokens", "jangguSoundOn", "sigimsaeSoundOn", "stripSymBracket", "midiToFreq",
   "scaleNotes", "makeScale", "realizeMelody", "scoreViewOn", "buildAudioEvents",
   "const:MELODY_PEAK", "const:SOFT_KNEE", "const:JANGGU_GAIN", "softClipCurve"],
  { beats: "4", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "all",
    jangdan: "", wantJangdan: false, playJanggu: false, playSigimsae: true,
    scoreView: true },
  // 파트 수를 마음대로 갈아 끼울 수 있는 합주 대역(代役). 앱과 같은 구조라야
  // stashActivePart가 제 노릇을 한다(활성 파트만 melodyFull에 산다).
  `let parts = [], activePart = 0;
   function stashActivePart() { if (parts[activePart]) parts[activePart].melody = melodyFull; }
   window.__t = {
     setParts: function (list) {
       parts = list.map(function (m) { return { melody: m, muted: false }; });
       activePart = 0; melodyFull = parts[0].melody;
     },
     mute: function (i, v) { parts[i].muted = v; },
     // 상수는 sandbox가 함수처럼 노출하지 않는다 — 값을 검사 쪽에 베껴 적으면 app.js를
     // 고쳐도 옛 값을 계속 맞다 하므로, 여기서 창구만 낸다.
     peak: function () { return MELODY_PEAK; }
   };`
);
const buildAudioEvents = app.fn("buildAudioEvents");
const softClipCurve = app.fn("softClipCurve");
const T = globalThis.__t;
const CURVE = softClipCurve(2049);
const PEAK = T.peak();

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function eq(label, got, want) {
  ok(label, JSON.stringify(got) === JSON.stringify(want),
     `나온 값: ${JSON.stringify(got)}\n      바란 값: ${JSON.stringify(want)}`);
}

// WaveShaper가 하는 일 그대로: 입력을 0.5배로 줄여 -1~1로 색인하고 곡선에서 선형 보간.
// (버스의 pre.gain=0.5 + shaper.curve — 곡선 색인 규칙까지 함께 검사하려고 되풀이한다.)
function soft(x) {
  const u = Math.max(-1, Math.min(1, x * 0.5));
  const p = (u + 1) / 2 * (CURVE.length - 1);
  const i = Math.floor(p), f = p - i;
  return i >= CURVE.length - 1 ? CURVE[CURVE.length - 1] : CURVE[i] * (1 - f) + CURVE[i + 1] * f;
}

// startPlayback과 같은 합성을 표본으로 재현해 봉우리를 잰다.
// 음 하나가 진폭 1까지 오르는 선형 엔벨로프(atk/rel)까지 그대로 옮긴다.
const SR = 48000;
function mixPeak(built, seconds) {
  const master = PEAK / Math.max(1, built.voices || 1);   // startPlayback의 마스터 식
  const buf = new Float64Array(Math.ceil(seconds * SR) + 1);
  built.events.forEach(function (e) {
    if (e.freq == null || e.t > seconds) return;
    const atk = Math.min(0.02, e.dur * 0.3), rel = Math.min(0.05, e.dur * 0.3);
    const hold = Math.max(e.t + atk, e.t + e.dur - rel);
    const i0 = Math.floor(e.t * SR), i1 = Math.min(buf.length - 1, Math.ceil((e.t + e.dur) * SR));
    const w = 2 * Math.PI * e.freq;
    for (let i = i0; i <= i1; i++) {
      const t = i / SR;
      if (t < e.t || t > e.t + e.dur) continue;
      const g = t < e.t + atk ? (t - e.t) / atk
        : t < hold ? 1
        : 1 - (t - hold) / Math.max(1e-9, e.t + e.dur - hold);
      buf[i] += g * Math.sin(w * (t - e.t));   // osc.start(on) → 시작 위상 0
    }
  });
  let raw = 0, out = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] * master);
    if (v > raw) raw = v;
    const o = Math.abs(soft(buf[i] * master));
    if (o > out) out = o;
  }
  return { raw: raw, out: out };
}

// 모든 파트가 똑같은 가락 — 헤테로포니의 최악(위상까지 완전히 겹치는) 경우다.
const UNISON = "황|태|중|임|남|임|중|태";

console.log("① 소리 나는 파트 수(voices)를 옳게 세는가");
{
  T.setParts([UNISON]);
  app.setMelody(UNISON);
  app.fields.scoreView = false;
  eq("파트 하나 = 1", buildAudioEvents().voices, 1);

  T.setParts([UNISON, UNISON, UNISON]);
  app.setMelody(UNISON);
  app.fields.scoreView = true;
  eq("총보 3파트 = 3", buildAudioEvents().voices, 3);

  app.fields.scoreView = false;
  eq("파트보면 펴 놓은 하나만 = 1", buildAudioEvents().voices, 1);

  app.fields.scoreView = true;
  T.mute(1, true);
  eq("음소거한 파트는 안 센다 = 2", buildAudioEvents().voices, 2);
  T.mute(1, false);
}

console.log("\n② 합성 봉우리가 파트 수와 무관하게 한계 안인가");
{
  for (const n of [1, 2, 4, 5, 8]) {
    T.setParts(Array.from({ length: n }, function () { return UNISON; }));
    app.setMelody(UNISON);
    app.fields.scoreView = true;
    const built = buildAudioEvents();
    const p = mixPeak(built, 8);
    ok(`${n}파트 제창 — 버스 뒤 봉우리 ${p.out.toFixed(3)} ≤ 1.0`, p.out <= 1.0,
       `마스터 뒤 ${p.raw.toFixed(3)} / 버스 뒤 ${p.out.toFixed(3)}`);
    // 정규화가 진짜 걸렸는지 — 파트가 늘어도 마스터 뒤 봉우리가 독주와 같아야 한다.
    ok(`${n}파트 — 마스터 뒤 봉우리가 독주와 같다 (${p.raw.toFixed(3)} ≈ ${PEAK})`,
       Math.abs(p.raw - PEAK) < 0.02, `나온 값 ${p.raw.toFixed(3)}`);
  }
}

console.log("\n③ 소프트 클립이 평소 소리엔 손을 안 대고 넘치는 자리만 누르는가");
{
  // 무릎 아래는 정확히 통과 — 왜곡이 0이어야 한다(0.25 선율 + 0.5 장구 = 0.75도 거의 그대로).
  [0.05, 0.25, 0.5, 0.69].forEach(function (x) {
    ok(`${x} → 그대로 통과`, Math.abs(soft(x) - x) < 1e-3, `나온 값 ${soft(x).toFixed(5)}`);
  });
  ok("선율 0.25 + 장구 0.5 = 0.75는 거의 손대지 않는다",
     Math.abs(soft(0.75) - 0.75) < 0.02, `나온 값 ${soft(0.75).toFixed(4)}`);

  // 넘치는 자리는 눌리되 1을 안 넘고, 커질수록 계속 커져야 한다(단조 — 접히면 소리가 뒤집힌다)
  [1.0, 1.25, 1.75, 2.0].forEach(function (x) {
    ok(`${x} → ${soft(x).toFixed(3)} (1.0 미만으로 눌림)`, soft(x) < 1.0 && soft(x) > 0.8,
       `나온 값 ${soft(x).toFixed(4)}`);
  });
  let mono = true;
  for (let i = 1; i < CURVE.length; i++) if (CURVE[i] < CURVE[i - 1]) mono = false;
  ok("곡선이 단조 증가한다 (접히면 파형이 뒤집힌다)", mono);
  ok("곡선이 홀함수다 (음수 쪽이 대칭 — 비대칭이면 짝수 배음이 생긴다)",
     Math.abs(CURVE[0] + CURVE[CURVE.length - 1]) < 1e-6);
  ok("한가운데가 0이다 (무음이 무음으로 나간다)", Math.abs(CURVE[(CURVE.length - 1) / 2]) < 1e-9);
}

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
