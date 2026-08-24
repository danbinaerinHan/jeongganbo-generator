// 게시된 악보의 **문법**을 훑어 그 결과를 서버에 적는다.
//
//   node tools/scan-published.mjs [--dry] [--verbose] [--limit N] [--id <게시물id>]
//
// ── 왜 서버가 아니라 여기서 재나 ──────────────────────────────────────────────
// 서버는 악보를 모른다(server/schema.sql 설계 뼈대 ①). 정간·시김새·율명을 읽을 줄 아는
// 것은 앱뿐이므로, 검사도 앱의 눈으로 해야 한다. 그래서 **js/app.js의 melodyBadFlags를
// 이름으로 떼어 와 그대로 돌린다**(tools/lib/app-sandbox.mjs) — 편집기에서 빨간 바탕이
// 깔리는 바로 그 함수다. 여기에 같은 셈을 한 벌 더 적으면 앱을 고쳐도 옛 답을 계속 맞다
// 한다. 서버에는 **결과 숫자만** 적힌다(admin_set_lint → scores.lint_bad).
//
// ── 무엇을 보나 ─────────────────────────────────────────────────────────────
// **선율만** 본다. 편집기가 빨간 바탕으로 짚어 주는 것이 선율이고, 곁줄·장단은 글자를
// 적는 자리라 '틀렸다'고 말할 잣대가 없다(모르는 글자는 그냥 글자로 그려진다).
// 총보면 파트마다 따로 세어 합친다.
//
// ── 들어가려면 ──────────────────────────────────────────────────────────────
// 관리자 계정으로 로그인한다(admin.html과 같은 열쇠). 둘 중 하나로 준다:
//   · 환경변수  JGB_ADMIN_EMAIL=…  JGB_ADMIN_PW=…
//   · 파일      server/admin.local.json  →  { "email": "…", "password": "…" }
// service_role 키는 쓰지 않는다 — 관리자 로그인이 이미 있고, 그 키는 모든 빗장을 무시한다.

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadApp } from "./lib/app-sandbox.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DRY = has("--dry");
const FIX = has("--fix-safe");
const VERBOSE = has("--verbose");
const ONLY = val("--id", null);
const LIMIT = Number(val("--limit", 0)) || 0;

// ---------- 설정 ----------
globalThis.window = globalThis;                 // 브라우저용 스크립트를 그대로 읽으려고
await import("../js/cloud-config.js");
const CFG = globalThis.JGB_CLOUD || {};
const KEY = CFG.key || CFG.anonKey || "";
const BASE = (CFG.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
if (!BASE || !KEY) {
  console.error("js/cloud-config.js에 서버 설정이 없습니다.");
  process.exit(1);
}

function creds() {
  const e = process.env.JGB_ADMIN_EMAIL, p = process.env.JGB_ADMIN_PW;
  if (e && p) return { email: e, password: p };
  const f = join(ROOT, "server/admin.local.json");
  if (existsSync(f)) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    if (j.email && j.password) return { email: j.email, password: j.password };
  }
  console.error([
    "관리자 로그인 정보가 없습니다. 둘 중 하나로 주세요:",
    "  JGB_ADMIN_EMAIL=you@example.com JGB_ADMIN_PW=… node tools/scan-published.mjs",
    '  server/admin.local.json  →  { "email": "…", "password": "…" }   (커밋 금지)',
  ].join("\n"));
  process.exit(1);
}

// ---------- 서버와 말하기 ----------
let token = null;
async function post(path, body, auth) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: Object.assign(
      { "apikey": KEY, "Content-Type": "application/json" },
      auth ? { "Authorization": "Bearer " + token } : {}),
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = (data && (data.message || data.error_description || data.msg)) || res.status;
    throw new Error(path + " — " + m);
  }
  return data;
}
const rpc = (fn, body) => post("/rest/v1/rpc/" + fn, body, true);

