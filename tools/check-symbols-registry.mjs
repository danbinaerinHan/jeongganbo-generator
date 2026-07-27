// js/symbols-registry.js가 만들어 내는 표들이 '리팩터링 전 app.js에 손으로 적혀 있던
// 표'와 한 글자도 다르지 않은지 검사한다. 사전 도입은 화면이 하나도 안 바뀌어야 하는
// 작업이라, 눈으로 훑는 대신 옛 값을 기준으로 기계가 대조하게 둔 것.
//
//   node tools/check-symbols-registry.mjs            # 기준 = 사전 도입 직전 커밋
//   node tools/check-symbols-registry.mjs <커밋>     # 기준 커밋을 직접 지정
//
// 기준 커밋의 app.js에서 옛 표들을 그대로 떼어다 쓰므로, 사전을 고친 뒤 이 검사가
// 깨지면 '악보 모양이 달라졌다'는 뜻이다(의도한 변경이면 기준 커밋을 옮길 것).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// 기준은 **사전 도입 직전** 커밋으로 못박는다. HEAD를 기본값으로 두면 사전이 커밋되는
// 순간 app.js의 표가 `SYM_REG.ornList` 참조로 바뀌어 떼어낼 옛 값이 사라진다
// (실제로 67fe4c1 이후 `ReferenceError: SYM_REG is not defined`로 검사가 죽었다).
const BASE = process.argv[2] || "eb02d91";

// ── 기준 커밋의 app.js에서 옛 표 떼어 오기 ──
// 표 안엔 문자열에 괄호가 없고 주석에만 있으므로, 줄 주석을 걷어낸 뒤 괄호 짝을 세어
// 값의 끝을 찾는다.
function legacySource() {
  try {
    return execFileSync("git", ["show", `${BASE}:js/app.js`], { cwd: ROOT, encoding: "utf8" });
  } catch (err) {
    throw new Error(`기준 커밋(${BASE})의 js/app.js를 읽지 못했습니다: ${err.message}`);
  }
}

function extract(src, name) {
  const start = src.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`기준 app.js에서 ${name}을(를) 찾지 못했습니다`);
  const rhsAt = src.indexOf("=", start) + 1;
  const body = src.slice(rhsAt).replace(/\/\/[^\n]*/g, "");
  const OPEN = { "[": "]", "{": "}", "(": ")" };
  let depth = 0, end = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (OPEN[ch]) depth++;
    else if (ch === "]" || ch === "}" || ch === ")") depth--;
    else if (ch === ";" && depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(`${name}의 끝(;)을 찾지 못했습니다`);
  // eslint-disable-next-line no-eval
  return eval(`(${body.slice(0, end)})`);
}

const src = legacySource();
const old = {
  ORN_LIST: extract(src, "ORN_LIST"),
  SYM_EXTRA_SCALE: extract(src, "SYM_EXTRA_SCALE"),
  ATT_SCALE_KEEP: extract(src, "ATT_SCALE_KEEP"),
  ATT_SYM_SCALE: extract(src, "ATT_SYM_SCALE"),
  LYRIC_SYMS: extract(src, "LYRIC_SYMS"),
  LYRIC_SYM_ALIAS: extract(src, "LYRIC_SYM_ALIAS"),
  LYRIC_SYM_SCALE: extract(src, "LYRIC_SYM_SCALE"),
  LYRIC_SYM_SCALE_DEFAULT: extract(src, "LYRIC_SYM_SCALE_DEFAULT"),
  JANGGU_NAMES: extract(src, "JANGGU_NAMES"),
  JANGGU_DRAW_SCALE: extract(src, "JANGGU_DRAW_SCALE")
};

// ── 지금 사전에서 파생된 표 ──
const scope = {};
// eslint-disable-next-line no-eval
new Function("window", readFileSync(join(ROOT, "js/symbols-registry.js"), "utf8"))(scope);
const reg = scope.JGB_SYM;
if (!reg) throw new Error("js/symbols-registry.js가 window.JGB_SYM을 안 만들었습니다");

