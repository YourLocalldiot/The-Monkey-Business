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

-- 3. Now that nothing is null, enforce the real constraints.
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
  insert into public.profiles (id, username, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
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

Once promoted, they can sign in and see a **Panel** link appear in the main nav (`assets/js/auth.js` reveals it for `role = 'moderator'` only) leading to `moderator.html`, to look up any user by username and edit their coins/streak.

## Playlists (content for the Browse Playlists page)

**Run this after the `profiles` query above** — it reuses the `is_moderator()` function defined there. Matches the table you already created and inserted four rows into via the table editor; every statement is `if not exists`-guarded so it won't collide with what's already there.

**Save as:** `playlists: schema + rls`

```sql
create table if not exists public.playlists (
  playlist_id integer generated by default as identity primary key,
  created_at timestamptz not null default now(),
  display_name_en text not null,
  description_en text,
  display_name_vn text,
  description_vn text,
  contents_ids integer[],
  image_url text
);

-- In case the table already existed (e.g. created via the table
-- editor UI) missing one of these — no-ops for columns you already have.
alter table public.playlists add column if not exists display_name_en text;
alter table public.playlists add column if not exists description_en text;
alter table public.playlists add column if not exists display_name_vn text;
alter table public.playlists add column if not exists description_vn text;
alter table public.playlists add column if not exists contents_ids integer[];
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

`contents_ids` is left as a plain `integer[]` for now, per "contents ids... add later" — every row in your sample insert has it `null`, and `browse-playlists.html` already handles that (shows "Contents coming soon." instead of a list). When actual content rows/tables exist, this becomes a real foreign-key relationship instead of a bare array.

## Notes

- Never expose the **service_role key** (Project Settings → API) anywhere client-side — it bypasses every RLS policy above. The **anon public key** already in `assets/js/supabase-client.js` is meant to be public.
- When the admin/CMS side gets built (lesson content, series, tracker calls), those become more `public.*` tables the same way — each with their own RLS policies.
- **Dashboard setting, not SQL:** two flows now redirect through emailed links — signup confirmation (`signup.js` → `login.html`) and password reset (`reset-password-request.js` → `reset-password.html`). **Both exact URLs** need to be added under **Authentication → URL Configuration → Redirect URLs** in the dashboard, or Supabase silently ignores them and falls back to the Site URL. This only works once the site is served over `http(s)` (a real deploy, or even a local dev server) — opening the files directly (`file://`) gives a broken redirect URL, since there's no real origin to build it from.
