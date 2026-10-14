# Supabase SQL to run

Every auth/data-driven page already points at your real Supabase project (`assets/js/supabase-client.js`). Paste each query below into your project's SQL Editor and run it — I have no tool that can execute SQL against your database, so this has to be run by you.

**What still needs running?** See [`pending-supabase-sql.md`](pending-supabase-sql.md), which is updated whenever a snippet is added or changed here.

**Save as:** `profiles: schema + rls + triggers`

The table, Row Level Security, and both triggers, in one script. Every statement checks first or is written to not error on a second run, so it's safe to re-run any time (e.g. after a policy gets accidentally dropped, or in a new environment).

```sql
-- 1. Add anything missing from an earlier version of this table.
--    (first_name/last_name: no-ops if you've already added them yourself.)
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists coins integer;
alter table public.profiles add column if not exists streak_days integer;

-- 2. Backfill from signup metadata before locking the columns down.
update public.profiles p
set username = u.raw_user_meta_data ->> 'username'
from auth.users u
where p.id = u.id
  and (p.username is null or p.username = '');

update public.profiles set role = 'user' where role is null or role = '';

-- first_name/last_name are required in signup.html, but that's only
-- ever enforced client-side — a direct API call could still leave them
-- blank. Backfill any nulls to '' (same reasoning as username/role
-- above) so the not-null constraints below don't fail on old rows.
update public.profiles p
set first_name = coalesce(u.raw_user_meta_data ->> 'first_name', '')
from auth.users u
where p.id = u.id and p.first_name is null;

update public.profiles p
set last_name = coalesce(u.raw_user_meta_data ->> 'last_name', '')
from auth.users u
where p.id = u.id and p.last_name is null;

-- coins/streak_days: any pre-existing null becomes 0 (existing non-null
-- values are left alone).
update public.profiles set coins = 0 where coins is null;
update public.profiles set streak_days = 0 where streak_days is null;

-- 3. Now that nothing is null, enforce the real constraints.
alter table public.profiles alter column coins set default 0;
alter table public.profiles alter column coins set not null;
alter table public.profiles alter column streak_days set default 0;
alter table public.profiles alter column streak_days set not null;
alter table public.profiles alter column username set not null;
alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;
alter table public.profiles alter column first_name set default '';
alter table public.profiles alter column first_name set not null;
alter table public.profiles alter column last_name set default '';
alter table public.profiles alter column last_name set not null;

-- Checked directly against pg_constraint rather than caught via
-- exception: a unique constraint's backing index and a check
-- constraint raise different SQLSTATEs on collision, so "catch one
-- exception name" doesn't reliably cover both.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_key') then
    alter table public.profiles add constraint profiles_username_key unique (username);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator'));
  end if;
end $$;

-- 4. Row Level Security: without this, the public anon key would let
--    anyone read or edit anyone's row.
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Moderators can look up and edit anyone's row — this is what powers
-- moderator.html. This check can't live inline in the policy: a policy
-- on public.profiles that queries public.profiles triggers the same
-- policy again to evaluate that inner query, which triggers it again,
-- forever ("infinite recursion detected in policy for relation
-- profiles" — every query against the table, even an ordinary
-- self-lookup, has to evaluate this policy too, not just the query
-- that's obviously about moderation). A security definer function
-- sidesteps this: it runs as the function's owner (the table owner,
-- when created from the SQL Editor), which bypasses RLS entirely for
-- its own internal query, so nothing recurses.
create or replace function public.is_moderator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'moderator'
  );
$$;

drop policy if exists "Moderators can view all profiles" on public.profiles;
create policy "Moderators can view all profiles"
  on public.profiles for select
  using (public.is_moderator());

drop policy if exists "Moderators can update any profile" on public.profiles;
create policy "Moderators can update any profile"
  on public.profiles for update
  using (public.is_moderator());

-- 5. RLS above is row-level, not column-level: on its own it would still
--    let a normal user rewrite their OWN coins/streak/role to anything
--    they want via a direct API call. This trigger silently reverts
--    those three columns back to their old value unless the person
--    making the change already has role = 'moderator'.
--    auth.uid() is only non-null for requests that went through
--    Supabase's Auth layer (i.e. a real signed-in app user) — a direct
--    Postgres connection like the SQL Editor or a service_role script
--    has no JWT at all, so auth.uid() is null there. That's treated as
--    a trusted admin context and skips the restriction; it's still safe
--    because RLS already blocks a fully-anonymous API caller from
--    reaching a row in the first place, so a real end user can never
--    trigger this branch — auth.uid() is always their own id.
create or replace function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_moderator() then
    new.coins := old.coins;
    new.streak_days := old.streak_days;
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_privileged_columns on public.profiles;
create trigger protect_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_privileged_columns();

-- 6. Auto-create a profile row on signup, pulling username/first_name/
--    last_name out of the signup metadata (signup.js sends all three via
--    options.data). If the username is already taken, this insert fails
--    on the unique constraint and the whole signup rolls back — no
--    orphan auth user is left behind. signup.js already turns that into
--    a friendly "That username is already taken." message.
--    first_name/last_name are coalesced to '' — they're now not-null
--    columns, and an explicit null here (e.g. a signup whose metadata
--    is missing that key) would otherwise violate the constraint and
--    fail the whole signup, not just leave the name blank.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, first_name, last_name, coins, streak_days)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    0,
    0
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**Save as:** `profiles: promote moderator`

There's no self-serve way to become a moderator (on purpose). It's a template — swap in the real username and re-run it each time you promote someone; no need to save a new copy per person.

```sql
update public.profiles set role = 'moderator' where username = 'their_username';
```

Once promoted, they can sign in and see a **CMS** link appear in the main nav (`assets/js/auth.js` reveals it for `role = 'moderator'` only) leading to `moderator.html`, to look up any user by username and edit their coins/streak.

## Playlists (content for the Browse Playlists page)

**Run this after the `profiles` query above** — it reuses the `is_moderator()` function defined there. Matches the table you already created and inserted four rows into via the table editor; every statement is `if not exists`-guarded so it won't collide with what's already there.

**Save as:** `playlists: schema + rls`

```sql
create table if not exists public.playlists (
  playlist_id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  display_name_en text not null,
  description_en text,
  display_name_vn text,
  description_vn text,
  contents_ids uuid[],      -- unused: see "CMS" below, playlist_items replaces it
  image_url text
);

-- In case the table already existed (e.g. created via the table
-- editor UI) missing one of these — no-ops for columns you already have.
alter table public.playlists add column if not exists display_name_en text;
alter table public.playlists add column if not exists description_en text;
alter table public.playlists add column if not exists display_name_vn text;
alter table public.playlists add column if not exists description_vn text;
alter table public.playlists add column if not exists contents_ids uuid[];
alter table public.playlists add column if not exists image_url text;

alter table public.playlists enable row level security;

-- Public content: browse-playlists.html reads this without requiring
-- a login, so anyone (including a logged-out visitor) can select.
drop policy if exists "Anyone can view playlists" on public.playlists;
create policy "Anyone can view playlists"
  on public.playlists for select
  using (true);

-- Only moderators can add/edit/remove playlists (there's no content
-- editor UI yet — for now that means doing it via the table editor or
-- the SQL Editor, signed in doesn't matter for those, but this is the
-- foundation for a real admin/CMS page later).
drop policy if exists "Moderators can insert playlists" on public.playlists;
create policy "Moderators can insert playlists"
  on public.playlists for insert
  with check (public.is_moderator());

drop policy if exists "Moderators can update playlists" on public.playlists;
create policy "Moderators can update playlists"
  on public.playlists for update
  using (public.is_moderator());

drop policy if exists "Moderators can delete playlists" on public.playlists;
create policy "Moderators can delete playlists"
  on public.playlists for delete
  using (public.is_moderator());
