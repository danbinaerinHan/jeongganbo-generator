// 앱에 흩어져 있는 **모든 안내 문구**를 한 문서로 모은다 → docs/도움말-문구.md
//
//   node tools/gen-help-doc.mjs
//
// 손으로 적은 목록이 아니라 실제 소스(index.html · js/tour-text.js · js/app.js)에서
// 그때그때 뽑아 쓴다 — 소스를 고치고 다시 돌리면 문서가 따라온다.
//
// **문서를 직접 고쳐도 된다.** 문구를 이 문서에서 다듬은 뒤 "이대로 적용해줘"라고 하면
// 소스에 옮기는 쓰임을 위해서다. 그 손댄 내용이 재생성으로 날아가지 않게, 맨 끝에 만들 때의
// 지문(해시)을 적어 두고 **문서가 손대진 상태면 덮어쓰지 않고 멈춘다**.
// 손댄 걸 버리고 새로 만들려면 --force.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

// ── HTML 조각 떼기 ──────────────────────────────────────────────────────────
// DOM 라이브러리 없이 쓰려고 최소한만: 여는 태그를 찾아 같은 이름의 태그 짝을 세며 끝을 찾는다.
function outerHtmlOf(src, attr, from) {
  const at = src.indexOf(attr, from || 0);
  if (at < 0) return null;
  return outerHtmlAt(src, src.lastIndexOf("<", at));
}
function outerHtmlAt(src, open) {
  if (open < 0) return null;
  const tag = (src.slice(open + 1).match(/^[a-zA-Z][\w-]*/) || [])[0];
  if (!tag) return null;
  // 자기 자신으로 닫는 태그(<input …>)는 여는 태그가 곧 전부
  const selfEnd = src.indexOf(">", open);
  if (/^(input|img|br|hr|meta|link)$/i.test(tag)) return src.slice(open, selfEnd + 1);
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return src.slice(open, m.index + m[0].length);
  }
  return null;
}
const byId = (id) => outerHtmlOf(html, `id="${id}"`);

// 태그를 걷어 사람이 읽는 글로. <br>·블록 끝은 줄바꿈, 나머지는 지운다.
function toText(frag) {
  if (!frag) return "";
  return frag
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|tr|section|h\d)>/gi, "\n")
    .replace(/<\/td>|<\/th>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
    .join("\n");
}
// 글 앞에 인용부호를 붙여 문서에서 '이건 앱 문구'임이 보이게
const quote = (t) => (t ? t.split("\n").map((l) => "> " + l).join("\n") : "> _(비어 있음)_");

// ── 둘러보기 ────────────────────────────────────────────────────────────────
const tourScope = {};
new Function("window", readFileSync(join(ROOT, "js/tour-text.js"), "utf8"))(tourScope);
const TT = tourScope.TOUR_TEXT || { chapters: [], finale: {}, steps: {} };

// 단계 차례는 app.js의 TOUR_STEPS가 정한다 — 문서도 그 차례로 보여야 실제와 맞는다.
const appSrc = readFileSync(join(ROOT, "js/app.js"), "utf8");
const stepOrder = [];
{
  const at = appSrc.indexOf("const TOUR_STEPS");
  const chunk = at >= 0 ? appSrc.slice(at, appSrc.indexOf("\n  ];", at)) : "";
  for (const m of chunk.matchAll(/\bid:\s*"([a-zA-Z]+)"/g)) stepOrder.push(m[1]);
}
const orderedSteps = stepOrder.filter((id) => TT.steps[id])
  .concat(Object.keys(TT.steps).filter((id) => !stepOrder.includes(id)));

