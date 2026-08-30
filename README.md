# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo currently holds the desktop **Home** page, plus **Log in** / **Sign up** / **Moderator tools** pages, as a static site wired to a real Supabase backend for auth — the first pieces of the site, built for review before the rest of the pages and the content/admin CMS work.

> **Keep this repo private for now.** The wordmark font (Disko Phonic) is licensed for personal use only — see `assets/fonts/README.md` before making this repo or any site built from it public.

## Structure

```
index.html               Home page
login.html                Log in (email + password)
signup.html                Sign up (username + email + password, min. 8 characters)
moderator.html              Look up a user by username, edit their coins/streak (moderator-only)
css/styles.css            Design tokens (colors, type, spacing) + all component styles
assets/fonts/              Font files — Disko Phonic + CDA Independence (see assets/fonts/README.md, incl. a licensing note)
assets/images/             Logo, favicon, and the nav/stat icon set (home, tracker, simulator, streak, currency)
assets/js/theme.js          Light/dark theme switch (localStorage + prefers-color-scheme)
assets/js/supabase-client.js  The one shared Supabase client (project URL + anon key live here)
assets/js/auth.js            Toggles the sidebar between "Log in" and "Profile" based on the real session
assets/js/login.js            Wires login.html's form to supabase.auth.signInWithPassword
assets/js/signup.js           Wires signup.html's form to supabase.auth.signUp
assets/js/moderator.js        Access-gates and drives moderator.html
docs/supabase-setup.md    Full walkthrough — the SQL in it still needs to be run in your Supabase project
```

## Planned pages

The main nav has three sections: **Home**, **Tracker**, **Simulation**. **Profile** sits separately at the bottom of the sidebar (see Design system below), alongside a **Log in** button — `assets/js/auth.js` shows whichever one actually matches the visitor's session. `tracker.html`, `simulation.html`, and `profile.html` are linked but not yet built. **Moderator tools** (`moderator.html`) intentionally isn't in the nav at all — same reasoning as the future admin/CMS area: it's a separate, non-public surface.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside.
- **Type** — **Disko Phonic** for the brand wordmark only; **CDA Independence** (Deck weights) for all headings and (Text weights) for body copy. See `assets/fonts/README.md` — it flags a licensing constraint on Disko Phonic that affects whether this repo can go public as-is.
- **Icons** — Home/Tracker/Simulation nav icons and the streak/currency (banana) stat-chip icons are the supplied illustrated PNG set (`assets/images/`), matching the palette. Profile's nav icon is still a plain inline SVG (no PNG was supplied for it).
- **Theme** — the sidebar has a Light/Dark toggle (`assets/js/theme.js`); it persists the explicit choice in `localStorage` and otherwise follows the OS `prefers-color-scheme`. All colors are CSS custom properties, so both themes are already fully styled.
- **i18n** — no language switch in the UI right now (the previous EN/VI sidebar toggle was replaced by the theme toggle above). Multi-language is still a core requirement per the brief; it needs a new home. Copy is static English only for now.
- **Account area** — Profile lives at the bottom of the sidebar (on mobile it rejoins the bottom tab bar as a 4th tab, matching the original mobile mockups) instead of in the main Home/Tracker/Simulation nav group, freeing up that spot for the Log in button. The old sidebar disclaimer ("Educational content only...") moved to the bottom of the Home page's main content instead of being dropped.

## Accounts, roles, and moderation

- Signup collects a **username** (3–24 chars, letters/numbers/underscore, must be unique) alongside email + password.
- Every new account starts at **0 coins and a 0-day streak** — enforced by the database column defaults, not just the UI.
- Two roles exist: `user` (default) and `moderator`. There's no self-serve way to become a moderator — you promote someone with a one-line SQL command (see `docs/supabase-setup.md` step 8).
- A moderator can open `moderator.html` to look up any user by username and edit their coins/streak. This is enforced by Row Level Security + a database trigger, not just a client-side check — a non-moderator's edit request is silently rejected by Postgres even if they bypass the UI entirely.

## Not yet in this repo

- **The actual SQL from `docs/supabase-setup.md` hasn't been run against the project yet** — I have no tool that can execute it for you. Until it is, sign-up/login work (Auth is built into Supabase), but there's no `profiles` table, so username/coins/streak/roles don't exist and `moderator.html` won't find anyone.
- Admin/CMS interface for managing lesson content (separate surface from the public site)
- Tracker, Simulation, Profile pages
- Native mobile app (a future phase — the design tokens here are meant to carry over)

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
