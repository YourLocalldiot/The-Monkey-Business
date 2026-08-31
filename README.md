# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo currently holds the desktop **Home** and **Simulation** pages, plus **Log in** / **Sign up** / **Moderator tools** pages, as a static site wired to a real Supabase backend for auth — the first pieces of the site, built for review before the rest of the pages and the content/admin CMS work.

> **Keep this repo private for now.** The wordmark font (Disko Phonic) is licensed for personal use only — see `assets/fonts/README.md` before making this repo or any site built from it public.

## Structure

```
index.html               Home page
simulation.html            Paper-trading stock simulator (banana-coins, sandboxed — see Design system)
login.html                Log in (email + password)
signup.html                Sign up (username + email + password, min. 8 characters)
moderator.html              Look up a user by username, edit their coins/streak (moderator-only)
css/styles.css            Design tokens (colors, type, spacing) + all component styles
assets/fonts/              Font files — Disko Phonic + CDA Independence (see assets/fonts/README.md, incl. a licensing note)
assets/images/             Logo, favicon, and the nav/stat icon set (home, tracker, simulator, streak, currency, profile)
assets/js/theme.js          Light/dark theme switch (localStorage + prefers-color-scheme)
assets/js/supabase-client.js  The one shared Supabase client (project URL + anon key live here)
assets/js/auth.js            Session-driven UI: Log in/Profile toggle, moderator-only Panel link, Home's greeting name
assets/js/login.js            Wires login.html's form to supabase.auth.signInWithPassword
assets/js/signup.js           Wires signup.html's form to supabase.auth.signUp
assets/js/moderator.js        Access-gates and drives moderator.html
assets/js/simulation.js       Drives simulation.html — its own localStorage state, no backend involved
docs/supabase-sql.md     The SQL to run in your Supabase project (table, RLS, triggers) — not run yet
```

## Planned pages

The main nav has three sections: **Home**, **Tracker**, **Simulation**, plus a fourth, **Panel**, that only moderators ever see (`assets/js/auth.js` checks the signed-in user's `role` and reveals it). **Profile** sits separately at the bottom of the sidebar (see Design system below), alongside a **Log in** button — `assets/js/auth.js` shows whichever one actually matches the visitor's session. `tracker.html` and `profile.html` are linked but not yet built. **Panel** links to `moderator.html`, which still isn't a real "page" in its own right — same reasoning as the future admin/CMS area, it's a separate, non-public surface, just now reachable from the nav for the one role that needs it.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside.
- **Type** — **Disko Phonic** for the brand wordmark only; **CDA Independence** (Deck weights) for all headings and (Text weights) for body copy. See `assets/fonts/README.md` — it flags a licensing constraint on Disko Phonic that affects whether this repo can go public as-is.
- **Icons** — Home/Tracker/Simulation/Profile nav icons (28px) and the streak/currency (banana) stat-chip icons are all the supplied illustrated PNG set (`assets/images/`), matching the palette. Panel has no supplied asset, so it's a plain inline SVG (shield/check) sized the same as the rest via the shared `.nav-icon` class.
- **Theme** — the sidebar has a Light/Dark toggle (`assets/js/theme.js`); it persists the explicit choice in `localStorage` and otherwise follows the OS `prefers-color-scheme`. All colors are CSS custom properties, so both themes are already fully styled.
- **i18n** — no language switch in the UI right now (the previous EN/VI sidebar toggle was replaced by the theme toggle above). Multi-language is still a core requirement per the brief; it needs a new home. Copy is static English only for now.
- **Account area** — Profile lives at the bottom of the sidebar (on mobile it rejoins the bottom tab bar as a 4th tab, matching the original mobile mockups) instead of in the main Home/Tracker/Simulation nav group, freeing up that spot for the Log in button. The old sidebar disclaimer ("Educational content only...") moved to the bottom of the Home page's main content instead of being dropped.

## Accounts, roles, and moderation

- Signup collects **first name, last name, username** (3–24 chars, letters/numbers/underscore, must be unique), email, and password.
- Every new account starts at **0 coins and a 0-day streak** — enforced by the database column defaults, not just the UI.
- The confirmation email links to `login.html` (`emailRedirectTo` in `signup.js`), not Supabase's default page — this needs the matching URL added under Auth → URL Configuration → Redirect URLs in the dashboard, see `docs/supabase-sql.md`. Landing on `login.html` already signed in (from that link) skips straight to Home instead of showing a login form.
- Once signed in, the Home page greeting uses the real first name (`assets/js/auth.js` fetches it and rewrites the speech bubble) instead of the static placeholder.
- Two roles exist: `user` (default) and `moderator`. There's no self-serve way to become a moderator — you promote someone with a one-line SQL command (see `docs/supabase-sql.md`).
- A moderator sees a **Panel** link in the main nav (everyone else doesn't) leading to `moderator.html`, to look up any user by username and edit their coins/streak. This is enforced by Row Level Security + a database trigger, not just a client-side check — a non-moderator's edit request is silently rejected by Postgres even if they bypass the UI entirely.

## Simulation (paper trading)

- `simulation.html` is a small stock-trading game: four companies (reusing the names from the Tracker mockup — Vinamilk, FPT, Hoa Phat, Mobile World) with prices in 🍌 banana-coins that move when you click "Next day." Buy/sell, watch a sparkline, track net worth and P&L.
- Its starting 🍌10,000 balance and all holdings live in `localStorage` (`assets/js/simulation.js`), **not** in Supabase and **not** the same balance as the real "coins" shown elsewhere in the app. That's deliberate, not a shortcut: the real `profiles.coins` column is locked by the anti-cheat trigger in `docs/supabase-sql.md` so users can't self-edit it, and a trading game needs to freely add/subtract balance on every trade. Keeping it sandboxed avoids reopening that hole.
- "Reset simulation" wipes the local save and starts over at day 1 — it never touches a real account.

## Not yet in this repo

- **`docs/supabase-sql.md` needs a re-run after every pull that touches it** (like this one — the `handle_new_user` trigger changed to also copy first/last name) — I have no tool that can execute SQL against the project, so schema/trigger changes in this repo don't reach your actual database until you paste and run them yourself.
- Admin/CMS interface for managing lesson content (separate surface from the public site)
- Tracker, Profile pages
- Native mobile app (a future phase — the design tokens here are meant to carry over)

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
