// 시김새가 소리로 제대로 풀리는지 검사한다.
//
// 재생 코드는 DOM에 파묻힌 큰 IIFE 안이라 그대로는 못 부른다. 그렇다고 여기에 같은 셈을
// 한 벌 더 적으면 검사가 아니라 '두 번째 구현'이 되어, app.js를 고쳐도 이 파일이 옛 답을
// 계속 맞다 한다. 그래서 **js/app.js의 소스 조각을 이름으로 떼어 와** 그대로 돌린다 —
// 검사가 보는 것이 곧 배포되는 코드다. DOM은 필요한 칸(값·체크) 몇 개만 흉내 낸다.
//
//   node tools/check-sigimsae-sound.mjs
//
// 값의 출처: MALerLab/SejongMusic(ISMIR 2024)의 jg_to_staff_converter.py가 시김새를
// 오선보로 풀 때 쓰는 음정 관계. 코드를 옮긴 것이 아니라 그 음악적 규칙을 우리 사전
// (js/symbols-registry.js의 snd)에 적고, 여기서 되짚어 확인한다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "js/app.js"), "utf8");

// ── app.js에서 이름으로 조각 떼어 오기 ──────────────────────────────────
// 여는 중괄호/대괄호부터 짝이 맞는 곳까지 — 문자열·주석 안의 괄호에 속지 않게 훑는다.
function sliceBalanced(src, from) {
  const OPEN = { "{": "}", "[": "]", "(": ")" };
  const stack = [];
  let i = from, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === "}" || c === "]" || c === ")") {
      if (stack.pop() !== c) throw new Error("괄호 짝이 안 맞습니다 @" + i);
      if (!stack.length) return i + 1;
    }
  }
  throw new Error("괄호가 안 닫혔습니다");
}

function takeFn(name) {
  const at = SRC.indexOf("\n  function " + name + "(");
  if (at < 0) throw new Error(`js/app.js에서 function ${name}을 못 찾았습니다`);
  const body = SRC.indexOf("{", SRC.indexOf(")", at));
  return SRC.slice(at, sliceBalanced(SRC, body));
}

// const NAME = { … } / [ … ] / new Set(…) 한 문장
function takeConst(name) {
  const at = SRC.indexOf("\n  const " + name + " = ");
  if (at < 0) throw new Error(`js/app.js에서 const ${name}을 못 찾았습니다`);
  const eq = SRC.indexOf("=", at);
  let open = eq + 1;
  while (" \t\r\n".includes(SRC[open])) open++;
  if (SRC[open] === "n" && SRC.startsWith("new ", open)) open = SRC.indexOf("(", open);
  return SRC.slice(at, sliceBalanced(SRC, open)) + ";";
}

// ── DOM 흉내 ────────────────────────────────────────────────────────────
const FIELDS = {
  beats: "20", tempoBpm: "60", hwangPitch: "63", joPreset: "all",
  jangdan: "", wantJangdan: false, playJanggu: false
};
function $(id) {
  if (!(id in FIELDS)) return null;
  const v = FIELDS[id];
  return typeof v === "boolean" ? { checked: v, value: "" } : { value: v, checked: false };
}

await import("../js/symbols-registry.js");
const SYM_REG = globalThis.JGB_SYM;

// ── app.js 조각을 그대로 실행 ───────────────────────────────────────────
const PARTS = [
  takeConst("SPECIAL_NOTES"), takeConst("SYM_MARK"), takeConst("ORN_BRACKET_CLOSE"),
  takeConst("SCALE"), takeConst("JO_PRESETS"),
  takeConst("PRE2"), takeConst("PRE2U"), takeConst("PRE1U"), takeConst("PRE1D"),
  takeFn("matchSpecialNote"), takeFn("tokenizeNotes"), takeFn("parseMelodyOffsets"),
  takeFn("groupRowTokens"), takeFn("jangguSoundOn"), takeFn("stripSymBracket"),
  takeFn("midiToFreq"), takeFn("scaleNotes"), takeFn("makeScale"), takeFn("buildAudioEvents")
];

