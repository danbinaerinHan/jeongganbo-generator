#!/usr/bin/env python3
"""시김새 다듬기 신구대조표 생성기 → docs/시김새-다듬기-대조.html

  python3 tools/sigimsae-refine/build-compare.py      (리포 루트에서)

대상·추천안·설명은 rows.py, 후보 그림은 assets/symbol_svgs/_다듬기/{A,B,C}/.
그림은 데이터 URL로 박아 넣으므로 HTML 한 장만 열면 된다(파일 경로 무관).
페이지에서 고른 결과(JSON)를 복사해 apply.py에 넘기면 실제 기호 파일이 바뀐다.

후보를 다시 만드는 법(도구는 이 폴더):
  raster.py  — SVG를 크롬 헤드리스로 래스터화(원본 viewBox 기준 + 여백)
  smooth.py  — A안: 흐림+문턱(곡률 흐름)으로 잔물결을 걷고 potrace로 다시 딴다
               (도형 0.007×3, 붓 획·한자 0.004×2). B안 도형은 src/의 획 SVG를 같은 도구로
               흐림 없이(0) 따서 채움 패스로 바꾼다.
  glyphs.py  — C안: 정해체(TW-Kai-98_1.ttf, 리포에 없음 — gen-yul-fonts.py 머리말의 받는 곳)
  bold.py    — B안(한자): C안 글자를 획 굵기 0.088(잉크 긴 변 대비)로 굵힌다
"""
import base64, html, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SYM = os.path.join(ROOT, "assets", "symbol_svgs")
CAND = os.path.join(SYM, "_다듬기")
OUT = os.path.join(ROOT, "docs", "시김새-다듬기-대조.html")
ORIG_REV = "4fce109"  # 다듬기 전 마지막 커밋
sys.path.insert(0, HERE)
from rows import GROUPS  # noqa: E402

OPT_NAME = {"O": "원본 유지", "A": "A · 가장자리 다듬기", "B": "B · 새로 그리기", "C": "C · 정해체 원래 굵기"}
OPT_NAME_HANJA = {"B": "B · 정해체 굵기 맞춤"}


# 메모 단추 — '어떻게 말할지' 막힐 때 누르면 메모에 붙는다. (무리, [표현…])
CHIPS = [
    ("굵기", ["획을 더 굵게", "획을 더 가늘게", "굵기를 고르게"]),
    ("끝", ["획 끝을 둥글게", "획 끝을 뾰족하게", "붓끝처럼 가늘어지게"]),
    ("이음", ["맞닿은 데(허리)를 메우기", "사이를 띄우기"]),
    ("모양", ["원본 느낌 더 살리기", "더 반듯하게", "좌우 대칭으로", "기울기 줄이기", "곡선을 더 둥글게"]),
    ("크기", ["악보에서 더 크게", "악보에서 더 작게"]),
]
CHIPS_HTML = "".join(f'<span class="cg">{g}</span>' + "".join(
    f'<button type="button" class="chip">{html.escape(c)}</button>' for c in cs) for g, cs in CHIPS)


def durl(path):
    return "data:image/svg+xml;base64," + base64.b64encode(open(path, "rb").read()).decode()


def durl_orig(rel):
    """원본 = 다듬기 전 커밋(ORIG_REV)의 파일. 적용한 뒤에도 대조표의 '원본' 칸이 옛 그림을 보이게."""
    b = subprocess.run(["git", "show", f"{ORIG_REV}:assets/symbol_svgs/{rel}.svg"], cwd=ROOT,
                       capture_output=True, check=True).stdout
    return "data:image/svg+xml;base64," + base64.b64encode(b).decode()


def card(key, opt, src, ghost, rec, is_hanja, labels=None):
    label = (labels or {}).get(opt) or (OPT_NAME_HANJA.get(opt) if is_hanja else None) or OPT_NAME.get(opt, opt)
    tag = '<span class="rec">추천</span>' if opt == rec else ""
    gh = f'<img class="ghost" src="{ghost}" alt="">' if ghost else ""
    return f"""<label class="card{' is-rec' if opt == rec else ''}">
  <input type="radio" name="{html.escape(key)}" value="{opt}"{' checked' if opt == rec else ''}>
  <span class="cap">{label}{tag}</span>
  <span class="paper big">{gh}<img class="sym" src="{src}" alt=""></span>
  <span class="paper mini"><span class="yul">黃</span><img src="{src}" class="s1" alt=""><span class="yul">林</span><img src="{src}" class="s2" alt=""></span>
</label>"""


