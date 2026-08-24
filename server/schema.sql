-- ============================================================================
-- 우물사이(umulsai.com) — 악보 게시 서버 스키마 · 1단계(계정 없는 익명 게시)
-- ============================================================================
-- 적용: Supabase 대시보드 › SQL Editor에 이 파일을 통째로 붙여넣고 실행.
--       몇 번을 다시 실행해도 같은 상태가 되게 짰다(테이블은 if not exists,
--       함수는 create or replace) — 스키마를 고칠 땐 이 파일을 고쳐 다시 돌린다.
--
-- 설계의 뼈대 셋. 이걸 흔들면 나머지가 다 무너지니 고치기 전에 먼저 읽을 것.
--
--  ① 서버는 악보를 모른다. 정간·시김새·기호를 그리는 일은 전부 브라우저가 하고,
--     서버가 아는 것은 `{ 제목, 지은이, JSON 한 덩어리 }`뿐이다. 그래서 이 파일에
--     정간보에 관한 지식이 한 줄도 없고, 앱이 문서 형식을 바꿔도 서버는 안 고친다.
--
--  ② 테이블에 직접 손대는 길은 없다. anon/authenticated의 테이블 권한을 회수하고
--     RLS를 켜 둔 채 정책을 하나도 두지 않는다(빗장 둘). 모든 길은 아래 RPC 넷뿐이라
--     크기 제한·게시 빈도 제한·권한 확인을 한 곳에서 강제할 수 있다.
--     ★ 수정 토큰의 해시가 같은 테이블에 있어서이기도 하다 — select를 한 번이라도
--       열면 남의 게시물을 고칠 열쇠가 함께 새어 나간다.
--
--  ③ 수정 권한은 문서가 아니라 브라우저에 있다. 게시할 때 돌려주는 토큰은 게시한
--     사람의 localStorage에만 남고, 서버에는 sha256 해시만 저장한다. 문서(.jgb.json·
--     공유 링크)에는 게시물 id만 실린다 — 파일을 남에게 주어도 수정 권한은 안 넘어간다.
--
--  ④ (2단계에서 더함) 판(版)은 쌓이고 지워지지 않는다. 게시·갱신할 때마다 그때의 문서를
--     score_versions에 한 줄로 뜬다. 운영자가 표기를 교정하더라도 **최초 게시본(v1)은
--     끝까지 남는다** — 약관 제5조의 교정 조항이 약속하는 '이전 판 보존'의 실물이 이것이다.
--
--  ⑤ (2단계에서 더함) 게시자의 뜻과 운영자의 처분은 다른 칸에 적는다. visibility는 올린
--     사람이 고른 것(공개/주소만)이고, hidden_at은 운영자가 내린 것이다. 한 칸에 섞으면
--     숨김을 풀 때 원래 공개 설정이 무엇이었는지 잃는다.
--
-- 클라이언트(js/cloud.js)는 supabase-js 없이 fetch로 부른다(무의존 원칙):
--   POST https://<프로젝트>.supabase.co/rest/v1/rpc/publish_score
--   헤더: apikey: <anon 키> · Content-Type: application/json
--   anon 키는 공개 키다. 정적 파일에 박혀 있어도 정상 — 진짜 빗장은 위 ②·③이다.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- 게시된 악보
-- ---------------------------------------------------------------------------
create table if not exists public.scores (
  id          text primary key,                 -- 주소에 실리는 짧은 id (아래 gen_score_id)
  doc         jsonb not null,                   -- 앱의 collectState() 결과 그대로
  doc_v       smallint not null default 1,      -- 문서 형식 판 번호(doc->>'v') — 나중 이사에 쓴다
  title       text not null default '제목 없음', -- doc 안 제목을 뽑아 둔 것(목록·검색용 사본)
  author      text not null default '',         -- 스스로 적는 이름. 계정이 없으므로 확인하지 않는다
  license     text not null default 'none',
  visibility  text not null default 'unlisted',
  token_hash  text not null,                    -- sha256(수정 토큰). 원본 토큰은 서버에 없다
  fork_of     text references public.scores(id) on delete set null,
  thumb       text,                             -- 미리보기 그림(data URI) — 아래 설명
  thumb_path  text,                             -- 그림을 Storage로 옮길 때 쓸 자리(지금은 안 씀)
  view_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint scores_license_ok    check (license in ('none','cc-by','cc-by-nc','cc-by-sa','cc-by-nc-sa','cc0')),
  -- private은 로그인 단계용으로 미리 받아 둔다. 지금 게시는 public(둘러보기에 오름) 또는
  -- unlisted(주소를 아는 사람만) 둘 중 하나다.
  constraint scores_visibility_ok check (visibility in ('private','unlisted','public')),
  constraint scores_author_len    check (char_length(author) <= 60)
);

-- 이미 만들어 둔 표에 뒤늦게 붙이는 칸(처음 설치면 위에서 이미 생겼다)
alter table public.scores add column if not exists thumb text;

-- 뒤늦게 넓힌 이용 조건 — 국립국악원 OMR 데이터셋(CC BY-NC-SA 4.0)을 들이며 추가(2026-08-14).
-- 이미 있는 표의 제약은 create table if not exists로는 안 바뀌므로 떨궈서 다시 건다.
-- (아래 publish_score의 v_lic 검사에도 같은 목록이 있다 — 값을 늘릴 땐 두 곳을 함께.)
alter table public.scores drop constraint if exists scores_license_ok;
alter table public.scores add constraint scores_license_ok
  check (license in ('none','cc-by','cc-by-nc','cc-by-sa','cc-by-nc-sa','cc0'));

-- 2단계(관리자 층)에서 더한 칸들. 옛 표에도 붙게 add column if not exists로 적는다.
--  ver         — 지금 몇 번째 판인가. score_versions의 마지막 번호와 늘 같다.
--  hidden_*    — 운영자가 내린 것. visibility(게시자의 뜻)와 **일부러 다른 칸**이다(머리말 ⑤).
--                hidden_reason은 공개 사유(약관 제6조 ④의 중단 내역에 그대로 실린다),
--                hidden_note는 운영자만 보는 메모.
--  lint_*      — 문법 검사 결과(잘못된 글자 수)와 그것을 잰 때. 서버는 악보를 모르므로
--                (머리말 ①) 검사는 tools/scan-published.mjs가 하고 여기엔 결과만 적힌다.
alter table public.scores add column if not exists ver           integer not null default 1;
alter table public.scores add column if not exists hidden_at     timestamptz;
alter table public.scores add column if not exists hidden_reason text;
alter table public.scores add column if not exists hidden_note   text;
alter table public.scores add column if not exists lint_bad      smallint;
alter table public.scores add column if not exists lint_at       timestamptz;

-- 둘러보기가 쓰는 차례. 부분 인덱스라 공개분만 담아 가볍다.
create index if not exists scores_public_recent_idx
  on public.scores (created_at desc) where visibility = 'public';
create index if not exists scores_public_views_idx
  on public.scores (view_count desc, created_at desc) where visibility = 'public';
create index if not exists scores_fork_of_idx on public.scores (fork_of);
-- 관리자 목록이 '내려간 것만' 추릴 때 쓴다(내려간 악보는 늘 소수라 부분 인덱스가 알맞다).
create index if not exists scores_hidden_idx
  on public.scores (hidden_at desc) where hidden_at is not null;


