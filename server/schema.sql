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

-- 둘러보기가 쓰는 차례. 부분 인덱스라 공개분만 담아 가볍다.
create index if not exists scores_public_recent_idx
  on public.scores (created_at desc) where visibility = 'public';
create index if not exists scores_public_views_idx
  on public.scores (view_count desc, created_at desc) where visibility = 'public';
create index if not exists scores_fork_of_idx on public.scores (fork_of);


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
-- ① 게시 — publish_score
-- ---------------------------------------------------------------------------
-- 돌려주는 token은 **이때 딱 한 번** 나온다. 서버엔 해시만 남으므로 잃어버리면
-- 되찾을 길이 없고(익명이라 본인 확인을 할 수단이 없다), 그 게시물은 운영자가
-- 지워주는 수밖에 없다 — 클라이언트가 그 사실을 사용자에게 알려야 한다.
-- 인자가 늘어난 판으로 갈아끼운다. create or replace는 인자가 다르면 '다른 함수'를 하나 더
-- 만들 뿐이라(오버로드) 옛 판이 남는다 — 먼저 떨어뜨려야 PostgREST가 헷갈리지 않는다.
drop function if exists public.publish_score(jsonb, text, text, text);
drop function if exists public.update_score(text, text, jsonb);

create or replace function public.publish_score(
  p_doc     jsonb,
  p_author  text default '',
  p_license text default 'none',
  p_fork_of text default null,
  p_public  boolean default true,   -- 둘러보기에 올릴 것인가 (아니면 주소를 아는 사람만)
  p_thumb   text default null
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

  insert into public.scores (id, doc, doc_v, title, author, license, visibility, token_hash, fork_of, thumb)
  values (
    v_id, p_doc,
    coalesce(nullif(p_doc ->> 'v', '')::smallint, 1),
    public.title_of(p_doc), v_author, v_lic,
    case when coalesce(p_public, true) then 'public' else 'unlisted' end,
    public.hash_token(v_token),
    -- 원본이 실제로 있을 때만 계보로 남긴다(남의 파일에 실려 온 낯선 id는 조용히 버림)
    (select s.id from public.scores s where s.id = p_fork_of),
    nullif(p_thumb, '')
  );

  insert into public.publish_log (ip_hash) values (v_ip);

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
  p_thumb  text default null       -- null = 지금 미리보기를 그대로 둔다
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_updated timestamptz;
begin
  perform public.check_doc(p_doc);
  perform public.check_thumb(p_thumb);

  update public.scores
     set doc        = p_doc,
         doc_v      = coalesce(nullif(p_doc ->> 'v', '')::smallint, 1),
         title      = public.title_of(p_doc),
         thumb      = coalesce(nullif(p_thumb, ''), thumb),
         visibility = case when p_public is null then visibility
                           when p_public then 'public' else 'unlisted' end,
         updated_at = now()
   where id = p_id
     and token_hash = public.hash_token(p_token)
  returning updated_at into v_updated;

  if v_updated is null then
    raise exception '이 악보를 고칠 권한이 없습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('id', p_id, 'updated_at', v_updated);
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
  s public.scores%rowtype;
begin
  select * into s from public.scores where id = p_id;
  if not found or s.visibility = 'private' then
    raise exception '악보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  update public.scores set view_count = view_count + 1 where id = p_id;

  return jsonb_build_object(
    'id',         s.id,
    'doc',        s.doc,
    'title',      s.title,
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
  with hits as (
    select * from public.scores
     where visibility = 'public'
       and (p_author is null or author = p_author)
       and (p_author_not is null or author <> p_author_not)
       and (v_q = '' or title ilike '%' || v_q || '%' or author ilike '%' || v_q || '%')
  )
  select count(*) into v_total from hits;

  with hits as (
    select * from public.scores
     where visibility = 'public'
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


-- ---------------------------------------------------------------------------
-- 권한 — 테이블은 닫고 RPC만 연다
-- ---------------------------------------------------------------------------
-- Supabase는 public 스키마의 테이블 권한을 anon/authenticated에 기본으로 준다.
-- 그것을 걷어내고(빗장 ①) RLS를 켠 채 정책을 하나도 두지 않는다(빗장 ②).
-- 정책이 없으면 나중에 누가 실수로 grant를 되살려도 행이 한 줄도 안 보인다.
alter table public.scores      enable row level security;
alter table public.publish_log enable row level security;

revoke all on table public.scores      from anon, authenticated;
revoke all on table public.publish_log from anon, authenticated;

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
revoke all on function public.publish_score(jsonb, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.update_score(text, text, jsonb, boolean, text)        from public, anon, authenticated;
revoke all on function public.delete_score(text, text)                 from public, anon, authenticated;
revoke all on function public.fetch_score(text)                        from public, anon, authenticated;
revoke all on function public.list_scores(text, text, integer, integer, text, text) from public, anon, authenticated;

-- 브라우저(anon)가 부를 수 있는 것은 이 다섯뿐이다.
-- ★ hash_token·caller_ip_hash·gen_score_id는 일부러 빼 둔다 — 토큰 해시 셈과 id 뽑기를
--   바깥에서 부를 수 있으면 빗장을 안에 둔 뜻이 없어진다.
grant execute on function public.publish_score(jsonb, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.update_score(text, text, jsonb, boolean, text)        to anon, authenticated;
grant execute on function public.delete_score(text, text)               to anon, authenticated;
grant execute on function public.fetch_score(text)                      to anon, authenticated;
grant execute on function public.list_scores(text, text, integer, integer, text, text) to anon, authenticated;

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
-- 브라우저 쪽 빗장 확인(anon 키로, 반드시 막혀야 하는 것들):
--   curl -s "$URL/rest/v1/scores?select=*"            -H "apikey: $ANON"   -- 빈 배열/거부
--   curl -s "$URL/rest/v1/rpc/hash_token" -X POST     -H "apikey: $ANON" \
--        -H 'Content-Type: application/json' -d '{"p_token":"x"}'          -- 권한 없음
-- ============================================================================