def main():
    rows_html, total = [], 0
    for gi, (gname, gdesc, rows) in enumerate(GROUPS):
        is_hanja = gname == "한자 기호"
        rows_html.append(f'<section class="grp"><h2><span class="num">{gi + 1:02d}</span>{html.escape(gname)}'
                         f'<span class="cnt">{len(rows)}</span></h2><p class="gdesc">{html.escape(gdesc)}</p>')
        for r in rows:
            total += 1
            t0 = r["targets"][0]
            orig = durl_orig(t0)
            cards = [card(r["stem"], "O", orig, None, r["rec"], is_hanja)]
            opts = sorted(d for d in os.listdir(CAND) if os.path.isdir(os.path.join(CAND, d)))  # A B B2 B3 B4 C
            for opt in opts:
                p = os.path.join(CAND, opt, r["stem"] + ".svg")
                if os.path.exists(p):
                    cards.append(card(r["stem"], opt, durl(p), orig, r["rec"], is_hanja, r.get("labels")))
            tg = " · ".join(t + ".svg" for t in r["targets"])
            rows_html.append(f"""<article class="row" data-key="{html.escape(r['stem'])}">
  <header><h3>{html.escape(r['ko'])}</h3><code>{html.escape(tg)}</code><span class="at">{html.escape(r['at'])}</span></header>
  <p class="note">{html.escape(r['note'])}</p>
  <div class="cards">{''.join(cards)}</div>
  <div class="memo"><textarea rows="1" placeholder="이 기호에 대한 메모 — 아래 표현을 눌러 넣거나 직접 적으십시오"></textarea>
  <div class="chips">{CHIPS_HTML}</div></div>
</article>""")
        rows_html.append("</section>")
    targets = {r["stem"]: r["targets"] for _, _, rows in GROUPS for r in rows}
    page = TEMPLATE.replace("%%ROWS%%", "\n".join(rows_html)).replace("%%TOTAL%%", str(total)) \
        .replace("%%TARGETS%%", json.dumps(targets, ensure_ascii=False))
    open(OUT, "w", encoding="utf-8").write(page)
    print(f"{total}개 → {os.path.relpath(OUT, ROOT)} ({len(page) // 1024}KB)")