-- ---------------------------------------------------------------------------
-- 판(版) — score_versions
-- ---------------------------------------------------------------------------
-- 게시·갱신할 때마다 그때의 문서를 통째로 한 줄 뜬다. 지금 판까지 포함해 담으므로
-- scores.doc과 마지막 판의 doc은 늘 같다 — 겹쳐 보여도 그렇게 둔 까닭이 있다:
--   · 읽기 경로(fetch_score)를 한 줄도 안 고쳐도 된다(살아 있는 사본은 scores에 그대로).
--   · '지금 것'과 '지난 것'을 다른 표에서 꺼내면 그 둘이 어긋날 길이 생긴다.
--
-- thumb은 담지 않는다 — 그림 하나가 200KB까지라 판마다 담으면 표가 그림으로 채워진다.
-- 미리보기는 '지금 어떤 악보인가'를 보여주는 것이라 지난 판의 것이 따로 필요하지도 않다.
--
-- 게시자가 악보를 지우면 판도 함께 사라진다(on delete cascade). 내린 것을 그림자로 남겨
-- 두면 지운 뜻이 없어서다 — 운영자의 처분 기록은 판이 아니라 admin_log에 남는다.
create table if not exists public.score_versions (
  score_id   text        not null references public.scores(id) on delete cascade,
  ver        integer     not null,
  doc        jsonb       not null,
  title      text        not null default '제목 없음',
  by_kind    text        not null default 'user',   -- 누가 만든 판인가: 게시자 | 운영자
  editor     uuid,                                  -- 운영자면 그 계정. 게시자는 계정이 없어 null
  note       text,                                  -- 운영자가 남기는 '무엇을 왜 고쳤나'
  created_at timestamptz not null default now(),

  primary key (score_id, ver),
  constraint score_versions_by_ok check (by_kind in ('user','admin'))
);

-- 한 악보에 남겨 두는 판 수. 넘으면 오래된 것부터 지우되 **v1은 절대 안 지운다**
-- (push_version 참고) — 최초 게시본은 게시자의 것이고 신고 처리의 증거이기도 하다.
create or replace function public.version_keep() returns integer
  language sql immutable as $$ select 20 $$;


-- ---------------------------------------------------------------------------
-- 게시 빈도 기록 (남용 방지)
-- ---------------------------------------------------------------------------
-- anon 키는 공개되어 있으니 누구나 게시를 부를 수 있다. 계정이 없어 사람을 셀 수는
-- 없고 남는 실마리는 IP뿐인데, **IP 자체는 저장하지 않는다** — 소금을 섞어 해시로만
-- 남기므로 같은 IP인지는 알아도 그 IP가 무엇인지는 알 수 없다. 하루 지난 기록은
-- 게시할 때마다 함께 지운다(따로 청소 작업을 걸지 않아도 되게).
create table if not exists public.publish_log (
  ip_hash text        not null,
  at      timestamptz not null default now()
);
create index if not exists publish_log_ip_at_idx on public.publish_log (ip_hash, at desc);

-- 시간당 이 수를 넘겨 게시하면 막는다. 사람이 손으로 올리는 속도와는 거리가 멀되,
-- 한 교실에서 여럿이 같은 공유기로 올리는 상황(같은 IP)은 걸리지 않을 만큼 넉넉히.
create or replace function public.publish_rate_limit() returns integer
  language sql immutable as $$ select 20 $$;


-- ---------------------------------------------------------------------------
-- 관리자
-- ---------------------------------------------------------------------------
-- 빗장은 **둘**이다: ① Supabase Auth로 로그인했는가 ② 그 계정이 아래 명단에 있는가.
-- 대시보드에서 신규 가입을 꺼 두더라도 명단을 함께 두는 까닭은, 가입이 어쩌다 열리거나
-- 누가 실수로 계정을 하나 더 만들어도 그것만으로는 아무것도 못 하게 하려는 것이다.
-- (설계 뼈대 ②와 같은 마음 — 빗장 하나는 언젠가 풀린다고 보고 짠다.)
--
-- auth.users를 참조(FK)하지 않는다. 이 파일을 대시보드에 붙여넣어 몇 번이고 다시 돌리는
-- 것이 설치 방법인데, auth 스키마에 손을 뻗으면 그 재실행이 환경을 탄다. 계정을 지우면
-- 이 줄은 남지만, 남은 uid로는 로그인할 수 없으니 열쇠가 되지는 않는다.
create table if not exists public.admins (
  uid      uuid primary key,
  name     text        not null default '',
  added_at timestamptz not null default now()
);

-- 지금 부른 사람이 관리자인가. 관리자용 RPC는 모두 첫 줄에서 이것을 묻는다.
-- ★ 이 함수 자체는 브라우저에 열지 않는다 — '나는 관리자인가'를 밖에서 물을 일이 없고,
--   여는 순간 명단의 존재 여부를 떠보는 창구가 된다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$ select exists (select 1 from public.admins a where a.uid = auth.uid()) $$;


-- 운영자가 한 일의 기록. 숨김·교정·삭제의 근거가 되고, 약관 제6조 ④의 중단 내역을
-- 적을 때 무엇을 언제 왜 내렸는지 여기서 꺼내 본다.
-- ★ score_id에 외래키를 걸지 않는다 — 게시물을 **지운 기록**이야말로 남아야 하는데,
--   외래키가 있으면 그 행이 사라질 때 기록도 함께 끌려간다.
create table if not exists public.admin_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  uid      uuid,
  action   text not null,                          -- save | hide | unhide | restore | delete
  score_id text,
  detail   jsonb not null default '{}'::jsonb      -- 사유·제목·지은이 등 그때의 사정
);
create index if not exists admin_log_at_idx    on public.admin_log (at desc);
create index if not exists admin_log_score_idx on public.admin_log (score_id, at desc);


-- ---------------------------------------------------------------------------
-- 짧은 id 만들기
-- ---------------------------------------------------------------------------
-- 주소에 실리는 값이라 눈으로 읽고 손으로 옮겨 적을 수 있어야 한다: 0/o, 1/l/i처럼
-- 헷갈리는 글자를 뺀 31자 알파벳. 8자면 31^8 ≈ 8,500억 가지.
-- ★ random()이 아니라 gen_random_bytes를 쓰는 까닭: 링크를 아는 사람만 보는 게시물
--   (unlisted)이라 id를 순서대로 찍어 남의 악보를 훑을 수 있으면 안 된다.
create or replace function public.gen_score_id(p_len integer default 8)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  n        constant integer := 31;
  bytes    bytea;
  out_id   text := '';
  i        integer;
begin
  bytes := gen_random_bytes(p_len);
  for i in 0..p_len - 1 loop
    out_id := out_id || substr(alphabet, 1 + (get_byte(bytes, i) % n), 1);
  end loop;
  return out_id;
end $$;


-- 토큰 → 저장 꼴(해시). 게시할 때와 확인할 때가 반드시 같은 셈을 써야 하므로 한 곳에 둔다.
create or replace function public.hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;


-- 부른 쪽 IP의 해시. 프록시를 거쳐 오므로 x-forwarded-for의 **첫 번째** 값이 원 주소다.
-- 소금은 이 함수 안에만 있다 — 표에 남는 값만으로는 IP를 되돌릴 수 없다.
create or replace function public.caller_ip_hash()
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  raw text;
begin
  begin
    raw := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    raw := '';   -- 헤더가 없는 경로(대시보드에서 직접 호출 등)에서도 터지지 않게
  end;
  return encode(digest('umulsai-publish-v1|' || btrim(raw), 'sha256'), 'hex');
end $$;


