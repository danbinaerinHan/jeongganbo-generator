// 국악원 OMR 데이터셋(.txt) → 우물사이 문서(.jgb.json)
//
//   node tools/import-ngc-omr.mjs <데이터셋 폴더> [출력 폴더] [--verify]
//
// 데이터셋은 Kim, Han, Jeong & Valero-Mas, "On the Automatic Recognition of Jeongganbo
// Music Notation" (ACM JOCCH 18(3), 2025)의 OMR로 국립국악원 간행 정악보를 읽어낸 것이고,
// 인코딩은 Han et al., "Six Dragons Fly Again" (TISMIR 9(1), 2026) §6의 JG-like encoding이다.
// 라이선스가 CC BY-NC-SA 4.0이니 변환물을 내보낼 때 출처와 조건을 함께 적을 것.
//
// ── 왜 변환이 되나
// 저쪽은 `:위치 율명 시김새 | …`, 이쪽은 `율명{시김새} … | …`인데 **밑에 깔린 모델이 같다**.
// 정간 하나를 행(세로 분박)으로 나누고 그 행을 다시 좌우 칸으로 나누는 2층 구조인데,
// 우물사이도 공백이 행을 가르고 한 행 안에서 글자가 붙어 있으면 그게 곧 좌우 칸이다
// (app.js groupRowTokens → rowDur/groups.length). 그래서 자리를 옮겨 적기만 하면 된다.
//
// ── 위치표는 어떻게 정했나
// 논문 Figure 6은 그림이라 글로 옮겨져 있지 않다. 그래서 데이터셋에 **짝으로 들어 있는
// MusicXML**(같은 곡의 오선보)에서 각 음의 실제 시각을 재어 위치 번호와 맞대어 확정했다.
// 위치마다 94~99%가 아래 표 하나로 설명된다(2026-08-13 실측, 5만 6천 정간).
// 즉 이 표는 논문을 읽고 옮겨 적은 것이 아니라 자료에서 되짚어 낸 것이다.
//
// ── 아직 못 담는 것
//  · 곡 안에서 각 길이가 바뀌는 곡(가곡·수제천·취타 등 45곡)도 그대로 들어온다 —
//    우물사이가 각별 정간 수(#gakBeats)를 갖게 되면서 담을 자리가 생겼다(2026-08-14).
//  · **지면 층**(장단·가사·대강·각 이름·빠르기)은 데이터셋에 아예 없다 — OMR이 정간 격자
//    안만 읽었기 때문이다(TISMIR §5.3.3). 사람이 채워야 한다.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

// ── 위치표 ────────────────────────────────────────────────────────────────
// 정간을 3행(또는 2행)으로 나누고, 각 행은 '통째'거나 '왼·오른' 두 칸이다.
// 번호는 3×3 / 2×3 격자로 놓이는데 가운데 열이 '행 통째'다:
//        1  2  3      ← 1행 (왼, 통째, 오른)          10·12·13 ← 1행
//        4  5  6      ← 2행                            11·14·15 ← 2행
//        7  8  9      ← 3행
// 0은 정간 전체를 한 음이 차지하는 것. 한 행이 통째로 비면 앞 음이 이어진다(→ 이음 '-').
const POS = { 0: [1, 0, "w"] };
for (let r = 0; r < 3; r++) {
  POS[3 * r + 1] = [3, r, "l"];
  POS[3 * r + 2] = [3, r, "w"];
  POS[3 * r + 3] = [3, r, "r"];
}
POS[10] = [2, 0, "w"]; POS[11] = [2, 1, "w"];
POS[12] = [2, 0, "l"]; POS[13] = [2, 0, "r"];
POS[14] = [2, 1, "l"]; POS[15] = [2, 1, "r"];

