-- ============================================================================
-- 빗장 점검 (2단계) — SQL Editor에 붙여넣고 Run. **결과가 0행이어야 정상이다.**
-- ============================================================================
-- server/schema.sql 맨 끝 '빗장 점검' 쿼리를 주석만 벗겨 옮긴 것이다. 한 줄이라도 나오면
-- 그것이 열려 있으면 안 되는 자리다(무엇·이름·누구에게). 원본은 schema.sql — 허용 목록을
-- 고칠 땐 거기를 고치고 이 파일을 다시 뜰 것.
-- ============================================================================
with allowed(fn, who) as (values
  -- 익명 RPC 다섯(악보) — 브라우저(anon)가 부르는 것
  ('publish_score','anon'), ('update_score','anon'), ('delete_score','anon'),
  ('fetch_score','anon'),   ('list_scores','anon'),
  -- 묻고 제안하기 여덟 — 브라우저(anon)가 부르는 것
  ('board_list','anon'),    ('board_get','anon'),     ('board_post','anon'),
  ('board_update','anon'),  ('board_delete','anon'),  ('board_reply','anon'),
  ('board_reply_delete','anon'), ('board_vote','anon'),
  -- 관리자용 열넷 — 로그인 + admins 명단
  ('admin_me','authenticated'),          ('admin_list_scores','authenticated'),
  ('admin_get_score','authenticated'),   ('admin_save_score','authenticated'),
  ('admin_set_hidden','authenticated'),  ('admin_versions','authenticated'),
  ('admin_version','authenticated'),     ('admin_restore','authenticated'),
  ('admin_delete_score','authenticated'),('admin_set_lint','authenticated'),
  ('admin_log_list','authenticated'),
  ('admin_board_set','authenticated'),   ('admin_board_reply','authenticated'),
  ('admin_board_hide_reply','authenticated'),
  -- 계정 임자용 여덟 — 로그인 + 제 것
  ('owner_list_scores','authenticated'), ('owner_update_score','authenticated'),
  ('owner_delete_score','authenticated'),('owner_adopt_score','authenticated'),
  ('owner_snap_list','authenticated'),   ('owner_snap_save','authenticated'),
  ('owner_snap_get','authenticated'),    ('owner_snap_delete','authenticated')
),
open_fns as (
  select p.proname::text as fn, r.rolname::text as who
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'),('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and has_function_privilege(r.rolname, p.oid, 'execute')
)
-- ① 허용 목록 밖인데 열려 있는 함수 (anon에만 열린 것은 authenticated에도 열려 있다)
select '함수가 열려 있음' as 무엇, o.fn as 이름, o.who as 누구에게
  from open_fns o
 where not exists (
   select 1 from allowed a
    where a.fn = o.fn and (a.who = o.who or a.who = 'anon'))
union all
-- ② 표가 직접 열려 있음 (RPC만 열기로 한 규칙이 깨진 자리)
select '표가 열려 있음', t.table_name, t.grantee
  from information_schema.role_table_grants t
 where t.table_schema = 'public' and t.grantee in ('anon','authenticated')
union all
-- ③ RLS가 꺼진 표
select 'RLS 꺼짐', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
-- ④ 밖에 열린 함수인데 search_path를 안 고정한 것
--    (SECURITY DEFINER + 열린 search_path는 남이 스키마를 앞에 끼워 넣을 틈이 된다)
select 'search_path 안 고정', p.proname::text, ''
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'))  cfg
                    where cfg like 'search_path=%')
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'));
