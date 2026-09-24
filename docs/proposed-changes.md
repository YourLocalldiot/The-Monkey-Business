# Proposed changes: brand overhaul + auth flow overhaul

**Status: mostly built.** After this was reviewed, I implemented the "what I'd actually build" list below through item 6. What follows is the original review document, kept as-is for context, plus this status summary:

- ✅ **Done:** `profile.html` + working logout, full password-reset flow (`reset-password-request.html` + `reset-password.html`), confirm-password field on signup, resend-confirmation on login, friendlier error copy, password show/hide toggles, loading-state button labels, `first_name`/`last_name` now `not null` at the database level, the stale Panel-nav sentence in `docs/supabase-sql.md`, and the two remaining placeholder mascot SVGs (sidebar brand mark, topline avatar shortcut) swapped for the real `logo-mark.png` art.
- ⚠️ **Evaluated, not done:** the combined "wordmark inside the open mouth" logo lockup. The extracted `wordmark-arced.png` turned out to be a tall, mostly-transparent bounding box shaped to wrap inside a specific large mouth illustration — pasting it next to a small 40px face icon (the actual use case, in the auth-page header) would look broken, not composited. Forcing a bad-looking result seemed worse than leaving the current text-based wordmark (already correct font, already working) in place. A real composite needs an actual design pass, not blind pixel math.
- ⏸️ **Still open, on purpose:** item 7 (a real i18n/Vietnamese-copy decision) and the broader "copy pass" — both need your input on direction, not just my judgment call.
- **Still needs you:** the SQL in `docs/supabase-sql.md` hasn't run against the live database, and the new reset-password redirect URL needs adding in the Supabase dashboard (see that file's Notes section).

---

It covers three things: what `BRAND GUIDELINE.pptx` actually says versus what the site already does, a concrete list of brand changes worth making, and a full audit + fix plan for signup/login "working flawlessly," including the Supabase side.

---

## Part 1 — Brand guideline audit

**The good news first: colors and fonts already match exactly.** The guideline's palette slide (`#ffe8ac`, `#4d322b`, `#b9e7ec`, `#f8fdff`) is pixel-identical to the site's existing tokens in `css/styles.css`. Its font slides list several *candidate* faces per role and land on the same two the site already uses: **Disko Phonic** (one of four Head Title options shown) and **CDA Independence** (the last of five Sub Text options shown). So this isn't a "redo the visual system" situation — it's closing a smaller set of specific gaps.

### What the deck actually specifies

| Area | Guideline content |
|---|---|
| **Positioning** (slide 3) | A media channel demystifying transparent investing for young Vietnamese people. Explicitly not investment advice; the goal is building a habit of thinking before investing, revisiting your own portfolio choices after 1–2 months. — This is word-for-word what the Tracker page mockup and the site's disclaimer already do. |
| **Tagline** (slide 4) | "Cùng khỉ kiếm tiền tỉ" (roughly: "Make bank with Khỉ") — Vietnamese, not currently used anywhere on the English-copy site. |
| **Tone of voice** (slide 5) | Three pillars: **(1) Humorous/trend-aware** — talk like texting a friend, use Gen Z language/memes selectively, never forced. **(2) Radically honest** — show wrong predictions, not just wins; every claim is sourced and later checked. **(3) Peer-learning, not top-down** — "I'm figuring this out with you," not "let me teach you." |
| **Logo concept** (slides 6–11) | Mascot's mouth wide open in a big smile, with the brand wordmark set *inside* the mouth. The deck itself says the icon logo is "still being fixed" and the wordmark logo "doesn't exist yet" — so even the source material treats this as unfinished. |
| **Mascot** (slides 18–19) | Name "Nguyễn Khôn Khỉ," nickname "Khỉ ngố." Personality: pudgy, clumsy, not a finance expert — just a curious monkey who saw friends discussing investing and decided to self-teach, narrating what he learns as he goes. Shows genuine emotion: doubt at suspicious numbers, excitement at a good find, confusion at hard concepts. Catchphrase: "Khỉ thấy cái này cứ chuối chuối thế nào ấy" (a pun — *chuối* means both "banana" and, in slang, "off/weird" — a nice callback to "banamoney"). |
| **"Elements"** (slides 12–17) | This slide's only visible content is generic stock clip-art (a stack of gold dollar-sign coins) — not a specified icon system. The site's existing custom illustrated PNG icon set (home/tracker/simulator/streak/currency/profile) already reads as more on-brand than this placeholder, so I'm not treating this as a gap. |

### Images extracted from the deck

