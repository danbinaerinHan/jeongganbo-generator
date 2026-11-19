// 곡마다 '한 줄 각 수'(gakPerRow)·제목 칸 폭(titleGakWidth) 후보를 편집기에 넣어 보고,
// 줄마다 각이 몇 개 놓이는지(화면용 각 번호 .gak-num의 자리)를 재어 가장 보기 좋은 값을 고른다.
//   node tools/edu-standard/probe.mjs <앱 사본> <.jgb.json 폴더> <결과 json>
// 고르는 잣대(앞이 먼저): 쪽 수가 적을 것 → 마지막 줄이 홀로 떨어지지 않을 것(가장 긴 줄의 절반 이상) →
// 줄마다 각 수가 고를 것 → 정간이 클 것.
import { spawn } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
const [,, MIRROR, SRC, OUT] = process.argv;
const PORT = 8766, DBG = 9334;
const http = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MIRROR, stdio: "ignore" });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${MIRROR}/../chrome-probe`, "--window-size=1500,2100", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp("Page.enable");
await cdp("Page.navigate", { url: `http://127.0.0.1:${PORT}/editor.html` }); await sleep(1500);
await ev(`localStorage.clear(); localStorage.setItem('jgb_welcome_v1','1'); localStorage.setItem('jgb_guide_seen_v1','1'); true`);
await cdp("Page.navigate", { url: `http://127.0.0.1:${PORT}/editor.html?r=1` }); await sleep(2500);
await ev(`(document.getElementById('ndCancel')||{click(){}}).click(); true`);
const result = {};
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".jgb.json")).sort()) {
  const doc = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  const tries = [];
  for (const tgw of ["auto", "1"]) for (let gpr = 3; gpr <= 12; gpr++) {
    const d = structuredClone(doc); d.controls.gakPerRow = String(gpr); d.controls.titleGakWidth = tgw;
    const m = await ev(`(async () => {
      await window.jgbDoc.adopt(${JSON.stringify(d)}, false);
      await new Promise(r => setTimeout(r, 60));
      const pages = [...document.querySelectorAll('#sheet .page svg')];
      const rows = []; let slot = [];
      pages.forEach((s, pi) => {
        const ns = [...s.querySelectorAll('.gak-num')].filter(t => /^\\d+$/.test(t.textContent.trim()))
          .map(t => ({ x: +t.getAttribute('x'), y: Math.round(+t.getAttribute('y')) }));
        const by = {}; ns.forEach(n => (by[pi + ':' + n.y] = by[pi + ':' + n.y] || []).push(n.x));
        Object.keys(by).sort((a,b)=>{const [pa,ya]=a.split(':').map(Number),[pb,yb]=b.split(':').map(Number);return pa-pb||ya-yb;})
          .forEach(k => { const xs = by[k].sort((a,b)=>a-b); rows.push(xs.length); for (let i=1;i<xs.length;i++) slot.push(xs[i]-xs[i-1]); });
      });
      slot.sort((a,b)=>a-b);
      return { pages: pages.length, rows, slot: slot.length ? slot[slot.length>>1] : 0 };
    })()`);
    tries.push({ gpr, tgw, ...m });
  }
  const ok = (t) => t.rows.length && t.rows.reduce((a, b) => a + b, 0) === +doc.controls.gakCount;
  const score = (t) => {
    const mx = Math.max(...t.rows), last = t.rows[t.rows.length - 1];
    const orphan = t.rows.length > 1 && last < Math.ceil(mx / 2) ? 1 : 0;
    const spread = mx - Math.min(...t.rows);
    return [t.pages, orphan, spread > 2 ? 1 : 0, -t.slot];
  };
  const good = tries.filter(ok).sort((a, b) => { const A = score(a), B = score(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; });
  const cur = tries.find((t) => String(t.gpr) === doc.controls.gakPerRow && t.tgw === "auto");
  result[f] = { best: good[0], cur };
  console.log(f, "| 지금", cur && cur.gpr, JSON.stringify(cur && cur.rows), cur && cur.pages + "쪽", "→ 고른 값", good[0] && `${good[0].gpr}/${good[0].tgw}`, JSON.stringify(good[0] && good[0].rows), good[0] && good[0].pages + "쪽", good[0] && good[0].slot.toFixed(1));
}
writeFileSync(OUT, JSON.stringify(result, null, 1));
ws.close(); chrome.kill(); http.kill(); process.exit(0);
