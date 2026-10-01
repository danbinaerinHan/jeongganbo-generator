-- ============================================================================
-- 묻고 제안하기 — 서버에 붙이기 (1단계: 이 파일 통째로 SQL Editor에 붙여넣고 Run)
-- ============================================================================
-- server/schema.sql의 '묻고 제안하기' 절과, 그 절에 딸린 권한 줄만 떼어 모은 것이다.
-- schema.sql 전체를 돌리지 않는 까닭: 그 파일의 권한 절은 아직 서버에 없는 이용자 계정
-- (3단계 · user_snapshots·owner_*)까지 함께 다루어, 지금 서버에서 통째로 돌리면 그 줄에서
-- 멈춘다(2026-10-01 실측: owner_list_scores 없음). 이 파일은 board_* 표·함수만 만든다.
--
-- 기대어 서는 것(이미 서버에 있다 — 2026-10-01 확인): caller_ip_hash · hash_token ·
-- gen_score_id · require_admin · admin_note.
--
-- 다시 돌려도 같은 상태가 된다(표는 if not exists, 함수는 create or replace).
-- ★ 원본은 schema.sql이다. 이 파일을 고치지 말고 schema.sql을 고친 뒤 다시 떼어 낼 것.
-- 다음 단계: server/check-grants.sql을 돌려 **결과가 한 줄도 없는지** 확인.
-- ============================================================================

-- ============================================================================
-- 묻고 제안하기 (board.html) — 4단계
-- ============================================================================
-- 이용자가 질문·제안을 올리고, 서로 댓글을 달고, 공감을 누르는 공개 게시판이다.
-- 갈래를 나누지 않는다 — '이건 질문인가 제안인가'를 쓰는 사람이 먼저 고민하게 하면 안 쓰고
-- 만다. 자주 묻는 질문(운영자가 미리 적어 둔 답)은 서버가 아니라 board.html에 손으로 적는다.
-- 악보 게시와 **같은 뼈대**를 쓴다: 표는 닫고 RPC만 연다(뼈대 ②) · 고칠 권한은 브라우저의
-- 열쇠(뼈대 ③) · 운영자의 처분은 게시자의 글과 다른 칸(뼈대 ⑤, hidden_at).
--
--  · 글·댓글은 **계정 없이** 올린다(악보 게시와 같다). 대신 브라우저마다 **글쓴이 열쇠** 하나를
--    쓴다 — 브라우저가 처음 글을 쓸 때 무작위로 만들어 localStorage(jgb_board_v1)에 두고,
--    글·댓글마다 함께 보낸다. 서버에는 그 해시(key_hash)만 남는다.
--    그 열쇠가 하는 일은 둘이다:
--      ① **고칠 권한** — 같은 열쇠로 쓴 글·댓글은 다 고치고 지울 수 있다(악보는 게시물마다
--         토큰이 따로지만, 여기선 글이 많아지므로 하나로 묶었다).
--      ② **꼬리표**(author_tag, 네 글자) — 닉네임 옆에 붙어 같은 이름을 쓰는 다른 사람과
--         갈라 준다('해금 #k7m2'·'해금 #p4xq'). 열쇠를 모르면 같은 꼬리표를 못 만든다.
--         ★ 꼬리표는 key_hash에서 떼지 않고 **다른 소금으로 따로 뜬다** — 인증에 쓰는 해시의
--           일부를 공개하면 그만큼 열쇠를 떠보기 쉬워진다.
--    닉네임은 **비워도 된다**(사용자 확정) — 비우면 '이름 없음 #k7m2'로 보인다.
--    컴퓨터나 IP로 사람을 가리지 않는다(개인정보). 그래서 '브라우저마다'이지 '컴퓨터마다'가 아니다.
--  · 공감은 **IP 해시 하나에 한 표**다. 계정이 없으니 사람을 셀 길이 이것뿐이다 — 한
--    교실(같은 공유기)에서는 한 표로 모인다. 순위를 가르는 힌트지 투표가 아니다.
--  · 운영자 답변은 `admin_board_reply`로만 달린다(is_staff). 익명 댓글이 이름 칸에
--    '운영자'라고 적어도 운영자 표시는 안 붙는다 — 표시는 이름이 아니라 열쇠가 정한다.
--  · 처리 상태(접수·반영함 따위)는 두지 않는다(사용자 확정) — 운영자가 답했는지(staff_replied)만
--    보인다.
--  · 내려간 글은 목록에서 빠지고, 주소로 들어오면 사유를 보여 준다(악보와 같은 규칙).
-- ============================================================================

