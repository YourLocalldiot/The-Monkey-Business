# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo currently holds the desktop **Home** page as a static HTML/CSS mockup — the first piece of the site, built for review before the rest of the pages and any backend/CMS work.

## Structure

```
index.html          Home page
css/styles.css       Design tokens (colors, type, spacing) + all component styles
assets/fonts/         Font files (see assets/fonts/README.md — currently stand-ins)
```

## Planned pages

The main nav has four sections: **Home**, **Tracker**, **Games**, **Profile**. Only Home exists so far — `tracker.html`, `games.html`, and `profile.html` are linked from the nav but not yet built.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside.
- **Type** — display headings use a rounded, friendly face (stand-in for **Kosnat Trunks**); body text uses a clean humanist face designed for Vietnamese (stand-in for **CDA Independence**). See `assets/fonts/README.md` to swap in the real files.
- **i18n** — the sidebar has an EN/VI language toggle in place; no actual translation wiring yet (static English copy only).

## Not yet in this repo

- Admin/CMS interface for managing lesson content (separate surface from the public site, not part of the 4-item nav)
- Tracker, Games, Profile pages
- Any backend, data, or auth
- Native mobile app (a future phase — the design tokens here are meant to carry over)

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
