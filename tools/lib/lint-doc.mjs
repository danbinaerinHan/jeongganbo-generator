// 앱의 눈으로 악보 문서를 재는 자리.
//
// 편집기가 선율 칸에 **빨간 바탕**을 깔 때 쓰는 그 함수(`melodyBadFlags`)를 js/app.js에서
// 이름으로 떼어 와 그대로 돌린다(tools/lib/app-sandbox.mjs). 검사 쪽에 같은 셈을 한 벌 더
// 적으면 그건 '두 번째 구현'이라 app.js를 고쳐도 옛 답을 계속 맞다 한다.
//
// 여기 한 벌만 두는 까닭: 재는 자리가 둘이다 —
//   · `tools/scan-published.mjs`   서버에 올라가 있는 악보
//   · `tools/edit-local-scores.mjs` 손에 있는 .jgb.json 파일
// 둘이 같은 악보에 다른 답을 내면 어느 쪽을 믿어야 할지 알 수 없다.
//
// **선율만 본다** — 곁줄·장단은 글자를 적는 자리라 '틀렸다'고 말할 잣대가 없다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadApp } from "./app-sandbox.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadLinter() {
  // 브라우저용 스크립트(그림 데이터)를 그대로 읽으려고 — window를 전역으로 세운다.
  if (!globalThis.window) globalThis.window = globalThis;

  // melodyBadFlags가 쓰는 표와 함수만 떼어 온다. symURL이 그림 사전 셋을 뒤지므로
  // (SYM_DATA·NOTE_DATA·JANGGU_DATA) 그 데이터도 브라우저에서처럼 window에 올려 둔다 —
  // 키 목록을 여기 따로 적으면 그것이 곧 두 번째 사전이 된다.
  await import("../../js/symbols-data.js");
  await import("../../js/notes-data.js");
  await import("../../js/janggu-data.js");

  const app = await loadApp(
    ["const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE",
     "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
     "const:OCT_ROWS", "octPrefix",
     // 칸 나눔 규칙(좌우는 상하가 있을 때만)이 쓰는 것들 — melodyBadFlags가 안에서 부른다
     "parseMelodyOffsets", "tokenizeNotes", "groupRowTokens", "cellSplitBad",
     "matchSpecialNote", "symURL", "melodyBadFlags"],
    {}
  );
  const melodyBadFlags = app.fn("melodyBadFlags");

  // ★ 빗장 하나. app.js는 BASESET(성립하는 율명 낱자)을 YUL에서 뽑는데, 검사 상자는 그것을
  //   **손으로 박아 둔 대역**으로 건네준다(tools/lib/app-sandbox.mjs). 둘이 어긋나면 멀쩡한
  //   율명이 죄다 '틀림'으로 잡혀 **모든 악보가 통째로 오류로 보고된다** — 조용히 틀리느니
  //   여기서 멈춘다. 견주는 값은 js/app.js의 YUL을 그 자리에서 읽어 온 것이라 사본이 아니다.
  {
    const src = readFileSync(join(ROOT, "js/app.js"), "utf8");
    const m = src.match(/\n  const YUL = \{([\s\S]*?)\n?\s*\};/);
    if (!m) throw new Error("js/app.js에서 const YUL을 못 찾았습니다.");
    const keys = [...m[1].matchAll(/([가-힣])\s*:/g)].map((x) => x[1]);
    const stale = keys.filter((k) => melodyBadFlags(k).bad.some(Boolean));
    if (!keys.length || stale.length)
      throw new Error(
        "app.js의 율명과 검사 상자의 BASESET이 어긋났습니다" +
        (stale.length ? ": " + stale.join(" ") : "(율명을 하나도 못 읽음)") +
        "\ntools/lib/app-sandbox.mjs의 BASESET을 js/app.js의 YUL과 맞춰 주세요.");
  }

  // 잘못된 글자를 '이어진 덩이'로 묶어 돌려준다 — 한 글자씩 세어 봐야 어디가 틀렸는지
  // 알 수 없고, 사람이 고칠 단위는 토큰이다.
  function badRuns(text) {
    const { a, bad } = melodyBadFlags(text);
    const runs = [];
    let i = 0;
    while (i < a.length) {
      if (!bad[i]) { i++; continue; }
      let j = i;
      while (j < a.length && bad[j]) j++;
      // 줄·글자 자리 — 편집기가 textarea라 이대로 찾아갈 수 있다
      let line = 1, col = 1;
      for (let k = 0; k < i; k++) { if (a[k] === "\n") { line++; col = 1; } else col++; }
      runs.push({
        line, col,
        text: a.slice(i, j).join(""),
        around: a.slice(Math.max(0, i - 6), Math.min(a.length, j + 6)).join("").replace(/\n/g, "⏎"),
      });
      i = j;
    }
    return runs;
  }

  // 문서 하나 — 총보면 파트마다 따로 센다. 옛 v1은 루트 melody 하나뿐이다.
  function scanDoc(doc) {
    const parts = Array.isArray(doc && doc.parts) && doc.parts.length
      ? doc.parts
      : [{ name: "", melody: (doc && doc.melody) || "" }];
    const out = [];
    parts.forEach((p, i) => {
      const t = (p && typeof p.melody === "string") ? p.melody : "";
      if (!t) return;
      const runs = badRuns(t);
      if (runs.length) out.push({ part: p.name || p.instrument || ("파트 " + (i + 1)), runs });
    });
    return out;
  }

  // 몇 **군데**인가(글자 수가 아니라 이어진 덩이 수) — 게시 창의 한 줄과 같은 셈이다.
  const countBad = (doc) => scanDoc(doc).reduce((n, f) => n + f.runs.length, 0);

  // `app`도 함께 내준다 — 같은 상자에서 다른 조각(octPrefix 등)을 꺼내 쓰는 도구가 있고
  // (scan-published.mjs의 --fix-safe), 상자를 두 번 세우면 app.js를 두 번 읽게 된다.
  return { app, melodyBadFlags, badRuns, scanDoc, countBad };
}
