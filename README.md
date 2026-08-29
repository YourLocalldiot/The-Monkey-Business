# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo currently holds the desktop **Home** page, plus standalone **Log in** / **Sign up** pages, as a static HTML/CSS mockup — the first pieces of the site, built for review before the rest of the pages and any backend/CMS work.

> **Keep this repo private for now.** The wordmark font (Disko Phonic) is licensed for personal use only — see `assets/fonts/README.md` before making this repo or any site built from it public.

## Structure

```
index.html          Home page
login.html            Log in (email + password)
signup.html           Sign up (email + password, min. 8 characters)
css/styles.css       Design tokens (colors, type, spacing) + all component styles
assets/fonts/         Font files — Disko Phonic + CDA Independence (see assets/fonts/README.md, incl. a licensing note)
assets/images/         Logo + derived favicon/avatar crops
assets/js/theme.js     Light/dark theme switch (reads + writes localStorage, no framework)
docs/supabase-setup.md Walkthrough for wiring login.html/signup.html to a real Supabase backend
```

## Planned pages

The main nav has three sections: **Home**, **Tracker**, **Simulation**. **Profile** sits separately at the bottom of the sidebar (see Design system below), alongside a **Log in** button — there's no auth yet, so it's hardcoded to always show the logged-out state. Only Home, Log in, and Sign up exist so far — `tracker.html`, `simulation.html`, and `profile.html` are linked but not yet built.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside.
- **Type** — **Disko Phonic** for the brand wordmark only; **CDA Independence** (Deck weights) for all headings and (Text weights) for body copy. See `assets/fonts/README.md` — it flags a licensing constraint on Disko Phonic that affects whether this repo can go public as-is.
- **Theme** — the sidebar has a Light/Dark toggle (`assets/js/theme.js`); it persists the explicit choice in `localStorage` and otherwise follows the OS `prefers-color-scheme`. All colors are CSS custom properties, so both themes are already fully styled.
- **i18n** — no language switch in the UI right now (the previous EN/VI sidebar toggle was replaced by the theme toggle above). Multi-language is still a core requirement per the brief; it needs a new home — worth deciding whether that's a settings/profile screen, a top-bar control, or something else before more pages are built. Copy is static English only for now.
- **Account area** — Profile now lives at the bottom of the sidebar (on mobile it rejoins the bottom tab bar as a 4th tab, matching the original mobile mockups) instead of in the main Home/Tracker/Simulation nav group, freeing up that spot for a **Log in** button. Since there's no auth wired up, the logged-out state (Log in button + generic Profile link) is hardcoded — swap it for a real session check once `docs/supabase-setup.md` is applied. The old sidebar disclaimer ("Educational content only...") moved to the bottom of the Home page's main content instead of being dropped.

## Not yet in this repo

- Admin/CMS interface for managing lesson content (separate surface from the public site)
- Tracker, Simulation, Profile pages
- A real backend — `login.html`/`signup.html` exist as UI only; see `docs/supabase-setup.md` to connect them
- Native mobile app (a future phase — the design tokens here are meant to carry over)

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