const factory = new Function("$", "SYM_REG", "BASESET", "melodyFullRef", `
  "use strict";
  const SYM_SND = SYM_REG.sound;
  const ORN_LIST = SYM_REG.ornList;
  const ORN_CAT = {}; ORN_LIST.forEach(function (o) { ORN_CAT[o.s] = o.c; });
  const ORN_KO = {};
  ORN_LIST.forEach(function (o) { if (!(o.k in ORN_KO)) ORN_KO[o.k] = o.s; });
  let melodyFull = "";
  ${PARTS.join("\n\n")}
  return function (text, opts) {
    melodyFull = text;
    return buildAudioEvents();
  };
`);

const YUL_BASES = ["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"];
const run = factory($, SYM_REG, new Set(YUL_BASES));

// ── 검사 ────────────────────────────────────────────────────────────────
// 소리 나는 음(freq)만 뽑아 반올림한 midi 열로 되돌린다. 사인파 주파수를 다시 midi로
// 되돌리는 건 '들리는 음'을 그대로 읽으려는 것 — 중간 계산을 믿지 않기 위해서다.
const toMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));
function pitchesOf(text) {
  FIELDS.beats = String(text.split("|").length);
  return run(text).events.filter((e) => e.freq).map((e) => toMidi(e.freq));
}
const H = 63;                      // 황 = 63 (세종 자료와 같은 기준음)
const P = (n) => H + YUL_BASES.indexOf(n);

let fail = 0, pass = 0;
function eq(label, got, want) {
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n      나온 값: [${got}]\n      바란 값: [${want}]`); }
}

console.log("기준: 황종 평조(황태중임남), 황 = 63\n");
FIELDS.joPreset = "hwang-pyeong";   // 황 태 중 임 남 = 63 65 68 70 72

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
FIELDS.joPreset = "hwang-gyemyeon";   // 황 협 중 임 무
eq("계면조에서 황 {니} → 협", pitchesOf("황|{니}"), [P("황"), P("협")]);
FIELDS.joPreset = "hwang-pyeong";
eq("평조에서 황 {니}  → 태", pitchesOf("황|{니}"), [P("황"), P("태")]);

console.log("\n음계 자동 추론(조가 '12율 전체'일 때)");
FIELDS.joPreset = "all";
// 황·태·중·임·남만 쓴 악보 → 음계는 저절로 황종 평조가 된다
const auto = "황|태|중|임|남|황|태|중|임|남|중|{니}";
eq("가장 많이 쓴 다섯 음이 곧 음계 → 중 다음 칸은 임",
   pitchesOf(auto).slice(-1), [P("임")]);

console.log("\n소리 없는 기호는 앞 음을 잇는다(옛 동작 그대로)");
FIELDS.joPreset = "hwang-pyeong";
eq("중 {흘림표} → 중 하나뿐", pitchesOf("중|{흘림표}"), [P("중")]);
eq("중 {요성표} → 중 하나뿐", pitchesOf("중|{요성표}"), [P("중")]);
eq("중 -        → 중 하나뿐", pitchesOf("중|-"), [P("중")]);
eq("맨 앞 {노}는 기준 삼을 앞 음이 없어 소리 없음", pitchesOf("{노}|중"), [P("중")]);

console.log("\n박은 그대로인가 (시김새가 자리를 넘지 않아야 한다)");
FIELDS.beats = "2";
const plain = run("중|중").events.reduce((s, e) => s + e.dur, 0);
const orn = run("중{니레}|중{느니르}").events.reduce((s, e) => s + e.dur, 0);
const seq = run("중|{느나르나니}").events.reduce((s, e) => s + e.dur, 0);
eq("꾸밈이 붙어도 총 길이 그대로", [Math.round(orn * 1e6), Math.round(seq * 1e6)],
   [Math.round(plain * 1e6), Math.round(plain * 1e6)]);

console.log(`\n${fail ? "✗" : "✓"} ${pass}개 통과${fail ? `, ${fail}개 실패` : ""}`);
process.exit(fail ? 1 : 0);
