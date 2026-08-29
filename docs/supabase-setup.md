# Setting up Supabase for user accounts

This walks through wiring up a real backend for `login.html` / `signup.html` — nothing here has been applied to the repo yet, since it needs your own Supabase project and API keys. Follow it when you're ready to make those forms actually work.

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick an org, name it (e.g. `the-monkey-business`), set a database password (save it somewhere — you won't need it day-to-day, but you'll want it for direct DB access later), pick a region close to Vietnam (e.g. Singapore).
3. Wait ~2 minutes for provisioning.

You get a Postgres database, plus Auth, Storage, and an auto-generated API — all free at this stage (see the free-tier limits from earlier: 500MB DB, 50k monthly active users, pauses after a week idle).

## 2. Grab your API keys

**Project Settings → API**. You'll need two values later:

- **Project URL** — `https://xxxxx.supabase.co`
- **anon public key** — a long JWT. This is safe to put in client-side code (the HTML/JS your users' browsers download) *as long as Row Level Security is on* (step 5) — it can't do anything the RLS policies don't allow.

Never expose the **service_role key** (also on that page) anywhere client-side — it bypasses RLS entirely.

## 3. You don't build the users table yourself

Supabase Auth already ships with an `auth.users` table — it handles email/password storage (hashed, salted), email confirmation, password reset, sessions, etc. You never write to it directly; you call the Auth API and Supabase manages it.

**Auth → Providers**: confirm **Email** is enabled (it is by default). For local development you may want to turn off "Confirm email" under **Auth → Settings** so `signUp()` logs the user in immediately instead of waiting on a confirmation email — turn it back on before going live.

## 4. Add a `profiles` table for app-specific data

`auth.users` only knows about email/password/session — it has no idea about coins, streaks, or display names. The standard pattern is a second table in the public schema, linked 1:1 to `auth.users` by id:

```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_choice text default 'default',
  coins integer not null default 0,
  streak_days integer not null default 0,
  best_streak_days integer not null default 0,
  language text not null default 'en', -- 'en' | 'vi'
  created_at timestamptz not null default now()
);
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
```

Notice there's no `insert` policy for users — profile rows get created automatically (next step), not by the client.

## 6. Auto-create a profile row on signup

A trigger on `auth.users` that fires on every new signup and inserts the matching `profiles` row:

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Now every signup automatically gets a `profiles` row with sensible defaults (0 coins, 0 streak) — nothing else to wire up.

## 7. Connect the login/signup pages

Add the Supabase JS client and initialize it with the values from step 2:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
  const supabase = window.supabase.createClient(
    'https://xxxxx.supabase.co',
    'YOUR_ANON_PUBLIC_KEY'
  );
</script>
```

Then handle the actual form submissions (replacing the placeholder `action="#"` forms):

```js
// signup.html
document.querySelector('.auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = e.target.email.value;
  const password = e.target.password.value;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) { /* show error.message near the form */ return; }
  window.location.href = 'index.html';
});
```

```js
// login.html
document.querySelector('.auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = e.target.email.value;
  const password = e.target.password.value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { /* show error.message near the form */ return; }
  window.location.href = 'index.html';
});
```

Reading the logged-in user elsewhere (e.g. to decide whether the sidebar shows "Log in" or the real Profile link, per the comment left in `index.html`):

```js
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  // fetch their profile: supabase.from('profiles').select('*').eq('id', session.user.id).single()
}
```

## Notes

- This repo is a static site (no build step, no server). Supabase is designed for exactly that — all of this runs from plain `<script>` tags, no Node backend required.
- When you're ready to add the admin/CMS side (lesson content, series, tracker calls), those become more `public.*` tables the same way — each with their own RLS policies, most of them read-only for regular users and writable only for an `admin` role.
- Keep the anon key out of your `.gitignore`'d local secrets mindset — it's meant to be public. What must stay secret is the service_role key and the DB password from step 1.
