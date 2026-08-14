// 국악원 OMR 변환본(.jgb.json)을 게시 서버에 올리고 관리한다.
//
//   node tools/publish-ngc-omr.mjs publish                 게시 (이미 올린 곡은 건너뜀 — 몇 번을 돌려도 안전)
//   node tools/publish-ngc-omr.mjs update                  문서·그림을 파일의 지금 내용으로 다시 올림(공개 설정은 그대로)
//   node tools/publish-ngc-omr.mjs visibility unlisted     전부 비공개(주소를 아는 사람만)로
//   node tools/publish-ngc-omr.mjs visibility public       전부 모아보기 목록으로 되올림
//   node tools/publish-ngc-omr.mjs delete --really         전부 삭제
//
// ── 무엇을 올리나
// 악보는 `국악원OMR데이터셋/_우물사이/*.jgb.json`(tools/import-ngc-omr.mjs가 변환한 것),
// 미리보기 그림은 `국악원OMR데이터셋/_thumbs/<sid>.txt`(번들 페이지의 [미리보기 그림 만들기]가
// 뜬 data URI). sid는 파일 이름의 sha1 앞 8자 — make-browse-bundle.mjs·serve-local-scores.py와
// **같은 셈**이라 거기서 뜬 그림이 여기 그대로 얹힌다.
//
// ── 지은이·이용 조건
// author는 아래 AUTHOR 한 값으로 통일한다 — 모아보기의 '국악원 정악보' **탭이 이 값으로
// 거른다**(list_scores의 p_author, js/browse.js의 NGC_AUTHOR와 글자까지 같아야 한다).
// 데이터셋이 CC BY-NC-SA 4.0이라 license도 'cc-by-nc-sa'로 못 박는다(다른 값을 주는 길 없음).
// 출처(논문 인용)는 게시물마다가 아니라 탭 머리(browse.html)에 한 번 적는다.
//
// ── 수정 열쇠(토큰)
// 서버가 게시할 때 딱 한 번 주는 토큰을 server/ngc-tokens.local.json 에 받아 둔다(커밋 금지,
// .gitignore 등록). visibility/delete가 이 파일을 읽어 일괄로 움직인다 — 이 파일을 잃으면
// 게시물을 고치거나 내릴 길이 없다(서버엔 해시만 남는다). 곡마다 성공 즉시 저장하므로
// 중간에 끊겨도 받은 토큰은 남는다.
//
// ── 게시 빈도 제한
// 서버는 시간당 20건(publish_rate_limit)을 넘으면 53400으로 막는다. 그 오류를 만나면
// 5분 기다렸다 이어서 올린다 — 69곡을 다 올리는 데 서너 시간이 걸릴 수 있다는 뜻이다.
// 급하면 Supabase SQL Editor에서 한도를 잠시 올렸다가(publish_rate_limit) 끝나고 되돌린다.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "국악원OMR데이터셋", "_우물사이");
const THUMBS = join(ROOT, "국악원OMR데이터셋", "_thumbs");
const TOKENS = join(ROOT, "server", "ngc-tokens.local.json");

// ★ js/browse.js의 NGC_AUTHOR와 글자까지 같아야 탭이 거른다
const AUTHOR = "국립국악원 (OMR)";
const LICENSE = "cc-by-nc-sa";

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

// ★ NFC로 정규화하고 해시 — 맥 파일 시스템은 이름을 NFD로 돌려주는데, _thumbs의 그림은
//   NFC 이름의 해시로 저장돼 있다(실측 2026-08-14: 69장 전부 NFC 쪽만 맞음).
const sid = (name) => createHash("sha1").update(name.normalize("NFC"), "utf8").digest("hex").slice(0, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadTokens() {
  if (!existsSync(TOKENS)) return { note: "국악원 OMR 게시물 수정 열쇠 — 커밋 금지(.gitignore). tools/publish-ngc-omr.mjs가 쓴다.", scores: [] };
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
  const todo = files.filter((f) => !done.has(f));
  console.log(`전체 ${files.length}곡 · 이미 올림 ${done.size}곡 · 이번에 ${todo.length}곡`);
  for (const f of todo) {
    const doc = JSON.parse(readFileSync(join(SRC, f), "utf8"));
    const thPath = join(THUMBS, sid(f) + ".txt");
    const thumb = existsSync(thPath) ? readFileSync(thPath, "utf8").trim() : null;
    for (;;) {
      try {
        const r = await rpc("publish_score", {
          p_doc: doc, p_author: AUTHOR, p_license: LICENSE, p_public: true, p_thumb: thumb,
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
    const thPath = join(THUMBS, sid(s.file) + ".txt");
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
    console.error("쓰임: node tools/publish-ngc-omr.mjs visibility public|unlisted");
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
  console.error("쓰임: node tools/publish-ngc-omr.mjs publish | visibility public|unlisted | delete --really");
  process.exit(1);
}