// ── 이름 맞추기 ───────────────────────────────────────────────────────────
// 기호 58종 중 53종은 이름이 그대로 우리 사전(js/symbols-registry.js)에 있다. 나머지만
// 여기서 갈아 끼운다. 하나하나 까닭이 있으니 지우지 말 것:
//  · 니나* / 니나 — 국악원 악보엔 '니나'로 읽히는 기호가 둘이다. 데이터셋은 홀로 칸을
//    차지하는 쪽에 별표를 달아 갈랐고, 우리 사전은 그림 파일 이름으로 갈라 두었다
//    (nina=붙임 / nina-dur=독립). 별표 있는 쪽이 우리 '니나'(독립), 없는 쪽이 '니라'(붙임)다
//    — 사전의 '니라' 주석이 말하는 그 이름 미정이 이 자료로 풀린 셈이다.
//  · 느니-르·니루-니 — 이름의 '-'는 본음 자리를 가리키는 표시라 우리 쪽은 붙여 쓴다.
//  · 반길이표/덧길이표 — OMR이 둘 중 어느 쪽인지 못 가린 자리다. 둘 다 적어 두고 사람이 고른다.
//  · 쉼표 — 우리 앱에선 괄호 없이 맨글자로 친다(app.js SYM_MARK).
const ALIAS = {
  "니나*": "{니나}", "니나": "{니라}",
  "느니-르": "{느니르}", "니루-니": "{니루니}",
  "반길이표/덧길이표": "{반길이표}{덧길이표}", "덧길이표/반길이표": "{덧길이표}{반길이표}",
  "쉼표": "쉼표"
};

// 기호 사전을 그대로 읽어 '앞 칸에 붙는 기호'를 가려낸다. 붙임(at.att)이 달린 기호는 앞에
// 칸이 하나라도 있으면 그 칸에 붙어 제 칸을 못 연다(app.js groupRowTokens) — 반칸 둘 중
// 오른쪽이 그런 기호면 우리 표기로는 두 칸이 한 칸으로 합쳐진다.
const REG = (() => {
  const g = {};
  new Function("window", readFileSync(new URL("../js/symbols-registry.js", import.meta.url), "utf8"))(g);
  return g.JGB_SYM;
})();
const GLUE = new Set(REG.list.filter((e) => e.at && e.at.att).map((e) => e.ko));
const glues = (t) => GLUE.has((ALIAS[t] || t).replace(/^\{|\}$/g, "").split("}{")[0]);

const NOTE_RE = /^(하하배|하배|중청|배|청)?[황대태협고중유임이남무응]$/;
const INSTRUMENT = { daegeum: "대금", piri: "피리", haegeum: "해금",
                     ajaeng: "아쟁", gayageum: "가야금", geomungo: "거문고" };

// 토큰 하나를 우물사이 표기로. 율명·이음(-)·쉼표는 맨글자, 나머지 기호는 {…}.
function token(t, isFirst) {
  if (t in ALIAS) return ALIAS[t];
  if (t === "-") return "-";
  if (isFirst && NOTE_RE.test(t)) return t;
  return NOTE_RE.test(t) ? t : "{" + t + "}";
}
const cellOf = (toks) => (toks && toks.length)
  ? toks.map((t, i) => token(t, i === 0)).join("")
  : "-";