```

`contents_ids` is no longer used: what's inside a playlist (videos, quizzes, in order) now lives in the `playlist_items` table from the CMS section below, which can point at real rows and be reordered safely. The column is left in place so nothing you set up by hand breaks; drop it whenever you like.

## CMS (the moderator page)

`moderator.html` (the **CMS** link, moderators only) edits playlists, quizzes, videos and users. Playlists and quizzes are saved through two database functions (`save_playlist`, `save_quiz`) so a save is all-or-nothing; the CMS's content tabs do nothing useful until the second query below has run. **Run both after the `profiles` and `playlists` queries above.**

### 1. Close a security hole (run this first, on its own)

**Save as:** `profiles: lock down set_profile_moderator`

Your project has a `public.set_profile_moderator(p_username text)` function (it isn't part of the queries in this file). Functions in the `public` schema are callable through the REST API by default, and this one is `security definer` and was executable by the anonymous role: anyone with the public anon key could call it and promote any username to moderator. That would also hand them the CMS. This revokes API access to it; promoting someone from the SQL Editor (the `profiles: promote moderator` query above) is unaffected.

```sql
-- public.set_profile_moderator() is SECURITY DEFINER, and by default every
-- function in the public schema can be called through the REST API by
-- anyone holding the (public) anon key. The protect_privileged_columns
-- trigger only restrains calls made by a signed-in non-moderator, so an
-- anonymous call to /rest/v1/rpc/set_profile_moderator could promote any
-- username to moderator. Promotion belongs in the SQL Editor (role
-- postgres), which this does not affect.
revoke execute on function public.set_profile_moderator(text) from public, anon, authenticated;
```

(`public.set_moderator(...)` is a leftover whose parameter name is a username that got pasted in by mistake, so it errors if called; it isn't reachable from the API, so it's harmless, but you can drop it.)

### 2. Tables, Row Level Security, and save functions

**Save as:** `cms: videos, quizzes, playlist contents`

Safe to re-run. The Supabase SQL Editor may ask you to confirm because the script contains `drop` statements (they're `drop policy if exists`, run before re-creating each policy, and dropping the old unused `quizzes.questions` column).

```sql
-- =====================================================================
-- CMS content: videos, quizzes (questions + answers), playlist contents
-- Needs is_moderator() from the profiles query, and public.playlists.
-- =====================================================================

-- 1. Tables -----------------------------------------------------------

-- Both exist already if you created them in the table editor; the
-- statements below only fill in what's missing.
create table if not exists public.videos (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  display_name_en text,
  display_name_vn text,
  youtube_link text
);

create table if not exists public.quizzes (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  display_name text
);

alter table public.videos alter column display_name_en set not null;
alter table public.videos alter column youtube_link set not null;

alter table public.quizzes add column if not exists description text;
alter table public.quizzes alter column display_name set not null;
-- Replaced by quiz_questions / quiz_options below (was an unused text[]).
alter table public.quizzes drop column if exists questions;

create table if not exists public.quiz_questions (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  position integer not null,
  prompt text not null check (btrim(prompt) <> ''),
  -- seconds; null means "no time limit"
  time_limit_seconds integer
    check (time_limit_seconds is null or time_limit_seconds between 1 and 3600)
);
create index if not exists quiz_questions_quiz_id_position_idx
  on public.quiz_questions (quiz_id, position);

-- A question is single-answer when exactly one option is_correct, and
-- "select all that apply" when several are.
create table if not exists public.quiz_options (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  question_id bigint not null references public.quiz_questions (id) on delete cascade,
  position integer not null,
  option_text text not null check (btrim(option_text) <> ''),
  is_correct boolean not null default false
);
create index if not exists quiz_options_question_id_position_idx
  on public.quiz_options (question_id, position);

-- The ordered contents of a playlist. Deleting a playlist removes its
-- rows here; a video or quiz that's still used by a playlist can't be
-- deleted (on delete restrict) so nothing disappears from a playlist by
-- accident. To add another kind of item later: add a nullable foreign-key
-- column here, extend item_type's check and the constraint below, and
-- teach save_playlist() the new type.
create table if not exists public.playlist_items (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  playlist_id bigint not null references public.playlists (playlist_id) on delete cascade,
  position integer not null,
  item_type text not null check (item_type in ('video', 'quiz')),
  video_id bigint references public.videos (id) on delete restrict,
  quiz_id bigint references public.quizzes (id) on delete restrict,
  constraint playlist_items_target_matches_type check (
    (item_type = 'video' and video_id is not null and quiz_id is null)
    or (item_type = 'quiz' and quiz_id is not null and video_id is null)
  )
);
create index if not exists playlist_items_playlist_id_position_idx
  on public.playlist_items (playlist_id, position);
create index if not exists playlist_items_video_id_idx on public.playlist_items (video_id);
create index if not exists playlist_items_quiz_id_idx on public.playlist_items (quiz_id);

-- 2. Row Level Security -------------------------------------------------
alter table public.videos         enable row level security;
alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options   enable row level security;
alter table public.playlist_items enable row level security;

-- Playlist contents are public (browse-playlists.html shows them);
-- only moderators can change them.
drop policy if exists "Anyone can view playlist items" on public.playlist_items;
create policy "Anyone can view playlist items"
  on public.playlist_items for select
  using (true);

drop policy if exists "Moderators can insert playlist items" on public.playlist_items;
create policy "Moderators can insert playlist items"
  on public.playlist_items for insert to authenticated
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can update playlist items" on public.playlist_items;
create policy "Moderators can update playlist items"
  on public.playlist_items for update to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can delete playlist items" on public.playlist_items;
create policy "Moderators can delete playlist items"
  on public.playlist_items for delete to authenticated
  using ((select public.is_moderator()));

-- Videos and quizzes: visitors can only see the ones that sit in a
-- playlist, so a half-finished quiz or a not-yet-published video stays
-- private until a moderator adds it to one. Moderators see everything.
-- (quizzes holds only the name and description; the questions and the
-- correct answers live in quiz_questions / quiz_options below, which
-- visitors cannot read at all.)
drop policy if exists "View videos that are in a playlist" on public.videos;
create policy "View videos that are in a playlist"
  on public.videos for select
  using (
    (select public.is_moderator())
    or exists (select 1 from public.playlist_items pi where pi.video_id = videos.id)
  );

drop policy if exists "Moderators can insert videos" on public.videos;
create policy "Moderators can insert videos"
  on public.videos for insert to authenticated
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can update videos" on public.videos;
create policy "Moderators can update videos"
  on public.videos for update to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can delete videos" on public.videos;
create policy "Moderators can delete videos"
  on public.videos for delete to authenticated
  using ((select public.is_moderator()));

drop policy if exists "View quizzes that are in a playlist" on public.quizzes;
create policy "View quizzes that are in a playlist"
  on public.quizzes for select
  using (
    (select public.is_moderator())
    or exists (select 1 from public.playlist_items pi where pi.quiz_id = quizzes.id)
  );

drop policy if exists "Moderators can insert quizzes" on public.quizzes;
create policy "Moderators can insert quizzes"
  on public.quizzes for insert to authenticated
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can update quizzes" on public.quizzes;
create policy "Moderators can update quizzes"
  on public.quizzes for update to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can delete quizzes" on public.quizzes;
create policy "Moderators can delete quizzes"
  on public.quizzes for delete to authenticated
  using ((select public.is_moderator()));

-- Questions and answers (including which answers are correct): moderators
-- only, for now. There is no quiz player yet; when it is built, serve
-- questions to learners through a function that leaves is_correct out
-- instead of opening these tables up.
drop policy if exists "Moderators can manage quiz questions" on public.quiz_questions;
create policy "Moderators can manage quiz questions"
  on public.quiz_questions for all to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can manage quiz options" on public.quiz_options;
create policy "Moderators can manage quiz options"
  on public.quiz_options for all to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

-- 3. Save + search functions ---------------------------------------------
-- The CMS saves a whole playlist / quiz in ONE call so it is all-or-
-- nothing (several separate requests could leave a half-saved quiz if one
-- failed). They run with the caller's own permissions (security invoker),
-- so the policies above still apply on top of the is_moderator() check.
-- Rows are matched by id and updated in place, never deleted and
-- re-inserted, so ids stay stable for anything that later points at them.

create extension if not exists unaccent with schema extensions;

