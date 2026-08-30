# Setting up Supabase for user accounts

`login.html`, `signup.html`, and `moderator.html` are already wired up to a real Supabase project (`assets/js/supabase-client.js` holds the URL + anon key). **The SQL in this doc has not been run yet** — I have no tool that can execute SQL against your database, so every code block below needs to be pasted into your project's **SQL Editor** (left sidebar in the Supabase dashboard) and run by you. Until you do, sign-up/login will still work (Supabase Auth's `auth.users` table is built in and needs no setup), but there's no `profiles` table yet, so coins/streak/username/roles won't exist.

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick an org, name it (e.g. `the-monkey-business`), set a database password (save it somewhere — you won't need it day-to-day, but you'll want it for direct DB access later), pick a region close to Vietnam (e.g. Singapore).
3. Wait ~2 minutes for provisioning.

You get a Postgres database, plus Auth, Storage, and an auto-generated API — all free at this stage (see the free-tier limits from earlier: 500MB DB, 50k monthly active users, pauses after a week idle).

## 2. Grab your API keys

**Project Settings → API**. You'll need two values:

- **Project URL** — `https://xxxxx.supabase.co`
- **anon public key** — a long JWT. This is safe to put in client-side code (the HTML/JS your users' browsers download) *as long as Row Level Security is on* (step 5) — it can't do anything the RLS policies don't allow. (Already in `assets/js/supabase-client.js`.)

Never expose the **service_role key** (also on that page) anywhere client-side — it bypasses RLS entirely.

## 3. You don't build the users table yourself

Supabase Auth already ships with an `auth.users` table — it handles email/password storage (hashed, salted), email confirmation, password reset, sessions, etc. You never write to it directly; you call the Auth API and Supabase manages it.

**Auth → Providers**: confirm **Email** is enabled (it is by default). For local development you may want to turn off "Confirm email" under **Auth → Settings** so `signUp()` logs the user in immediately instead of waiting on a confirmation email — turn it back on before going live.

## 4. Add a `profiles` table

`auth.users` only knows about email/password/session — it has no idea about coins, streaks, usernames, or roles. The standard pattern is a second table in the public schema, linked 1:1 to `auth.users` by id.

**Run this if you haven't created the table yet:**

```sql
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
```

Every new row defaults to `coins = 0`, `streak_days = 0`, `role = 'user'` — a normal signup always starts from zero, exactly as it should.

**If you already ran the old version of this table** (without `username`/`role`), migrate instead:

```sql
alter table public.profiles add column username text unique;
alter table public.profiles add column role text not null default 'user' check (role in ('user', 'moderator'));
-- backfill existing rows before making username required, e.g.:
-- update public.profiles set username = 'user_' || substr(id::text, 1, 8) where username is null;
alter table public.profiles alter column username set not null;
```

## 5. Lock it down with Row Level Security

Without this, the anon key would let anyone read or edit anyone's row.

```sql
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Moderators (see step 8) can look up and edit anyone's row —
-- this is what powers moderator.html.
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
```

Notice there's no `insert` policy for users — profile rows get created automatically (next step), not by the client.

**Important gap this doesn't close on its own:** the "Users can update their own profile" policy above is row-level — it doesn't stop a signed-in user from calling the API directly and rewriting *their own* `coins`, `streak_days`, or `role` to anything they want. Row Level Security can't restrict individual columns, only rows. Step 6 closes this with a trigger.

## 6. Stop users from editing their own coins, streak, or role

A `before update` trigger that silently reverts those three columns back to their previous value, unless the person making the change is a moderator:

```sql
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
```

With this in place: a normal user's update request (e.g. changing `display_name` or `language`) still goes through fine, but if that same request also tried to sneak in a `coins` or `role` change, this trigger quietly discards it. Only a row where `role = 'moderator'` can change those three fields — on their own row or anyone else's.

## 7. Auto-create a profile row on signup

A trigger on `auth.users` that fires on every new signup and inserts the matching `profiles` row, pulling the username out of the signup metadata (`signup.js` sends it via `options.data.username`):

```sql
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

If someone signs up with a username that's already taken, this insert fails on the `unique` constraint, which rolls back the whole signup (no orphan auth user is left behind). `signup.js` already looks for "username" in the returned error message and shows "That username is already taken." instead of the raw Postgres error.

## 8. Moderators

There's no self-serve way to become a moderator (on purpose). Promote someone by running this once in the SQL Editor:

```sql
update public.profiles set role = 'moderator' where username = 'their_username';
```

Once promoted, they can sign in and open `moderator.html` directly (it's not in the main nav, same as the future admin/CMS area) to look up any user by username and edit their coins/streak — backed by the RLS policies and trigger above, not just a client-side check.

## Notes

- This repo is a static site (no build step, no server). Supabase is designed for exactly that — all of this runs from plain `<script>` tags, no Node backend required.
- When you're ready to add the admin/CMS side (lesson content, series, tracker calls), those become more `public.*` tables the same way — each with their own RLS policies, most of them read-only for regular users and writable only for a moderator/admin role.
- Keep the anon key out of your `.gitignore`'d local secrets mindset — it's meant to be public. What must stay secret is the service_role key and the DB password from step 1.
