// 『교과서 표준악보집』 변환본(.jgb.json)을 게시 서버에 올리고 관리한다 — tools/publish-ngc-omr.mjs와 같은 꼴.
//
//   node tools/publish-edu-standard.mjs publish [--unlisted]   게시 (이미 올린 곡은 건너뜀 — 몇 번을 돌려도 안전)
//   node tools/publish-edu-standard.mjs update                 문서·그림을 파일의 지금 내용으로 다시 올림(공개 설정은 그대로)
//   node tools/publish-edu-standard.mjs visibility unlisted    전부 비공개(주소를 아는 사람만)로
//   node tools/publish-edu-standard.mjs visibility public      전부 공유마당 목록으로 되올림
//   node tools/publish-edu-standard.mjs delete --really        전부 삭제
//
// ── 무엇을 올리나
// 악보는 `교과서표준악보집/_우물사이/*.jgb.json`(tools/edu-standard/run.sh가 변환한 것), 미리보기 그림은
// `교과서표준악보집/_그림/_thumbs/<같은 이름>.txt`(tools/edu-standard/render.mjs가 뜬 data URI).
//
// ── 지은이·이용 조건
// author는 아래 AUTHOR 한 값으로 통일한다 — 공유마당의 '교과서 표준악보' **탭이 이 값으로 거른다**
// (js/browse.js의 EDU_AUTHOR와 글자까지 같아야 한다). 원본에 이용 조건 표기가 없어 license는
// 'none'(저작권 유보)으로 둔다. 출처는 게시물마다가 아니라 탭 머리(browse.html #scLeadEdu)와
// 각 악보의 부제에 적는다.
//
// ── 올리는 차례
// 공유마당은 최신순이 기본이라 **나중에 올린 것이 앞에 선다** — 그래서 책 차례를 거꾸로 올린다
// (소금 17 → … → 단소 01). 그러면 탭을 열었을 때 단소 01부터 책 차례대로 보인다.
//
// ── 수정 열쇠(토큰)
// server/edu-tokens.local.json (커밋 금지 — .gitignore의 server/*.local.json*). 곡마다 성공 즉시 저장한다.
//
// ── 게시 빈도 제한
// 서버는 시간당 20건을 넘으면 53400으로 막는다. 그 오류를 만나면 5분 기다렸다 이어서 올린다
// (42곡이면 두 시간 남짓). 급하면 SQL Editor에서 publish_rate_limit을 잠시 올렸다가 되돌린다.
//
// ── 순서 주의
// '올라온 악보' 탭이 이 42곡을 빼려면 server/edu-tab.sql을 먼저 돌려야 한다(그 전엔 지은이를
// 둘 다 빼는 호출이 안 먹어 이 곡들이 '올라온 악보'에도 섞인다). 그 전에 올릴 거면 --unlisted로
// 올려 두고, SQL·browse.js 배포 뒤에 `visibility public`으로 연다.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "교과서표준악보집", "_우물사이");
const THUMBS = join(ROOT, "교과서표준악보집", "_그림", "_thumbs");
const TOKENS = join(ROOT, "server", "edu-tokens.local.json");

// ★ js/browse.js의 EDU_AUTHOR와 글자까지 같아야 탭이 거른다
const AUTHOR = "국립국악원 (교과서 표준악보집)";
const LICENSE = "none";

// ── 서버 연결값은 js/cloud-config.js에서 그대로 읽는다(두 벌 적지 않으려고) ──
const cfgSrc = readFileSync(join(ROOT, "js", "cloud-config.js"), "utf8");
const CFG_URL = (cfgSrc.match(/url:\s*"([^"]*)"/) || [])[1] || "";
const CFG_KEY = (cfgSrc.match(/key:\s*"([^"]*)"/) || [])[1] || "";
if (!CFG_URL || !CFG_KEY) {
  console.error("js/cloud-config.js에 서버 연결값이 없습니다 — 게시 서버가 아직 안 붙은 상태입니다.");
  process.exit(1);
}
const API = CFG_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1/rpc/";
const HEADERS = { "apikey": CFG_KEY, "Content-Type": "application/json" };
if (/^eyJ/.test(CFG_KEY)) HEADERS["Authorization"] = "Bearer " + CFG_KEY;

