// js/app.js의 함수를 이름으로 떼어 와 Node에서 그대로 돌리는 상자.
//
// 왜 이렇게까지 하나: app.js는 DOM에 붙은 큰 IIFE라 통째로는 못 부른다. 그렇다고 검사 쪽에
// 같은 셈을 한 벌 더 적으면 그건 검사가 아니라 '두 번째 구현'이라, app.js를 고쳐도 옛 답을
// 계속 맞다 한다. 그래서 소스 조각을 떼어 와 실행한다 — 검사가 보는 것이 곧 배포되는 코드다.
// DOM은 그 함수들이 실제로 읽는 칸(값·체크) 몇 개만 흉내 낸다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/app.js"), "utf8");

// 여는 괄호부터 짝이 맞는 곳까지 — 문자열·주석·정규식 안의 괄호에 속지 않게 훑는다.
// 정규식을 따로 챙기는 건 /[&<>"]/g 같은 것 때문이다: 문자 묶음 안의 따옴표를 문자열
// 시작으로 잘못 읽으면 그 뒤가 통째로 어긋난다(실제로 xmlEsc에서 한 번 그랬다).
function sliceBalanced(src, from) {
  const OPEN = { "{": "}", "[": "]", "(": ")" };
  const BEFORE_RE = "(,=:[!&|?{};+-*%<>~^\n\t ";   // 이 뒤의 /는 나눗셈이 아니라 정규식
  const stack = [];
  let inStr = null, inLine = false, inBlock = false, inRe = false, inCls = false, last = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inRe) {
      if (c === "\\") i++;
      else if (c === "[") inCls = true;
      else if (c === "]") inCls = false;
      else if (c === "/" && !inCls) inRe = false;
      continue;
    }
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === "/" && BEFORE_RE.includes(last)) { inRe = true; inCls = false; continue; }
    if (c === "\"" || c === "'" || c === "`") { inStr = c; continue; }
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === "}" || c === "]" || c === ")") {
      if (stack.pop() !== c) throw new Error("괄호 짝이 안 맞습니다 @" + i);
      if (!stack.length) return i + 1;
    }
    if (c.trim()) last = c;
  }
  throw new Error("괄호가 안 닫혔습니다");
}

function takeFn(name) {
  const at = SRC.indexOf("\n  function " + name + "(");
  if (at < 0) throw new Error(`js/app.js에서 function ${name}을 못 찾았습니다`);
  return SRC.slice(at, sliceBalanced(SRC, SRC.indexOf("{", SRC.indexOf(")", at))));
}

// const NAME = { … } / [ … ] / new Set(…) / 한 줄짜리 식
function takeConst(name) {
  const at = SRC.indexOf("\n  const " + name + " = ");
  if (at < 0) throw new Error(`js/app.js에서 const ${name}을 못 찾았습니다`);
  let open = SRC.indexOf("=", at) + 1;
  while (" \t\r\n".includes(SRC[open])) open++;
  if (SRC.startsWith("new ", open)) open = SRC.indexOf("(", open);
  if (!"{[(".includes(SRC[open])) return SRC.slice(at, SRC.indexOf("\n", open) + 1);
  return SRC.slice(at, sliceBalanced(SRC, open)) + ";";
}

/**
 * @param names   떼어 올 것들. "이름"은 함수, "const:이름"은 상수.
 * @param fields  DOM 칸 흉내 — { id: "값" | true/false }
 * @param prelude 떼어 온 조각들 앞에 끼워 넣을 대역(代役) 코드. 검사 범위 밖의 것을
 *                가리는 데 쓴다(예: 합주 파트 목록 — 시김새 소리 검사엔 파트가 하나면 된다).
 * @returns { fields, setMelody, fn }
 */
export async function loadApp(names, fields, prelude) {
  await import("../../js/symbols-registry.js");
  const SYM_REG = globalThis.JGB_SYM;

  const parts = names.map(function (n) {
    return n.startsWith("const:") ? takeConst(n.slice(6)) : takeFn(n);
  });
  const exposed = names.map(function (n) { return n.startsWith("const:") ? null : n; })
    .filter(Boolean);

  const state = { melody: "", fields: fields };
  function $(id) {
    if (!(id in state.fields)) return null;
    const v = state.fields[id];
    return typeof v === "boolean" ? { checked: v, value: "" } : { value: v, checked: false };
  }

  // melodyFull·track은 app.js에선 바깥에 사는 것들이라 여기서 채워 준다
  // (melodyFull은 검사가 곡을 갈아 끼울 수 있게 setter로 연다).
  const factory = new Function("$", "SYM_REG", "BASESET", `
    "use strict";
    const SYM_SND = SYM_REG.sound;
    const ORN_LIST = SYM_REG.ornList;
    const ORN_CAT = {}; ORN_LIST.forEach(function (o) { ORN_CAT[o.s] = o.c; });
    const ORN_KO = {};
    ORN_LIST.forEach(function (o) { if (!(o.k in ORN_KO)) ORN_KO[o.k] = o.s; });
    let melodyFull = "";
    function track() {}
    ${prelude || ""}
    ${parts.join("\n\n")}
    return { __setMelody: function (t) { melodyFull = t; },
             ${exposed.map(function (n) { return n + ": " + n; }).join(", ")} };
  `);

  const api = factory($, SYM_REG,
    new Set(["황", "대", "태", "협", "고", "중", "유", "임", "이", "남", "무", "응"]));

  return {
    fields: state.fields,
    setMelody(t) { state.melody = t; api.__setMelody(t); },
    fn(name) {
      if (!api[name]) throw new Error(`${name}을 떼어 오지 않았습니다`);
      return api[name];
    }
  };
}
