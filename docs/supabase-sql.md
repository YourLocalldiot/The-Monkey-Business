# Supabase SQL to run

`login.html`, `signup.html`, and `moderator.html` already point at your real Supabase project (`assets/js/supabase-client.js`). This is the SQL that project still needs — **paste the whole block below into your project's SQL Editor (left sidebar in the Supabase dashboard) and run it once.** I have no tool that can execute SQL against your database, so this has to be run by you.

Until you run it: sign-up and login already work (Supabase Auth's `auth.users` table needs no setup), but there's no `profiles` table yet, so usernames, coins, streaks, and roles don't exist — `moderator.html` won't find anyone, and the Home page's Log in/Profile toggle only knows *whether* someone is signed in, not their username or balance.

This assumes a fresh project where none of this has been run before. If you've already run an earlier version of this schema, drop the `profiles` table first (`drop table if exists public.profiles cascade;`) so this doesn't collide with it.

```sql
-- 1. The table. auth.users (built into Supabase) handles email/password;
--    this holds everything app-specific. Every row starts at 0 coins and
--    a 0-day streak — a normal signup always starts from zero.
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_choice text default 'default',
  coins integer not null default 0,
  streak_days integer not null default 0,
  best_streak_days integer not null default 0,
  language text not null default 'en', -- 'en' | 'vi'
  role text not null default 'user' check (role in ('user', 'moderator')),
  created_at timestamptz not null default now()
);

-- 2. Row Level Security: without this, the public anon key would let
--    anyone read or edit anyone's row.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Moderators can look up and edit anyone's row — this is what powers
-- moderator.html.
create policy "Moderators can view all profiles"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator')
  );

create policy "Moderators can update any profile"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator')
  );

-- 3. RLS above is row-level, not column-level: on its own it would still
--    let a normal user rewrite their OWN coins/streak/role to anything
--    they want via a direct API call. This trigger silently reverts
--    those three columns back to their old value unless the person
--    making the change already has role = 'moderator'.
create function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  caller_is_moderator boolean;
begin
  select (role = 'moderator') into caller_is_moderator
  from public.profiles where id = auth.uid();

  if not coalesce(caller_is_moderator, false) then
    new.coins := old.coins;
    new.streak_days := old.streak_days;
    new.role := old.role;
  end if;

  return new;
end;
$$;

create trigger protect_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_privileged_columns();

-- 4. Auto-create a profile row on signup, pulling the username out of
--    the signup metadata (signup.js sends it via options.data.username).
--    If the username is already taken, this insert fails on the unique
--    constraint and the whole signup rolls back — no orphan auth user
--    is left behind. signup.js already turns that into a friendly
--    "That username is already taken." message.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## Promoting a user to moderator

There's no self-serve way to do this (on purpose) — run it once per person, after they've signed up:

```sql
update public.profiles set role = 'moderator' where username = 'their_username';
```

Once promoted, they can sign in and open `moderator.html` directly (it's not in the main nav) to look up any user by username and edit their coins/streak.

## Notes

- Never expose the **service_role key** (Project Settings → API) anywhere client-side — it bypasses every RLS policy above. The **anon public key** already in `assets/js/supabase-client.js` is meant to be public.
- When the admin/CMS side gets built (lesson content, series, tracker calls), those become more `public.*` tables the same way — each with their own RLS policies.
