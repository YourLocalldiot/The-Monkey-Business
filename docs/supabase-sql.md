# Supabase SQL to run

`login.html`, `signup.html`, `moderator.html`, and `simulation.html` already point at your real Supabase project (`assets/js/supabase-client.js`). This is the SQL that project still needs — **paste the whole block below into your project's SQL Editor (left sidebar in the Supabase dashboard) and run it once.** I have no tool that can execute SQL against your database, so this has to be run by you.

## What's already there, from your `profiles_rows.csv` export

You've already got a `profiles` table with real signups in it — this is written as a **migration**, not a from-scratch setup, and won't touch existing rows beyond the fixes below. Comparing your export against the intended schema:

| Column | Status |
|---|---|
| `id`, `display_name`, `avatar_choice`, `coins`, `streak_days`, `best_streak_days`, `created_at` | Fine as-is — no changes needed. |
| `username` | **Needs fixing.** Column exists but is empty on both existing rows, and has no `unique`/`not null` constraint — so nothing stops a duplicate or a signup with no username at all. |
| `role` | **Needs fixing.** Same issue — empty on both rows, no default, no constraint limiting it to `'user'`/`'moderator'`. |
| `language` | **Missing entirely.** Not required right now (nothing in the app reads/writes it yet — i18n isn't wired up). Optional add-on at the bottom if you want it ready for later. |

The block below fixes `username` and `role` by backfilling from `display_name` (both your existing rows already have display_name values that look like the intended username — double check them, and update manually first if either looks wrong) and then locking the constraints down. It's safe to run even if some of it was already applied — every statement either checks first or is written to not error on a second run.

```sql
-- 1. Add anything missing from an earlier version of this table.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists role text;

-- 2. Backfill existing rows before locking the columns down.
--    Uses display_name as the source since your two existing rows
--    already hold username-shaped values there.
update public.profiles set username = display_name where username is null or username = '';
update public.profiles set role = 'user' where role is null or role = '';

-- 3. Now that nothing is null, enforce the real constraints.
alter table public.profiles alter column username set not null;
alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;

do $$ begin
  alter table public.profiles add constraint profiles_username_key unique (username);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator'));
exception when duplicate_object then null;
end $$;

-- 4. Row Level Security: without this, the public anon key would let
--    anyone read or edit anyone's row. Safe to re-run.
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
-- moderator.html.
drop policy if exists "Moderators can view all profiles" on public.profiles;
create policy "Moderators can view all profiles"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator')
  );

drop policy if exists "Moderators can update any profile" on public.profiles;
create policy "Moderators can update any profile"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'moderator')
  );

-- 5. RLS above is row-level, not column-level: on its own it would still
--    let a normal user rewrite their OWN coins/streak/role to anything
--    they want via a direct API call. This trigger silently reverts
--    those three columns back to their old value unless the person
--    making the change already has role = 'moderator'.
create or replace function public.protect_privileged_columns()
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

drop trigger if exists protect_privileged_columns on public.profiles;
create trigger protect_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_privileged_columns();

-- 6. Auto-create a profile row on signup, pulling the username out of
--    the signup metadata (signup.js sends it via options.data.username).
--    If the username is already taken, this insert fails on the unique
--    constraint and the whole signup rolls back — no orphan auth user
--    is left behind. signup.js already turns that into a friendly
--    "That username is already taken." message.
create or replace function public.handle_new_user()
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## Optional: add `language` back

Nothing reads or writes this yet (the sidebar's EN/VI toggle from early on was replaced by the theme switch, and multi-language still needs a real home — see the main README). Add it whenever that gets built:

```sql
alter table public.profiles add column if not exists language text not null default 'en';
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
