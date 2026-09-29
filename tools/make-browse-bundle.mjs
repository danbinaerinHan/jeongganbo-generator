// .jgb.json 여러 개 → **로컬 모아보기 번들**(정적 페이지 한 장 + 악보 파일들)
//
//   node tools/make-browse-bundle.mjs <jgb 폴더> <출력 폴더> [번들 이름]
//
// 서버에 올리지 않고 손에서 확인하려고 만드는 자리다. 진짜 모아보기(browse.html)는 게시된
// 악보를 서버에서 받아 오는데, 여기 만드는 것은 **파일만으로 도는 같은 꼴의 목록**이다.
//
// ── 규칙 셋
//  ① 꼴은 browse.html의 것을 그대로 쓴다 — css/styles.css + css/browse.css를 상대경로로 싣고
//    카드 클래스(.sc-*)도 같다. 여기서 새 색·새 클래스를 만들지 말 것.
//  ② 문패(#brandBox)는 browse.html에서 **뜯어 온다** — 로고 마크업의 네 번째 사본을 만들지
//    않으려는 것이다(index.html → browse.html까지가 이미 두 벌).
//  ③ 악보는 카드를 누를 때 `<script>`로 불러 localStorage(jgb_state_v1)에 넣고 편집기로 간다.
//    fetch가 아니라 script인 것은 file://로 열어도 되게 하려는 것이다(CORS를 안 탄다) —
//    js/janggu-audio.js를 첫 재생 때 script로 붙이는 것과 같은 수법.
//
// ── 미리보기 그림
// 악보를 그리려면 브라우저가 있어야 하므로 여기(Node)서는 못 만든다. 대신 **페이지가 스스로
// 뜬다**: [미리보기 그림 만들기]를 누르면 숨은 iframe에 편집기를 띄우고 악보를 하나씩 들여
// (jgbDoc.adopt) 그려진 SVG를 캔버스로 옮겨 담는다. 결과는 localStorage에 두므로 다음부터는
// 바로 보인다. 진짜 모아보기가 게시할 때 만드는 그림(js/cloud.js makeThumb)과 같은 수법이고,
// 서버가 악보를 그릴 줄 몰라도 되는 까닭도 같다.
// 그림이 아직 없으면 진짜 모아보기가 그림 없는 게시물에 쓰는 '井' 칸이 나온다.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("쓰임: node tools/make-browse-bundle.mjs <jgb 폴더> <출력 폴더> [번들 이름]");
  process.exit(1);
}
const [SRC, OUT] = args;
const NAME = args[2] || "모아보기 (로컬)";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── 문패는 browse.html에서 뜯어 온다(사본을 하나 더 만들지 않으려고) ──
const browseHtml = readFileSync(join(ROOT, "browse.html"), "utf8");
const topStart = browseHtml.indexOf('<div class="sc-top">');
const topEnd = browseHtml.indexOf("</header>", topStart);
let topBlock = browseHtml.slice(topStart, browseHtml.indexOf("</div>\n\n<header", topStart) + 6);
// 상대경로를 한 단계 위로 — 번들이 하위 폴더에 놓이므로
topBlock = topBlock.replace(/href="index\.html"/g, 'href="../../index.html"');

// ── 악보 읽기 ──
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(join(OUT, "docs"), { recursive: true });

// 악보 id — 파일 이름에서 늘 같은 값이 나오게 뜬다. tools/serve-local-scores.py(로컬 게시
// 서버)·tools/publish-ngc-omr.mjs가 **같은 셈**을 쓰므로, 여기서 뜬 미리보기 그림을 그대로 얹을 수 있다.
// ★ NFC로 정규화하고 해시 — 맥 파일 시스템은 이름을 NFD로 돌려줘서, 정규화 없이 뜨면
//   세 도구의 열쇠가 서로 어긋난다(2026-08-14 실측: 그림 69장이 딴 이름으로 새로 생겼다).
const sid = (name) => createHash("sha1").update(name.normalize("NFC"), "utf8").digest("hex").slice(0, 8);
const files = readdirSync(SRC).filter((f) => f.endsWith(".jgb.json")).sort((a, b) => a.localeCompare(b, "ko"));
const items = files.map((f) => {
  const i = sid(f);
  const doc = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  const c = doc.controls || {};
  const parts = doc.parts || [];
  const gakN = parts[0] ? parts[0].melody.split("\n").length : 0;
  // 각 길이가 섞인 곡인지 — 확인용 번들이라 이게 한눈에 보여야 한다
  const ex = String(c.gakBeats || "").trim();
  writeFileSync(join(OUT, "docs", i + ".js"), "window.__jgbDoc=" + JSON.stringify(doc) + ";", "utf8");
  return {
    id: i,
    title: (c.title || basename(f, ".jgb.json")).normalize("NFC"),
    insts: parts.map((p) => p.instrument).filter((x) => x && x !== "all"),
    beats: Number(c.beats) || 0,
    gak: gakN,
    mixed: ex
  };
});

