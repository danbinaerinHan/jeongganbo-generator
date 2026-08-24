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

// ---------- 훑기 ----------
console.log("서버: " + BASE);
const c = creds();
const auth = await post("/auth/v1/token?grant_type=password", c, false);
token = auth.access_token;
const me = await rpc("admin_me", {});
console.log("관리자: " + (me.name || c.email) + (DRY ? "  · 살펴보기만 함(--dry)" : ""));

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

let dirty = 0, wrote = 0, unchanged = 0;
const rows = [];
for (const s of list) {
  let r;
  try { r = await rpc("admin_get_score", { p_id: s.id }); }
  catch (e) { console.log("  ! " + s.id + " — " + e.message); continue; }

  const found = scanDoc(r.doc);
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
            (DRY ? " · (--dry라 아무것도 안 적었습니다)"
                 : " · 새로 적음 " + wrote + " · 그대로 " + unchanged));
console.log("결과는 관리 화면(admin.html)의 '문법 오류' 탭에서 볼 수 있습니다.");