// 정간 하나(':2 청황 미는표 :6 니') → 우물사이 정간('청황{미는표} -{니} -')
// want = 그 정간이 뜻하는 칸 나눔(정간을 720으로 잰 시각). 검증(--verify)이 이걸 기준으로
// app.js가 실제로 나눈 자리와 견준다 — 변환한 글을 다시 읽어 세면 제 답을 제가 맞다 하게 된다.
function convertCell(cell, warn) {
  const NONE = { text: "", want: [0] };   // 빈 정간도 한 칸(앞 음이 이어짐)
  const slots = [];
  for (const chunk of cell.split(/(?=:\d+)/)) {
    const t = chunk.trim().split(/\s+/).filter(Boolean);
    if (!t.length || !/^:\d+$/.test(t[0])) continue;
    slots.push([Number(t[0].slice(1)), t.slice(1).map((s) => s.normalize("NFC"))]);
  }
  if (!slots.length) return NONE;
  if (slots.some(([p]) => !(p in POS))) { warn("모르는 위치 번호"); return NONE; }
  const nrows = Math.max(...slots.map(([p]) => POS[p][0]));
  if (slots.some(([p]) => POS[p][0] !== nrows)) { warn("한 정간에 행 수가 섞임"); return NONE; }

  const grid = Array.from({ length: nrows }, () => ({ w: null, l: null, r: null, extra: [] }));
  for (const [p, toks] of slots) {
    const [, r, c] = POS[p];
    // '행 통째'와 '반칸'이 한 행에 함께 오면 어느 쪽도 못 믿는다(OMR 잡음, 전체의 0.2%).
    // 음을 버리진 않고 그 행의 칸으로 차례대로 밀어 넣는다 — 시각은 어긋나도 적힌 것은 남는다.
    if (grid[r][c]) grid[r].extra.push(toks);
    else grid[r][c] = toks;
  }
  const want = [];
  const text = grid.map((g, r) => {
    const hasHalf = g.l || g.r;
    if (g.w && hasHalf) warn("한 행에 통째+반칸");
    let s, cols;
    if (g.w && !hasHalf) { s = cellOf(g.w); cols = 1; }
    else if (hasHalf) {
      s = cellOf(g.l) + cellOf(g.r) + (g.w ? cellOf(g.w) : ""); cols = g.w ? 3 : 2;
      // 반칸 하나가 **붙임 기호만으로** 되어 있으면(예: 왼칸 이음 + 오른칸 루러표) 우리 표기로는
      // 앞 칸에 붙어 버려 칸이 하나로 합쳐진다 — 붙임표는 제 칸을 못 여는 기호라서다.
      // 소리는 그대로고(둘 다 소리가 없다) 그림도 거의 같지만, 칸 나눔은 한 칸 준다.
      if (g.r && glues(g.r[0])) { warn("붙임 기호가 반칸을 홀로 차지"); cols -= 1; }
    }
    else { s = "-"; cols = 1; }
    cols += g.extra.length;
    s += g.extra.map(cellOf).join("");
    for (let c = 0; c < cols; c++) want.push(Math.round(720 * (r / nrows + c / (cols * nrows))));
    return s;
  }).join(" ");
  return { text, want };
}

// 악기별 덩어리(빈 줄로 갈림) — 파일 이름 끝의 악기 차례와 같은 순서다
function blocksOf(text) {
  const out = []; let cur = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") { if (cur.length) { out.push(cur); cur = []; } }
    else cur.push(line);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── 각 길이 ──────────────────────────────────────────────────────────────
// 간행 악보엔 표준 각보다 짧은 줄이 섞여 있다 — 가곡은 곡이 각의 한가운데에서 시작해 한
// 바퀴 돌아 끝나 첫·끝 각이 짧고(5 + 16×14 + 11), 수제천·취타는 장이 바뀌는 자리에 짧은
// 각이 낀다. 우물사이가 **각별 정간 수**를 갖게 되면서(#gakBeats) 그 길이를 그대로 적는다 —
// 예전엔 빈 정간으로 메우거나 두 줄을 합쳐 억지로 길이를 맞췄는데, 그건 간행 악보가 실제로
// 그린 모습(짧은 각은 짧은 칸)과 달랐다. 지금은 읽은 대로 적는 것이 곧 맞는 것이다.
function gakLengths(rows) {
  const lens = rows.map((r) => r.length);
  const freq = new Map();
  for (const n of lens) freq.set(n, (freq.get(n) || 0) + 1);
  const beats = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];   // 가장 흔한 길이가 기본
  const ex = lens.map((n, i) => (n === beats ? null : (i + 1) + ":" + n)).filter(Boolean);
  return { beats, gakBeats: ex.join(", "), lens };
}

function convertPiece(path) {
  const stem = basename(path, ".txt");
  const cut = stem.indexOf("_daegeum");
  // macOS 파일 이름은 자모가 갈린 꼴(NFD)이라 그대로 두면 '계락'으로 찾아도 안 걸린다
  const title = (cut > 0 ? stem.slice(0, cut) : stem).trim().normalize("NFC");
  const insts = (cut > 0 ? stem.slice(cut + 1) : "").split("_").map((k) => INSTRUMENT[k] || "all");
  const blocks = blocksOf(readFileSync(path, "utf8")).map((b) => b.map((l) => l.split("|")));
  const warns = new Map();
  const warn = (why) => warns.set(why, (warns.get(why) || 0) + 1);

  // 악기끼리 각 구성은 늘 같다(69곡 전부 확인) — 그래도 한 벌씩 따로 재어 어긋나면 알린다.
  const each = blocks.map(gakLengths);
  const len = each[0];
  if (each.some((e) => e.gakBeats !== len.gakBeats || e.beats !== len.beats))
    warn("악기마다 각 구성이 다름");
  const mixed = new Set(len.lens).size > 1;

  const wants = [];   // [각][정간] = 그 정간이 뜻하는 칸 나눔(검증용)
  const parts = blocks.map((rows, i) => ({
    id: i + 1,
    name: insts[i] && insts[i] !== "all" ? insts[i] : "",
    abbr: "", instrument: insts[i] || "all", muted: false,
    // 각 = 한 줄, 정간 = '|'. 빈 정간이 이어질 때 '||'가 되면 옛 각-구분으로 읽히므로
    // 반드시 ' | ' 꼴로 벌려 잇는다(app.js parseMelodyOffsets).
    melody: rows.map((cells) => {
      const cs = cells.map((c) => convertCell(c, warn));
      wants.push(cs.map((c) => c.want));
      return cs.map((c) => c.text).join(" | ");
    }).join("\n"),
    lyrics: "", cellStyles: {}
  }));

  return { title, parts, wants, gakCount: blocks[0].length,
           beats: len.beats, gakBeats: len.gakBeats, mixed, lens: len.lens, warns };
}