// ---------- 앱의 눈으로 재기 ----------
// melodyBadFlags가 쓰는 표와 함수만 떼어 온다. symURL이 그림 사전 셋을 뒤지므로
// (SYM_DATA·NOTE_DATA·JANGGU_DATA) 그 데이터도 브라우저에서처럼 window에 올려 둔다 —
// 키 목록을 여기 따로 적으면 그것이 곧 두 번째 사전이 된다.
await import("../js/symbols-data.js");
await import("../js/notes-data.js");
await import("../js/janggu-data.js");

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
  if (!m) { console.error("js/app.js에서 const YUL을 못 찾았습니다."); process.exit(1); }
  const keys = [...m[1].matchAll(/([가-힣])\s*:/g)].map((x) => x[1]);
  const stale = keys.filter((k) => melodyBadFlags(k).bad.some(Boolean));
  if (!keys.length || stale.length) {
    console.error("app.js의 율명과 검사 상자의 BASESET이 어긋났습니다" +
                  (stale.length ? ": " + stale.join(" ") : "(율명을 하나도 못 읽음)"));
    console.error("tools/lib/app-sandbox.mjs의 BASESET을 js/app.js의 YUL과 맞춰 주세요.");
    process.exit(1);
  }
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

// ---------- 손대도 되는 교정 (--fix-safe) ----------
// **답이 하나로 정해지는 것만** 고친다. 검사기가 아는 것은 '앱이 이 글자를 못 읽는다'까지고
// 무엇을 쓰려던 것인지는 모르므로, 짐작이 끼어드는 갈래(시김새 이름 오타·어긋난 괄호 짝·
// 문장부호)는 손대지 않고 표시만 한다. 약관 제5조 제4항이 교정 범위를 '**명백한** 표기
// 오류'로 좁혀 둔 것과 같은 선이다.
//
//   ① 한자 율명 → 한글   黃 → 황 · 潢 → 청황
//   ② 괄호 안 빈칸 걷기   { 흘림표 } → {흘림표}
//
// ①의 대응표는 **app.js의 YUL·OCT_HANJA를 그 자리에서 읽어 뒤집은 것**이다(사본이 아니다).
// 뒤집을 때 같은 한자가 두 뜻을 갖는 것은 빼 둔다 — 2026-08-24 실측으로 57자 중 侇 하나가
// 배유·배이 둘로 갈린다(app.js의 OCT_HANJA에 같은 글자가 두 번 적혀 있다).
const octPrefix = app.fn("octPrefix");
const HANJA = (() => {
  const src = readFileSync(join(ROOT, "js/app.js"), "utf8");
  const pairs = (t) => {
    const o = {};
    for (const [, k, v] of t.matchAll(/([가-힣])\s*:\s*"([^"]+)"/g)) o[k] = v;
    return o;
  };
  const yulSrc = src.slice(src.indexOf("\n  const YUL = {"));
  const YUL = pairs(yulSrc.slice(0, yulSrc.indexOf("};")));
  const at = src.indexOf("\n  const OCT_HANJA = {");
  const octSrc = src.slice(at, src.indexOf("\n  };", at));
  const seen = new Map();
  const put = (ch, txt) => {
    if (!seen.has(ch)) seen.set(ch, new Set());
    seen.get(ch).add(txt);
  };
  for (const [b, ch] of Object.entries(YUL)) put(ch, b);
  for (const line of octSrc.split("\n")) {
    const m = line.match(/"(-?\d)":\s*\{(.*)\}/);
    if (!m) continue;
    for (const [b, ch] of Object.entries(pairs(m[2]))) put(ch, octPrefix(Number(m[1])) + b);
  }
  const map = {};
  let split = 0;
  for (const [ch, set] of seen) { if (set.size === 1) map[ch] = [...set][0]; else split++; }
  return { map, split, total: seen.size };
})();

const CLOSE = { "{": "}", "[": "]", "(": ")" };
const clean = (t) => !melodyBadFlags(t).bad.some(Boolean);

