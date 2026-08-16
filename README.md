# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo currently holds the desktop **Home** page as a static HTML/CSS mockup — the first piece of the site, built for review before the rest of the pages and any backend/CMS work.

> **Keep this repo private for now.** The wordmark font (Disko Phonic) is licensed for personal use only — see `assets/fonts/README.md` before making this repo or any site built from it public.

## Structure

```
index.html          Home page
css/styles.css       Design tokens (colors, type, spacing) + all component styles
assets/fonts/         Font files — Disko Phonic + CDA Independence (see assets/fonts/README.md, incl. a licensing note)
```

## Planned pages

The main nav has four sections: **Home**, **Tracker**, **Simulation**, **Profile**. Only Home exists so far — `tracker.html`, `simulation.html`, and `profile.html` are linked from the nav but not yet built.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside.
- **Type** — **Disko Phonic** for the brand wordmark only; **CDA Independence** (Deck weights) for all headings and (Text weights) for body copy. See `assets/fonts/README.md` — it flags a licensing constraint on Disko Phonic that affects whether this repo can go public as-is.
- **i18n** — the sidebar has an EN/VI language toggle in place; no actual translation wiring yet (static English copy only).

## Not yet in this repo

- Admin/CMS interface for managing lesson content (separate surface from the public site, not part of the 4-item nav)
- Tracker, Simulation, Profile pages
- Any backend, data, or auth
- Native mobile app (a future phase — the design tokens here are meant to carry over)

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
