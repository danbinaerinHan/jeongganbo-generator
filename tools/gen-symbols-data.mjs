// js/symbols-data.js 생성기.
//   assets/symbol_svgs/{symbols,tempo,special} 세 폴더의 .svg 를 base64 data URL 로 묶어
//   window.SYM_DATA = { <파일명(확장자 제외)>: "data:image/svg+xml;base64,..." } 를 만든다.
//   - symbols : 시김새 대표 이미지(영문 stem)
//   - tempo   : 빠르기 기호(한글 stem) — 시김새 팔레트 '빠르기' 그룹
//   - special : 특수기호(한글 stem) — 가사 기호 팔레트
//   키 이름이 겹치지 않으므로 한 객체(SYM_DATA)에 함께 담는다. symURL()이 이 객체를 읽는다.
// 사용법:  node tools/gen-symbols-data.mjs   (리포 루트에서 실행)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SVG_ROOT = join(ROOT, "assets", "symbol_svgs");
const FOLDERS = ["symbols", "tempo", "special"];

function collect(folder) {
  const dir = join(SVG_ROOT, folder);
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .sort()
    .map((f) => {
      const stem = f.slice(0, -4);
      const b64 = readFileSync(join(dir, f)).toString("base64");
      return [stem, "data:image/svg+xml;base64," + b64];
    });
}

const entries = FOLDERS.flatMap(collect);
const seen = new Set();
for (const [k] of entries) {
  if (seen.has(k)) throw new Error("중복 stem: " + k + " — 폴더 간 파일명이 겹칩니다.");
  seen.add(k);
}

const body = entries
  .map(([k, v]) => "  " + JSON.stringify(k) + ": " + JSON.stringify(v))
  .join(",\n");

const out =
  "// 자동 생성(tools/gen-symbols-data.mjs) — assets/symbol_svgs/{symbols,tempo,special} SVG를 base64로 내장. 직접 편집 금지.\n" +
  "window.SYM_DATA = {\n" +
  body +
  "\n};\n";

writeFileSync(join(ROOT, "js", "symbols-data.js"), out);
console.log("js/symbols-data.js 재생성 완료 — " + entries.length + "개 키");