const cards = items.map((it) => `  ${JSON.stringify(it)}`).join(",\n");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(NAME)} · 우물사이 (로컬 확인용)</title>
<!-- 편집기·모아보기와 같은 스타일을 그대로 쓴다(색 변수를 한 곳에 두려는 것) -->
<link rel="stylesheet" href="../../css/styles.css">
<link rel="stylesheet" href="../../css/browse.css">
</head>
<body class="browse">

${topBlock}

<header class="sc-head">
  <h1>${esc(NAME)}</h1>
  <p class="sc-lead">국립국악원 간행 정악보를 OMR로 읽어 우물사이 문서로 옮긴 것입니다.
  <b>이 페이지는 손에서 확인하려고 만든 로컬 목록</b>이라 서버에 올라가 있지 않습니다.
  카드를 누르면 그 악보가 편집기에서 열립니다.</p>
  <p class="sc-lead" style="font-size:.86em;opacity:.75">자료 출처: Kim, Han, Jeong &amp; Valero-Mas,
  <i>On the Automatic Recognition of Jeongganbo Music Notation</i> (ACM JOCCH 18(3), 2025) ·
  <b>CC BY-NC-SA 4.0</b>. 인코딩은 Han et al., <i>Six Dragons Fly Again</i> (TISMIR 9(1), 2026).</p>

  <div class="sc-controls">
    <input type="search" id="scSearch" class="sc-search" placeholder="곡 이름으로 찾기" autocomplete="off">
    <div class="sc-sorts">
      <button type="button" class="sc-sort on" data-sort="name">이름순</button>
      <button type="button" class="sc-sort" data-sort="size">긴 곡순</button>
      <button type="button" class="sc-sort" data-sort="mixed">각 길이 섞인 곡</button>
    </div>
    <button type="button" id="scShoot" class="sc-sort">미리보기 그림 만들기</button>
    <span id="scCount" class="sc-count"></span>
  </div>
</header>

<div id="scGrid" class="sc-grid"></div>