async function rpc(fn, body) {
  const res = await fetch(API + fn, { method: "POST", headers: HEADERS, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const err = new Error((data && data.message) || (fn + " 실패 (" + res.status + ")"));
  err.code = data && data.code;
  err.status = res.status;
  throw err;
}

// 게시 빈도 제한(53400)인지 — 메시지가 아니라 코드로 본다
const isRateLimit = (e) => e.code === "53400" || /시간에 올릴 수 있는/.test(e.message || "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadTokens() {
  if (!existsSync(TOKENS)) return { note: "교과서 표준악보집 게시물 수정 열쇠 — 커밋 금지(.gitignore). tools/publish-edu-standard.mjs가 쓴다.", scores: [] };
  return JSON.parse(readFileSync(TOKENS, "utf8"));
}
function saveTokens(t) {
  writeFileSync(TOKENS, JSON.stringify(t, null, 2) + "\n", "utf8");
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".jgb.json")).sort((a, b) => a.localeCompare(b, "ko"));
const cmd = process.argv[2];

if (cmd === "publish") {
  const tok = loadTokens();
  const done = new Set(tok.scores.map((s) => s.file));
  const todo = files.filter((f) => !done.has(f)).reverse();   // 책 차례를 거꾸로(위 '올리는 차례')
  const isPublic = !process.argv.includes("--unlisted");
  console.log(`전체 ${files.length}곡 · 이미 올림 ${done.size}곡 · 이번에 ${todo.length}곡`);
  for (const f of todo) {
    const doc = JSON.parse(readFileSync(join(SRC, f), "utf8"));
    const thPath = join(THUMBS, f.replace(/\.jgb\.json$/, ".txt"));
    const thumb = existsSync(thPath) ? readFileSync(thPath, "utf8").trim() : null;
    for (;;) {
      try {
        const r = await rpc("publish_score", {
          p_doc: doc, p_author: AUTHOR, p_license: LICENSE, p_public: isPublic, p_thumb: thumb,
        });
        tok.scores.push({ id: r.id, title: doc.controls?.title || f, file: f, token: r.token });
        saveTokens(tok);   // 곡마다 바로 저장 — 끊겨도 받은 토큰은 남는다
        console.log(`올림  ${r.id}  ${doc.controls?.title || f}${thumb ? "" : "  (그림 없음)"}`);
        break;
      } catch (e) {
        if (isRateLimit(e)) { console.log("빈도 제한 — 5분 기다립니다…"); await sleep(5 * 60 * 1000); continue; }
        console.error(`실패  ${f}: ${e.message}`);
        process.exit(1);   // 형식 오류 등은 이어가 봐야 같은 이유로 다 막힌다 — 멈추고 원인부터
      }
    }
  }
  console.log(`끝 — 모두 ${tok.scores.length}곡이 올라가 있습니다.`);

} else if (cmd === "update") {
  // 변환기를 고쳐 문서를 다시 뽑았을 때(레이아웃·형식 손질) 쓴다 — 게시 빈도 제한은
  // publish에만 있어 여기는 한달음에 끝난다. 그림도 _thumbs의 지금 것을 함께 싣는다.
  const tok = loadTokens();
  for (const s of tok.scores) {
    const doc = JSON.parse(readFileSync(join(SRC, s.file), "utf8"));
    const thPath = join(THUMBS, s.file.replace(/\.jgb\.json$/, ".txt"));
    const thumb = existsSync(thPath) ? readFileSync(thPath, "utf8").trim() : null;
    try {
      await rpc("update_score", { p_id: s.id, p_token: s.token, p_doc: doc, p_public: null, p_thumb: thumb });
      console.log(`갱신  ${s.id}  ${s.title}${thumb ? "" : "  (그림 없음)"}`);
    } catch (e) {
      console.error(`실패  ${s.id}  ${s.title}: ${e.message}`);
    }
  }

} else if (cmd === "visibility") {
  const to = process.argv[3];
  if (to !== "public" && to !== "unlisted") {
    console.error("쓰임: node tools/publish-edu-standard.mjs visibility public|unlisted");
    process.exit(1);
  }
  const tok = loadTokens();
  for (const s of tok.scores) {
    // update_score는 문서를 다시 받으므로 파일의 지금 내용을 그대로 싣는다
    const doc = JSON.parse(readFileSync(join(SRC, s.file), "utf8"));
    try {
      await rpc("update_score", { p_id: s.id, p_token: s.token, p_doc: doc, p_public: to === "public" });
      console.log(`${to === "public" ? "공개" : "비공개"}  ${s.id}  ${s.title}`);
    } catch (e) {
      console.error(`실패  ${s.id}  ${s.title}: ${e.message}`);
    }
  }

} else if (cmd === "delete") {
  if (process.argv[3] !== "--really") {
    console.error("정말 전부 지우려면 --really 를 붙이세요 (지운 게시물은 되살릴 수 없습니다).");
    process.exit(1);
  }
  const tok = loadTokens();
  const left = [];
  for (const s of tok.scores) {
    try {
      await rpc("delete_score", { p_id: s.id, p_token: s.token });
      console.log(`지움  ${s.id}  ${s.title}`);
    } catch (e) {
      console.error(`실패  ${s.id}  ${s.title}: ${e.message}`);
      left.push(s);
    }
  }
  tok.scores = left;
  saveTokens(tok);

} else {
  console.error("쓰임: node tools/publish-edu-standard.mjs publish | visibility public|unlisted | delete --really");
  process.exit(1);
}