create or replace function public.save_playlist(
  p_playlist_id     bigint,   -- null creates a new playlist
  p_display_name_en text,
  p_display_name_vn text,
  p_description_en  text,
  p_description_vn  text,
  p_image_url       text,
  p_items           jsonb     -- [{"id": 7, "type": "video", "ref_id": 3}, ...] in play order
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      bigint := p_playlist_id;
  v_item    jsonb;
  v_pos     integer := 0;
  v_item_id bigint;
  v_type    text;
  v_ref     bigint;
  v_keep    bigint[] := '{}';
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can edit playlists.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_display_name_en, '')) = '' then
    raise exception 'The playlist needs an English name.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'The playlist contents must be a list.';
  end if;

  if v_id is null then
    insert into public.playlists
      (display_name_en, display_name_vn, description_en, description_vn, image_url)
    values (
      btrim(p_display_name_en),
      nullif(btrim(coalesce(p_display_name_vn, '')), ''),
      nullif(btrim(coalesce(p_description_en, '')), ''),
      nullif(btrim(coalesce(p_description_vn, '')), ''),
      nullif(btrim(coalesce(p_image_url, '')), '')
    )
    returning playlist_id into v_id;
  else
    update public.playlists
       set display_name_en = btrim(p_display_name_en),
           display_name_vn = nullif(btrim(coalesce(p_display_name_vn, '')), ''),
           description_en  = nullif(btrim(coalesce(p_description_en, '')), ''),
           description_vn  = nullif(btrim(coalesce(p_description_vn, '')), ''),
           image_url       = nullif(btrim(coalesce(p_image_url, '')), '')
     where playlist_id = v_id;
    if not found then
      raise exception 'This playlist no longer exists. Reload the page and try again.';
    end if;
  end if;

  for v_item in
    select e.item from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e(item)
  loop
    v_pos  := v_pos + 1;
    v_type := v_item ->> 'type';
    v_ref  := nullif(v_item ->> 'ref_id', '')::bigint;
    if coalesce(v_type, '') not in ('video', 'quiz') or v_ref is null then
      raise exception 'Item % in the contents list is not a valid video or quiz.', v_pos;
    end if;

    v_item_id := nullif(v_item ->> 'id', '')::bigint;
    if v_item_id is not null then
      update public.playlist_items
         set position  = v_pos,
             item_type = v_type,
             video_id  = case when v_type = 'video' then v_ref end,
             quiz_id   = case when v_type = 'quiz'  then v_ref end
       where id = v_item_id and playlist_id = v_id;
      if not found then
        raise exception 'This playlist was changed by someone else. Reload the page and try again.';
      end if;
    else
      insert into public.playlist_items (playlist_id, position, item_type, video_id, quiz_id)
      values (
        v_id, v_pos, v_type,
        case when v_type = 'video' then v_ref end,
        case when v_type = 'quiz'  then v_ref end
      )
      returning id into v_item_id;
    end if;
    v_keep := v_keep || v_item_id;
  end loop;

  delete from public.playlist_items where playlist_id = v_id and id <> all (v_keep);

  return v_id;
end;
$$;

create or replace function public.save_quiz(
  p_quiz_id      bigint,   -- null creates a new quiz
  p_display_name text,
  p_description  text,
  p_questions    jsonb     -- [{"id": 4, "prompt": "...", "time_limit_seconds": 30,
                           --   "options": [{"id": 9, "text": "...", "is_correct": true}, ...]}, ...]
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id bigint := p_quiz_id;
  v_q       jsonb;
  v_o       jsonb;
  v_q_pos   integer := 0;
  v_o_pos   integer;
  v_q_id    bigint;
  v_o_id    bigint;
  v_keep_q  bigint[] := '{}';
  v_keep_o  bigint[];
  v_prompt  text;
  v_text    text;
  v_time    integer;
  v_options integer;
  v_correct integer;
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can edit quizzes.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'The quiz needs a name.';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'The quiz questions must be a list.';
  end if;

  if v_quiz_id is null then
    insert into public.quizzes (display_name, description)
    values (
      btrim(p_display_name),
      nullif(btrim(coalesce(p_description, '')), '')
    )
    returning id into v_quiz_id;
  else
    update public.quizzes
       set display_name = btrim(p_display_name),
           description  = nullif(btrim(coalesce(p_description, '')), '')
     where id = v_quiz_id;
    if not found then
      raise exception 'This quiz no longer exists. Reload the page and try again.';
    end if;
  end if;

  for v_q in
    select e.item from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) as e(item)
  loop
    v_q_pos  := v_q_pos + 1;
    v_prompt := btrim(coalesce(v_q ->> 'prompt', ''));
    v_time   := nullif(v_q ->> 'time_limit_seconds', '')::integer;

    if v_prompt = '' then
      raise exception 'Question % needs some text.', v_q_pos;
    end if;
    if jsonb_typeof(coalesce(v_q -> 'options', '[]'::jsonb)) <> 'array' then
      raise exception 'The answers of question % must be a list.', v_q_pos;
    end if;

    select count(*),
           count(*) filter (where coalesce((o.opt ->> 'is_correct')::boolean, false))
      into v_options, v_correct
      from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as o(opt);
    if v_options < 2 then
      raise exception 'Question % needs at least two answers.', v_q_pos;
    end if;
    if v_correct < 1 then
      raise exception 'Question % needs at least one correct answer.', v_q_pos;
    end if;

    v_q_id := nullif(v_q ->> 'id', '')::bigint;
    if v_q_id is not null then
      update public.quiz_questions
         set position = v_q_pos, prompt = v_prompt, time_limit_seconds = v_time
       where id = v_q_id and quiz_id = v_quiz_id;
      if not found then
        raise exception 'This quiz was changed by someone else. Reload the page and try again.';
      end if;
    else
      insert into public.quiz_questions (quiz_id, position, prompt, time_limit_seconds)
      values (v_quiz_id, v_q_pos, v_prompt, v_time)
      returning id into v_q_id;
    end if;
    v_keep_q := v_keep_q || v_q_id;

    v_o_pos  := 0;
    v_keep_o := '{}';
    for v_o in
      select e.item from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as e(item)
    loop
      v_o_pos := v_o_pos + 1;
      v_text  := btrim(coalesce(v_o ->> 'text', ''));
      if v_text = '' then
        raise exception 'Answer % of question % needs some text.', v_o_pos, v_q_pos;
      end if;

      v_o_id := nullif(v_o ->> 'id', '')::bigint;
      if v_o_id is not null then
        update public.quiz_options
           set position    = v_o_pos,
               option_text = v_text,
               is_correct  = coalesce((v_o ->> 'is_correct')::boolean, false)
         where id = v_o_id and question_id = v_q_id;
        if not found then
          raise exception 'This quiz was changed by someone else. Reload the page and try again.';
        end if;
      else
        insert into public.quiz_options (question_id, position, option_text, is_correct)
        values (v_q_id, v_o_pos, v_text, coalesce((v_o ->> 'is_correct')::boolean, false))
        returning id into v_o_id;
      end if;
      v_keep_o := v_keep_o || v_o_id;
    end loop;

    delete from public.quiz_options where question_id = v_q_id and id <> all (v_keep_o);
  end loop;

  delete from public.quiz_questions where quiz_id = v_quiz_id and id <> all (v_keep_q);

  return v_quiz_id;
end;
$$;