<script>
(function () {
  "use strict";
  var ITEMS = [
${cards}
  ];
  var TKEY = "jgb_bundle_thumbs_v1";
  var thumbs = {};
  try { thumbs = JSON.parse(localStorage.getItem(TKEY) || "{}"); } catch (e) { thumbs = {}; }
  var grid = document.getElementById("scGrid");
  var count = document.getElementById("scCount");
  var sort = "name", q = "";

  // 카드를 누르면 그 악보를 localStorage에 넣고 편집기로 간다 — 편집기는 열릴 때 늘
  // jgb_state_v1을 되살리므로 앱을 한 줄도 안 고치고 열린다.
  function open(id) {
    var s = document.createElement("script");
    s.src = "docs/" + id + ".js?t=" + Date.now();
    s.onload = function () {
      try {
        localStorage.setItem("jgb_state_v1", JSON.stringify(window.__jgbDoc));
        localStorage.setItem("jgb_welcome_v1", "1");   // 환영 카드·새 문서 마법사를 막는다
        localStorage.setItem("jgb_guide_seen_v1", "1");
      } catch (e) { alert("악보를 넣지 못했습니다: " + e.message); return; }
      location.href = "../../index.html";
    };
    s.onerror = function () { alert("악보 파일을 못 읽었습니다 (docs/" + id + ".js)"); };
    document.head.appendChild(s);
  }

  function card(it) {
    var a = document.createElement("a");
    a.className = "sc-card";
    a.href = "#";
    a.addEventListener("click", function (e) { e.preventDefault(); open(it.id); });

    var th = document.createElement("div");
    th.className = "sc-thumb";
    if (thumbs[it.id]) {
      var img = document.createElement("img");
      img.src = thumbs[it.id]; img.alt = ""; img.loading = "lazy";
      th.appendChild(img);
    } else {
      th.classList.add("sc-thumb-none");
      th.textContent = "井";
    }
    a.appendChild(th);

    var body = document.createElement("div");
    body.className = "sc-body";
    var h = document.createElement("h3");
    h.className = "sc-title";
    h.textContent = it.title;
    body.appendChild(h);
    var meta = document.createElement("div");
    meta.className = "sc-meta";
    meta.textContent = it.gak + "각 · " + it.beats + "정간" + (it.insts.length ? " · " + it.insts.length + "악기" : "");
    body.appendChild(meta);
    var tags = document.createElement("div");
    tags.className = "sc-tags";
    it.insts.forEach(function (n) {
      var t = document.createElement("span"); t.className = "sc-tag"; t.textContent = n; tags.appendChild(t);
    });
    if (it.mixed) {
      var m = document.createElement("span");
      m.className = "sc-tag sc-tag-fork";
      m.textContent = "각 길이 섞임";
      m.title = "각별 정간 수: " + it.mixed;
      tags.appendChild(m);
    }
    body.appendChild(tags);
    a.appendChild(body);
    return a;
  }

  function draw() {
    var list = ITEMS.filter(function (it) { return !q || it.title.indexOf(q.normalize("NFC")) >= 0; });
    if (sort === "size") list = list.slice().sort(function (a, b) { return b.gak * b.beats - a.gak * a.beats; });
    else if (sort === "mixed") list = list.filter(function (it) { return it.mixed; });
    grid.innerHTML = "";
    list.forEach(function (it) { grid.appendChild(card(it)); });
    count.textContent = list.length + "곡";
  }

  // ── 미리보기 그림 뜨기 ──
  // 숨은 iframe에 편집기를 띄우고 악보를 하나씩 들인 뒤, 그려진 SVG를 캔버스로 옮겨 담는다.
  // adopt(doc, **false**)로 부르는 것이 요점 — hadWork를 false로 주면 '지금 작업을 덮을까요'를
  // 묻지 않는다(69번 물으면 못 쓴다). 편집기 쪽 코드는 한 줄도 안 고친다.
  function shoot(win, doc) {
    win.jgbDoc.adopt(doc, false);
    var svg = win.document.querySelector("#sheet .page svg");
    if (!svg) return Promise.resolve(null);
    var vb = (svg.getAttribute("viewBox") || "0 0 210 297").split(/\s+/).map(Number);
    var node = svg.cloneNode(true);
    [].forEach.call(node.querySelectorAll(".no-print"), function (n) { n.remove(); });
    var xml = new XMLSerializer().serializeToString(node);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = 300; c.height = Math.round(300 * (vb[3] || 297) / (vb[2] || 210));
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);   // 악보는 늘 흰 종이
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = function () { res(null); };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    });
  }
  function loadDoc(id) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "docs/" + id + ".js?t=" + Date.now();
      s.onload = function () { res(window.__jgbDoc); };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  var btn = document.getElementById("scShoot");
  btn.addEventListener("click", async function () {
    btn.disabled = true;
    var fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;left:-9999px;top:0;width:1200px;height:900px;border:0";
    fr.src = "../../index.html";
    document.body.appendChild(fr);
    try {
      await new Promise(function (res, rej) { fr.onload = res; fr.onerror = rej; });
      var win = fr.contentWindow;
      // 첫 방문 카드·새 문서 마법사가 떠 있으면 닫는다(그림에 안 나오게)
      var nd = win.document.getElementById("ndCancel"); if (nd) nd.click();
      var wc = win.document.getElementById("wcSkip"); if (wc) wc.click();
      if (!win.jgbDoc) throw new Error("편집기를 못 읽었습니다 — 로컬 서버로 여셨나요?");
      for (var i = 0; i < ITEMS.length; i++) {
        btn.textContent = "그림 뜨는 중… " + (i + 1) + "/" + ITEMS.length;
        var uri = await shoot(win, await loadDoc(ITEMS[i].id));
        thumbs[ITEMS[i].id] = uri;
        // 로컬 게시 서버(tools/serve-local-scores.py)가 떠 있으면 그림을 얹어 둔다 —
        // 그래야 진짜 모아보기(browse.html)에도 같은 그림이 나온다. 없으면 조용히 넘어간다.
        if (uri) try { await fetch("/_thumb/" + ITEMS[i].id, { method: "POST", body: uri }); } catch (e) {}
      }
      try { localStorage.setItem(TKEY, JSON.stringify(thumbs)); }
      catch (e) { alert("그림은 떴지만 저장은 못 했습니다(자리가 모자랍니다). 이번 화면에만 보입니다."); }
      btn.textContent = "미리보기 그림 다시 만들기";
    } catch (e) {
      alert("그림을 못 만들었습니다: " + e.message);
      btn.textContent = "미리보기 그림 만들기";
    }
    fr.remove(); btn.disabled = false; draw();
  });

  document.getElementById("scSearch").addEventListener("input", function (e) { q = e.target.value.trim(); draw(); });
  [].forEach.call(document.querySelectorAll(".sc-sort"), function (b) {
    b.addEventListener("click", function () {
      [].forEach.call(document.querySelectorAll(".sc-sort"), function (x) { x.classList.remove("on"); });
      b.classList.add("on"); sort = b.getAttribute("data-sort"); draw();
    });
  });
  // 편집기로 돌아가는 버튼 이름 — 하던 작업이 있으면 '돌아가기'(browse.js와 같은 규칙)
  var back = document.getElementById("scBack");
  if (back && localStorage.getItem("jgb_state_v1")) back.textContent = "← 편집기로 돌아가기";
  draw();
})();
</script>
</body>
</html>
`;
writeFileSync(join(OUT, "index.html"), html, "utf8");
console.log(`${items.length}곡 → ${join(OUT, "index.html")}`);
console.log("미리보기 그림은 페이지의 [미리보기 그림 만들기]가 뜬다(로컬 서버로 열 것 — file://은 iframe 접근이 막힌다)");
