// 시김새가 소리로 제대로 풀리는지 검사한다.
//
//   node tools/check-sigimsae-sound.mjs
//
// js/app.js의 함수를 이름으로 떼어 와 그대로 돌린다(tools/lib/app-sandbox.mjs 참고) —
// 검사가 보는 것이 곧 배포되는 코드다.
//
// 값의 출처: MALerLab/SejongMusic(ISMIR 2024)의 jg_to_staff_converter.py가 시김새를
// 오선보로 풀 때 쓰는 음정 관계. 코드를 옮긴 것이 아니라 그 음악적 규칙을 우리 사전
// (js/symbols-registry.js의 snd)에 적고, 여기서 되짚어 확인한다.

import { loadApp } from "./lib/app-sandbox.mjs";

const app = await loadApp(
  ["const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
   "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
   "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
   "jangguSoundOn", "stripSymBracket", "midiToFreq", "scaleNotes", "makeScale",
   "realizeMelody", "buildAudioEvents"],
  { beats: "20", tempoBpm: "60", hwangPitch: "63", joPreset: "all",
    jangdan: "", wantJangdan: false, playJanggu: false }
);
const buildAudioEvents = app.fn("buildAudioEvents");

// 소리 나는 음(freq)만 뽑아 반올림한 midi 열로 되돌린다. 사인파 주파수를 다시 midi로
// 되돌리는 건 '들리는 음'을 그대로 읽으려는 것 — 중간 계산을 믿지 않기 위해서다.
const toMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));
function pitchesOf(text) {
  app.fields.beats = String(text.split("|").length);
  app.setMelody(text);
  return buildAudioEvents().events.filter((e) => e.freq).map((e) => toMidi(e.freq));
}
function totalOf(text, beats) {
  app.fields.beats = String(beats);
  app.setMelody(text);
  return buildAudioEvents().events.reduce((s, e) => s + e.dur, 0);
}

const YUL = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
const P = (n) => 63 + YUL.indexOf(n);   // 황 = 63 (세종 자료와 같은 기준음)

let fail = 0, pass = 0;
function eq(label, got, want) {
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n      나온 값: [${got}]\n      바란 값: [${want}]`); }
}

console.log("기준: 황종 평조(황태중임남), 황 = 63\n");
app.fields.joPreset = "hwang-pyeong";

console.log("독립 시김새 — 앞 음을 기준으로 제 칸을 나눠 갖는다");
eq("황 {노}    → 황, 그 아래(남↓)", pitchesOf("황|{노}"), [P("황"), P("남") - 12]);
eq("중 {니}    → 중, 그 위(임)", pitchesOf("중|{니}"), [P("중"), P("임")]);
eq("중 {리}    → 중, 두 칸 위(남)", pitchesOf("중|{리}"), [P("중"), P("남")]);
eq("중 {로}    → 중, 두 칸 아래(황)", pitchesOf("중|{로}"), [P("중"), P("황")]);
eq("중 {니나}  → 중, [임 중]", pitchesOf("중|{니나}"), [P("중"), P("임"), P("중")]);
eq("중 {느나}  → 중, [태 중]", pitchesOf("중|{느나}"), [P("중"), P("태"), P("중")]);
eq("중 {노라}  → 중, [태 황]", pitchesOf("중|{노라}"), [P("중"), P("태"), P("황")]);
eq("중 {느니}  → 중, [임 남]", pitchesOf("중|{느니}"), [P("중"), P("임"), P("남")]);
eq("중 {니레나}→ 중, [남 임 중]", pitchesOf("중|{니레나}"), [P("중"), P("남"), P("임"), P("중")]);
eq("중 {니로나}→ 중, [임 중 태]", pitchesOf("중|{니로나}"), [P("중"), P("임"), P("중"), P("태")]);
eq("중 {느나르나니} → 중, [태 중 임 중 태]",
   pitchesOf("중|{느나르나니}"), [P("중"), P("태"), P("중"), P("임"), P("중"), P("태")]);
eq("중 {같은음표} → 중, 중", pitchesOf("중|{같은음표}"), [P("중"), P("중")]);

console.log("\n붙임 시김새 — 제가 붙은 본음을 기준으로 앞뒤에 짧게");
eq("{니레}중  → 임(꾸밈), 중", pitchesOf("중{니레}"), [P("임"), P("중")]);
eq("{너녜}중  → 황(두 칸 아래), 중", pitchesOf("중{너녜}"), [P("황"), P("중")]);
eq("{노니로}중→ 중, 임, 중", pitchesOf("중{노니로}"), [P("중"), P("임"), P("중")]);
eq("{나니로}중→ 태, 임, 중", pitchesOf("중{나니로}"), [P("태"), P("임"), P("중")]);
eq("{느니르}중→ 태, 중, 태 (앞뒤로 감싼다)", pitchesOf("중{느니르}"), [P("태"), P("중"), P("태")]);
eq("{나니나}중→ 본음 자리를 [중 임 중]으로 가른다",
   pitchesOf("중{나니나}"), [P("중"), P("임"), P("중")]);
eq("{싸랭}중  → 하배황(개방현), 중", pitchesOf("중{싸랭}"), [P("황") - 24, P("중")]);

console.log("\n음계에 따라 '한 칸'이 달라지는가");
app.fields.joPreset = "hwang-gyemyeon";   // 황 협 중 임 무
eq("계면조에서 황 {니} → 협", pitchesOf("황|{니}"), [P("황"), P("협")]);
app.fields.joPreset = "hwang-pyeong";
eq("평조에서 황 {니}  → 태", pitchesOf("황|{니}"), [P("황"), P("태")]);

console.log("\n음계 자동 추론(조가 '12율 전체'일 때)");
app.fields.joPreset = "all";
eq("가장 많이 쓴 다섯 음이 곧 음계 → 중 다음 칸은 임",
   pitchesOf("황|태|중|임|남|황|태|중|임|남|중|{니}").slice(-1), [P("임")]);

console.log("\n소리 없는 기호는 앞 음을 잇는다(옛 동작 그대로)");
app.fields.joPreset = "hwang-pyeong";
eq("중 {흘림표} → 중 하나뿐", pitchesOf("중|{흘림표}"), [P("중")]);
eq("중 {요성표} → 중 하나뿐", pitchesOf("중|{요성표}"), [P("중")]);
eq("중 -        → 중 하나뿐", pitchesOf("중|-"), [P("중")]);
eq("맨 앞 {노}는 기준 삼을 앞 음이 없어 소리 없음", pitchesOf("{노}|중"), [P("중")]);

console.log("\n박은 그대로인가 (시김새가 자리를 넘지 않아야 한다)");
const plain = totalOf("중|중", 2);
eq("꾸밈이 붙어도 총 길이 그대로",
   [Math.round(totalOf("중{니레}|중{느니르}", 2) * 1e6),
    Math.round(totalOf("중|{느나르나니}", 2) * 1e6)],
   [Math.round(plain * 1e6), Math.round(plain * 1e6)]);

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