-- Lowercase + accent-free text for searching ("Kinh tế" -> "kinh te").
-- Accents are stripped BEFORE lowercasing so capital letters with accents
-- work whatever the database's locale is; the translate() covers the
-- Vietnamese d-with-stroke explicitly.
create or replace function public.fold_text(p_text text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select lower(unaccent(translate(coalesce(p_text, ''), 'đĐ', 'dD')));
$$;

-- Quiz search for the CMS: matches the name, the description, or the
-- text of any question, ignoring case and accents. An empty search
-- returns everything, newest first.
create or replace function public.search_quizzes(p_query text default '')
returns table (
  id bigint,
  display_name text,
  description text,
  created_at timestamptz,
  question_count integer
)
language sql
stable
set search_path = public
as $$
  with needle as (
    select public.fold_text(btrim(coalesce(p_query, ''))) as q
  )
  select
    qz.id,
    qz.display_name,
    qz.description,
    qz.created_at,
    (select count(*)::integer from public.quiz_questions qq where qq.quiz_id = qz.id)
  from public.quizzes qz, needle
  where needle.q = ''
     or strpos(public.fold_text(qz.display_name), needle.q) > 0
     or strpos(public.fold_text(qz.description), needle.q) > 0
     or exists (
       select 1 from public.quiz_questions qq
        where qq.quiz_id = qz.id
          and strpos(public.fold_text(qq.prompt), needle.q) > 0
     )
  order by qz.created_at desc, qz.id desc;
$$;

-- Signed-in users only (the RLS policies make these useless to anyone who
-- is not a moderator anyway).
revoke execute on function public.save_playlist(bigint, text, text, text, text, text, jsonb) from public, anon;
grant  execute on function public.save_playlist(bigint, text, text, text, text, text, jsonb) to authenticated;

revoke execute on function public.save_quiz(bigint, text, text, jsonb) from public, anon;
grant  execute on function public.save_quiz(bigint, text, text, jsonb) to authenticated;

revoke execute on function public.search_quizzes(text) from public, anon;
grant  execute on function public.search_quizzes(text) to authenticated;

revoke execute on function public.fold_text(text) from public, anon;
grant  execute on function public.fold_text(text) to authenticated;
```

How it fits together:

- **`playlist_items`** is the ordered contents of a playlist: each row is one video *or* one quiz (`item_type` says which, and a check constraint enforces that exactly the matching column is filled). Deleting a playlist removes its rows here; a video or quiz still sitting in a playlist can't be deleted.
- **Quizzes** are `quizzes` (name, description) → `quiz_questions` (text, `time_limit_seconds`, order) → `quiz_options` (text, `is_correct`, order). Several correct options make a question "select all that apply". The old `quizzes.questions` text array is dropped; it was empty.
- **Who can see what:** visitors can read playlists and `playlist_items`, plus any video or quiz *name* that sits in a playlist; moderators see everything. Questions, answers and the correct-answer flags are moderator-only for now (no quiz player exists yet). When one is built, hand questions to learners through a function that omits `is_correct`, rather than opening those tables.
- **Another kind of playlist item** (an article, a game, ...): add a column to `playlist_items`, extend the two `item_type` checks, and add the type to `save_playlist`. The CMS's playlist editor then needs a matching picker.
- Quiz search (`search_quizzes`, with its `fold_text` helper) uses the `unaccent` extension, so Vietnamese searches work without typing the accents.

## Your playlists (the Home page)

**Run this after the `playlists` query above** (it only needs `public.playlists`).

**Save as:** `user_playlists: schema + rls`

Which playlists each signed-in user has added with the **Add playlist** button on Browse playlists, and which one is current. Home shows the one with the latest `last_opened_at` (adding a playlist or choosing it from the Home box makes it the latest). Deleting a playlist or an account removes the matching rows. Safe to re-run.

```sql
create table if not exists public.user_playlists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  playlist_id bigint not null references public.playlists (playlist_id) on delete cascade,
  added_at timestamptz not null default now(),
  -- The playlist with the latest value is the one the Home page shows.
  last_opened_at timestamptz not null default now(),
  primary key (user_id, playlist_id)
);
create index if not exists user_playlists_playlist_id_idx
  on public.user_playlists (playlist_id);

-- Everyone, moderators included, can only see and change their own rows.
alter table public.user_playlists enable row level security;

drop policy if exists "Users can view their own playlists" on public.user_playlists;
create policy "Users can view their own playlists"
  on public.user_playlists for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add playlists for themselves" on public.user_playlists;
create policy "Users can add playlists for themselves"
  on public.user_playlists for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own playlists" on public.user_playlists;
create policy "Users can update their own playlists"
  on public.user_playlists for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their own playlists" on public.user_playlists;
create policy "Users can remove their own playlists"
  on public.user_playlists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Makes a playlist the current one on Home. Uses the database's clock, so
-- a wrong clock on someone's device can't scramble the order.
create or replace function public.open_playlist(p_playlist_id bigint)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.user_playlists
     set last_opened_at = now()
   where user_id = (select auth.uid())
     and playlist_id = p_playlist_id;
$$;

revoke execute on function public.open_playlist(bigint) from public, anon;
grant  execute on function public.open_playlist(bigint) to authenticated;
```

Until this has been run, Home keeps showing "You currently have no playlists", and **Add playlist** shows an error instead of saving.

## Vietnamese content (the language switch)

**Run this after the `cms` query above.** The site can be shown in English or Vietnamese (the switch is on the Profile page). Playlists and videos already had `display_name_vn` / `description_vn` columns; this adds the same for quizzes (name, description, each question, each answer), adds `profiles.language` so a user's choice follows them to other devices, and replaces `save_quiz` and `search_quizzes` so the CMS can save and search the Vietnamese text.

**Save as:** `i18n: vietnamese content + language`

Safe to re-run. It drops the old four-argument `save_quiz` before creating the new one, because the API can't choose between two functions with the same name.

```sql
-- =====================================================================
-- Vietnamese content + the account's language
-- Run after the cms query (it replaces save_quiz and search_quizzes).
-- =====================================================================

-- 1. Vietnamese text next to the English, for the quiz content (playlists
--    and videos already have *_vn columns). Empty means "show the English".
alter table public.quizzes        add column if not exists display_name_vn text;
alter table public.quizzes        add column if not exists description_vn  text;
alter table public.quiz_questions add column if not exists prompt_vn       text;
alter table public.quiz_options   add column if not exists option_text_vn  text;

-- 2. Which language a signed-in user picked on their Profile page, so it
--    follows them to other devices. null = no choice yet (the browser's
--    language decides). Users can change their own row, same as their name.
alter table public.profiles add column if not exists language text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table public.profiles
      add constraint profiles_language_check check (language is null or language in ('en', 'vi'));
  end if;
end $$;

-- 3. save_quiz gets two more parameters (the Vietnamese name and
--    description) and reads prompt_vn / text_vn from the questions JSON.
--    A different parameter list would create a second function of the same
--    name, which the API can't choose between, so the old one is dropped.
drop function if exists public.save_quiz(bigint, text, text, jsonb);

