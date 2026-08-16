// 재생이 **보기를 따르는가** — 총보면 합주, 파트보면 그 악기만 울리는지 검사한다.
//
//   node tools/check-play-parts.mjs
//
// 화면엔 한 악기만 펴 놓았는데 소리는 온 악기가 나면 무엇을 듣고 있는지 알 수가 없다
// (2026-08-14 사용자 요청). 인쇄·PNG가 '보이는 그대로'인 것과 같은 규칙이라, 갈림길을
// app.js의 scoreViewOn() 한 곳에 두고 그리기·오선보·레이아웃·재생이 함께 본다.
//
// js/app.js의 함수를 이름으로 떼어 와 그대로 돌린다(tools/lib/app-sandbox.mjs 참고) —
// 검사가 보는 것이 곧 배포되는 코드다. 시김새가 어떤 음높이로 풀리나는 여기 관심 밖이고
// (그건 check-sigimsae-sound.mjs), 여기서 보는 것은 **누구의 소리가 섞이나**뿐이다.

import { loadApp } from "./lib/app-sandbox.mjs";

const app = await loadApp(
  ["const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "matchSpecialNote", "tokenizeNotes", "const:DAEGANG_PRESET", "defBeats", "parseGakBeats",
   "gakBeatsMap", "beatsAt", "daegangTextFor", "parseDaegang", "parseMelodyOffsets",
   "groupRowTokens", "jangguSoundOn", "sigimsaeSoundOn", "stripSymBracket", "midiToFreq",
   "scaleNotes", "makeScale", "realizeMelody", "scoreViewOn", "buildAudioEvents"],
  { beats: "4", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "all",
    jangdan: "", wantJangdan: false, playJanggu: false, playSigimsae: true,
    scoreView: true },
  // 악기 둘짜리 총보를 세운다. 활성 파트의 선율만 melodyFull(작업 사본)에 살고 나머지는
  // parts[i].melody에 있다 — 앱과 같은 구조라야 stashActivePart가 제 노릇을 한다.
  `let parts = [{ name: "가야금", melody: "", muted: false },
                { name: "거문고", melody: "", muted: false }];
   let activePart = 0;
   function stashActivePart() { parts[activePart].melody = melodyFull; }
   window.__t = {
     setActive: function (i) { stashActivePart(); activePart = i; melodyFull = parts[i].melody; },
     setPart: function (i, t) { if (i === activePart) melodyFull = t; parts[i].melody = t; },
     mute: function (i, v) { parts[i].muted = v; },
     count: function () { return parts.length; }
   };`
);
const buildAudioEvents = app.fn("buildAudioEvents");
const T = globalThis.__t;

let fail = 0, pass = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? "\n      " + detail : ""}`); }
}
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(label, g === w, `나온 값: ${g}\n      바란 값: ${w}`);
}

// 사인파 주파수를 midi로 되돌려 '들리는 음'을 그대로 읽는다 — 중간 계산을 안 믿으려고.
const toMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));
const YUL = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
const P = (n) => 63 + YUL.indexOf(n);
// 두 악기가 서로 다른 음만 내게 해 두면 '누가 울렸나'를 음높이로 가릴 수 있다
const GAYA = "황|황|황|황", GEO = "임|임|임|임";
function heard() {
  const built = buildAudioEvents();
  return [...new Set(built.events.filter((e) => e.freq).map((e) => toMidi(e.freq)))].sort((a, b) => a - b);
}
// marks는 **열별 한 벌**이다(총보면 악기마다, 파트보면 하나). 자리는 화면의 열 번호.
function markLanes() {
  return buildAudioEvents().marks;
}

T.setPart(0, GAYA);
T.setPart(1, GEO);
app.setMelody(GAYA);

console.log("보기에 따라 누가 울리는가 (가야금=황 · 거문고=임)");
{
  app.fields.scoreView = true;
  eq("총보면 두 악기가 함께 울린다", heard(), [P("황"), P("임")]);

  app.fields.scoreView = false;
  eq("파트보(가야금)면 가야금만", heard(), [P("황")]);

  T.setActive(1);
  eq("파트보에서 거문고로 갈아타면 거문고만", heard(), [P("임")]);

  app.fields.scoreView = true;
  eq("총보로 되돌리면 다시 둘 다", heard(), [P("황"), P("임")]);
  T.setActive(0);
}

console.log("\n음소거(🔇)는 두 보기 모두에서 살아 있다");
{
  app.fields.scoreView = true;
  T.mute(1, true);
  eq("총보에서 음소거한 악기는 빠진다", heard(), [P("황")]);

  app.fields.scoreView = false;
  T.setActive(1);
  eq("파트보에서 그 악기가 음소거면 소리가 없다", heard(), []);
  T.mute(1, false);
  eq("음소거를 풀면 다시 들린다", heard(), [P("임")]);
  T.setActive(0);
}

console.log("\n하이라이트 표식은 보이는 악기마다 한 벌 (2026-08-16)");
{
  // 예전엔 활성 파트 하나만 담았는데, 총보에서 한 악기에만 표시가 떠 이상했다.
  // 이제 보이는 악기마다 한 벌이고, 그 자리(열 번호)가 playGeom의 자리와 맞물린다.
  app.fields.scoreView = false;
  const partView = markLanes();
  app.fields.scoreView = true;
  const scoreView = markLanes();
  eq("파트보면 한 벌 · 총보면 악기 수만큼", [partView.length, scoreView.length], [1, T.count()]);
  eq("벌마다 그 악기의 정간을 다 담는다", scoreView.map((m) => m.length), [4, 4]);
  eq("파트보에서는 펴 놓은 악기 것이 0번 자리에", partView[0].length, 4);

  // 음소거해도 표식은 남는다 — 화면엔 있으니 어디를 지나는지 보여야 한다
  T.mute(1, true);
  eq("음소거한 악기도 표식은 그대로", markLanes().map((m) => m.length), [4, 4]);
  T.mute(1, false);
}

console.log("\n악기가 하나뿐이면 예전 그대로");
{
  // 파트가 하나면 scoreViewOn()이 늘 거짓이라 갈림길 자체가 없다 — 옛 악보가 그대로 돈다.
  app.fields.scoreView = true;
  T.mute(1, true);
  T.setPart(1, "");
  eq("빈 파트를 음소거해 두면 활성 파트만 들린다", heard(), [P("황")]);
  T.mute(1, false);
  T.setPart(1, GEO);
}

console.log(fail ? `\n✗ ${pass}개 통과, ${fail}개 실패` : `\n✓ ${pass}개 통과`);
process.exit(fail ? 1 : 0);