I pulled the actual embedded artwork out of the `.pptx` (it's a zip archive) and staged the useful ones at **`assets/images/brand-guideline-extracted/`** so you can look at them without reopening the deck:

- `mascot-neutral.png`, `mascot-worried.png`, `mascot-confident.png` — three official full-body expression poses of the mascot (same character, same palette as the site: brown fur, cream face/ears/belly, cyan round glasses).
- `mascot-face-openmouth.png` — a close-up face crop with the mouth wide open. **This is essentially the same artwork you originally gave me for the current favicon/logo-mark** — same character, same open-mouth logo concept — just confirming what's live already lines up with the official version.
- `wordmark-arced.png` — the "MONKEYBUSINESS" wordmark, pre-arced to curve along the inside of that open mouth. This is the one piece that doesn't exist as a usable asset on the site yet.

### Brand gaps worth closing

1. **A few hand-drawn placeholder mascot faces are still in the code.** When I first built the sidebar and topline, before you'd supplied any mascot art, I improvised simple inline-SVG monkey faces as stand-ins. Two of those never got swapped out for the real logo image the way the Home page greeting avatar did:
   - `index.html` / `simulation.html` — the sidebar `.brand-mark` (next to "The Monkey Business" wordmark)
   - `index.html` / `simulation.html` — the `.avatar-btn` in the top-right stat cluster

   **Proposed fix:** replace both with a crop of the real mascot art (`logo-mark.png`, already in use for the Home greeting, or one of the newly-extracted poses).

2. **No combined logo lockup exists** (open-mouth face + wordmark inside it), which is the deck's actual specified logo. Right now the site uses the face alone.

   **Proposed fix:** compose `mascot-face-openmouth.png` + `wordmark-arced.png` into one asset for use in larger placements — e.g. the `.auth-brand` lockup on the login/signup/moderator pages, which currently pairs the face with plain text instead of an integrated mark.

3. **No codified logo usage rules.** The deck's slide 11 gestures at "do/don't" rules but the actual annotations are vector shapes I can't cleanly extract as text. I'd propose a short, standard set instead of guessing at the deck's specifics: don't recolor the mascot outside the brand palette, don't stretch/skew it off its aspect ratio, keep a minimum clear-space margin around it equal to the height of one ear, and don't place it on a background that fails contrast against the cream face or brown fur.

4. **Copy doesn't yet reflect the specified tone.** Most existing UI copy is neutral and functional (form labels, error messages) — fine as-is, that's not where "voice" belongs. The greeting bubble and any first-person mascot lines are where it matters, and the current one already leans the right way:

   > "Morning, {name}! I **think** I finally get what a P/E ratio is. Let's find out for sure."

   That's already peer-learning voice ("I think," not "here's the answer"), which is a good sign the instinct was already correct before I'd seen the deck. I'd propose extending the same voice to a few more places once they exist — e.g. the Tracker page's "we were wrong" revisit notes (radical honesty, slide 5's pillar #2, and literally already the Tracker mockup's own design), and empty/error states site-wide, written as the mascot talking, not a system message.

5. **Open question — not something I'll decide for you:** the guideline's own copy (tagline, tone examples) is entirely in Vietnamese, for a Vietnamese Gen Z audience, but the whole site is English-only right now (the EN/VI toggle was removed a while back in favor of the theme toggle, and i18n was flagged as needing "a new home"). Matching the guideline's *voice* doesn't require matching its *language*, but it's worth deciding explicitly: is the live site meant to ship in Vietnamese, English, or both? That decision changes how much copywriting work items 4 above actually is.

---

## Part 2 — Auth flow audit ("work flawlessly")

I read every current auth-related file (`login.html`, `signup.html`, `moderator.html`, and all of `assets/js/{auth,login,signup,moderator,supabase-client}.js`) end to end. The happy path works correctly: sign up → confirm email → land on login already-authenticated → session-driven sidebar. Here's everything short of that:

| # | Gap | Why it matters |
|---|---|---|
| 1 | **There is no way to log out, anywhere on the site.** Confirmed with a repo-wide search for `signOut` — zero matches. | Once signed in, a visitor is permanently signed in on that browser. This is the single biggest thing standing between the current flow and "flawless." |
| 2 | **"Profile" links to `profile.html`, which doesn't exist.** | Clicking your own name/avatar 404s. It's the natural place to put the logout button, too. |
| 3 | **No password reset ("forgot password") flow.** | Anyone who forgets their password has no self-service recovery path. |
| 4 | **No way to resend the confirmation email.** | If someone doesn't get/loses the email, they're stuck — signing up again with the same email just errors. |
| 5 | **Signup has one password field, no confirmation field.** | A typo in the password field isn't caught until the first failed login. |
| 6 | **Login errors show Supabase's raw message verbatim,** and "email not confirmed" isn't handled specially. | Supabase's own copy ("Invalid login credentials" / "Email not confirmed") is *usable* but generic, and the unconfirmed-email case has an obvious next action (resend) that's currently a dead end. |
| 7 | **No password show/hide toggle.** | Minor, but a standard expectation now, especially on mobile. |
| 8 | **Submit buttons disable but don't change label** while a request is in flight (still says "Log in" while disabled). | Not broken, just not as clear as it could be that something's happening. |
| 9 | **`first_name`/`last_name` are required in the HTML form but not enforced at the database level.** | Same class of gap `username` had before — anyone bypassing the form (a direct API call) can currently leave them blank. |
| 10 | **`docs/supabase-sql.md`'s moderator note is stale** — it says "Panel isn't in the main nav," which was true when written but isn't anymore. | Small, but worth fixing while touching this file. |

### Proposed fixes

**1–2. Logout + a real Profile page.** Build a minimal `profile.html`: shows username, first/last name, coins, streak (read-only for now — editing those is a bigger feature), and a working **Log out** button (`supabase.auth.signOut()` → redirect to `index.html`). This single page closes gaps #1 and #2 together, and gives the "Profile" link in every sidebar something real to point at.

**3. Password reset.** Add a "Forgot password?" link on `login.html` → a new `reset-password-request.html` (email field → `supabase.auth.resetPasswordForEmail()`) → a new `reset-password.html` (the link Supabase emails lands here with a recovery session already active → new password field → `supabase.auth.updateUser({ password })` → redirect to login). Needs the same `emailRedirectTo` + Supabase dashboard allow-list treatment as the signup confirmation link.

**4. Resend confirmation.** On the login page, if a login attempt fails with Supabase's "Email not confirmed" error, show a "Resend confirmation email" action that calls `supabase.auth.resend({ type: 'signup', email })`.

**5. Confirm-password field.** Add a second password input to `signup.html`; block submission client-side (before even calling `signUp()`) if the two don't match, with an inline message.

**6. Friendlier + more specific error copy.** Keep passing through Supabase's message as a fallback, but special-case the ones with an obvious next step: "Email not confirmed" → the resend action from #4; "User already registered" → a link straight to the login page.

**7. Password visibility toggle.** A small icon button inside each password field that flips its `type` between `password`/`text`.

**8. Loading label swap.** Submit buttons read "Logging in…" / "Signing up…" while their request is in flight, reverting on error.

**9. Database-level `not null` on `first_name`/`last_name`.** Same backfill-then-constrain pattern already used for `username`/`role` in `docs/supabase-sql.md` — see Part 3.

**10. Doc fix.** Update the stale sentence in `docs/supabase-sql.md`.

### Supabase changes this implies (Part 3)

None of this needs new tables. Concretely, if approved:

- **SQL** (append to the existing idempotent migration in `docs/supabase-sql.md`): backfill any existing null `first_name`/`last_name` rows to an empty string, then `alter column ... set not null` on both — mirroring exactly what was already done for `username`.
- **Dashboard, not SQL** (same category as the existing `emailRedirectTo` note): the password-reset flow needs its own redirect URL (e.g. `.../reset-password.html`) added to **Authentication → URL Configuration → Redirect URLs**, alongside the existing `login.html` entry.
- **No RLS changes needed** — `resetPasswordForEmail`, `updateUser`, `signOut`, and `resend` are all part of the Auth API and aren't gated by the `profiles` table's policies at all.

---

## What I'd actually build, in order, if you approve

1. `profile.html` + logout (closes the biggest gap, and every other page's "Profile" link starts working)
2. Password reset flow (2 new pages + 1 login.html link)
3. Signup: confirm-password field + resend-confirmation on login + friendlier error copy
4. Small polish: password show/hide, loading labels
5. Supabase: `not null` on first/last name (SQL doc update) + the stale doc sentence
6. Brand: swap the two remaining placeholder SVG mascot faces for real art; build the combined logo lockup for the auth pages; light copy pass on the greeting/empty/error states
7. (Pending your answer on the open question above) — a real i18n pass, if you want Vietnamese copy to ship

Let me know which of these you want done, and whether to change the order.

## Keep the current pages for the navbar, and the site will be in English for now with Vietnamese addition in the future.