create or replace function public.save_quiz(
  p_quiz_id         bigint,   -- null creates a new quiz
  p_display_name    text,
  p_description     text,
  p_questions       jsonb,    -- [{"id": 4, "prompt": "...", "prompt_vn": "...", "time_limit_seconds": 30,
                              --   "options": [{"id": 9, "text": "...", "text_vn": "...", "is_correct": true}, ...]}, ...]
  p_display_name_vn text default null,
  p_description_vn  text default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id   bigint := p_quiz_id;
  v_q         jsonb;
  v_o         jsonb;
  v_q_pos     integer := 0;
  v_o_pos     integer;
  v_q_id      bigint;
  v_o_id      bigint;
  v_keep_q    bigint[] := '{}';
  v_keep_o    bigint[];
  v_prompt    text;
  v_prompt_vn text;
  v_text      text;
  v_text_vn   text;
  v_time      integer;
  v_options   integer;
  v_correct   integer;
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can edit quizzes.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'The quiz needs a name.';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'The quiz questions must be a list.';
  end if;

  if v_quiz_id is null then
    insert into public.quizzes (display_name, display_name_vn, description, description_vn)
    values (
      btrim(p_display_name),
      nullif(btrim(coalesce(p_display_name_vn, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      nullif(btrim(coalesce(p_description_vn, '')), '')
    )
    returning id into v_quiz_id;
  else
    update public.quizzes
       set display_name    = btrim(p_display_name),
           display_name_vn = nullif(btrim(coalesce(p_display_name_vn, '')), ''),
           description     = nullif(btrim(coalesce(p_description, '')), ''),
           description_vn  = nullif(btrim(coalesce(p_description_vn, '')), '')
     where id = v_quiz_id;
    if not found then
      raise exception 'This quiz no longer exists. Reload the page and try again.';
    end if;
  end if;

  for v_q in
    select e.item from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) as e(item)
  loop
    v_q_pos     := v_q_pos + 1;
    v_prompt    := btrim(coalesce(v_q ->> 'prompt', ''));
    v_prompt_vn := nullif(btrim(coalesce(v_q ->> 'prompt_vn', '')), '');
    v_time      := nullif(v_q ->> 'time_limit_seconds', '')::integer;

    if v_prompt = '' then
      raise exception 'Question % needs some text.', v_q_pos;
    end if;
    if jsonb_typeof(coalesce(v_q -> 'options', '[]'::jsonb)) <> 'array' then
      raise exception 'The answers of question % must be a list.', v_q_pos;
    end if;

    select count(*),
           count(*) filter (where coalesce((o.opt ->> 'is_correct')::boolean, false))
      into v_options, v_correct
      from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as o(opt);
    if v_options < 2 then
      raise exception 'Question % needs at least two answers.', v_q_pos;
    end if;
    if v_correct < 1 then
      raise exception 'Question % needs at least one correct answer.', v_q_pos;
    end if;

    v_q_id := nullif(v_q ->> 'id', '')::bigint;
    if v_q_id is not null then
      update public.quiz_questions
         set position = v_q_pos, prompt = v_prompt, prompt_vn = v_prompt_vn, time_limit_seconds = v_time
       where id = v_q_id and quiz_id = v_quiz_id;
      if not found then
        raise exception 'This quiz was changed by someone else. Reload the page and try again.';
      end if;
    else
      insert into public.quiz_questions (quiz_id, position, prompt, prompt_vn, time_limit_seconds)
      values (v_quiz_id, v_q_pos, v_prompt, v_prompt_vn, v_time)
      returning id into v_q_id;
    end if;
    v_keep_q := v_keep_q || v_q_id;

    v_o_pos  := 0;
    v_keep_o := '{}';
    for v_o in
      select e.item from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as e(item)
    loop
      v_o_pos   := v_o_pos + 1;
      v_text    := btrim(coalesce(v_o ->> 'text', ''));
      v_text_vn := nullif(btrim(coalesce(v_o ->> 'text_vn', '')), '');
      if v_text = '' then
        raise exception 'Answer % of question % needs some text.', v_o_pos, v_q_pos;
      end if;

      v_o_id := nullif(v_o ->> 'id', '')::bigint;
      if v_o_id is not null then
        update public.quiz_options
           set position       = v_o_pos,
               option_text    = v_text,
               option_text_vn = v_text_vn,
               is_correct     = coalesce((v_o ->> 'is_correct')::boolean, false)
         where id = v_o_id and question_id = v_q_id;
        if not found then
          raise exception 'This quiz was changed by someone else. Reload the page and try again.';
        end if;
      else
        insert into public.quiz_options (question_id, position, option_text, option_text_vn, is_correct)
        values (v_q_id, v_o_pos, v_text, v_text_vn, coalesce((v_o ->> 'is_correct')::boolean, false))
        returning id into v_o_id;
      end if;
      v_keep_o := v_keep_o || v_o_id;
    end loop;

    delete from public.quiz_options where question_id = v_q_id and id <> all (v_keep_o);
  end loop;

  delete from public.quiz_questions where quiz_id = v_quiz_id and id <> all (v_keep_q);

  return v_quiz_id;
end;
$$;

revoke execute on function public.save_quiz(bigint, text, text, jsonb, text, text) from public, anon;
grant  execute on function public.save_quiz(bigint, text, text, jsonb, text, text) to authenticated;

-- 4. Quiz search now looks in the Vietnamese text too. (Same signature as
--    before, so this simply replaces the function; its permissions stay.)
create or replace function public.search_quizzes(p_query text default '')
returns table (
  id bigint,
  display_name text,
  description text,
  created_at timestamptz,
  question_count integer
)
language sql
stable
set search_path = public
as $$
  with needle as (
    select public.fold_text(btrim(coalesce(p_query, ''))) as q
  )
  select
    qz.id,
    qz.display_name,
    qz.description,
    qz.created_at,
    (select count(*)::integer from public.quiz_questions qq where qq.quiz_id = qz.id)
  from public.quizzes qz, needle
  where needle.q = ''
     or strpos(public.fold_text(qz.display_name), needle.q) > 0
     or strpos(public.fold_text(qz.display_name_vn), needle.q) > 0
     or strpos(public.fold_text(qz.description), needle.q) > 0
     or strpos(public.fold_text(qz.description_vn), needle.q) > 0
     or exists (
       select 1 from public.quiz_questions qq
        where qq.quiz_id = qz.id
          and (strpos(public.fold_text(qq.prompt), needle.q) > 0
               or strpos(public.fold_text(qq.prompt_vn), needle.q) > 0)
     )
  order by qz.created_at desc, qz.id desc;
$$;
```

Until it has been run: the site still works (Browse playlists and Home fall back to English quiz names, and the language is remembered on the device only), but the **Quizzes tab in the CMS can't load or save**, because it now reads and writes the Vietnamese columns. Run this before opening the Quizzes tab.

## Quiz shuffling + Vietnamese for new accounts

**Run this after the `i18n: vietnamese content + language` query above** (it replaces `save_quiz` again, and `handle_new_user`). It does two things:

1. **Shuffle settings per quiz.** Adds `quizzes.shuffle_questions` and `quizzes.shuffle_answers` (the two switches in the CMS Quizzes tab, under "When the quiz is played"), and replaces `save_quiz` so it saves them. Nothing shuffles yet: there is no quiz player, so these are only stored until one is built.
2. **Vietnamese by default for new accounts.** `handle_new_user` now creates every new profile with `language = 'vi'` (and the column's default is `'vi'`). Existing accounts are not touched; anyone can still switch to English on their Profile page.

**Save as:** `quizzes: shuffle + default language`

Safe to re-run. It drops the older `save_quiz` versions first, because the API can't choose between two functions with the same name. **Don't re-run the `i18n` query after this one**: it would bring the older `save_quiz` back next to this one.

```sql
-- =====================================================================
-- Quiz shuffle settings + Vietnamese as the default language for new users
-- Run after the i18n query (it needs the *_vn columns and profiles.language).
-- =====================================================================

-- 1. Shuffle switches on each quiz (off by default).
alter table public.quizzes add column if not exists shuffle_questions boolean not null default false;
alter table public.quizzes add column if not exists shuffle_answers   boolean not null default false;

-- 2. New accounts start in Vietnamese. (A column default does not change
--    existing rows.)
alter table public.profiles alter column language set default 'vi';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, first_name, last_name, coins, streak_days, language)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    0,
    0,
    'vi'
  );
  return new;
end;
$$;

-- 3. save_quiz also saves the two shuffle switches. Older versions are
--    dropped first (see above).
drop function if exists public.save_quiz(bigint, text, text, jsonb);
drop function if exists public.save_quiz(bigint, text, text, jsonb, text, text);

create or replace function public.save_quiz(
  p_quiz_id         bigint,   -- null creates a new quiz
  p_display_name    text,
  p_description     text,
  p_questions       jsonb,    -- [{"id": 4, "prompt": "...", "prompt_vn": "...", "time_limit_seconds": 30,
                              --   "options": [{"id": 9, "text": "...", "text_vn": "...", "is_correct": true}, ...]}, ...]
  p_display_name_vn text default null,
  p_description_vn  text default null,
  p_shuffle_questions boolean default null,   -- null = leave as it is (false for a new quiz)
  p_shuffle_answers   boolean default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id   bigint := p_quiz_id;
  v_q         jsonb;
  v_o         jsonb;
  v_q_pos     integer := 0;
  v_o_pos     integer;
  v_q_id      bigint;
  v_o_id      bigint;
  v_keep_q    bigint[] := '{}';
  v_keep_o    bigint[];
  v_prompt    text;
  v_prompt_vn text;
  v_text      text;
  v_text_vn   text;
  v_time      integer;
  v_options   integer;
  v_correct   integer;
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can edit quizzes.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'The quiz needs a name.';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'The quiz questions must be a list.';
  end if;

  if v_quiz_id is null then
    insert into public.quizzes (display_name, display_name_vn, description, description_vn, shuffle_questions, shuffle_answers)
    values (
      btrim(p_display_name),
      nullif(btrim(coalesce(p_display_name_vn, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      nullif(btrim(coalesce(p_description_vn, '')), ''),
      coalesce(p_shuffle_questions, false),
      coalesce(p_shuffle_answers, false)
    )
    returning id into v_quiz_id;
  else
    update public.quizzes
       set display_name    = btrim(p_display_name),
           display_name_vn = nullif(btrim(coalesce(p_display_name_vn, '')), ''),
           description     = nullif(btrim(coalesce(p_description, '')), ''),
           description_vn  = nullif(btrim(coalesce(p_description_vn, '')), ''),
           shuffle_questions = coalesce(p_shuffle_questions, shuffle_questions),
           shuffle_answers   = coalesce(p_shuffle_answers, shuffle_answers)
     where id = v_quiz_id;
    if not found then
      raise exception 'This quiz no longer exists. Reload the page and try again.';
    end if;
  end if;

  for v_q in
    select e.item from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) as e(item)
  loop
    v_q_pos     := v_q_pos + 1;
    v_prompt    := btrim(coalesce(v_q ->> 'prompt', ''));
    v_prompt_vn := nullif(btrim(coalesce(v_q ->> 'prompt_vn', '')), '');
    v_time      := nullif(v_q ->> 'time_limit_seconds', '')::integer;

    if v_prompt = '' then
      raise exception 'Question % needs some text.', v_q_pos;
    end if;
    if jsonb_typeof(coalesce(v_q -> 'options', '[]'::jsonb)) <> 'array' then
      raise exception 'The answers of question % must be a list.', v_q_pos;
    end if;

    select count(*),
           count(*) filter (where coalesce((o.opt ->> 'is_correct')::boolean, false))
      into v_options, v_correct
      from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as o(opt);
    if v_options < 2 then
      raise exception 'Question % needs at least two answers.', v_q_pos;
    end if;
    if v_correct < 1 then
      raise exception 'Question % needs at least one correct answer.', v_q_pos;
    end if;

    v_q_id := nullif(v_q ->> 'id', '')::bigint;
    if v_q_id is not null then
      update public.quiz_questions
         set position = v_q_pos, prompt = v_prompt, prompt_vn = v_prompt_vn, time_limit_seconds = v_time
       where id = v_q_id and quiz_id = v_quiz_id;
      if not found then
        raise exception 'This quiz was changed by someone else. Reload the page and try again.';
      end if;
    else
      insert into public.quiz_questions (quiz_id, position, prompt, prompt_vn, time_limit_seconds)
      values (v_quiz_id, v_q_pos, v_prompt, v_prompt_vn, v_time)
      returning id into v_q_id;
    end if;
    v_keep_q := v_keep_q || v_q_id;

    v_o_pos  := 0;
    v_keep_o := '{}';
    for v_o in
      select e.item from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as e(item)
    loop
      v_o_pos   := v_o_pos + 1;
      v_text    := btrim(coalesce(v_o ->> 'text', ''));
      v_text_vn := nullif(btrim(coalesce(v_o ->> 'text_vn', '')), '');
      if v_text = '' then
        raise exception 'Answer % of question % needs some text.', v_o_pos, v_q_pos;
      end if;

      v_o_id := nullif(v_o ->> 'id', '')::bigint;
      if v_o_id is not null then
        update public.quiz_options
           set position       = v_o_pos,
               option_text    = v_text,
               option_text_vn = v_text_vn,
               is_correct     = coalesce((v_o ->> 'is_correct')::boolean, false)
         where id = v_o_id and question_id = v_q_id;
        if not found then
          raise exception 'This quiz was changed by someone else. Reload the page and try again.';
        end if;
      else
        insert into public.quiz_options (question_id, position, option_text, option_text_vn, is_correct)
        values (v_q_id, v_o_pos, v_text, v_text_vn, coalesce((v_o ->> 'is_correct')::boolean, false))
        returning id into v_o_id;
      end if;
      v_keep_o := v_keep_o || v_o_id;
    end loop;

    delete from public.quiz_options where question_id = v_q_id and id <> all (v_keep_o);
  end loop;

  delete from public.quiz_questions where quiz_id = v_quiz_id and id <> all (v_keep_q);

  return v_quiz_id;
end;
$$;

revoke execute on function public.save_quiz(bigint, text, text, jsonb, text, text, boolean, boolean) from public, anon;
grant  execute on function public.save_quiz(bigint, text, text, jsonb, text, text, boolean, boolean) to authenticated;
```

Until it has been run: everything still works. The two shuffle switches in the CMS are disabled (and a quiz saves without them), and new accounts get their language from the browser, as before, rather than Vietnamese.

## Quiz player: pictures, playing, leaderboard

**Run this after the `quizzes: shuffle + default language` query above.** It adds what `quiz.html` (the page Home opens for a quiz) and the CMS picture field need:

1. **A picture for each question.** `quiz_questions.image_url` (a link, not an upload). `save_quiz` is replaced so it saves it (same arguments as before, so nothing else changes).
2. **The quiz player.** Questions and answers can't be read by learners (the correct answers would leak), so playing goes through functions that never reveal `is_correct` until a question has been answered: `get_quiz_intro`, `start_quiz`, `answer_question` (grades the answer and works out the points), `finish_quiz` and `get_quiz_leaderboard`.
3. **Points.** `round(1000 × (1 − (response time ÷ question timer) × ½))` for a correct answer, 0 for a wrong one or a timeout, so 1000 for an instant answer down to 500 at the last second. A question with no time limit is played with a 30-second timer. The response time is measured in the browser and clamped to the question timer.
4. **The leaderboard.** `quiz_players` has one row per player per quiz. The leaderboard shows only **usernames and places**, never scores. Working out places needs each player's best score though, so that is kept in this table, out of reach: nobody can read or change the table through the API, and the functions only ever return places. (To not keep any number at all, places would have to be fixed forever at the moment a player finishes, and could never change when others play later.)

**Save as:** `quizzes: pictures + player + leaderboard`

Safe to re-run. **Don't re-run the older `save_quiz` queries after this one** (they would bring back a `save_quiz` that doesn't know about pictures).

```sql
-- =====================================================================
-- Quiz pictures, the quiz player and the leaderboard
-- Run after the shuffle query (it needs quizzes.shuffle_* and the *_vn columns).
-- =====================================================================

-- 1. A picture link per question (null = no picture).
alter table public.quiz_questions add column if not exists image_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_questions_image_url_check') then
    alter table public.quiz_questions
      add constraint quiz_questions_image_url_check
      check (image_url is null or (length(image_url) <= 2000 and image_url ~* '^https?://[^[:space:]]+$'));
  end if;
end $$;

-- 2. save_quiz also saves each question's picture. Same signature as the
--    shuffle version, so this simply replaces it (its permissions stay).
create or replace function public.save_quiz(
  p_quiz_id         bigint,   -- null creates a new quiz
  p_display_name    text,
  p_description     text,
  p_questions       jsonb,    -- [{"id": 4, "prompt": "...", "prompt_vn": "...", "time_limit_seconds": 30,
                              --   "options": [{"id": 9, "text": "...", "text_vn": "...", "is_correct": true}, ...]}, ...]
  p_display_name_vn text default null,
  p_description_vn  text default null,
  p_shuffle_questions boolean default null,   -- null = leave as it is (false for a new quiz)
  p_shuffle_answers   boolean default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id   bigint := p_quiz_id;
  v_q         jsonb;
  v_o         jsonb;
  v_q_pos     integer := 0;
  v_o_pos     integer;
  v_q_id      bigint;
  v_o_id      bigint;
  v_keep_q    bigint[] := '{}';
  v_keep_o    bigint[];
  v_prompt    text;
  v_prompt_vn text;
  v_text      text;
  v_text_vn   text;
  v_time      integer;
  v_image     text;
  v_options   integer;
  v_correct   integer;
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can edit quizzes.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' then
    raise exception 'The quiz needs a name.';
  end if;
  if jsonb_typeof(coalesce(p_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'The quiz questions must be a list.';
  end if;

  if v_quiz_id is null then
    insert into public.quizzes (display_name, display_name_vn, description, description_vn, shuffle_questions, shuffle_answers)
    values (
      btrim(p_display_name),
      nullif(btrim(coalesce(p_display_name_vn, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      nullif(btrim(coalesce(p_description_vn, '')), ''),
      coalesce(p_shuffle_questions, false),
      coalesce(p_shuffle_answers, false)
    )
    returning id into v_quiz_id;
  else
    update public.quizzes
       set display_name    = btrim(p_display_name),
           display_name_vn = nullif(btrim(coalesce(p_display_name_vn, '')), ''),
           description     = nullif(btrim(coalesce(p_description, '')), ''),
           description_vn  = nullif(btrim(coalesce(p_description_vn, '')), ''),
           shuffle_questions = coalesce(p_shuffle_questions, shuffle_questions),
           shuffle_answers   = coalesce(p_shuffle_answers, shuffle_answers)
     where id = v_quiz_id;
    if not found then
      raise exception 'This quiz no longer exists. Reload the page and try again.';
    end if;
  end if;

  for v_q in
    select e.item from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) as e(item)
  loop
    v_q_pos     := v_q_pos + 1;
    v_prompt    := btrim(coalesce(v_q ->> 'prompt', ''));
    v_prompt_vn := nullif(btrim(coalesce(v_q ->> 'prompt_vn', '')), '');
    v_time      := nullif(v_q ->> 'time_limit_seconds', '')::integer;
    v_image     := nullif(btrim(coalesce(v_q ->> 'image_url', '')), '');

    if v_image is not null and (length(v_image) > 2000 or v_image !~* '^https?://[^[:space:]]+$') then
      raise exception 'The picture link of question % must start with http:// or https:// and have no spaces.', v_q_pos;
    end if;

    if v_prompt = '' then
      raise exception 'Question % needs some text.', v_q_pos;
    end if;
    if jsonb_typeof(coalesce(v_q -> 'options', '[]'::jsonb)) <> 'array' then
      raise exception 'The answers of question % must be a list.', v_q_pos;
    end if;

    select count(*),
           count(*) filter (where coalesce((o.opt ->> 'is_correct')::boolean, false))
      into v_options, v_correct
      from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as o(opt);
    if v_options < 2 then
      raise exception 'Question % needs at least two answers.', v_q_pos;
    end if;
    if v_correct < 1 then
      raise exception 'Question % needs at least one correct answer.', v_q_pos;
    end if;

    v_q_id := nullif(v_q ->> 'id', '')::bigint;
    if v_q_id is not null then
      update public.quiz_questions
         set position = v_q_pos, prompt = v_prompt, prompt_vn = v_prompt_vn, time_limit_seconds = v_time,
             -- a caller that doesn't send image_url at all leaves the picture alone
             image_url = case when v_q ? 'image_url' then v_image else image_url end
       where id = v_q_id and quiz_id = v_quiz_id;
      if not found then
        raise exception 'This quiz was changed by someone else. Reload the page and try again.';
      end if;
    else
      insert into public.quiz_questions (quiz_id, position, prompt, prompt_vn, time_limit_seconds, image_url)
      values (v_quiz_id, v_q_pos, v_prompt, v_prompt_vn, v_time, v_image)
      returning id into v_q_id;
    end if;
    v_keep_q := v_keep_q || v_q_id;

    v_o_pos  := 0;
    v_keep_o := '{}';
    for v_o in
      select e.item from jsonb_array_elements(coalesce(v_q -> 'options', '[]'::jsonb)) as e(item)
    loop
      v_o_pos   := v_o_pos + 1;
      v_text    := btrim(coalesce(v_o ->> 'text', ''));
      v_text_vn := nullif(btrim(coalesce(v_o ->> 'text_vn', '')), '');
      if v_text = '' then
        raise exception 'Answer % of question % needs some text.', v_o_pos, v_q_pos;
      end if;

      v_o_id := nullif(v_o ->> 'id', '')::bigint;
      if v_o_id is not null then
        update public.quiz_options
           set position       = v_o_pos,
               option_text    = v_text,
               option_text_vn = v_text_vn,
               is_correct     = coalesce((v_o ->> 'is_correct')::boolean, false)
         where id = v_o_id and question_id = v_q_id;
        if not found then
          raise exception 'This quiz was changed by someone else. Reload the page and try again.';
        end if;
      else
        insert into public.quiz_options (question_id, position, option_text, option_text_vn, is_correct)
        values (v_q_id, v_o_pos, v_text, v_text_vn, coalesce((v_o ->> 'is_correct')::boolean, false))
        returning id into v_o_id;
      end if;
      v_keep_o := v_keep_o || v_o_id;
    end loop;

    delete from public.quiz_options where question_id = v_q_id and id <> all (v_keep_o);
  end loop;

  delete from public.quiz_questions where quiz_id = v_quiz_id and id <> all (v_keep_q);

  return v_quiz_id;
end;
$$;

-- 3. Who has played which quiz. Nobody reads or writes this table directly
--    (RLS on, no policies, no grants): the functions below do, and they only
--    ever hand out places, never scores.
create table if not exists public.quiz_players (
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Best finished score; only used to work out places. null = never finished.
  best_score integer,
  -- The run in progress (reset by start_quiz, cleared by finish_quiz).
  attempt_score integer not null default 0,
  attempt_answered bigint[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);
create index if not exists quiz_players_quiz_id_best_score_idx
  on public.quiz_players (quiz_id, best_score desc);

alter table public.quiz_players enable row level security;
revoke all on public.quiz_players from anon, authenticated;

-- 4. Place of a score among the *other* finished players: 1 + how many beat
--    it; total = other finished players + you. Internal helper (not callable
--    through the API).
create or replace function public.quiz_rank(p_quiz_id bigint, p_user uuid, p_score integer)
returns table (place integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select (1 + count(*) filter (where qp.best_score > p_score))::integer,
         (count(*) + 1)::integer
    from public.quiz_players qp
   where qp.quiz_id = p_quiz_id
     and qp.user_id <> p_user
     and qp.best_score is not null;
$$;
revoke execute on function public.quiz_rank(bigint, uuid, integer) from public, anon, authenticated;

-- 5. What the quiz page shows before the quiz starts.
create or replace function public.get_quiz_intro(p_quiz_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Log in to play this quiz.' using errcode = '28000';
  end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  -- same visibility as the quizzes table: in a playlist, or you are a moderator
  if not found or not (public.is_moderator()
        or exists (select 1 from public.playlist_items pi where pi.quiz_id = p_quiz_id)) then
    raise exception 'This quiz was not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'name', v_quiz.display_name,
    'name_vn', v_quiz.display_name_vn,
    'description', v_quiz.description,
    'description_vn', v_quiz.description_vn,
    'question_count', (select count(*) from public.quiz_questions qq where qq.quiz_id = p_quiz_id),
    'player_count', (select count(*) from public.quiz_players qp where qp.quiz_id = p_quiz_id and qp.best_score is not null)
  );
end;
$$;

-- 6. Starts a run: resets the run in progress and returns the questions
--    (answers without is_correct) plus the player's starting place.
create or replace function public.start_quiz(p_quiz_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_quiz      public.quizzes%rowtype;
  v_questions jsonb;
  v_place     integer;
  v_total     integer;
begin
  if v_uid is null then
    raise exception 'Log in to play this quiz.' using errcode = '28000';
  end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found or not (public.is_moderator()
        or exists (select 1 from public.playlist_items pi where pi.quiz_id = p_quiz_id)) then
    raise exception 'This quiz was not found.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', qq.id,
             'prompt', qq.prompt,
             'prompt_vn', qq.prompt_vn,
             'image_url', qq.image_url,
             'time_limit_seconds', coalesce(qq.time_limit_seconds, 30),
             'multiple', (select count(*) from public.quiz_options o where o.question_id = qq.id and o.is_correct) > 1,
             'options', (select coalesce(jsonb_agg(
                           jsonb_build_object('id', o.id, 'text', o.option_text, 'text_vn', o.option_text_vn)
                           order by o.position, o.id), '[]'::jsonb)
                         from public.quiz_options o where o.question_id = qq.id)
           ) order by qq.position, qq.id), '[]'::jsonb)
    into v_questions
    from public.quiz_questions qq
   where qq.quiz_id = p_quiz_id;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'This quiz has no questions yet.';
  end if;

  insert into public.quiz_players (quiz_id, user_id)
  values (p_quiz_id, v_uid)
  on conflict (quiz_id, user_id)
  do update set attempt_score = 0, attempt_answered = '{}', updated_at = now();

  select r.place, r.total into v_place, v_total from public.quiz_rank(p_quiz_id, v_uid, 0) r;

  return jsonb_build_object(
    'shuffle_questions', v_quiz.shuffle_questions,
    'shuffle_answers', v_quiz.shuffle_answers,
    'questions', v_questions,
    'place', v_place,
    'total', v_total
  );
end;
$$;

-- 7. Grades one answer. p_option_ids is what the player ticked (empty when
--    time ran out), p_seconds how long they took.
create or replace function public.answer_question(
  p_quiz_id     bigint,
  p_question_id bigint,
  p_option_ids  bigint[],
  p_seconds     numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_limit   integer;
  v_row     public.quiz_players%rowtype;
  v_correct bigint[];
  v_given   bigint[];
  v_ok      boolean;
  v_secs    numeric;
  v_points  integer;
  v_score   integer;
  v_place   integer;
  v_total   integer;
begin
  if v_uid is null then
    raise exception 'Log in to play this quiz.' using errcode = '28000';
  end if;

  select coalesce(qq.time_limit_seconds, 30) into v_limit
    from public.quiz_questions qq
   where qq.id = p_question_id and qq.quiz_id = p_quiz_id;
  if not found then
    raise exception 'This question was not found.' using errcode = 'P0002';
  end if;

  select * into v_row from public.quiz_players
   where quiz_id = p_quiz_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Start the quiz first.';
  end if;
  if p_question_id = any (v_row.attempt_answered) then
    raise exception 'You already answered this question.';
  end if;

  select coalesce(array_agg(o.id order by o.id), '{}'::bigint[]) into v_correct
    from public.quiz_options o
   where o.question_id = p_question_id and o.is_correct;
  select coalesce(array_agg(x.id order by x.id), '{}'::bigint[]) into v_given
    from (select distinct u.id from unnest(coalesce(p_option_ids, '{}'::bigint[])) as u(id)) x;

  v_ok     := cardinality(v_given) > 0 and v_given = v_correct;
  v_secs   := least(greatest(coalesce(p_seconds, v_limit), 0), v_limit);
  -- Points = round(1000 x (1 - response time / question timer x 1/2))
  v_points := case when v_ok then round(1000 * (1 - (v_secs / v_limit) * 0.5))::integer else 0 end;

  update public.quiz_players
     set attempt_score    = attempt_score + v_points,
         attempt_answered = attempt_answered || p_question_id,
         updated_at       = now()
   where quiz_id = p_quiz_id and user_id = v_uid
  returning attempt_score into v_score;

  select r.place, r.total into v_place, v_total from public.quiz_rank(p_quiz_id, v_uid, v_score) r;

  return jsonb_build_object(
    'correct', v_ok,
    'points', v_points,
    'correct_option_ids', to_jsonb(v_correct),
    'score', v_score,
    'place', v_place,
    'total', v_total
  );
end;
$$;

-- 8. Ends the run: keeps the best score (only to rank by) and returns the
--    score of this run and the player's place.
create or replace function public.finish_quiz(p_quiz_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_row   public.quiz_players%rowtype;
  v_count integer;
  v_best  integer;
  v_place integer;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'Log in to play this quiz.' using errcode = '28000';
  end if;
  select * into v_row from public.quiz_players
   where quiz_id = p_quiz_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'Start the quiz first.';
  end if;
  select count(*) into v_count from public.quiz_questions qq where qq.quiz_id = p_quiz_id;
  if cardinality(v_row.attempt_answered) < v_count then
    raise exception 'Answer every question before finishing.';
  end if;

  v_best := greatest(coalesce(v_row.best_score, 0), v_row.attempt_score);
  update public.quiz_players
     set best_score = v_best, attempt_score = 0, attempt_answered = '{}', updated_at = now()
   where quiz_id = p_quiz_id and user_id = v_uid;

  select r.place, r.total into v_place, v_total from public.quiz_rank(p_quiz_id, v_uid, v_best) r;

  return jsonb_build_object('score', v_row.attempt_score, 'place', v_place, 'total', v_total);
end;
$$;

-- 9. The leaderboard: usernames and places only. The top 10 plus the caller's
--    own row; total = everyone who has finished the quiz. Tied scores share a place.
create or replace function public.get_quiz_leaderboard(p_quiz_id bigint)
returns table (place integer, username text, is_me boolean, total integer)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select qp.user_id,
           (rank() over (order by qp.best_score desc))::integer as place,
           (count(*) over ())::integer as total
      from public.quiz_players qp
     where qp.quiz_id = p_quiz_id and qp.best_score is not null
  )
  select r.place, p.username, (r.user_id = auth.uid()), r.total
    from ranked r
    join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.place <= 10 or r.user_id = auth.uid())
   order by r.place, p.username;
$$;

-- Only signed-in users can call the player functions.
revoke execute on function public.get_quiz_intro(bigint) from public, anon;
revoke execute on function public.start_quiz(bigint) from public, anon;
revoke execute on function public.answer_question(bigint, bigint, bigint[], numeric) from public, anon;
revoke execute on function public.finish_quiz(bigint) from public, anon;
revoke execute on function public.get_quiz_leaderboard(bigint) from public, anon;
grant  execute on function public.get_quiz_intro(bigint) to authenticated;
grant  execute on function public.start_quiz(bigint) to authenticated;
grant  execute on function public.answer_question(bigint, bigint, bigint[], numeric) to authenticated;
grant  execute on function public.finish_quiz(bigint) to authenticated;
grant  execute on function public.get_quiz_leaderboard(bigint) to authenticated;
```

Until it has been run: the quiz page can't start a quiz (it says the quiz isn't available yet), and the CMS picture field is disabled.

## Quiz effects

**Run this after the `profiles` query** (it only needs `is_moderator()`). The effects a quiz plays when a player picks a right or a wrong answer: a coloured, blurred flash over the whole screen plus a text or emoji. Moderators add, edit and delete them in **CMS → Effects**; the quiz page reads them. Each effect has a kind (`correct` or `incorrect`), the text/emoji, the flash colour (`#rrggbb`) and how long the flash lasts in seconds. With several effects of one kind, the quiz picks one at random each time.

**Save as:** `quiz_effects: schema + rls + starter effects`

Safe to re-run. The two starter effects (a green ✅ for 0.8 s and a brown 💩 for 1.5 s) are only added while the table is empty, so deleting them in the CMS sticks, unless you delete **all** of them and run this again.

```sql
create table if not exists public.quiz_effects (
  id bigint generated by default as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('correct', 'incorrect')),
  -- the text or emoji flashed in the middle of the screen
  content text not null check (btrim(content) <> '' and length(content) <= 40),
  -- the colour of the full-screen flash, as #rrggbb
  color text not null check (color ~* '^#[0-9a-f]{6}$'),
  -- how long the flash lasts, in seconds
  duration_seconds numeric(4, 1) not null check (duration_seconds between 0.2 and 10)
);

alter table public.quiz_effects enable row level security;

-- Every signed-in player needs to read them; only moderators change them.
drop policy if exists "Signed-in users can view quiz effects" on public.quiz_effects;
create policy "Signed-in users can view quiz effects"
  on public.quiz_effects for select to authenticated
  using (true);

drop policy if exists "Moderators can insert quiz effects" on public.quiz_effects;
create policy "Moderators can insert quiz effects"
  on public.quiz_effects for insert to authenticated
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can update quiz effects" on public.quiz_effects;
create policy "Moderators can update quiz effects"
  on public.quiz_effects for update to authenticated
  using ((select public.is_moderator()))
  with check ((select public.is_moderator()));

drop policy if exists "Moderators can delete quiz effects" on public.quiz_effects;
create policy "Moderators can delete quiz effects"
  on public.quiz_effects for delete to authenticated
  using ((select public.is_moderator()));

-- The two starter effects, only while there are none.
insert into public.quiz_effects (kind, content, color, duration_seconds)
select v.kind, v.content, v.color, v.duration_seconds
  from (values
    ('correct',   '✅', '#3fb56a', 0.8),
    ('incorrect', '💩', '#7b4a2a', 1.5)
  ) as v (kind, content, color, duration_seconds)
 where not exists (select 1 from public.quiz_effects);
```

Until it has been run: quizzes still flash those same two starter effects (they are built in as a fallback), but **CMS → Effects** can't load or save anything.

## Notes

- Never expose the **service_role key** (Project Settings → API) anywhere client-side — it bypasses every RLS policy above. The **anon public key** already in `assets/js/supabase-client.js` is meant to be public.
- The CMS tables above (videos, quizzes, playlist contents) follow that pattern. Tracker calls are still to come, as more `public.*` tables with their own RLS policies.
- **Dashboard setting, not SQL:** two flows now redirect through emailed links — signup confirmation (`signup.js` → `login.html`) and password reset (`reset-password-request.js` → `reset-password.html`). **Both exact URLs** need to be added under **Authentication → URL Configuration → Redirect URLs** in the dashboard, or Supabase silently ignores them and falls back to the Site URL. This only works once the site is served over `http(s)` (a real deploy, or even a local dev server) — opening the files directly (`file://`) gives a broken redirect URL, since there's no real origin to build it from.
