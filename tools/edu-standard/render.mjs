// 헤드리스 크롬으로 편집기에 문서를 들여 악보 그림(PNG)을 뜬다 — 원본과 대조하는 데 쓰고,
// 공유마당 미리보기(js/cloud.js makeThumb과 같은 꼴: 첫 쪽, 폭 300px PNG data URI)도 함께 뜬다.
//   node tools/edu-standard/render.mjs <앱 사본 폴더> <.jgb.json 폴더> <출력 폴더> [곡 이름 일부…]
// 앱 사본은 editor.html·css/·js/를 복사하고 js/cloud-config.js를 빈 설정으로 바꾼 것(서버에 안 닿게).
import { spawn } from "child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
const [,, MIRROR, SRC, OUTDIR, ...only] = process.argv;
mkdirSync(OUTDIR, { recursive: true });
const PORT = 8765, DBG = 9333;
const http = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MIRROR, stdio: "ignore" });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${OUTDIR}/../chrome-prof`, "--window-size=1500,2100", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1500, height: 2100, deviceScaleFactor: 1, mobile: false });
const base = `http://127.0.0.1:${PORT}/editor.html`;
await cdp("Page.navigate", { url: base }); await sleep(2500);
const files = readdirSync(SRC).filter((f) => f.endsWith(".jgb.json") && (!only.length || only.some((o) => f.includes(o))));
for (const f of files) {
  const doc = readFileSync(join(SRC, f), "utf8");
  await ev(`localStorage.clear(); localStorage.setItem('jgb_state_v1', ${JSON.stringify(doc)}); localStorage.setItem('jgb_welcome_v1','1'); localStorage.setItem('jgb_guide_seen_v1','1'); true`);
  await cdp("Page.navigate", { url: base + "?r=" + Date.now() }); await sleep(2600);
  // 악보 SVG만 그림으로: 직렬화 → 이미지
  const png = await ev(`(async () => {
    const svgs = [...document.querySelectorAll('#sheetArea svg, #sheet svg')].filter(s => s.getBoundingClientRect().width > 300);
    const out = [];
    for (const s of svgs) {
      const c = s.cloneNode(true); try { window.jgbDoc.embedFonts && await window.jgbDoc.embedFonts(c); } catch(e){}
      c.querySelectorAll('.no-print').forEach(n => n.remove());
      const vb = (c.getAttribute('viewBox')||'').split(/\\s+/).map(Number);
      const W = 1240, H = Math.round(W * vb[3] / vb[2]);
      c.setAttribute('width', W); c.setAttribute('height', H);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,W,H); x.drawImage(img, 0, 0);
      out.push(cv.toDataURL('image/png'));
    }
    const bad = window.jgbDoc.badCount();
    // 공유마당 미리보기 — cloud.js makeThumb과 같은 규칙(첫 쪽, 폭 300, 흰 바탕, 190KB 넘으면 없음)
    let thumb = null;
    const first = document.querySelector('#sheet .page svg');
    if (first) {
      const c = first.cloneNode(true); c.querySelectorAll('.no-print').forEach(n => n.remove());
      try { window.jgbDoc.embedFonts && window.jgbDoc.embedFonts(c); } catch(e){}
      const vb = (first.getAttribute('viewBox')||'0 0 210 297').split(/\\s+/).map(Number);
      const xml = new XMLSerializer().serializeToString(c);
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); });
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = Math.round(300 * vb[3] / vb[2]);
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,cv.width,cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
      const uri = cv.toDataURL('image/png'); thumb = uri.length > 190000 ? null : uri;
    }
    return JSON.stringify({ out, bad, thumb });
  })()`);
  const r = JSON.parse(png || '{"out":[]}');
  mkdirSync(join(OUTDIR, "_thumbs"), { recursive: true });
  if (r.thumb) writeFileSync(join(OUTDIR, "_thumbs", f.replace(".jgb.json", ".txt")), r.thumb);
  r.out.forEach((d, i) => writeFileSync(join(OUTDIR, f.replace(".jgb.json", `-${i + 1}.png`)), Buffer.from(d.split(",")[1], "base64")));
  console.log(f, "pages", r.out.length, "bad", r.bad, r.thumb ? "thumb " + r.thumb.length : "no-thumb");
}
ws.close(); chrome.kill(); http.kill(); process.exit(0);