create table if not exists public.board_posts (
  id            text primary key,
  title         text not null,
  body          text not null,
  author        text not null default '',
  author_tag    text not null default '',
  key_hash      text not null,
  vote_count    integer not null default 0,
  reply_count   integer not null default 0,
  staff_replied boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),   -- 마지막 댓글·수정 시각(목록 '최근 활동')
  edited_at     timestamptz,
  hidden_at     timestamptz,
  hidden_reason text
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);
create index if not exists board_posts_votes_idx   on public.board_posts (vote_count desc, created_at desc);

create table if not exists public.board_replies (
  id            bigint generated always as identity primary key,
  post_id       text not null references public.board_posts(id) on delete cascade,
  body          text not null,
  author        text not null default '',
  author_tag    text not null default '',  -- 운영자 답변은 비어 있다
  key_hash      text,                     -- 운영자 답변은 열쇠가 없다(열쇠가 로그인이다)
  is_staff      boolean not null default false,
  created_at    timestamptz not null default now(),
  hidden_at     timestamptz,
  hidden_reason text
);
create index if not exists board_replies_post_idx on public.board_replies (post_id, created_at);

create table if not exists public.board_votes (
  post_id text not null references public.board_posts(id) on delete cascade,
  ip_hash text not null,
  at      timestamptz not null default now(),
  primary key (post_id, ip_hash)
);

-- 글·댓글 빈도 기록. publish_log와 따로 두는 까닭: 악보 게시 한도와 섞이면 댓글 몇 개에
-- 악보를 못 올리게 된다.
create table if not exists public.board_log (
  ip_hash text        not null,
  what    text        not null,           -- post | reply
  at      timestamptz not null default now()
);
create index if not exists board_log_ip_at_idx on public.board_log (ip_hash, what, at desc);

-- 한 시간 한도. 사람이 손으로 쓰는 속도와는 거리가 멀되, 도배는 막을 만큼.
create or replace function public.board_rate_limit(p_what text) returns integer
  language sql immutable
  set search_path = public, extensions
  as $$ select case p_what when 'post' then 6 else 30 end $$;