// ── 보기별 레이아웃을 문서에 박는다 ──
// 앱의 규칙(app.js applyState): controls = '저장 당시 보기'의 레이아웃, viewLayouts = 다른
// 보기 것. 총보로 열리는 문서라 controls에 총보 레이아웃을 직접 싣고, 파트보 것은
// viewLayouts.part에 둔다. 안 실으면 총보가 세션 기본값(한 줄 10각)으로 그려져 4~6파트
// 곡이 가로 40~60열이 된다(정간 한 칸 2.7mm — 2026-08-14 실측, 사용자 제보).
// 한 줄 각 수는 열 16개쯤을 목표로 파트 수로 나눈다: 4파트→4각(16열), 5→3, 6→2.
// 정간 11mm × 16열 ≈ A4 세로 인쇄폭이라 칸 크기가 파트보(11mm)와 같은 급으로 나온다.
const LAYOUT_COMMON = {
  paperSize: "A4", orientation: "portrait", stackAuto: true, stackCount: "2",
  cellSize: "11", gakGap: "7", bandGap: "10", pageFill: "50",
};
const scoreLayoutFor = (nParts) =>
  ({ ...LAYOUT_COMMON, gakPerRow: String(Math.max(1, Math.floor(16 / Math.max(1, nParts)))) });
const PART_LAYOUT = { ...LAYOUT_COMMON, gakPerRow: "10" };

// 대강 — 앱의 대표 패턴(app.js DAEGANG_PRESET)과 같은 값을 문서에 **명시적으로** 싣는다
// (10정간 3·2·2·3, 12정간 3·3·3·3, 16정간 11·5, 20정간 6·4·4·6 — 2026-08-14 사용자 확정).
// 칸을 비워 두면 열 때 이전 문서의 대강이 남아 '합이 안 맞아 적용 안 함'이 되거나, 기본
// 각이 대강 없이 그려진다. 표에 없는 길이(4·6·8·18)는 빈 값 = 대강 없음. 각 길이가 섞인
// 곡의 다른 길이 각은 앱이 DAEGANG_PRESET에서 알아서 찾는다(daegangTextFor).
const DAEGANG = { 10: "3 2 2 3", 12: "3 3 3 3", 16: "11 5", 20: "6 4 4 6" };