// ── 팔레트 한 줄 안내(SYM_LANES.syntax) — app.js가 그려 넣는 문구 ───────────
const laneHints = [];
for (const m of appSrc.matchAll(/syntax:\s*\{\s*how:\s*"([^"]*)"\s*,\s*ex:\s*\[/g)) {
  // 보기 문자열엔 `황[미는표]`처럼 대괄호가 들어 있어 `[^\]]*`로는 일찍 끊긴다 —
  // 여는 대괄호부터 따옴표 짝만 세어 읽는다.
  const from = m.index + m[0].length;
  const end = appSrc.indexOf("]", from) < 0 ? from : (function () {
    let i = from, q = false;
    for (; i < appSrc.length; i++) {
      const c = appSrc[i];
      if (c === '"') q = !q;
      else if (c === "]" && !q) return i;
    }
    return from;
  })();
  const ex = [...appSrc.slice(from, end).matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  laneHints.push({ how: m[1], ex: ex.join(" · ") });
}

// ── 툴팁(data-tip)·호버 설명(title) ────────────────────────────────────────
// 어느 버튼의 것인지 알아보게 같은 태그 안의 id와 보이는 글자를 함께 뽑는다.
function collectAttr(attr) {
  const out = [];
  const re = new RegExp(`<[^>]*\\b${attr}="([^"]*)"[^>]*>`, "g");
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (/<(option|meta|link|input type="hidden")/i.test(tag)) continue;
    const id = (tag.match(/id="([^"]+)"/) || [])[1] || "";
    // 라벨은 **그 요소의 글자**에서 — 원시 HTML을 잘라 쓰면 아이콘 SVG 조각(<path d="M …)이
    // 그대로 표에 실린다. 요소를 통째로 떠서 태그를 걷은 뒤 첫 줄만 쓴다.
    const label = (toText(outerHtmlAt(html, m.index) || "").split("\n").find((l) => l.trim()) || "")
      .slice(0, 24);
    const text = m[1].replace(/&#10;|\n/g, " / ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ id, label, text });
  }
  // 같은 문구가 여러 번 나오면 한 줄로
  const seen = new Map();
  out.forEach((o) => { const k = o.id + "|" + o.text; if (!seen.has(k)) seen.set(k, o); });
  return [...seen.values()];
}
const mdCell = (s) => (s || "").replace(/\|/g, "\\|");

// ── 문서 조립 ───────────────────────────────────────────────────────────────
const L = [];
const push = (...xs) => L.push(...xs);

push("# 우물사이 — 앱에 나오는 모든 안내 문구", "");
push("사용자에게 보이는 설명·안내를 한자리에 모은 문서입니다. **문구를 다듬고 싶을 때 여기서 찾아**,");
push("각 절에 적힌 '고치는 곳'으로 가서 고치면 됩니다.", "");
push("> ✏️ **이 문서를 직접 고쳐도 됩니다.** 여기서 문구를 다듬은 뒤 \"이대로 적용해줘\"라고 하면");
push("> 소스에 옮겨 드립니다. 손댄 내용이 날아가지 않게, 생성기는 **문서가 손대진 상태면 멈춥니다**.", ">");
push("> 소스를 고친 쪽이 최신이라 문서를 새로 뽑고 싶을 때만 아래를 돌리세요.", ">");
push("> ```bash", "> node tools/gen-help-doc.mjs          # 손댄 문서가 있으면 멈춤", "> node tools/gen-help-doc.mjs --force  # 손댄 걸 버리고 새로", "> ```", "");
push(`_만든 시각 기준 소스: index.html · js/tour-text.js · js/app.js_`, "");
push("---", "");

push("## 1. 둘러보기 (투어)", "");
push("**고치는 곳: `js/tour-text.js`** — 이 파일만 고치면 됩니다(코드 몰라도 됨).");
push("단계 차례·하이라이트 위치·예시 그림은 `js/app.js`의 `TOUR_STEPS`가 정합니다.", "");
push("글 쓰는 꼴: `**항목 이름**: 내용` 한 줄씩 · 맺음은 \"~할 수 있습니다\" ·");
push("항목 이름엔 대상을 붙일 것(\"켜기\"❌ → \"장단 켜기\"⭕).", "");
push(`### 1.1 장 이름`, "");
push("> " + (TT.chapters || []).join(" · "), "");
push(`### 1.2 마치는 축하 카드`, "");
push(`- 이모지: ${TT.finale.emoji || ""} · 버튼: ${TT.finale.button || ""}`);
push(`- 제목: **${TT.finale.title || ""}**`, "");
push(quote(TT.finale.body || ""), "");
push(`### 1.3 단계 (${orderedSteps.length}개)`, "");
orderedSteps.forEach((id, i) => {
  const s = TT.steps[id];
  push(`#### ${i + 1}. ${s.title}  \`${id}\``, "");
  push(quote(s.body), "");
});
push("---", "");

push("## 2. 도움말 창 (상단바 ? 도움말)", "");
push("**고치는 곳: `index.html`의 `#helpModal`** — 탭마다 `<section class=\"help-pane\" data-help=\"…\">`.", "");
const helpTabs = [["basics", "정간보란?"], ["start", "시작하기"], ["input", "입력 방법"], ["keys", "단축키"]];
// data-help는 **탭 버튼에도** 붙어 있어 그냥 찾으면 버튼이 잡힌다(글자 한 줄뿐).
// 본문은 .help-panes 안에 있으므로 거기서부터 찾는다.
const panesAt = html.indexOf('class="help-panes"');
helpTabs.forEach(([key, name]) => {
  const frag = outerHtmlOf(html, `data-help="${key}"`, panesAt);
  push(`### ${name}  \`data-help="${key}"\``, "");
  push(quote(toText(frag)), "");
});
push("---", "");

push("## 3. 도구창 안의 ? 안내", "");
push("**고치는 곳: `index.html`** — 각 `id`의 `<div class=\"melody-guide\">`.", "");
const guides = [
  ["melodyGuide", "선율 입력 (율명/시김새 창)"],
  ["inputModeGuide", "입력 방식 (에디터 / 직접 입력)"],
  ["jangdanGuide", "장단 창"],
  ["lyricsGuide", "곁줄 창"],
  ["textGuide", "텍스트 창"],
  ["gakNameGuide", "빠르기/각/장 창"],
  ["shortcutsGuide", "단축키 안내"]
];
guides.forEach(([id, name]) => {
  push(`### ${name}  \`#${id}\``, "");
  push(quote(toText(byId(id))), "");
});
push("---", "");

push("## 4. 첫 방문 화면", "");
push("**고치는 곳: `index.html`의 `#welcomeModal` · `#newDocModal`**", "");
[["welcomeModal", "환영 카드"], ["newDocModal", "새 문서 만들기"]].forEach(([id, name]) => {
  push(`### ${name}  \`#${id}\``, "");
  push(quote(toText(byId(id))), "");
});
push("---", "");

push("## 5. 팔레트 위 한 줄 안내", "");
push("**고치는 곳: `js/app.js`의 `SYM_LANES[*].syntax`** — 줄(선율·곁줄·장단)마다 문구가 다릅니다.");
push("이 한 줄은 늘 떠 있어 짧아야 하므로 **개조식**(서술어 없이)으로 씁니다.", "");
laneHints.forEach((h, i) => push(`${i + 1}. \`${h.how}\`  — 보기: ${h.ex}`));
push("");
push("---", "");

const tips = collectAttr("data-tip");
push(`## 6. 버튼 툴팁 (${tips.length}개)`, "");
push("**고치는 곳: `index.html`의 `data-tip=\"…\"`** — 버튼 위에 마우스를 올리면 뜨는 말풍선입니다.", "");
push("| 버튼 | id | 문구 |", "|---|---|---|");
tips.forEach((t) => push(`| ${mdCell(t.label)} | \`${t.id}\` | ${mdCell(t.text)} |`));
push("");
push("---", "");

const titles = collectAttr("title");
push(`## 7. 호버 설명 (title, ${titles.length}개)`, "");
push("**고치는 곳: `index.html`의 `title=\"…\"`** — 브라우저가 띄우는 기본 설명입니다.", "");
push("| 요소 | id | 문구 |", "|---|---|---|");
titles.forEach((t) => push(`| ${mdCell(t.label)} | \`${t.id}\` | ${mdCell(t.text)} |`));
push("");

// ── 손댄 문서 지키기 ────────────────────────────────────────────────────────
// 맨 끝 지문 줄을 뺀 본문의 해시가 지문과 같으면 '만든 그대로'(손 안 댐), 다르면 손댄 것.
const STAMP = "<!-- gen-help-doc:";
// 끝의 빈 줄은 지문을 뜨기 전에 떨군다 — 읽을 때도 같은 손질을 하므로, 안 맞추면
// 손 안 댄 문서도 '고쳐졌다'로 잘못 걸린다.
const body = L.join("\n").replace(/\n+$/, "");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex").slice(0, 16);

mkdirSync(join(ROOT, "docs"), { recursive: true });
const out = join(ROOT, "docs/도움말-문구.md");
const force = process.argv.includes("--force");
if (!force && existsSync(out)) {
  const cur = readFileSync(out, "utf8");
  const at = cur.lastIndexOf(STAMP);
  const prevBody = at < 0 ? cur : cur.slice(0, at).replace(/\n+$/, "");
  const prevStamp = at < 0 ? null : (cur.slice(at).match(/gen-help-doc:\s*([0-9a-f]+)/) || [])[1];
  if (at < 0 || prevStamp !== sha(prevBody)) {
    console.error("✗ docs/도움말-문구.md 가 손으로 고쳐져 있습니다 — 덮어쓰지 않았습니다.");
    console.error("  · 고친 내용을 소스에 반영하려면: 그 문서를 보고 '이대로 적용해줘'라고 요청");
    console.error("  · 고친 걸 버리고 새로 만들려면:  node tools/gen-help-doc.mjs --force");
    process.exit(1);
  }
  if (prevBody === body) { console.log("변화 없음 — 그대로 둡니다."); process.exit(0); }
}
writeFileSync(out, body + "\n\n" + STAMP + " " + sha(body) + " -->\n", "utf8");
console.log("docs/도움말-문구.md 만듦" + (force ? " (--force)" : ""));
console.log(`  둘러보기 ${orderedSteps.length}단계 · 도움말 ${helpTabs.length}탭 · ? 안내 ${guides.length}개`);
console.log(`  팔레트 안내 ${laneHints.length}줄 · 툴팁 ${tips.length}개 · 호버 설명 ${titles.length}개`);