-- ---------------------------------------------------------------------------
-- 문서 검사 — 게시와 갱신이 같은 잣대를 쓰도록 한 곳에 모은다
-- ---------------------------------------------------------------------------
-- 1MB: 우락 전곡이 압축 전 수십 KB 남짓이라 한참 넉넉하다. 이 문턱은 '악보가 아닌 것'을
-- 거르는 빗장이지 큰 곡을 막는 선이 아니다 — 진짜 곡이 걸리면 올려도 된다.
create or replace function public.check_doc(p_doc jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception '악보 문서가 아닙니다.' using errcode = '22023';
  end if;
  if p_doc -> 'controls' is null then
    raise exception '악보 문서가 아닙니다(controls 없음).' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > 1000000 then
    raise exception '악보가 너무 큽니다(1MB 넘음).' using errcode = '22023';
  end if;
end $$;


-- 미리보기 그림 검사. 그림은 브라우저가 악보 첫 장을 작게 그려 만든 **data URI**를 그대로
-- 받는다 — Storage 버킷·업로드 정책을 들이지 않으려는 선택이고, 이 앱이 원래 기호·소리를
-- 전부 data URI로 다루는 것과도 결이 같다. 대신 표가 무거워지므로 크기를 조인다.
-- 쌓이는 양이 부담스러워지면 Storage로 옮기고 thumb_path를 쓰면 된다(칸을 비워 뒀다).
create or replace function public.check_thumb(p_thumb text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_thumb is null or p_thumb = '' then return; end if;
  if p_thumb !~ '^data:image/(png|jpeg|webp);base64,' then
    raise exception '미리보기 그림 형식이 아닙니다.' using errcode = '22023';
  end if;
  if octet_length(p_thumb) > 200000 then
    raise exception '미리보기 그림이 너무 큽니다.' using errcode = '22023';
  end if;
end $$;


-- doc 안 제목을 뽑아 목록용 사본으로 쓴다. 클라이언트가 따로 보내지 않는 까닭은
-- 악보에 보이는 제목과 목록에 뜨는 제목이 어긋날 길을 아예 없애려는 것.
create or replace function public.title_of(p_doc jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select left(coalesce(nullif(btrim(p_doc -> 'controls' ->> 'title'), ''), '제목 없음'), 200)
$$;


-- ---------------------------------------------------------------------------
-- 판 뜨기 — push_version
-- ---------------------------------------------------------------------------
-- **scores에 이미 적힌 지금 판을 그대로 한 줄 뜬다.** 문서를 인자로 받지 않는 것이 요점이다 —
-- 부르는 쪽이 무엇을 썼든 판에 담기는 것은 표에 실제로 남은 그것이라, 살아 있는 사본과
-- 판의 내용이 어긋날 길이 없다. 그래서 이 함수는 늘 **쓴 다음에** 부른다.
--
-- 같은 번호가 두 번 들어올 걱정은 없다: 부르는 쪽이 먼저 scores의 그 행을 고쳐 잠갔으므로
-- 뒤엣것은 앞엣것이 끝날 때까지 기다린다. on conflict는 그래도 두는 빗장일 뿐이다.
create or replace function public.push_version(
  p_id     text,
  p_by     text default 'user',
  p_editor uuid default null,
  p_note   text default null
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.scores%rowtype;
begin
  select * into s from public.scores where id = p_id;
  if not found then return null; end if;

  insert into public.score_versions (score_id, ver, doc, title, by_kind, editor, note)
  values (s.id, s.ver, s.doc, s.title,
          case when p_by = 'admin' then 'admin' else 'user' end,
          p_editor, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (score_id, ver) do nothing;

  -- 오래된 판을 걷는다. v1은 남긴다 — 최초 게시본이라 지울 것이 아니다.
  -- 번호가 연달아 붙으므로(1,2,3…) 이 셈만으로 '최근 K개 + v1'이 남는다.
  delete from public.score_versions v
   where v.score_id = s.id
     and v.ver > 1
     and v.ver <= s.ver - public.version_keep();

  return s.ver;
end $$;


-- ---------------------------------------------------------------------------
-- ① 게시 — publish_score
-- ---------------------------------------------------------------------------
-- 돌려주는 token은 **이때 딱 한 번** 나온다. 서버엔 해시만 남으므로 잃어버리면
-- 되찾을 길이 없고(익명이라 본인 확인을 할 수단이 없다), 그 게시물은 운영자가
-- 지워주는 수밖에 없다 — 클라이언트가 그 사실을 사용자에게 알려야 한다.
-- 인자가 늘어난 판으로 갈아끼운다. create or replace는 인자가 다르면 '다른 함수'를 하나 더
-- 만들 뿐이라(오버로드) 옛 판이 남는다 — 먼저 떨어뜨려야 PostgREST가 헷갈리지 않는다.
drop function if exists public.publish_score(jsonb, text, text, text);
drop function if exists public.update_score(text, text, jsonb);
-- 문법 검사 결과(p_lint)를 함께 받는 판으로 갈아끼운다(2026-08-24).
-- ★ 여기 적는 것은 **떨어뜨릴 옛 서명**이다(새 서명이 아니다) — create or replace는 인자가
--   다르면 '다른 함수'를 하나 더 만들 뿐이라, 옛 것을 안 지우면 오버로드로 남아 PostgREST가
--   어느 쪽을 부를지 헷갈린다.
drop function if exists public.publish_score(jsonb, text, text, text, boolean, text);
drop function if exists public.update_score(text, text, jsonb, boolean, text);
drop function if exists public.admin_save_score(text, jsonb, text);

create or replace function public.publish_score(
  p_doc     jsonb,
  p_author  text default '',
  p_license text default 'none',
  p_fork_of text default null,
  p_public  boolean default true,   -- 둘러보기에 올릴 것인가 (아니면 주소를 아는 사람만)
  p_thumb   text default null,
  -- 올리는 브라우저가 재 온 문법 오류 수. **서버는 악보를 못 읽으므로**(설계 뼈대 ①) 재는
  -- 일은 거기서 하고 여기엔 숫자만 온다 — 게시 창이 어차피 그 값을 띄우고 있어서 공짜다.
  -- ★ 믿을 수 있는 값은 아니다(마음먹으면 0을 보낸다). 운영자가 볼 힌트지 빗장이 아니고,
  --   tools/scan-published.mjs가 언제든 덮어쓴다. 안 보내면(null) 안 적는다.
  p_lint    integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip     text := public.caller_ip_hash();
  v_recent integer;
  v_id     text;
  v_token  text;
  v_author text := left(btrim(coalesce(p_author, '')), 60);
  v_lic    text := coalesce(nullif(btrim(p_license), ''), 'none');
  v_try    integer;
begin
  perform public.check_doc(p_doc);
  perform public.check_thumb(p_thumb);

  if v_lic not in ('none','cc-by','cc-by-nc','cc-by-sa','cc-by-nc-sa','cc0') then
    raise exception '알 수 없는 이용 조건입니다.' using errcode = '22023';
  end if;

  -- 하루 지난 기록은 여기서 함께 치운다(따로 청소 작업을 걸지 않으려고)
  delete from public.publish_log where at < now() - interval '1 day';

  select count(*) into v_recent
    from public.publish_log
   where ip_hash = v_ip and at > now() - interval '1 hour';
  if v_recent >= public.publish_rate_limit() then
    raise exception '한 시간에 올릴 수 있는 악보 수를 넘었습니다. 잠시 뒤 다시 시도해 주세요.'
      using errcode = '53400';
  end if;

  -- 겹치면 다시 뽑는다. 8자 31알파벳이라 실제로는 거의 첫 번에 끝난다.
  for v_try in 1..5 loop
    v_id := public.gen_score_id(8);
    exit when not exists (select 1 from public.scores where id = v_id);
    v_id := null;
  end loop;
  if v_id is null then
    raise exception '주소를 만들지 못했습니다. 다시 시도해 주세요.' using errcode = '53400';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.scores (id, doc, doc_v, title, author, license, visibility, token_hash, fork_of, thumb,
                             lint_bad, lint_at)
  values (
    v_id, p_doc,
    coalesce(nullif(p_doc ->> 'v', '')::smallint, 1),
    public.title_of(p_doc), v_author, v_lic,
    case when coalesce(p_public, true) then 'public' else 'unlisted' end,
    public.hash_token(v_token),
    -- 원본이 실제로 있을 때만 계보로 남긴다(남의 파일에 실려 온 낯선 id는 조용히 버림)
    (select s.id from public.scores s where s.id = p_fork_of),
    nullif(p_thumb, ''),
    case when p_lint is null then null else greatest(p_lint, 0) end,
    case when p_lint is null then null else now() end
  );

  insert into public.publish_log (ip_hash) values (v_ip);

  -- 첫 판(v1). 이 줄은 뒤에 무슨 일이 있어도 안 지워진다(push_version의 프루닝 참고) —
  -- 운영자가 표기를 교정하더라도 게시자가 처음 올린 악보는 그대로 남아야 한다.
  perform public.push_version(v_id, 'user', null::uuid, null);

  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;


-- ---------------------------------------------------------------------------
-- ② 갱신 — update_score
-- ---------------------------------------------------------------------------
-- 없는 id와 틀린 토큰을 **같은 말로** 되돌려준다. 다르게 답하면 id만 바꿔가며
-- '이 주소에 게시물이 있는지'를 훑을 수 있어서다(unlisted의 뜻이 없어진다).
create or replace function public.update_score(
  p_id     text,
  p_token  text,
  p_doc    jsonb,
  p_public boolean default null,   -- null = 지금 공개 설정을 그대로 둔다
  p_thumb  text default null,      -- null = 지금 미리보기를 그대로 둔다
  p_lint   integer default null    -- null = 지금 문법 검사 결과를 그대로 둔다(위 publish_score 참고)
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_updated timestamptz;
  v_ver     integer;
begin
  perform public.check_doc(p_doc);
  perform public.check_thumb(p_thumb);

  -- 판을 올린다(v+1). 게시자가 자기 악보를 덮어써도 지난 판이 남으므로 되살릴 수 있고,
  -- 운영자 교정과 게시자 갱신이 **한 줄기 번호**로 이어져 무엇이 언제 것인지 헷갈리지 않는다.
  --
  -- ★ hidden_at은 건드리지 않는다 — 내려간 악보를 게시자가 고쳐서 도로 올릴 수는 없다.
  --   visibility(게시자의 뜻)를 아무리 바꿔도 운영자의 처분은 그대로다(머리말 ⑤).
  update public.scores
     set doc        = p_doc,
         doc_v      = coalesce(nullif(p_doc ->> 'v', '')::smallint, 1),
         title      = public.title_of(p_doc),
         thumb      = coalesce(nullif(p_thumb, ''), thumb),
         visibility = case when p_public is null then visibility
                           when p_public then 'public' else 'unlisted' end,
         -- 내용이 그대로면 판을 안 올린다. 클라이언트는 공개 설정만 바꿀 때도 문서를
         -- 통째로 보내므로, 그냥 올리면 '공개 ↔ 주소만'을 오갈 때마다 같은 악보가 판으로
         -- 쌓인다. jsonb 비교는 키 차례를 안 따지므로 뜻이 같으면 같다고 본다.
         ver        = case when doc is distinct from p_doc then ver + 1 else ver end,
         lint_bad   = case when p_lint is null then lint_bad else greatest(p_lint, 0) end,
         lint_at    = case when p_lint is null then lint_at  else now() end,
         updated_at = now()
   where id = p_id
     and token_hash = public.hash_token(p_token)
  returning ver, updated_at into v_ver, v_updated;

  if v_updated is null then
    raise exception '이 악보를 고칠 권한이 없습니다.' using errcode = '42501';
  end if;

  perform public.push_version(p_id, 'user', null::uuid, null);

  return jsonb_build_object('id', p_id, 'ver', v_ver, 'updated_at', v_updated);
end $$;


-- ---------------------------------------------------------------------------
-- ③ 삭제 — delete_score
-- ---------------------------------------------------------------------------
create or replace function public.delete_score(p_id text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hit integer;
begin
  delete from public.scores
   where id = p_id and token_hash = public.hash_token(p_token);
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception '이 악보를 지울 권한이 없습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------------
-- ④ 열기 — fetch_score
-- ---------------------------------------------------------------------------
-- token_hash는 절대 내보내지 않는다(그래서 select *를 쓰지 않고 칸을 하나씩 적는다).
-- 조회수를 올리므로 volatile이고, PostgREST에서 POST로 불린다.
create or replace function public.fetch_score(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s     public.scores%rowtype;
  v_msg text;
begin
  select * into s from public.scores where id = p_id;
  if not found or s.visibility = 'private' then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 운영자가 내린 악보. 없는 것과 **다르게** 답하는데, 이건 설계 뼈대 ②(없는 id와 틀린
  -- 토큰을 같은 말로 답한다)의 예외가 아니라 그 밖의 일이다: 이 주소는 이미 나눠 준 것이라
  -- 새로 새어 나갈 것이 없고, 약관 제6조 ④가 '왜 내려갔는지 확인할 수 있는 자리'를
  -- 약속하고 있어 오히려 알려 주어야 한다.
  if s.hidden_at is not null then
    v_msg := '게시가 중단된 악보입니다.';
    if coalesce(btrim(s.hidden_reason), '') <> '' then
      v_msg := v_msg || ' 사유: ' || s.hidden_reason;
    end if;
    raise exception '%', v_msg using errcode = '42501';
  end if;

  update public.scores set view_count = view_count + 1 where id = p_id;

  return jsonb_build_object(
    'id',         s.id,
    'doc',        s.doc,
    'title',      s.title,
    'ver',        s.ver,
    -- 마지막 판이 **운영자가 고친 것**이면 그 사실을 함께 알린다(없으면 null).
    -- 약관 제5조 제6항이 게시자에게 '교정 기록의 열람과 원상회복을 요구할 권리'를 주는데,
    -- 고쳐진 줄을 모르면 쓸 수 없는 권리다 — 제 악보를 여는 순간 보이게 하는 것이 가장 빠르다.
    -- 게시자가 그 뒤에 스스로 갱신했으면(마지막 판이 게시자 것) 굳이 알리지 않는다.
    'admin_edit', (select case when v.by_kind = 'admin'
                          then jsonb_build_object('ver', v.ver, 'note', v.note, 'at', v.created_at)
                          end
                     from public.score_versions v
                    where v.score_id = s.id
                    order by v.ver desc limit 1),
    'author',     s.author,
    'license',    s.license,
    'visibility', s.visibility,
    'fork_of',    s.fork_of,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'view_count', s.view_count + 1
  );
end $$;


-- ---------------------------------------------------------------------------
-- ⑤ 둘러보기 목록 — list_scores
-- ---------------------------------------------------------------------------
-- 공개(public)로 올린 것만 내보낸다. **doc은 빼고** 목록에 필요한 것만 담는다 —
-- 악보 본문까지 실으면 한 페이지가 수 MB가 되고, 목록에서는 쓰지도 않는다.
-- 정렬은 최신순/인기순 둘뿐이고 인덱스도 그 둘에 맞춰 두 개만 뒀다.
-- p_author/p_author_not — 모아보기 **탭**이 쓰는 지은이 필터(정확 일치). 국악원 OMR 데이터셋
-- 69곡을 '국악원 정악보' 탭으로 가르고, '올라온 악보' 탭에서는 그 69곡을 뺀다(2026-08-14).
-- 서버는 '국악원'이라는 이름을 모른다 — 무슨 지은이로 가를지는 클라이언트(js/browse.js)가 정한다.
-- 인자가 늘어난 판으로 갈아끼운다(옛 4인자 판을 먼저 떨궈야 PostgREST가 안 헷갈린다).
drop function if exists public.list_scores(text, text, integer, integer);

create or replace function public.list_scores(
  p_sort       text default 'recent',   -- recent | popular
  p_q          text default '',
  p_limit      integer default 24,
  p_offset     integer default 0,
  p_author     text default null,       -- 이 지은이 것만
  p_author_not text default null        -- 이 지은이 것은 빼고
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q      text    := btrim(coalesce(p_q, ''));
  v_items  jsonb;
  v_total  bigint;
begin
  -- 검색은 제목·지은이만 본다. 악보 본문(선율)까지 뒤지는 건 뜻이 애매하고(율명 한 글자가
  -- 온 곡에 다 들어 있다) 인덱스도 못 탄다.
  -- 운영자가 내린 악보(hidden_at)는 목록에서 뺀다 — 아래 두 with에 같은 조건이 있다.
  with hits as (
    select * from public.scores
     where visibility = 'public'
       and hidden_at is null
       and (p_author is null or author = p_author)
       and (p_author_not is null or author <> p_author_not)
       and (v_q = '' or title ilike '%' || v_q || '%' or author ilike '%' || v_q || '%')
  )
  select count(*) into v_total from hits;

  with hits as (
    select * from public.scores
     where visibility = 'public'
       and hidden_at is null
       and (p_author is null or author = p_author)
       and (p_author_not is null or author <> p_author_not)
       and (v_q = '' or title ilike '%' || v_q || '%' or author ilike '%' || v_q || '%')
     order by
       case when p_sort = 'popular' then view_count end desc nulls last,
       created_at desc
     limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         h.id,
           'title',      h.title,
           'author',     h.author,
           'license',    h.license,
           'thumb',      h.thumb,
           'fork_of',    h.fork_of,
           'view_count', h.view_count,
           'created_at', h.created_at
         ) order by
           case when p_sort = 'popular' then h.view_count end desc nulls last,
           h.created_at desc), '[]'::jsonb)
    into v_items from hits h;

  return jsonb_build_object('items', v_items, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset);
end $$;



-- ============================================================================
-- 관리자용 RPC — 로그인한 관리자만 부를 수 있다
-- ============================================================================
-- 위 다섯(publish/update/delete/fetch/list)은 **계정 없는 익명 게시**의 계약이라 손대지
-- 않았다. 관리자의 일은 성격이 달라 옆에 따로 세운다:
--   · 익명 RPC의 열쇠는 **토큰**이고, 관리자 RPC의 열쇠는 **로그인 + 명단**이다.
--     update_score에 '관리자면 토큰 없이도'를 끼워 넣으면 그 함수의 계약이 둘이 되어,
--     읽는 사람이 매번 '지금 어느 쪽 이야기인가'를 가려야 한다.
--   · 관리자가 한 일은 반드시 기록(admin_log)이 남아야 하는데, 익명 갱신에는 남길 것이 없다.
--
-- 전부 `authenticated`에만 열고 `anon`에는 안 연다(맨 아래 grant). 그래도 첫 줄에서
-- require_admin()을 다시 묻는 까닭은, 권한을 여는 자리와 확인하는 자리가 떨어져 있으면
-- 언젠가 한쪽만 고쳐지기 때문이다.
-- ============================================================================

-- 지금 부른 사람이 관리자인가. 아니면 그 자리에서 멈추고, 맞으면 그 uid를 돌려준다
-- (부르는 쪽이 기록에 적을 값이라 어차피 필요하다).
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;


-- 운영 기록 한 줄. 관리자 RPC마다 세 줄씩 적기보다 한 곳에 모은다 —
-- 무엇을 남기는지가 한눈에 보여야 빠뜨린 것도 눈에 띈다.
create or replace function public.admin_note(
  p_uid    uuid,
  p_action text,
  p_id     text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.admin_log (uid, action, score_id, detail)
  values (p_uid, p_action, p_id, coalesce(p_detail, '{}'::jsonb))
$$;


-- ---------------------------------------------------------------------------
-- 나는 누구인가 — admin_me
-- ---------------------------------------------------------------------------
-- 관리 페이지가 로그인 직후 한 번 부른다. is_admin()을 브라우저에 안 여는 대신 이것을
-- 여는 까닭: 이 함수는 **자기 자신에 대해서만** 답한다(남이 관리자인지는 못 묻는다).
create or replace function public.admin_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
begin
  return jsonb_build_object(
    'uid',  v_uid,
    'name', (select a.name from public.admins a where a.uid = v_uid));
end $$;


-- ---------------------------------------------------------------------------
-- 목록 — admin_list_scores
-- ---------------------------------------------------------------------------
-- list_scores와 무엇이 다른가: **내려간 것과 주소만 공개인 것까지 전부** 보이고,
-- 운영에 필요한 칸(hidden_*·lint_*·ver·updated_at)이 함께 온다. doc은 여기서도 뺀다.
--
-- 세는 일과 뽑는 일을 두 번 하지 않고 count(*) over()로 한 번에 한다 — 창 함수는
-- limit보다 **먼저** 매겨지므로 거른 전체 수가 나온다.
create or replace function public.admin_list_scores(
  p_sort   text    default 'recent',   -- recent | updated | popular | lint
  p_q      text    default '',
  p_limit  integer default 24,
  p_offset integer default 0,
  p_filter text    default 'all'       -- all | public | unlisted | hidden | lint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid    := public.require_admin();
  v_limit  integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q      text    := btrim(coalesce(p_q, ''));
  v_sort   text    := coalesce(nullif(btrim(p_sort), ''), 'recent');
  v_filter text    := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_items  jsonb;
  v_total  bigint  := 0;
begin
  with hits as (
    select s.*,
           count(*)     over () as total_cnt,
           row_number() over (
             order by
               case when v_sort = 'popular' then s.view_count end desc nulls last,
               case when v_sort = 'lint'    then s.lint_bad   end desc nulls last,
               case when v_sort = 'updated' then s.updated_at end desc nulls last,
               s.created_at desc
           ) as rn
      from public.scores s
     where case v_filter
             when 'hidden'   then s.hidden_at is not null
             when 'public'   then s.visibility = 'public'   and s.hidden_at is null
             when 'unlisted' then s.visibility = 'unlisted' and s.hidden_at is null
             when 'lint'     then coalesce(s.lint_bad, 0) > 0
             else true
           end
       -- 검색은 제목·지은이에 더해 **id도** 본다. 신고 편지에 실려 오는 것이 주소라,
       -- 거기서 딴 id를 그대로 붙여넣어 찾을 수 있어야 한다.
       and (v_q = '' or s.id = v_q
            or s.title ilike '%' || v_q || '%' or s.author ilike '%' || v_q || '%')
     order by rn
     limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',            h.id,
           'ver',           h.ver,
           'title',         h.title,
           'author',        h.author,
           'license',       h.license,
           'visibility',    h.visibility,
           'hidden_at',     h.hidden_at,
           'hidden_reason', h.hidden_reason,
           'hidden_note',   h.hidden_note,
           'lint_bad',      h.lint_bad,
           'lint_at',       h.lint_at,
           'thumb',         h.thumb,
           'fork_of',       h.fork_of,
           'view_count',    h.view_count,
           'created_at',    h.created_at,
           'updated_at',    h.updated_at
         ) order by h.rn), '[]'::jsonb),
         coalesce(max(h.total_cnt), 0)
    into v_items, v_total
    from hits h;

  return jsonb_build_object('items', v_items, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset,
                            'sort', v_sort, 'filter', v_filter);
end $$;


-- ---------------------------------------------------------------------------
-- 하나 열기 — admin_get_score
-- ---------------------------------------------------------------------------
-- fetch_score와 둘이 다른 점 셋: 내려간 악보도 열리고, 조회수를 **안 올리며**(운영자가
-- 들여다본 것은 사람들이 본 것이 아니다), 판 목록이 함께 온다.
-- token_hash는 여기서도 절대 안 내보낸다.
create or replace function public.admin_get_score(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
  s     public.scores%rowtype;
  v_ver jsonb;
begin
  select * into s from public.scores where id = p_id;
  if not found then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ver',        v.ver,
           'title',      v.title,
           'by',         v.by_kind,
           'editor',     v.editor,
           'note',       v.note,
           'created_at', v.created_at
         ) order by v.ver desc), '[]'::jsonb)
    into v_ver
    from public.score_versions v where v.score_id = p_id;

  return jsonb_build_object(
    'id',            s.id,
    'doc',           s.doc,
    'ver',           s.ver,
    'title',         s.title,
    'author',        s.author,
    'license',       s.license,
    'visibility',    s.visibility,
    'hidden_at',     s.hidden_at,
    'hidden_reason', s.hidden_reason,
    'hidden_note',   s.hidden_note,
    'lint_bad',      s.lint_bad,
    'lint_at',       s.lint_at,
    'thumb',         s.thumb,
    'fork_of',       s.fork_of,
    'view_count',    s.view_count,
    'created_at',    s.created_at,
    'updated_at',    s.updated_at,
    'versions',      v_ver);
end $$;


-- ---------------------------------------------------------------------------
-- 교정 — admin_save_score
-- ---------------------------------------------------------------------------
-- 운영자가 악보의 표기를 고친다. **메모(p_note)를 반드시 받는다** — 무엇을 왜 고쳤나가
-- 판에 함께 실려야 나중에 게시자도 읽을 수 있고, 약관의 교정 조항이 약속하는 것이 그것이다.
-- 빈 메모를 통과시키면 반년 뒤 'v4에서 뭘 고쳤더라'가 되어 되돌릴 근거가 사라진다.
--
-- ★ 게시자의 토큰은 그대로 살려 둔다. 운영자가 손을 댔다고 해서 올린 사람이 제 악보를
--   못 고치게 되면 그건 교정이 아니라 뺏는 것이다.
create or replace function public.admin_save_score(
  p_id   text,
  p_doc  jsonb,
  p_note text,
  p_lint integer default null   -- 고친 뒤의 문법 오류 수(편집기가 재 온다). null = 그대로 둔다
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := public.require_admin();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_same boolean;
  v_ver  integer;
begin
  perform public.check_doc(p_doc);
  if v_note is null then
    raise exception '무엇을 왜 고쳤는지 적어 주세요.' using errcode = '22023';
  end if;

  -- 있는 악보인지와 '내용이 정말 달라졌나'를 한 번에 가른다. 없으면 v_same이 null이다.
  select (s.doc is not distinct from p_doc) into v_same
    from public.scores s where s.id = p_id;
  if v_same is null then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 내용이 그대로면 판을 안 올린다(update_score와 같은 규칙). 판 번호는 '몇 번 눌렀나'가
  -- 아니라 '내용이 몇 번 달라졌나'를 세는 값이라야 뜻이 있다.
  update public.scores
     set doc        = p_doc,
         doc_v      = coalesce(nullif(p_doc ->> 'v', '')::smallint, 1),
         title      = public.title_of(p_doc),
         ver        = case when v_same then ver else ver + 1 end,
         lint_bad   = case when p_lint is null then lint_bad else greatest(p_lint, 0) end,
         lint_at    = case when p_lint is null then lint_at  else now() end,
         updated_at = case when v_same then updated_at else now() end
   where id = p_id
  returning ver into v_ver;

  -- 안 달라졌으면 판도 기록도 남기지 않는다 — 아무 일도 없었으므로.
  if not v_same then
    perform public.push_version(p_id, 'admin', v_uid, v_note);
    perform public.admin_note(v_uid, 'save', p_id,
              jsonb_build_object('note', v_note, 'ver', v_ver));
  end if;

  return jsonb_build_object('id', p_id, 'ver', v_ver, 'changed', not v_same);
end $$;


-- ---------------------------------------------------------------------------
-- 내리기·다시 열기 — admin_set_hidden
-- ---------------------------------------------------------------------------
-- visibility(게시자의 뜻)는 건드리지 않는다. 다시 열면 올린 사람이 골랐던 공개 설정이
-- 그대로 돌아온다 — 그러라고 칸을 따로 둔 것이다(머리말 ⑤).
--
-- ★ 이미 내려간 악보를 다시 내리면 hidden_at은 **처음 내린 때 그대로** 둔다. 그 날짜가
--   중단 내역에 적히는 날짜이고, 사유를 다듬었다고 해서 중단한 날이 오늘로 바뀌면 안 된다.
create or replace function public.admin_set_hidden(
  p_id     text,
  p_hidden boolean,
  p_reason text default null,   -- 공개된다(주소를 여는 사람에게 그대로 보인다)
  p_note   text default null    -- 운영자만 본다
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid := public.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  s        public.scores%rowtype;
begin
  if p_hidden and v_reason is null then
    raise exception '내리는 사유를 적어 주세요(그 주소를 여는 사람에게 보입니다).'
      using errcode = '22023';
  end if;

  update public.scores
     set hidden_at     = case when p_hidden then coalesce(hidden_at, now()) else null end,
         hidden_reason = case when p_hidden then v_reason else null end,
         -- 내부 메모는 다시 열어도 남긴다 — 무슨 일이 있었는지의 기록이라 지울 것이 아니다.
         hidden_note   = coalesce(v_note, hidden_note)
   where id = p_id
  returning * into s;

  if s.id is null then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  perform public.admin_note(v_uid, case when p_hidden then 'hide' else 'unhide' end, p_id,
            jsonb_build_object('reason', v_reason, 'note', v_note,
                               'title', s.title, 'author', s.author));

  return jsonb_build_object('id', s.id, 'hidden_at', s.hidden_at,
                            'hidden_reason', s.hidden_reason,
                            'visibility', s.visibility, 'title', s.title);
end $$;


-- ---------------------------------------------------------------------------
-- 판 보기 — admin_versions · admin_version
-- ---------------------------------------------------------------------------
-- 목록에는 doc을 안 싣는다(악보 하나가 수십 KB인데 판이 스물이면 목록만 수백 KB다).
-- 내용을 볼 때는 한 판씩 따로 꺼낸다.
create or replace function public.admin_versions(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
  v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'ver',        v.ver,
           'title',      v.title,
           'by',         v.by_kind,
           'editor',     v.editor,
           'note',       v.note,
           'bytes',      octet_length(v.doc::text),
           'created_at', v.created_at
         ) order by v.ver desc), '[]'::jsonb)
    into v_out
    from public.score_versions v where v.score_id = p_id;
  return jsonb_build_object('id', p_id, 'versions', v_out);
end $$;

create or replace function public.admin_version(p_id text, p_ver integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
  v     public.score_versions%rowtype;
begin
  select * into v from public.score_versions
   where score_id = p_id and ver = p_ver;
  if not found then
    raise exception '그런 판이 없습니다.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v.score_id, 'ver', v.ver, 'doc', v.doc, 'title', v.title,
    'by', v.by_kind, 'editor', v.editor, 'note', v.note, 'created_at', v.created_at);
end $$;


-- ---------------------------------------------------------------------------
-- 되돌리기 — admin_restore
-- ---------------------------------------------------------------------------
-- 되돌림도 **새 판**이다. v3으로 되돌리면 그 내용이 v9가 되어 얹힌다 — 역사를 지우고
-- 과거로 돌아가는 것이 아니라, 과거의 내용을 지금 판으로 다시 채택하는 것이다.
-- 그래야 '언제 누가 되돌렸나'가 남고, 되돌린 것을 다시 되돌릴 수도 있다.
create or replace function public.admin_restore(
  p_id   text,
  p_ver  integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := public.require_admin();
  v_note text;
  v_old  public.score_versions%rowtype;
  v_ver  integer;
begin
  select * into v_old from public.score_versions
   where score_id = p_id and ver = p_ver;
  if not found then
    raise exception '그런 판이 없습니다.' using errcode = 'P0002';
  end if;

  -- 조사는 숫자를 **읽은 소리**의 받침이 정한다: 3(삼)·6(육)과 0으로 끝나는 수(십·이십·백)만
  -- 받침이 있어 '으로'다. 관리 화면(js/admin.js의 roFor)도 같은 셈을 쓴다 — 화면에 보이는
  -- 말과 기록에 적히는 말이 어긋나면 안 된다.
  v_note := coalesce(nullif(btrim(coalesce(p_note, '')), ''),
                     'v' || p_ver ||
                     case when p_ver % 10 in (0, 3, 6) then '으로' else '로' end || ' 되돌림');

  update public.scores
     set doc        = v_old.doc,
         doc_v      = coalesce(nullif(v_old.doc ->> 'v', '')::smallint, 1),
         title      = v_old.title,
         ver        = case when doc is distinct from v_old.doc then ver + 1 else ver end,
         updated_at = now()
   where id = p_id
  returning ver into v_ver;

  perform public.push_version(p_id, 'admin', v_uid, v_note);
  perform public.admin_note(v_uid, 'restore', p_id,
            jsonb_build_object('from_ver', p_ver, 'ver', v_ver, 'note', v_note));

  return jsonb_build_object('id', p_id, 'ver', v_ver, 'from_ver', p_ver);
end $$;


-- ---------------------------------------------------------------------------
-- 지우기 — admin_delete_score
-- ---------------------------------------------------------------------------
-- 마지막 수단이다. 숨김으로 될 일이면 숨긴다 — 지우면 판까지 함께 사라지고(cascade)
-- 게시자에게도 되돌려줄 것이 남지 않는다.
-- ★ 기록을 **먼저** 남긴다. 지운 뒤에는 제목도 지은이도 꺼낼 수 없다.
create or replace function public.admin_delete_score(p_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid := public.require_admin();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  s        public.scores%rowtype;
begin
  if v_reason is null then
    raise exception '지우는 사유를 적어 주세요.' using errcode = '22023';
  end if;

  select * into s from public.scores where id = p_id;
  if not found then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  perform public.admin_note(v_uid, 'delete', p_id,
            jsonb_build_object('reason', v_reason, 'title', s.title,
                               'author', s.author, 'ver', s.ver,
                               'created_at', s.created_at));

  delete from public.scores where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;


-- ---------------------------------------------------------------------------
-- 문법 검사 결과 적기 — admin_set_lint
-- ---------------------------------------------------------------------------
-- 서버는 악보를 모른다(설계 뼈대 ①). 검사는 tools/scan-published.mjs가 app.js의 검사
-- 함수를 그대로 떼어 와 돌리고, 여기엔 **결과만** 적힌다.
-- 기록(admin_log)은 안 남긴다 — 스캔 한 번에 수십 줄이 쌓여 정작 봐야 할 처분 기록이 묻힌다.
create or replace function public.admin_set_lint(p_id text, p_bad integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
  v_hit integer;
begin
  update public.scores
     set lint_bad = greatest(coalesce(p_bad, 0), 0), lint_at = now()
   where id = p_id;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id, 'lint_bad', greatest(coalesce(p_bad, 0), 0));
end $$;


-- ---------------------------------------------------------------------------
-- 운영 기록 보기 — admin_log_list
-- ---------------------------------------------------------------------------
create or replace function public.admin_log_list(
  p_limit  integer default 50,
  p_offset integer default 0,
  p_id     text    default null    -- 이 악보의 기록만
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid    uuid    := public.require_admin();
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_out    jsonb;
begin
  with hits as (
    select l.*, count(*) over () as total_cnt
      from public.admin_log l
     where p_id is null or l.score_id = p_id
     order by l.at desc
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
           'items', coalesce(jsonb_agg(jsonb_build_object(
             'id', h.id, 'at', h.at, 'uid', h.uid, 'who', a.name,
             'action', h.action, 'score_id', h.score_id, 'detail', h.detail
           ) order by h.at desc), '[]'::jsonb),
           'total', coalesce(max(h.total_cnt), 0))
    into v_out
    from hits h left join public.admins a on a.uid = h.uid;
  return v_out;
end $$;


-- ---------------------------------------------------------------------------
-- 권한 — 테이블은 닫고 RPC만 연다
-- ---------------------------------------------------------------------------
-- Supabase는 public 스키마의 테이블 권한을 anon/authenticated에 기본으로 준다.
-- 그것을 걷어내고(빗장 ①) RLS를 켠 채 정책을 하나도 두지 않는다(빗장 ②).
-- 정책이 없으면 나중에 누가 실수로 grant를 되살려도 행이 한 줄도 안 보인다.
alter table public.scores         enable row level security;
alter table public.publish_log    enable row level security;
alter table public.score_versions enable row level security;
alter table public.admins         enable row level security;
alter table public.admin_log      enable row level security;

revoke all on table public.scores         from anon, authenticated;
revoke all on table public.publish_log    from anon, authenticated;
-- 판·관리자 명단·운영 기록도 같은 규칙이다. 특히 admins는 **로그인한 사람에게도** 닫는다 —
-- 명단을 읽을 수 있으면 누가 관리자인지 알아내는 창구가 된다.
revoke all on table public.score_versions from anon, authenticated;
revoke all on table public.admins         from anon, authenticated;
revoke all on table public.admin_log      from anon, authenticated;

-- 함수는 일단 전부 걷고 필요한 것만 다시 준다.
-- ★ `from public`만으로는 모자란다 — Supabase는 public 스키마에 새로 만들어지는 함수의
--   실행 권한을 **anon·authenticated에게 직접** 주는 기본 설정(alter default privileges)을
--   걸어 둔다. PUBLIC을 통한 권한만 걷으면 그 직접 부여분이 남아, 내부용 함수(hash_token
--   등)가 브라우저에서 그대로 불린다(2026-08-04 실측 — 로컬 Postgres에서는 안 드러난다).
revoke all on function public.gen_score_id(integer)                    from public, anon, authenticated;
revoke all on function public.hash_token(text)                         from public, anon, authenticated;
revoke all on function public.caller_ip_hash()                         from public, anon, authenticated;
revoke all on function public.check_doc(jsonb)                         from public, anon, authenticated;
revoke all on function public.check_thumb(text)                        from public, anon, authenticated;
revoke all on function public.title_of(jsonb)                          from public, anon, authenticated;
revoke all on function public.publish_rate_limit()                     from public, anon, authenticated;
revoke all on function public.version_keep()                           from public, anon, authenticated;
revoke all on function public.push_version(text, text, uuid, text)     from public, anon, authenticated;
revoke all on function public.is_admin()                               from public, anon, authenticated;
revoke all on function public.publish_score(jsonb, text, text, text, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.update_score(text, text, jsonb, boolean, text, integer)        from public, anon, authenticated;
revoke all on function public.delete_score(text, text)                 from public, anon, authenticated;
revoke all on function public.fetch_score(text)                        from public, anon, authenticated;
revoke all on function public.list_scores(text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.require_admin()                          from public, anon, authenticated;
revoke all on function public.admin_note(uuid, text, text, jsonb)       from public, anon, authenticated;
revoke all on function public.admin_me()                                from public, anon, authenticated;
revoke all on function public.admin_list_scores(text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.admin_get_score(text)                     from public, anon, authenticated;
revoke all on function public.admin_save_score(text, jsonb, text, integer)       from public, anon, authenticated;
revoke all on function public.admin_set_hidden(text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.admin_versions(text)                      from public, anon, authenticated;
revoke all on function public.admin_version(text, integer)              from public, anon, authenticated;
revoke all on function public.admin_restore(text, integer, text)        from public, anon, authenticated;
revoke all on function public.admin_delete_score(text, text)            from public, anon, authenticated;
revoke all on function public.admin_set_lint(text, integer)             from public, anon, authenticated;
revoke all on function public.admin_log_list(integer, integer, text)    from public, anon, authenticated;

-- 브라우저(anon)가 부를 수 있는 것은 이 다섯뿐이다.
-- ★ hash_token·caller_ip_hash·gen_score_id는 일부러 빼 둔다 — 토큰 해시 셈과 id 뽑기를
--   바깥에서 부를 수 있으면 빗장을 안에 둔 뜻이 없어진다.
-- ★ push_version·is_admin도 마찬가지다. 판을 뜨는 일은 게시·갱신에 딸린 것이지 따로
--   부를 일이 아니고, is_admin은 명단을 떠보는 창구가 된다.
grant execute on function public.publish_score(jsonb, text, text, text, boolean, text, integer) to anon, authenticated;
grant execute on function public.update_score(text, text, jsonb, boolean, text, integer)        to anon, authenticated;
grant execute on function public.delete_score(text, text)               to anon, authenticated;
grant execute on function public.fetch_score(text)                      to anon, authenticated;
grant execute on function public.list_scores(text, text, integer, integer, text, text) to anon, authenticated;

-- 관리자용은 **anon에는 안 열고** authenticated에만 연다. 로그인만으로는 아무것도 못 하고
-- (admins 명단에 있어야 한다) 함수마다 첫 줄에서 require_admin()이 다시 묻는다 —
-- 여는 자리와 확인하는 자리가 떨어져 있으면 언젠가 한쪽만 고쳐진다.
-- ★ require_admin·admin_note는 여기 없다. 관리자용 함수들이 안에서만 쓰는 부품이다.
grant execute on function public.admin_me()                                to authenticated;
grant execute on function public.admin_list_scores(text, text, integer, integer, text) to authenticated;
grant execute on function public.admin_get_score(text)                     to authenticated;
grant execute on function public.admin_save_score(text, jsonb, text, integer)       to authenticated;
grant execute on function public.admin_set_hidden(text, boolean, text, text) to authenticated;
grant execute on function public.admin_versions(text)                      to authenticated;
grant execute on function public.admin_version(text, integer)              to authenticated;
grant execute on function public.admin_restore(text, integer, text)        to authenticated;
grant execute on function public.admin_delete_score(text, text)            to authenticated;
grant execute on function public.admin_set_lint(text, integer)             to authenticated;
grant execute on function public.admin_log_list(integer, integer, text)    to authenticated;

-- ---------------------------------------------------------------------------
-- 이미 올라와 있던 악보를 판 표에 들이기 (한 번만 먹고 그 뒤엔 아무 일도 안 한다)
-- ---------------------------------------------------------------------------
-- 판을 쌓기 전에 올라온 악보들은 지난 기록이 없다. 지금 실린 문서를 그 악보의 v1로 앉힌다 —
-- 그 사이 몇 번을 고쳤든 남아 있는 것은 지금 것뿐이라, 이 v1은 '최초 게시본'이 아니라
-- '판을 세기 시작한 자리'다. 그 사정을 note에 적어 둔다(뒤에 볼 사람이 오해하지 않게).
insert into public.score_versions (score_id, ver, doc, title, by_kind, note, created_at)
select s.id, s.ver, s.doc, s.title, 'user',
       '판을 쌓기 전에 올라온 악보 — 이 줄은 최초 게시본이 아니라 지금 판입니다.',
       s.updated_at
  from public.scores s
 on conflict (score_id, ver) do nothing;


-- PostgREST에 스키마가 바뀐 것을 알린다(대시보드에서 실행하면 대개 저절로 된다)
notify pgrst, 'reload schema';


-- ============================================================================
-- 손으로 확인해 보기 (SQL Editor에서)
-- ============================================================================
--   select public.publish_score('{"v":1,"controls":{"title":"시험곡"}}'::jsonb, '한단비', 'cc-by');
--     → {"id":"k7m2xq4p","token":"…48자…"}
--   select public.fetch_score('k7m2xq4p');
--   select public.update_score('k7m2xq4p', '<토큰>', '{"v":1,"controls":{"title":"고친 곡"}}'::jsonb);
--   select public.update_score('k7m2xq4p', '틀린토큰', '{"v":1,"controls":{}}'::jsonb);  -- 42501로 막혀야 정상
--   select public.delete_score('k7m2xq4p', '<토큰>');
--
-- 판이 쌓이는지 (갱신할 때마다 ver가 1씩 오르고 줄이 하나씩 는다):
--   select ver from public.scores where id = 'k7m2xq4p';
--   select ver, title, by_kind, created_at from public.score_versions
--    where score_id = 'k7m2xq4p' order by ver;
--
-- 내려간 악보 (아직 내리는 RPC가 없으므로 손으로 세워 보고 되돌린다):
--   update public.scores set hidden_at = now(), hidden_reason = '시험' where id = 'k7m2xq4p';
--   select public.fetch_score('k7m2xq4p');   -- '게시가 중단된 악보입니다. 사유: 시험'
--   select public.list_scores();             -- 목록에서 빠져 있어야 정상
--   update public.scores set hidden_at = null, hidden_reason = null where id = 'k7m2xq4p';
--
-- 관리자 명단 (대시보드 Authentication에서 계정을 만든 뒤 그 uid를 넣는다):
--   insert into public.admins (uid, name) values ('<auth.users의 id>', '한단비내린');
--
-- ── 관리자 RPC를 SQL Editor에서 시험하려면 ──────────────────────────────────
-- 관리자 RPC는 auth.uid()로 사람을 가리는데, SQL Editor에는 로그인 정보가 없어 그 값이
-- 비어 있다(그래서 그냥 부르면 '관리자만 할 수 있습니다'로 막힌다 — 정상이다).
-- 한 트랜잭션 안에서만 신분을 빌려 쓸 수 있다:
--
--   begin;
--   select set_config('request.jwt.claims',
--                     json_build_object('sub', '<관리자 UID>')::text, true);
--   select public.admin_me();                      -- {"uid":…, "name":"…"}
--   select public.admin_list_scores('recent', '', 5, 0, 'all');
--   select public.admin_set_hidden('<id>', true, '시험으로 내림');
--   select public.fetch_score('<id>');             -- 중단 안내가 나와야 정상
--   select public.admin_set_hidden('<id>', false);
--   select public.admin_save_score('<id>', '{"v":1,"controls":{"title":"교정본"}}'::jsonb,
--                                  '시험 교정');
--   select public.admin_versions('<id>');          -- 판이 하나 늘었는지
--   select public.admin_log_list(10, 0, '<id>');   -- 기록이 남았는지
--   rollback;                                      -- 시험이면 되돌린다
--
-- set_config의 셋째 인자 true가 '이 트랜잭션 동안만'이라는 뜻이라, commit/rollback과
-- 함께 저절로 풀린다. 웹 관리자 페이지에서는 이럴 일이 없다 — 진짜 로그인 토큰이 실려 온다.
--
-- 브라우저 쪽 빗장 확인(anon 키로, 반드시 막혀야 하는 것들):
--   curl -s "$URL/rest/v1/scores?select=*"            -H "apikey: $ANON"   -- 빈 배열/거부
--   curl -s "$URL/rest/v1/rpc/hash_token" -X POST     -H "apikey: $ANON" \
--        -H 'Content-Type: application/json' -d '{"p_token":"x"}'          -- 권한 없음
--   curl -s "$URL/rest/v1/rpc/admin_list_scores" -X POST -H "apikey: $ANON" \
--        -H 'Content-Type: application/json' -d '{}'                       -- 권한 없음
-- ============================================================================