TEMPLATE = r"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시김새 다듬기 대조</title>
<style>
:root{--bg:#f4f4f2;--panel:#fff;--soft:#faf8f3;--line:#e2ddd2;--ink:#2b2a27;--muted:#7a756b;--accent:#8a5a2b;--accent-soft:#f3e8da;--paper:#fff;--ghost-f:invert(27%) sepia(95%) saturate(5000%) hue-rotate(350deg);--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1d1c1a;--panel:#262522;--soft:#2c2b28;--line:#3a3833;--ink:#ebe7df;--muted:#a39d91;--accent:#d9a36a;--accent-soft:#3b3025}}
:root[data-theme="dark"]{--bg:#1d1c1a;--panel:#262522;--soft:#2c2b28;--line:#3a3833;--ink:#ebe7df;--muted:#a39d91;--accent:#d9a36a;--accent-soft:#3b3025}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 140px}
h1{font-size:22px;margin:0 0 6px}
.lead{color:var(--muted);margin:0 0 18px;max-width:780px}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 8px;font-size:13px}
.legend b{font-family:var(--mono);color:var(--accent);margin-right:4px}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:13px}
.bar label{display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.bar .sp{flex:1}
.bar button,.out button{font:inherit;font-size:13px;padding:5px 12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:6px;cursor:pointer}
.bar button:hover,.out button:hover{border-color:var(--accent)}
.grp h2{display:flex;align-items:baseline;gap:10px;font-size:17px;margin:34px 0 4px}
.grp h2 .num{font-family:var(--mono);font-size:12px;letter-spacing:.14em;color:var(--accent)}
.grp h2 .cnt{font-family:var(--mono);font-size:12px;color:var(--muted)}
.gdesc{color:var(--muted);margin:0 0 12px;max-width:820px;font-size:13px}
.row{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.row header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.row h3{margin:0;font-size:16px}
.row code{font-family:var(--mono);font-size:12px;color:var(--muted)}
.row .at{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 6px}
.note{margin:4px 0 10px;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:8px;padding:8px;cursor:pointer;position:relative;background:var(--soft)}
.card input{position:absolute;opacity:0;pointer-events:none}
.card:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft) inset;background:var(--accent-soft)}
.card:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
.cap{font-size:12px;display:flex;align-items:center;gap:6px}
.cap::before{content:"";width:12px;height:12px;border-radius:50%;border:1.5px solid var(--muted);flex:none}
.card:has(input:checked) .cap::before{border-color:var(--accent);background:radial-gradient(var(--accent) 45%,transparent 50%)}
.rec{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 4px;margin-left:auto}
.paper{background:var(--paper);border-radius:4px;display:flex;align-items:center;justify-content:center;position:relative}
.big{height:170px}
.big img{max-width:80%;max-height:140px;position:absolute;inset:0;margin:auto}
.big .ghost{display:none;filter:var(--ghost-f);opacity:.45}
body.ghost-on .big .ghost{display:block}
body.ghost-on .big:has(.ghost) .sym{opacity:.8}
.mini{height:46px;gap:2px;color:#111}
.mini .yul{font:26px/1 "Kaiti SC","STKaiti","KaiTi","BiauKai","GungSeo","Batang",serif}
.mini img.s1{height:22px;max-width:30px;margin:0 8px 0 2px;object-fit:contain}
.mini img.s2{height:14px;max-width:20px;margin-left:2px;object-fit:contain}
.memo{margin-top:10px}
.memo textarea{width:100%;min-height:34px;resize:vertical;font:inherit;font-size:13px;background:var(--soft);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
.memo textarea:focus{outline:none;border-color:var(--accent)}
.row.has-memo .memo textarea{border-color:var(--accent);background:var(--panel)}
.chips{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin-top:6px;font-size:12px}
.chips{opacity:.5;transition:opacity .15s}
.row:hover .chips,.row:focus-within .chips{opacity:1}
.chips .cg{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--muted);margin-left:6px}
.chips .cg:first-child{margin-left:0}
.chip{font:inherit;font-size:12px;padding:1px 8px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);cursor:pointer}
.chip:hover{border-color:var(--accent);color:var(--accent)}
.out{position:fixed;left:0;right:0;bottom:0;background:var(--panel);border-top:1px solid var(--line);padding:10px 16px;z-index:6}
.out .in{max-width:1180px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.out .sum{font-size:13px;flex:1;min-width:220px}
.out .sum b{color:var(--accent)}
.out textarea{width:100%;height:60px;font:12px var(--mono);background:var(--soft);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px;display:none}
.out.open textarea{display:block}
@media (max-width:600px){.cards{grid-template-columns:repeat(2,1fr)}.big{height:120px}.big img{max-height:100px}}
</style></head>
<body>
<div class="wrap">
<h1>시김새 다듬기 대조</h1>
<p class="lead">원본 그림에서 따 온 시김새 SVG 중 테두리가 거칠거나 굵기가 고르지 않은 %%TOTAL%%개를 골라 후보를 만들었습니다.
칸을 눌러 쓸 안을 고르십시오. 추천안이 미리 골라져 있습니다. 칸 아래 작은 줄은 율명 옆에 실제 크기 가까이 놓아 본 모습입니다.<br>더 손볼 곳이 있으면 기호마다 메모를 남기십시오. [결과 복사]에 고른 안과 메모가 함께 담깁니다.</p>
<div class="legend"><span><b>A</b>가장자리 다듬기 — 모양은 그대로, 잔물결만 걷음</span><span><b>B</b>새로 그리기(도형) · 정해체 굵기 맞춤(한자)</span><span><b>C</b>정해체 원래 굵기(한자)</span></div>
<div class="bar">
  <label><input type="checkbox" id="ghost"> 원본 겹쳐 보기(빨강 = 원본)</label>
  <span class="sp"></span>
  <button type="button" data-all="rec">모두 추천안</button>
  <button type="button" data-all="O">모두 원본</button>
  <button type="button" id="theme" aria-label="밝게/어둡게">◐</button>
</div>
%%ROWS%%
</div>
<div class="out" id="out"><div class="in">
  <div class="sum" id="sum"></div>
  <button type="button" id="show">결과 보기</button>
  <button type="button" id="copy">결과 복사</button>
  <textarea id="json" readonly></textarea>
</div></div>
<script>
(function(){
  const TARGETS = %%TARGETS%%;
  const KEY = "jgb_sigimsae_refine_v1";
  const rows = [...document.querySelectorAll(".row")];
  const recOf = r => (r.querySelector(".card.is-rec input") || r.querySelector("input")).value;
  const MKEY = "jgb_sigimsae_refine_memo_v1";
  const ta = r => r.querySelector(".memo textarea");
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    rows.forEach(r => { const v = saved[r.dataset.key]; const i = v && r.querySelector(`input[value="${v}"]`); if (i) i.checked = true; });
    const memos = JSON.parse(localStorage.getItem(MKEY) || "{}");
    rows.forEach(r => { if (memos[r.dataset.key]) ta(r).value = memos[r.dataset.key]; });
  } catch (e) {}
  const grow = el => { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };
  function pick(){ const o = {}; rows.forEach(r => { o[r.dataset.key] = r.querySelector("input:checked").value; }); return o; }
  function update(){
    const p = pick(); const n = {O:0,A:0,B:0,C:0}; Object.values(p).forEach(v => n[v[0]]++);
    const ch = Object.keys(p).length - n.O;
    document.getElementById("sum").innerHTML = `바꿀 기호 <b>${ch}</b> / ${rows.length} · A ${n.A} · B ${n.B} · C ${n.C} · 원본 ${n.O}`;
    const memos = {}; rows.forEach(r => { const m = ta(r).value.trim(); r.classList.toggle("has-memo", !!m); if (m) memos[r.dataset.key] = m; });
    const out = {}; Object.entries(p).forEach(([k,v]) => { if (v !== "O" || memos[k]) out[k] = {opt: v, targets: TARGETS[k]}; if (memos[k]) out[k].memo = memos[k]; });
    const nm = Object.keys(memos).length;
    if (nm) document.getElementById("sum").innerHTML += ` · 메모 <b>${nm}</b>`;
    try { localStorage.setItem(MKEY, JSON.stringify(memos)); } catch (e) {}
    document.getElementById("json").value = JSON.stringify(out);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  }
  document.addEventListener("change", e => { if (e.target.matches(".card input")) update(); });
  document.addEventListener("input", e => { if (e.target.matches(".memo textarea")) { grow(e.target); update(); } });
  document.addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const t = ta(c.closest(".row")), w = c.textContent;
    t.value = t.value.trim() ? t.value.replace(/\s+$/, "") + (/[.,·]$/.test(t.value.trim()) ? " " : ", ") + w : w;
    grow(t); t.focus(); update();
  });
  rows.forEach(r => { if (ta(r).value) grow(ta(r)); });
  document.querySelectorAll("[data-all]").forEach(b => b.onclick = () => {
    rows.forEach(r => { const v = b.dataset.all === "rec" ? recOf(r) : "O"; r.querySelector(`input[value="${v}"]`).checked = true; }); update(); });
  document.getElementById("ghost").onchange = e => document.body.classList.toggle("ghost-on", e.target.checked);
  document.getElementById("show").onclick = () => document.getElementById("out").classList.toggle("open");
  document.getElementById("copy").onclick = async () => {
    const t = document.getElementById("json"); document.getElementById("out").classList.add("open");
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand("copy"); }
    document.getElementById("copy").textContent = "복사됨"; setTimeout(() => document.getElementById("copy").textContent = "결과 복사", 1400);
  };
  document.getElementById("theme").onclick = () => {
    const d = document.documentElement, dark = d.dataset.theme ? d.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    d.dataset.theme = dark ? "light" : "dark";
  };
  update();
})();
</script>
</body></html>
"""

if __name__ == "__main__":
    main()
