# Supabase SQL to run

Every auth/data-driven page already points at your real Supabase project (`assets/js/supabase-client.js`). Paste each query below into your project's SQL Editor and run it — I have no tool that can execute SQL against your database, so this has to be run by you.

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

## Notes

- Never expose the **service_role key** (Project Settings → API) anywhere client-side — it bypasses every RLS policy above. The **anon public key** already in `assets/js/supabase-client.js` is meant to be public.
- The CMS tables above (videos, quizzes, playlist contents) follow that pattern. Tracker calls are still to come, as more `public.*` tables with their own RLS policies.
- **Dashboard setting, not SQL:** two flows now redirect through emailed links — signup confirmation (`signup.js` → `login.html`) and password reset (`reset-password-request.js` → `reset-password.html`). **Both exact URLs** need to be added under **Authentication → URL Configuration → Redirect URLs** in the dashboard, or Supabase silently ignores them and falls back to the Site URL. This only works once the site is served over `http(s)` (a real deploy, or even a local dev server) — opening the files directly (`file://`) gives a broken redirect URL, since there's no real origin to build it from.
