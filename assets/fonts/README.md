# Fonts

| File | Role | Used by |
|---|---|---|
| `disko-phonic-regular.woff2` | Brand wordmark only | `--font-wordmark` (the sidebar "The Monkey Business" logotype — nowhere else) |
| `cda-independence-deck-600.woff2`, `-700.woff2` | Headings | `--font-display` |
| `cda-independence-text-400.woff2`, `-600.woff2`, `-700.woff2` | Body copy, UI labels | `--font-body` |

## ⚠️ Disko Phonic license — read before publishing

Disko Phonic is distributed under 1001Fonts' **Free-For-Personal-Use (FFP)** license (see `Disko Phonic.pdf` / the EULA in the original download). Two clauses matter here:

- **Commercial use** ("business cards, logos, advertising, websites, mobile apps for companies... anything that will generate direct or indirect income") is **not allowed without prior written permission** from the author.
- **Distribution** ("may not be sold or **published**... without written permission") also requires permission.

The Monkey Business is a commercial product, so publishing this repo (or a site built from it) publicly is technically outside the license until either:

1. you get a written commercial license from the Disko Phonic author, or
2. the wordmark is swapped for a licensed/owned alternative.

Until then, **keep this repository private.**

## Vietnamese coverage

Disko Phonic's glyph set is Latin-only — it has **no Vietnamese diacritics** (not even basic Latin-1 accents). That's why it's wired to the wordmark only (`.brand-name`, which always reads "The Monkey Business" regardless of language). Every other heading and label uses CDA Independence, which has full Vietnamese coverage — don't extend `--font-wordmark` to any translatable copy.

## Swapping fonts later

Update the `src: url(...)` in the matching `@font-face` block in `css/styles.css`. Font roles are controlled by the `--font-wordmark`, `--font-display`, and `--font-body` variables near the top of that file.
