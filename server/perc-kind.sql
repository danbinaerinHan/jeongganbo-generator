-- 타악 정간보를 공유마당에 올리기 위한 서버 고침(2026-11-16) — Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- server/schema.sql에서 떼어 낸 사본이다(원본을 고쳤으면 이 파일도 다시 뜰 것).
--   ① scores.kind — 문서의 kind에서 저절로 뽑는 칸(perc | jeongak). 기존 행도 바로 채워진다.
--   ② list_scores가 카드마다 kind를 함께 내준다(인자·권한은 그대로 — create or replace는 grant를 지킨다).
-- 여러 번 돌려도 된다. 돌린 뒤 server/check-grants.sql을 한 번 돌려 0행인지 볼 것.

alter table public.scores add column if not exists kind text
  generated always as (case when doc ->> 'kind' = 'perc' then 'perc' else 'jeongak' end) stored;

-- 정렬은 최신순/인기순 둘뿐이고 인덱스도 그 둘에 맞춰 두 개만 뒀다.
-- p_author/p_author_not — 모아보기 **탭**이 쓰는 지은이 필터(정확 일치). 국악원 OMR 데이터셋
-- 69곡을 '국악원 정악보' 탭으로 가르고, '올라온 악보' 탭에서는 그 69곡을 뺀다(2026-08-14).
-- 서버는 '국악원'이라는 이름을 모른다 — 무슨 지은이로 가를지는 클라이언트(js/browse.js)가 정한다.
-- 인자가 늘어난 판으로 갈아끼운다(옛 4인자 판을 먼저 떨궈야 PostgREST가 안 헷갈린다).

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
           'kind',       h.kind,
           'view_count', h.view_count,
           'created_at', h.created_at
         ) order by
           case when p_sort = 'popular' then h.view_count end desc nulls last,
           h.created_at desc), '[]'::jsonb)
    into v_items from hits h;

  return jsonb_build_object('items', v_items, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset);
end $$;
