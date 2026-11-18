-- '교과서 표준악보' 탭을 위한 서버 고침(2026-11-18) — Supabase SQL Editor에 통째로 붙여 넣고 Run.
-- server/schema.sql의 list_scores를 떼어 낸 사본이다(원본을 고쳤으면 이 파일도 다시 뜰 것).
--   · p_author_not이 줄바꿈으로 이은 **여러** 지은이를 받는다 — '올라온 악보' 탭이
--     국악원 정악보(OMR)와 교과서 표준악보 둘 다 빼야 해서. 이름 하나만 주던 옛 호출도 그대로 맞다.
--   · 인자·반환형이 그대로라 create or replace가 권한(grant)을 지킨다.
-- 여러 번 돌려도 된다. 돌린 뒤 server/check-grants.sql을 한 번 돌려 0행인지 볼 것.

create or replace function public.list_scores(
  p_sort       text default 'recent',   -- recent | popular
  p_q          text default '',
  p_limit      integer default 24,
  p_offset     integer default 0,
  p_author     text default null,       -- 이 지은이 것만
  p_author_not text default null        -- 이 지은이 것은 빼고(여럿이면 줄바꿈으로 잇는다 — 2026-11-18)
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
       and (p_author_not is null or author <> all(string_to_array(p_author_not, E'\n')))
       and (v_q = '' or title ilike '%' || v_q || '%' or author ilike '%' || v_q || '%')
  )
  select count(*) into v_total from hits;

  with hits as (
    select * from public.scores
     where visibility = 'public'
       and hidden_at is null
       and (p_author is null or author = p_author)
       and (p_author_not is null or author <> all(string_to_array(p_author_not, E'\n')))
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