// ── 대조 ──
// 기호를 새로 들이는 건 정상이므로 '늘어난 것'은 통과시키고 세어서 알려 준다. 막아야 할 건
// 옛 항목이 **바뀌거나 사라지는** 것 — 그건 기존 악보의 모양이 달라진다는 뜻이다.
const fails = [];
const key = (v) => (v && typeof v === "object" && "s" in v) ? v.s : String(v);
function eq(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { console.log(`  ✓ ${label}`); return; }
  const bad = [];
  let added = 0;
  if (Array.isArray(got) && Array.isArray(want)) {
    // 옛 항목이 지금도 '같은 값으로, 같은 앞뒤 차례로' 있는지 본다(새 항목은 건너뛰며 훑음)
    const oldKeys = new Set(want.map(key));
    const kept = got.filter((v) => oldKeys.has(key(v)));
    added = got.length - kept.length;
    const n = Math.max(kept.length, want.length);
    for (let i = 0; i < n; i++) {
      const g = JSON.stringify(kept[i]), w = JSON.stringify(want[i]);
      if (g !== w) bad.push(`      [${i}] 지금 ${g} / 예전 ${w}`);
    }
  } else {
    Object.keys(want || {}).forEach(function (k) {
      if (JSON.stringify(got[k]) !== JSON.stringify(want[k])) {
        bad.push(`      ${k}: 지금 ${JSON.stringify(got[k])} / 예전 ${JSON.stringify(want[k])}`);
      }
    });
    added = Object.keys(got || {}).filter((k) => !(k in (want || {}))).length;
  }
  if (bad.length) {
    fails.push(label);
    console.log(`  ✗ ${label} — 옛 항목이 달라짐`);
    bad.slice(0, 12).forEach((l) => console.log(l));
    if (bad.length > 12) console.log(`      … 외 ${bad.length - 12}건`);
  } else {
    console.log(`  ✓ ${label} — 옛 항목 그대로, ${added}개 새로 늘어남`);
  }
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

console.log(`기준: ${BASE}:js/app.js\n`);
eq("ORN_LIST (선율 시김새 목록·순서·자리)", reg.ornList, old.ORN_LIST);
eq("ATT_SCALE_KEEP (붙임표 확대 제외)", [...reg.attKeep].sort(), [...old.ATT_SCALE_KEEP].sort());
eq("ATT_SYM_SCALE (붙임 미세 배율)", sorted(reg.attScale), sorted(old.ATT_SYM_SCALE));
eq("SYM_EXTRA_SCALE (독립 기호 미세 배율)", sorted(reg.cellScale), sorted(old.SYM_EXTRA_SCALE));
eq("LYRIC_SYMS (가사줄 목록·순서)", reg.lyricNames, old.LYRIC_SYMS);
eq("LYRIC_SYM_ALIAS (가사줄 이름→그림)", sorted(reg.lyricAlias), sorted(old.LYRIC_SYM_ALIAS));
eq("JANGGU_NAMES (장단줄 목록·순서)", reg.jangguNames, old.JANGGU_NAMES);
eq("JANGGU_DRAW_SCALE (장구 그리기 배율)", sorted(reg.jangguScale), sorted(old.JANGGU_DRAW_SCALE));

// 가사줄 배율은 예전엔 '표에 없으면 기본 0.4'였고 지금은 이름마다 값을 다 갖는다.
// 표끼리가 아니라 '실제로 그릴 때 쓰는 값'끼리 맞춰 본다.
// 대상은 '예전에 있던 이름'만 — 새로 들인 기호는 예전 표에 없어서 기본값 0.4와 비교되어
// 바뀐 것처럼 보인다(실제로는 늘어난 것).
const lyNames = [...new Set([...old.LYRIC_SYMS, ...Object.keys(old.LYRIC_SYM_SCALE)])].sort();
const lyOld = {}, lyNew = {};
lyNames.forEach(function (n) {
  lyOld[n] = (n in old.LYRIC_SYM_SCALE) ? old.LYRIC_SYM_SCALE[n] : old.LYRIC_SYM_SCALE_DEFAULT;
  lyNew[n] = (n in reg.lyricScale) ? reg.lyricScale[n] : 0.4;
});
eq("가사줄 그리기 배율(기본값 적용 후)", lyNew, lyOld);

// 사전 자체의 앞뒤 맞음 — id 중복, 자리 없는 항목, 목록에 없는 id
const seen = new Set();
reg.list.forEach(function (s) {
  if (seen.has(s.id)) fails.push(`id 중복: ${s.id}`);
  seen.add(s.id);
  if (!Object.keys(s.at).length) fails.push(`자리(at)가 빈 항목: ${s.id}`);
});
console.log(fails.length ? `\n✗ ${fails.length}건 어긋남` : "\n✓ 전부 같음 — 사전이 옛 표를 그대로 재현합니다");
process.exit(fails.length ? 1 : 0);
