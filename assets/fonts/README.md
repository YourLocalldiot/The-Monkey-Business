# Fonts

These files are **stand-ins**, not the brand's real typefaces:

| File | Standing in for |
|---|---|
| `kosnat-trunks-fallback-*.woff2` | Kosnat Trunks (display/title font) |
| `cda-independence-fallback-*.woff2` | CDA Independence (body font) |

They're [Baloo 2](https://fonts.google.com/specimen/Baloo+2) and [Be Vietnam Pro](https://fonts.google.com/specimen/Be+Vietnam+Pro), both under the SIL Open Font License 1.1 (free to use, modify, and redistribute — see [scripts.sil.org/OFL](https://scripts.sil.org/OFL)), subsetted to Latin + Vietnamese glyphs only.

## Swapping in the real fonts

1. Drop the real `.woff2` files in this folder.
2. In `css/styles.css`, update the `src: url(...)` line inside each `@font-face` block to point at the new files (keep the `font-family` names — `'Kosnat Trunks Fallback'` / `'CDA Independence Fallback'` — or rename them and update the `--font-display` / `--font-body` variables at the top of the same file).
3. Delete the fallback files once nothing references them.