// 한 조각을 고쳐 본다. 무엇을 몇 군데 고쳤는지 함께 돌려준다.
function fixText(text) {
  let hanja = 0, spaces = 0;
  let out = "";
  for (const ch of text) {
    if (HANJA.map[ch]) { out += HANJA.map[ch]; hanja++; } else out += ch;
  }
  // 괄호 안 빈칸 — 줄바꿈은 건드리지 않는다(그건 닫는 괄호를 빠뜨린 쪽에 가깝다).
  out = out.replace(/([{[(])([^{}[\]()\n]*)([)\]}])/g, (m, open, inner, close) => {
    if (CLOSE[open] !== close) return m;          // 짝이 어긋나면 손대지 않는다
    if (!/\s/.test(inner)) return m;
    const t = inner.trim();
    if (!t || /\s/.test(t)) return m;             // 가운데 빈칸이면 이름이 아니다
    if (!clean(open + t + close)) return m;       // 빈칸을 걷어도 못 읽으면 그대로 둔다
    spaces++;
    return open + t + close;
  });
  return { text: out, hanja, spaces };
}

// ★ 고친 뒤 **반드시 다시 재 본다.** 틀린 자리가 줄지 않았거나 없던 자리가 새로 생겼으면
//   그 교정은 버린다 — 남의 악보를 짐작으로 바꾸지 않겠다는 약속을 코드로 지키는 자리다.
function fixSafely(text) {
  const before = melodyBadFlags(text).bad.filter(Boolean).length;
  const r = fixText(text);
  if (r.text === text) return null;
  const after = melodyBadFlags(r.text).bad.filter(Boolean).length;
  if (after >= before) return null;
  return { text: r.text, hanja: r.hanja, spaces: r.spaces, before, after };
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

// 문서를 통째로 고쳐 본다. 파트마다 따로 재고, 하나라도 고쳐졌으면 새 문서를 돌려준다.
function fixDoc(doc) {
  const d = JSON.parse(JSON.stringify(doc));
  let hanja = 0, spaces = 0, touched = 0;
  const lanes = Array.isArray(d.parts) && d.parts.length ? d.parts : [d];
  lanes.forEach((p) => {
    if (typeof p.melody !== "string" || !p.melody) return;
    const r = fixSafely(p.melody);
    if (!r) return;
    p.melody = r.text; hanja += r.hanja; spaces += r.spaces; touched++;
  });
  return touched ? { doc: d, hanja, spaces } : null;
}

// 고친 사실을 판에 적는 말. 무엇을 몇 군데 고쳤는지가 남아야 게시자가 읽고 판단할 수 있다
// (약관 제5조 제5·6항).
function fixNote(f) {
  const bits = [];
  if (f.hanja) bits.push("한자 율명 " + f.hanja + "자를 한글로");
  if (f.spaces) bits.push("괄호 안 빈칸 " + f.spaces + "군데 정리");
  return "표기 자동 교정 — " + bits.join(" · ") + " (tools/scan-published.mjs --fix-safe)";
}

// ---------- 훑기 ----------
console.log("서버: " + BASE);
const c = creds();
const auth = await post("/auth/v1/token?grant_type=password", c, false);
token = auth.access_token;
const me = await rpc("admin_me", {});
console.log("관리자: " + (me.name || c.email) + (DRY ? "  · 살펴보기만 함(--dry)" : ""));
if (FIX) {
  console.log("교정 모드(--fix-safe) — 답이 하나로 정해지는 것만 고칩니다: " +
              "한자 율명 " + Object.keys(HANJA.map).length + "자" +
              (HANJA.split ? "(뜻이 갈리는 " + HANJA.split + "자는 뺌)" : "") +
              " · 괄호 안 빈칸.");
  console.log("  시김새 이름 오타·어긋난 괄호 짝·문장부호는 손대지 않고 표시만 합니다.\n");
}

async function listAll() {
  const all = [];
  let offset = 0;
  for (;;) {
    const r = await rpc("admin_list_scores",
      { p_sort: "recent", p_q: "", p_limit: 100, p_offset: offset, p_filter: "all" });
    const items = r.items || [];
    all.push(...items);
    offset += items.length;
    if (!items.length || offset >= (r.total || 0)) break;
    if (LIMIT && all.length >= LIMIT) break;
  }
  return LIMIT ? all.slice(0, LIMIT) : all;
}

const list = ONLY ? [{ id: ONLY, title: "(지정)", lint_bad: null }] : await listAll();
console.log("악보 " + list.length + "곡\n");

let dirty = 0, wrote = 0, unchanged = 0, repaired = 0;
const rows = [];
for (const s of list) {
  let r;
  try { r = await rpc("admin_get_score", { p_id: s.id }); }
  catch (e) { console.log("  ! " + s.id + " — " + e.message); continue; }

  let doc = r.doc, fixed = null;
  if (FIX) {
    fixed = fixDoc(doc);
    if (fixed) {
      doc = fixed.doc;
      const note = fixNote(fixed);
      console.log("  ✎ " + r.id + " " + r.title + " — " + note.replace(/ \(tools.*$/, ""));
      if (!DRY) {
        try { await rpc("admin_save_score", { p_id: r.id, p_doc: doc, p_note: note }); repaired++; }
        catch (e) { console.log("  ! " + r.id + " 되쓰지 못했습니다 — " + e.message); doc = r.doc; }
      }
    }
  }

  const found = scanDoc(doc);
  const bad = found.reduce((n, f) => n + f.runs.length, 0);
  if (bad) dirty++;
  rows.push({ id: r.id, title: r.title, ver: r.ver, bad, found, was: s.lint_bad });

  // 이미 같은 값이면 굳이 쓰지 않는다 — lint_at만 새로 찍혀 '언제 마지막으로 달라졌나'가 흐려진다.
  if (!DRY && s.lint_bad !== bad) {
    try { await rpc("admin_set_lint", { p_id: r.id, p_bad: bad }); wrote++; }
    catch (e) { console.log("  ! " + r.id + " 결과를 적지 못했습니다 — " + e.message); }
  } else if (!DRY) unchanged++;
}

// ---------- 알려 주기 ----------
// 터미널에서 한글·한자는 두 칸을 먹는다 — 글자 수로 채우면 악기 이름이 있는 줄만 밀린다.
const wide = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) ||
         (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
         (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) ||
         (c >= 0xffe0 && c <= 0xffe6);
};
const cols = (s) => [...String(s)].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - cols(s)));
rows.sort((a, b) => b.bad - a.bad);
const hit = rows.filter((r) => r.bad > 0);
if (!hit.length) {
  console.log("문법이 어긋난 악보가 없습니다.");
} else {
  console.log(pad("주소", 10) + pad("틀림", 6) + "제목");
  console.log("-".repeat(60));
  for (const r of hit) {
    console.log(pad(r.id, 10) + pad(String(r.bad), 6) + r.title + "  (v" + r.ver + ")");
    if (VERBOSE) {
      for (const f of r.found) {
        for (const run of f.runs.slice(0, 8)) {
          console.log("    " + pad(f.part, 12) + "줄 " + run.line + " 글자 " + run.col +
                      "  «" + run.text + "»   …" + run.around + "…");
        }
        if (f.runs.length > 8) console.log("    " + pad(f.part, 12) + "… 그 밖 " + (f.runs.length - 8) + "군데");
      }
    }
  }
  if (!VERBOSE) console.log("\n어디가 틀렸는지 보려면 --verbose");
}

console.log("\n훑은 악보 " + rows.length + " · 어긋난 악보 " + dirty +
            (FIX ? " · 고친 악보 " + (DRY ? "0(--dry)" : repaired) : "") +
            (DRY ? " · (--dry라 아무것도 안 적었습니다)"
                 : " · 새로 적음 " + wrote + " · 그대로 " + unchanged));
if (FIX && !DRY && repaired) {
  console.log("고친 악보는 판이 하나 올라갔습니다 — 관리 화면에서 판 번호를 눌러 되돌릴 수 있습니다.");
}
console.log("결과는 관리 화면(admin.html)의 '문법 오류' 탭에서 볼 수 있습니다.");