-- 한도 확인 + 기록 한 줄. 글과 댓글이 같은 셈을 쓰도록 한 곳에 둔다.
create or replace function public.board_throttle(p_what text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := public.caller_ip_hash();
  v_n  integer;
begin
  delete from public.board_log where at < now() - interval '1 day';
  select count(*) into v_n from public.board_log
   where ip_hash = v_ip and what = p_what and at > now() - interval '1 hour';
  if v_n >= public.board_rate_limit(p_what) then
    raise exception '한 시간에 올릴 수 있는 글 수를 넘었습니다. 잠시 뒤 다시 시도해 주세요.'
      using errcode = '53400';
  end if;
  insert into public.board_log (ip_hash, what) values (v_ip, p_what);
end $$;

-- 글자 검사 — 앞뒤 빈칸을 걷고 길이를 본다. 비었거나 넘치면 멈춘다.
create or replace function public.board_text(p_text text, p_min integer, p_max integer, p_name text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v text := btrim(coalesce(p_text, ''));
begin
  if char_length(v) < p_min then
    raise exception '%을(를) 적어 주세요.', p_name using errcode = '22023';
  end if;
  if char_length(v) > p_max then
    raise exception '%은(는) %자까지 적을 수 있습니다.', p_name, p_max using errcode = '22023';
  end if;
  return v;
end $$;

-- 글쓴이 열쇠 → 저장 꼴(해시). 짧거나 비었으면 멈춘다(브라우저는 48자를 만든다).
create or replace function public.board_key(p_key text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if char_length(coalesce(p_key, '')) not between 32 and 128 then
    raise exception '글쓴이 열쇠가 올바르지 않습니다. 페이지를 새로 고쳐 다시 시도해 주세요.'
      using errcode = '22023';
  end if;
  return public.hash_token(p_key);
end $$;

-- 글쓴이 열쇠 → 꼬리표 네 글자. 알파벳은 gen_score_id와 같다(0/o·1/l/i를 뺀 31자).
-- 소금이 key_hash와 다르다 — 위 머리말 ② 참고.
create or replace function public.board_tag(p_key text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  h   bytea := digest('umulsai-board-tag-v1|' || coalesce(p_key, ''), 'sha256');
  out text := '';
  i   integer;
begin
  for i in 0..3 loop
    out := out || substr(alphabet, 1 + (get_byte(h, i) % 31), 1);
  end loop;
  return out;
end $$;


-- ---------------------------------------------------------------------------
-- 목록 — board_list
-- ---------------------------------------------------------------------------
-- 본문은 앞 160자만 준다(목록이 길어지면 무거워진다). voted는 **부른 쪽 IP가** 공감했는가.
create or replace function public.board_list(
  p_sort   text default 'recent',    -- recent | votes | active
  p_q      text default '',
  p_limit  integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ip    text := public.caller_ip_hash();
  v_q     text := nullif(btrim(coalesce(p_q, '')), '');
  v_lim   integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  select count(*) into v_total
    from public.board_posts p
   where p.hidden_at is null
     and (v_q is null or p.title ilike '%' || v_q || '%' or p.body ilike '%' || v_q || '%');

  select coalesce(jsonb_agg(x.j order by x.rn), '[]'::jsonb) into v_items
    from (
      select row_number() over (
               order by
                 case when p_sort = 'votes'  then p.vote_count end desc nulls last,
                 case when p_sort = 'active' then p.updated_at end desc nulls last,
                 p.created_at desc) as rn,
             jsonb_build_object(
               'id', p.id, 'title', p.title,
               'excerpt', left(p.body, 160), 'author', p.author, 'author_tag', p.author_tag,
               'votes', p.vote_count, 'replies', p.reply_count,
               'staff_replied', p.staff_replied,
               'created_at', p.created_at, 'updated_at', p.updated_at,
               'voted', exists (select 1 from public.board_votes v
                                 where v.post_id = p.id and v.ip_hash = v_ip)) as j
        from public.board_posts p
       where p.hidden_at is null
         and (v_q is null or p.title ilike '%' || v_q || '%' or p.body ilike '%' || v_q || '%')
       order by rn
       limit v_lim offset v_off
    ) x;

  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;


-- ---------------------------------------------------------------------------
-- 글 하나 — board_get
-- ---------------------------------------------------------------------------
-- 내려간 댓글은 **자리를 남기고** 글만 뺀다(hidden: true) — 대화의 앞뒤가 끊겨 보이지
-- 않게, 그리고 무언가 내려갔다는 사실은 보이게.
-- p_key를 주면 mine(이 브라우저가 쓴 것인가)을 함께 준다 — [고치기]·[지우기]를 띄울지를
-- 브라우저가 스스로 셈하게 하면 꼬리표 셈을 두 벌 적게 된다.
create or replace function public.board_get(p_id text, p_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := public.caller_ip_hash();
  v_kh text := case when coalesce(p_key, '') = '' then null else public.hash_token(p_key) end;
  p    public.board_posts;
begin
  select * into p from public.board_posts where id = p_id;
  if not found then
    raise exception '없는 글입니다.' using errcode = 'P0002';
  end if;
  if p.hidden_at is not null then
    raise exception '운영자가 내린 글입니다. 사유: %', coalesce(p.hidden_reason, '—')
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'post', jsonb_build_object(
      'id', p.id, 'title', p.title, 'body', p.body, 'author', p.author,
      'author_tag', p.author_tag, 'mine', v_kh is not null and p.key_hash = v_kh,
      'votes', p.vote_count, 'replies', p.reply_count,
      'created_at', p.created_at, 'edited_at', p.edited_at,
      'voted', exists (select 1 from public.board_votes v
                        where v.post_id = p.id and v.ip_hash = v_ip)),
    'replies', coalesce((
      select jsonb_agg(
               case when r.hidden_at is null then
                 jsonb_build_object('id', r.id, 'body', r.body, 'author', r.author,
                                    'author_tag', r.author_tag, 'is_staff', r.is_staff,
                                    'mine', v_kh is not null and r.key_hash is not distinct from v_kh,
                                    'created_at', r.created_at)
               else
                 jsonb_build_object('id', r.id, 'hidden', true, 'created_at', r.created_at)
               end order by r.created_at)
        from public.board_replies r where r.post_id = p.id), '[]'::jsonb));
end $$;


-- ---------------------------------------------------------------------------
-- 글 쓰기·고치기·지우기 — board_post / board_update / board_delete
-- ---------------------------------------------------------------------------
create or replace function public.board_post(
  p_title  text,
  p_body   text,
  p_author text,
  p_key    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title text := public.board_text(p_title, 2, 80, '제목');
  v_body  text := public.board_text(p_body, 1, 4000, '내용');
  v_kh    text := public.board_key(p_key);
  v_tag   text := public.board_tag(p_key);
  v_id    text;
  v_try   integer;
begin
  perform public.board_throttle('post');

  for v_try in 1..5 loop
    v_id := public.gen_score_id(8);
    exit when not exists (select 1 from public.board_posts where id = v_id);
    v_id := null;
  end loop;
  if v_id is null then
    raise exception '글 주소를 만들지 못했습니다. 다시 시도해 주세요.' using errcode = '53400';
  end if;

  insert into public.board_posts (id, title, body, author, author_tag, key_hash)
  values (v_id, v_title, v_body, left(btrim(coalesce(p_author, '')), 30), v_tag, v_kh);

  return jsonb_build_object('id', v_id, 'tag', v_tag);
end $$;

-- 없는 글과 남의 열쇠를 같은 말로 돌려준다(update_score와 같은 까닭).
create or replace function public.board_update(
  p_id    text,
  p_key   text,
  p_title text,
  p_body  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title text := public.board_text(p_title, 2, 80, '제목');
  v_body  text := public.board_text(p_body, 1, 4000, '내용');
begin
  update public.board_posts
     set title = v_title, body = v_body, edited_at = now(), updated_at = now()
   where id = p_id and key_hash = public.hash_token(p_key) and hidden_at is null;
  if not found then
    raise exception '이 글을 고칠 수 없습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.board_delete(p_id text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.board_posts
   where id = p_id and key_hash = public.hash_token(p_key);
  if not found then
    raise exception '이 글을 지울 수 없습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------------
-- 댓글 — board_reply / board_reply_delete
-- ---------------------------------------------------------------------------
create or replace function public.board_reply(
  p_post   text,
  p_body   text,
  p_author text,
  p_key    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_body  text := public.board_text(p_body, 1, 2000, '댓글');
  v_kh    text := public.board_key(p_key);
  v_id    bigint;
begin
  if not exists (select 1 from public.board_posts where id = p_post and hidden_at is null) then
    raise exception '없는 글입니다.' using errcode = 'P0002';
  end if;
  perform public.board_throttle('reply');

  insert into public.board_replies (post_id, body, author, author_tag, key_hash)
  values (p_post, v_body, left(btrim(coalesce(p_author, '')), 30), public.board_tag(p_key), v_kh)
  returning id into v_id;

  update public.board_posts
     set reply_count = reply_count + 1, updated_at = now()
   where id = p_post;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.board_reply_delete(p_reply bigint, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_post text;
begin
  delete from public.board_replies
   where id = p_reply and key_hash = public.hash_token(p_key) and not is_staff
  returning post_id into v_post;
  if v_post is null then
    raise exception '이 댓글을 지울 수 없습니다.' using errcode = '42501';
  end if;
  update public.board_posts set reply_count = greatest(reply_count - 1, 0) where id = v_post;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------------
-- 공감 — board_vote
-- ---------------------------------------------------------------------------
-- p_on = true면 누르고 false면 거둔다. 같은 IP가 두 번 눌러도 한 표다(기본키).
-- vote_count는 세어서 다시 적는다(더하고 빼기만 하면 어긋난 값이 영영 남는다).
create or replace function public.board_vote(p_post text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := public.caller_ip_hash();
  v_n  integer;
begin
  if not exists (select 1 from public.board_posts where id = p_post and hidden_at is null) then
    raise exception '없는 글입니다.' using errcode = 'P0002';
  end if;
  if coalesce(p_on, true) then
    insert into public.board_votes (post_id, ip_hash) values (p_post, v_ip)
    on conflict do nothing;
  else
    delete from public.board_votes where post_id = p_post and ip_hash = v_ip;
  end if;
  select count(*) into v_n from public.board_votes where post_id = p_post;
  update public.board_posts set vote_count = v_n where id = p_post;
  return jsonb_build_object('votes', v_n, 'voted', coalesce(p_on, true));
end $$;


-- ---------------------------------------------------------------------------
-- 운영자 — admin_board_set / admin_board_reply / admin_board_hide_reply
-- ---------------------------------------------------------------------------
-- 셋 다 첫 줄에서 require_admin()을 묻고, 한 일을 admin_log에 남긴다(score_id 칸에 글 id,
-- detail.target = 'board'). 운영 기록을 한 표에 모아야 '무엇을 언제 왜'를 한 곳에서 본다.

-- 내리기·되올리기.
create or replace function public.admin_board_set(
  p_id     text,
  p_hidden boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := public.require_admin();
  v_title text;
begin
  select title into v_title from public.board_posts where id = p_id;
  if not found then
    raise exception '없는 글입니다.' using errcode = 'P0002';
  end if;

  if p_hidden is not null then
    if p_hidden and nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception '내리는 사유를 적어 주세요.' using errcode = '22023';
    end if;
    update public.board_posts
       set hidden_at = case when p_hidden then now() else null end,
           hidden_reason = case when p_hidden then btrim(p_reason) else null end
     where id = p_id;
    perform public.admin_note(v_uid, case when p_hidden then 'board_hide' else 'board_unhide' end, p_id,
      jsonb_build_object('target', 'board', 'reason', p_reason, 'title', v_title));
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- 운영자 답변. 글쓴이 이름 칸은 서버가 정한다(부르는 쪽이 적지 않는다).
create or replace function public.admin_board_reply(p_post text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := public.require_admin();
  v_body text := public.board_text(p_body, 1, 4000, '답변');
  v_id   bigint;
begin
  if not exists (select 1 from public.board_posts where id = p_post) then
    raise exception '없는 글입니다.' using errcode = 'P0002';
  end if;
  insert into public.board_replies (post_id, body, author, is_staff)
  values (p_post, v_body, '우물사이 운영자', true)
  returning id into v_id;
  update public.board_posts
     set reply_count = reply_count + 1, staff_replied = true, updated_at = now()
   where id = p_post;
  perform public.admin_note(v_uid, 'board_reply', p_post,
    jsonb_build_object('target', 'board', 'reply', v_id));
  return jsonb_build_object('id', v_id);
end $$;

-- 댓글 내리기·되올리기
create or replace function public.admin_board_hide_reply(
  p_reply  bigint,
  p_hidden boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := public.require_admin();
  v_post text;
begin
  if coalesce(p_hidden, true) and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '내리는 사유를 적어 주세요.' using errcode = '22023';
  end if;
  update public.board_replies
     set hidden_at = case when coalesce(p_hidden, true) then now() else null end,
         hidden_reason = case when coalesce(p_hidden, true) then btrim(p_reason) else null end
   where id = p_reply
  returning post_id into v_post;
  if v_post is null then
    raise exception '없는 댓글입니다.' using errcode = 'P0002';
  end if;
  perform public.admin_note(v_uid,
    case when coalesce(p_hidden, true) then 'board_reply_hide' else 'board_reply_unhide' end, v_post,
    jsonb_build_object('target', 'board', 'reply', p_reply, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------------
-- 권한 — schema.sql '권한' 절의 board 줄만. 표는 닫고(RLS 켬·정책 0개) RPC만 연다.
-- ---------------------------------------------------------------------------
alter table public.board_posts    enable row level security;
alter table public.board_replies  enable row level security;
alter table public.board_votes    enable row level security;
alter table public.board_log      enable row level security;
revoke all on table public.board_posts    from anon, authenticated;
revoke all on table public.board_replies  from anon, authenticated;
revoke all on table public.board_votes    from anon, authenticated;
revoke all on table public.board_log      from anon, authenticated;
revoke all on function public.board_rate_limit(text)                   from public, anon, authenticated;
revoke all on function public.board_throttle(text)                     from public, anon, authenticated;
revoke all on function public.board_text(text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.board_key(text)                          from public, anon, authenticated;
revoke all on function public.board_tag(text)                          from public, anon, authenticated;
revoke all on function public.board_list(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.board_get(text, text)                          from public, anon, authenticated;
revoke all on function public.board_post(text, text, text, text)       from public, anon, authenticated;
revoke all on function public.board_update(text, text, text, text)     from public, anon, authenticated;
revoke all on function public.board_delete(text, text)                 from public, anon, authenticated;
revoke all on function public.board_reply(text, text, text, text)            from public, anon, authenticated;
revoke all on function public.board_reply_delete(bigint, text)         from public, anon, authenticated;
revoke all on function public.board_vote(text, boolean)                from public, anon, authenticated;
revoke all on function public.admin_board_set(text, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_board_reply(text, text)            from public, anon, authenticated;
revoke all on function public.admin_board_hide_reply(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.board_list(text, text, integer, integer) to anon, authenticated;
grant execute on function public.board_get(text, text)                        to anon, authenticated;
grant execute on function public.board_post(text, text, text, text)     to anon, authenticated;
grant execute on function public.board_update(text, text, text, text)   to anon, authenticated;
grant execute on function public.board_delete(text, text)               to anon, authenticated;
grant execute on function public.board_reply(text, text, text, text)          to anon, authenticated;
grant execute on function public.board_reply_delete(bigint, text)       to anon, authenticated;
grant execute on function public.board_vote(text, boolean)              to anon, authenticated;
grant execute on function public.admin_board_set(text, boolean, text) to authenticated;
grant execute on function public.admin_board_reply(text, text)             to authenticated;
grant execute on function public.admin_board_hide_reply(bigint, boolean, text) to authenticated;

notify pgrst, 'reload schema';