function docOf(p) {
  const scoreView = p.parts.length > 1;
  const daegang = DAEGANG[p.beats] || "";
  return {
    v: 2,
    controls: {
      beats: String(p.beats), gakBeats: p.gakBeats, gakCount: String(p.gakCount),
      title: p.title, hwangPitch: "63",     // 데이터셋 오선보가 황=E♭(fifths -4)로 적혀 있다
      scoreView, daegang,
      wantJangdan: false, wantTempo: false,
      ...(scoreView ? scoreLayoutFor(p.parts.length) : PART_LAYOUT)
    },
    viewLayouts: scoreView ? { part: PART_LAYOUT, score: null } : { part: null, score: null },
    jangdan: "", parts: p.parts, activePart: 0,
    // 총 각 수를 우리가 못 박았으니 '사용자가 적은 것'으로 둔다 — 안 그러면 페이지 채움이
    // 이 값을 덮어 각 수가 종이에 맞춰 늘어난다(app.js gakUserSet).
    // daegangAuto를 대강과 같은 값으로 — '자동으로 채워진 값'이라는 표시라, 나중에 정간
    // 수를 바꾸면 프리셋이 따라 갈아끼워진다(다르면 '사용자가 적은 값'으로 굳는다).
    gakUserSet: true, daegangAuto: daegang,
    customTexts: [], gakNames: {}, gakNameOffs: {}
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
if (!args.length) {
  console.error("쓰임: node tools/import-ngc-omr.mjs <데이터셋 폴더> [출력 폴더] [--verify]");
  process.exit(1);
}
const SRC = args[0], OUT = args[1] || join(SRC, "_우물사이");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

let made = 0, skipped = 0;
const verify = [];
for (const f of readdirSync(SRC).filter((f) => f.endsWith(".txt")).sort()) {
  const p = convertPiece(join(SRC, f));
  const tag = `${p.title} (${p.parts.length}악기 ${p.gakCount}각 ${p.beats}정간)`;
  if (p.mixed) console.log(`  ↔ 각 길이 섞임  ${p.title} — 기본 ${p.beats}정간, 예외 ${p.gakBeats}`);
  writeFileSync(join(OUT, p.title + ".jgb.json"), JSON.stringify(docOf(p)), "utf8");
  for (const [why, n] of p.warns) console.log(`  ⚠ ${p.title}: ${why} ${n}곳`);
  if (flags.has("--verify")) p.parts.forEach((x, i) => verify.push({ melody: x.melody, want: p.wants.slice(i * (p.gakCount), (i + 1) * p.gakCount) }));
  console.log(`  만듦    ${tag}`);
  made++;
}
console.log(`\n${made}곡 변환${skipped ? `, ${skipped}곡 건너뜀` : ""} → ${OUT}`);

// ── 검증(--verify) ────────────────────────────────────────────────────────
// 변환한 글을 app.js의 realizeMelody에 그대로 먹여, 정간 안 시각이 원 자료가 뜻한 자리와
// 맞는지 본다. 검사 쪽에 같은 셈을 다시 적지 않는다 — 그러면 app.js를 고쳐도 옛 답을
// 계속 맞다 한다(tools/lib/app-sandbox.mjs 머리말).
if (flags.has("--verify")) {
  const { loadApp } = await import("./lib/app-sandbox.mjs");
  const app = await loadApp(
    ["const:SPECIAL_NOTES", "const:SYM_MARK", "const:ORN_BRACKET_CLOSE", "const:SCALE",
     "const:JO_PRESETS", "const:PRE2", "const:PRE2U", "const:PRE1U", "const:PRE1D",
     "matchSpecialNote", "tokenizeNotes", "parseMelodyOffsets", "groupRowTokens",
     "defBeats", "parseGakBeats", "gakBeatsMap", "beatsAt",
     "sigimsaeSoundOn", "stripSymBracket", "scaleNotes", "makeScale", "realizeMelody"],
    { beats: "12", gakBeats: "", tempoBpm: "60", hwangPitch: "63", joPreset: "all", playSigimsae: true },
    `let parts = [{ melody: "", muted: false }];
     let activePart = 0;
     function stashActivePart() { parts[0].melody = melodyFull; }`
  );
  const realize = app.fn("realizeMelody");
  let ok = 0, bad = 0;
  for (const { melody, want } of verify) {
    melody.split("\n").forEach((line, li) => {
      const cells = line.split("|");
      app.fields.beats = String(cells.length);   // 한 각씩 세우므로 그 각의 정간 수가 곧 기본값
      app.fields.gakBeats = "";
      const got = cells.map(() => []);
      for (const s of realize(63, line, {})) got[s.cell].push(Math.round((s.beat - s.cell) * 720));
      cells.forEach((c, i) => {
        const a = got[i].join(","), b = (want[li] && want[li][i] || []).join(",");
        if (a === b) ok++;
        else { bad++; if (bad <= 8) console.log(`   어긋남 ${JSON.stringify(c)} — app ${a} / 뜻 ${b}`); }
      });
    });
  }
  console.log(`검증: 정간 칸 나눔 일치 ${ok.toLocaleString()} / 불일치 ${bad.toLocaleString()} ` +
              `(${(100 * ok / Math.max(1, ok + bad)).toFixed(2)}%)`);
}
