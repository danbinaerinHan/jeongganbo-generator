#!/usr/bin/env node
/* ============================================================================
   server/schema.sql — 빗장이 스스로와 어긋나지 않는가
   ============================================================================
   서버는 손으로 붙여넣어 돌리는 파일이라 오타가 나도 알려 주는 사람이 없다. 그중에서도
   **권한은 틀려도 조용하다** — 빠뜨린 revoke는 오류가 아니라 열린 문이다. 그래서 파일
   안에서 서로를 가리키는 세 곳이 같은 말을 하는지 여기서 대조한다:

     ① create or replace function …   무엇이 있나
     ② revoke / grant …               무엇을 열고 닫았나
     ③ 파일 끝의 '빗장 점검' 허용 목록  무엇이 열려 있어야 한다고 적어 두었나

   ③이 특히 중요하다. 그 쿼리는 실제 서버에서 구멍을 찾아 주는 물건인데, 허용 목록이
   낡으면 **구멍을 보고도 조용해진다**(허용된 줄 알고 넘긴다). 사람이 두 곳을 함께
   고치기를 바라는 대신 여기서 지켜본다.

   ★ 이 검사는 SQL을 실행하지 않는다 — 글자만 본다. 실제 권한은 schema.sql 끝의 점검
     쿼리를 SQL Editor에서 돌려 확인할 것(그쪽이 진짜 답이다).
   ============================================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "server/schema.sql"), "utf8");

let bad = 0;
const fail = (m) => { console.error("  ✗ " + m); bad++; };
const sec = (t) => console.log("\n" + t);

// 줄 주석은 걷고 본다(주석 속 예시가 진짜 구문으로 잡히지 않게). 파일 끝의 점검 쿼리는
// /* */ 안에 있으므로 따로 떼어 읽는다.
const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

const all = (re, s = code) => [...s.matchAll(re)].map((m) => m[1]);
const funcs = new Set(all(/create or replace function public\.(\w+)\s*\(/g));
const revoked = new Set(all(/revoke all on function public\.(\w+)\(/g));
const grantAnon = new Set(all(/grant execute on function public\.(\w+)\([^)]*\)\s*to anon/g));
const grantAuth = new Set(
  all(/grant execute on function public\.(\w+)\([^)]*\)\s*to (?:anon, )?authenticated/g));

sec("① 함수마다 revoke가 있는가");
// Supabase는 새 함수의 실행 권한을 anon·authenticated에게 **직접** 준다. 그러니 revoke를
// 빠뜨린 함수는 만들자마자 브라우저에 열린 것이다.
{
  const miss = [...funcs].filter((f) => !revoked.has(f));
  if (miss.length) fail(`revoke 없음 → 브라우저에 열림: ${miss.join(", ")}`);
  else console.log(`  ✓ 함수 ${funcs.size}개 전부 revoke됨`);
}

sec("② grant는 있는 함수에만 걸려 있는가");
{
  const ghost = [...new Set([...grantAnon, ...grantAuth])].filter((f) => !funcs.has(f));
  if (ghost.length) fail(`없는 함수에 grant: ${ghost.join(", ")}`);
  else console.log("  ✓ 유령 grant 없음");
}

sec("③ 앞머리가 열쇠를 말하는가");
// 이 스키마의 규칙: 앞머리 없음 = 토큰(anon도 부른다) · admin_* = 로그인+명단 ·
// owner_* = 로그인+임자. 뒤의 둘은 **anon에 열리면 안 된다.**
{
  for (const f of [...grantAnon].filter((f) => /^(admin|owner)_/.test(f)))
    fail(`${f} 이(가) anon에 열려 있다 — 로그인이 필요한 함수다`);
  const gated = [...funcs].filter((f) => /^(admin|owner)_/.test(f) && grantAuth.has(f));
  console.log(`  ✓ 로그인 전용 ${gated.length}개가 anon에는 닫혀 있음`);
}

sec("④ 로그인이 필요한 함수가 첫 줄에서 다시 묻는가");
// 권한을 여는 자리(grant)와 확인하는 자리(함수 첫 줄)가 떨어져 있으면 언젠가 한쪽만
// 고쳐진다 — 그래서 둘 다 있어야 한다.
{
  for (const f of [...funcs].filter((f) => /^(admin|owner)_/.test(f))) {
    const i = code.indexOf(`create or replace function public.${f}`);
    const a = code.indexOf("$$", i), b = code.indexOf("$$", a + 2);
    const body = code.slice(a, b);
    const want = f.startsWith("admin_") ? "require_admin()" : "require_login()";
    // admin_note는 관리자 함수들이 안에서만 쓰는 부품이라 밖에 안 열린다(그래서 면제).
    const exposed = grantAuth.has(f) || grantAnon.has(f);
    if (exposed && !body.includes(want)) fail(`${f} 이(가) ${want} 을(를) 안 부른다`);
  }
  if (!bad) console.log("  ✓ 열린 admin_*·owner_* 가 전부 다시 묻는다");
}

sec("⑤ 밖에 열린 함수가 search_path를 고정했는가");
{
  for (const f of [...funcs].filter((f) => grantAnon.has(f) || grantAuth.has(f))) {
    const i = code.indexOf(`create or replace function public.${f}`);
    const head = code.slice(i, code.indexOf("$$", i));
    if (/security definer/i.test(head) && !/set\s+search_path/i.test(head))
      fail(`${f} — SECURITY DEFINER인데 search_path를 안 고정했다`);
  }
  if (!bad) console.log("  ✓ 전부 고정됨");
}

sec("⑥ 파일 끝 '빗장 점검'의 허용 목록이 grant와 같은가");
// 이 검사가 이 파일의 핵심이다 — 허용 목록이 낡으면 점검 쿼리가 구멍을 보고도 조용해진다.
{
  const m = sql.match(/with allowed\(fn, who\) as \(values([\s\S]*?)\n\),/);
  if (!m) fail("허용 목록(with allowed …)을 못 찾았다");
  else {
    const listed = new Map();
    for (const [, fn, who] of m[1].matchAll(/\('(\w+)','(\w+)'\)/g)) listed.set(fn, who);
    const want = new Map();
    for (const f of grantAnon) want.set(f, "anon");
    for (const f of grantAuth) if (!want.has(f)) want.set(f, "authenticated");

    for (const [f, who] of want)
      if (!listed.has(f)) fail(`grant는 있는데 허용 목록에 없다: ${f} (${who})`);
      else if (listed.get(f) !== who)
        fail(`허용 목록의 누구에게가 다르다: ${f} — 목록 ${listed.get(f)} · grant ${who}`);
    for (const f of listed.keys())
      if (!want.has(f)) fail(`허용 목록에 있는데 grant가 없다: ${f}`);
    if (!bad) console.log(`  ✓ ${want.size}개가 양쪽에서 같다`);
  }
}

sec("⑦ 표는 전부 RLS를 켜고 권한을 걷었는가");
{
  const tables = new Set(all(/create table if not exists public\.(\w+)\s*\(/g));
  const rls = new Set(all(/alter table public\.(\w+)\s+enable row level security/g));
  const rev = new Set(all(/revoke all on table public\.(\w+)\s+from anon, authenticated/g));
  for (const t of tables) {
    if (!rls.has(t)) fail(`${t} — RLS를 안 켰다`);
    if (!rev.has(t)) fail(`${t} — anon/authenticated 권한을 안 걷었다`);
  }
  // 정책을 하나라도 두면 '정책 0개' 빗장이 풀린다 — 표를 직접 여는 길이 생긴 것이다.
  if (/create policy/i.test(code)) fail("create policy가 있다 — 표를 직접 여는 길이 생겼다");
  if (!bad) console.log(`  ✓ 표 ${tables.size}개, 정책 0개`);
}

console.log(bad ? `\n✗ ${bad}군데 어긋남` : "\n✓ 전부 통과");
process.exit(bad ? 1 : 0);
