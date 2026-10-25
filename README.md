# The Monkey Business

Khỉ's own online diary — a platform teaching Vietnamese high schoolers investing and economics through video playlists and games. Learn and practice freely, zero judgment: Khỉ is a friend, not a teacher.

This repo holds the desktop **Home**, **Simulation**, and **Profile** pages, plus a full **Log in / Sign up / Reset password** auth flow and a moderator-only **CMS**, as a static site wired to a real Supabase backend — the first pieces of the site, built for review before the rest of the pages and the content/admin CMS work.

> **Keep this repo private for now.** The wordmark font (Disko Phonic) is licensed for personal use only — see `assets/fonts/README.md` before making this repo or any site built from it public.

## Structure

```
index.html                    Home page
simulation.html                 Trading Simulation: paper-trading stock game (banana-coins, sandboxed — see Design system)
browse-playlists.html           Every playlist from the public.playlists table, as expandable rows
marketplace.html                Stub page — "coming soon," not just a dead nav link
profile.html                    Signed-in user's own page: name, stats, log out
login.html                      Log in (email + password), "Forgot password?", resend confirmation
signup.html                     Sign up (first/last name + username + email + password + confirm password)
reset-password-request.html       Request a password reset email
reset-password.html               Set a new password (the link from that email lands here)
moderator.html                  CMS (moderator-only): edit playlists, quizzes and videos; look up a user and edit their coins/streak
video.html                      Watch page: [x] back to Home + video name in a top bar, the YouTube player, a "Next" button (opened from Home's path)
quiz.html                       Quiz page: intro (name, description, leaderboard), 3-2-1 countdown, one question at a time with a timer, results
css/styles.css                 Design tokens (colors, type, spacing) + all component styles
assets/fonts/                   Font files — Disko Phonic + CDA Independence (see assets/fonts/README.md, incl. a licensing note)
assets/images/                  Logo, favicon, and the nav/stat icon set (home, tracker, simulator, streak, currency, profile, marketplace, files)
assets/images/brand-guideline-extracted/  Official mascot/wordmark art pulled out of BRAND GUIDELINE.pptx, for reference
assets/js/theme.js               Light/dark theme (localStorage + prefers-color-scheme); the switch itself is on the Profile page
assets/js/i18n.js                English/Vietnamese: picks the language, translates data-i18n text, I18N.t() / I18N.pick() for scripts
assets/js/i18n-strings.js        Every piece of text in both languages (the dictionary)
assets/js/lang-switch.js        The language switch shown on every page (top bar, auth pages or sidebar); saves the choice on the account when signed in
assets/js/guest.js              The id a guest's browser keeps, the name they last chose, and moving a guest's quiz results onto the account after login (claim_guest_results)
scripts/check-i18n.py            Checks the dictionary against the pages and scripts (run it after changing any text)
assets/js/supabase-client.js     The one shared Supabase client (project URL + anon key live here)
assets/js/auth.js                Session-driven UI: Log in/Profile toggle, moderator-only CMS link, Home's greeting name
assets/js/password-toggle.js     Show/hide button wiring, shared by every password field on the site
assets/js/login.js               Wires login.html: sign-in, "email not confirmed" resend, loading state
assets/js/signup.js              Wires signup.html: checks every field, username availability, every failure with its own message, then sends the user to the login page
assets/js/auth-errors.js        Turns Supabase Auth errors into messages in the page's language (used by sign-up, login and the reset pages)
assets/js/profile.js             Loads the signed-in user's profile row; the username / display name forms (each changeable once a week); the Log out button
assets/js/reset-password-request.js  Sends the reset email
assets/js/reset-password.js      Validates the recovery session, sets the new password
assets/js/moderator.js           CMS shell: access gate, tabs, and the helpers the section scripts share
assets/js/moderator-playlists.js CMS > Playlists: details + the ordered videos/quizzes inside, saved through save_playlist()
assets/js/moderator-quizzes.js   CMS > Quizzes: search; name, description, questions (with an optional picture: a link or an upload), answers, correct answers, time limits, shuffle switches, EXP/banana rewards, CSV bulk add; saved through save_quiz()
assets/js/moderator-videos.js    CMS > Videos: the video library (names + YouTube link + EXP/banana rewards)
assets/js/moderator-effects.js  CMS > Effects: the correct / incorrect flashes a quiz plays (type, text or emoji, colour, flash time), with a preview
assets/js/moderator-podium.js   CMS > Podium talk: the emojis and phrases a top-3 player can choose to say in the leaderboard's speech bubble
assets/js/effects.js            Plays an effect (a coloured blur flash over the screen + a text/emoji) and loads them from quiz_effects
assets/js/ui.js                 The site's own notifications: toasts, confirm dialog, form-validation messages (replace the browser's)
assets/js/quiz-import.js        Reads the quiz template CSV and validates it for the CMS Quizzes tab
assets/templates/               TheMonkeyBusinessQuizTemplate.csv, the downloadable template for bulk-adding quiz questions
assets/js/sidebar.js            Expand/collapse button for the navigation sidebar (remembered per device)
assets/js/loader.js             Loading screen (looping animation + "Web guy is an idiot") shown while a page's images, scripts and fonts are still loading
assets/js/video.js              Loads the video for video.html and embeds it; "Next" unlocks once it has been watched, records it as finished and offers the EXP/banana reward to claim
assets/js/next-piece.js         Finds the piece after this one in the playlist (from ?playlist=, else the player's current playlist), for "Continue" after a video or quiz
assets/js/quiz.js               Plays a quiz (signed in, or as a guest on an Anonymous quiz) through the database's start_quiz / answer_question / finish_quiz / claim_quiz_reward functions (points = round(1000 x (1 - response time / timer x 1/2)); leaderboard shows usernames, places and, for the top 3, a speech bubble with what they chose to say)
assets/js/moderator-users.js     CMS > Users: search usernames, pick a user, edit their bananas (coins) and streak
assets/js/simulation.js          Drives simulation.html — its own localStorage state, no backend involved
assets/js/browse-playlists.js    Fetches public.playlists (and their contents), renders the expandable rows, wires "Add playlist"
assets/js/home.js                Home: the current-playlist box (from user_playlists) and the path of pieces under it (grey until finished, coloured after)
docs/supabase-sql.md           The SQL to run in your Supabase project (profiles, playlists, the CMS tables and user playlists: schema, RLS, triggers, functions)
docs/pending-supabase-sql.md   Which of those snippets haven't been run yet (kept in step with supabase-sql.md; you confirm what's been run)
docs/proposed-changes.md       Standing review doc for the brand/auth overhaul — most of it has now been built; see its own status
```

## Planned pages

The main nav has **Home**, **Tracker**, **Trading Simulation**, **Browse playlists**, **Marketplace**, plus a sixth, **CMS**, that only moderators ever see (`assets/js/auth.js` checks the signed-in user's `role` and reveals it). **Profile** sits separately at the bottom of the sidebar (see Design system below), alongside a **Log in** button — `assets/js/auth.js` shows whichever one actually matches the visitor's session. `tracker.html` is a blank "coming soon" placeholder, like Marketplace. **CMS** links to `moderator.html` (see below); it's a separate, non-public surface, so only moderators ever see the link.

## Design system

- **Colors** — `#4d322b` ink, `#ffe8ac` cream, `#b9e7ec` sky, `#f8fdff` paper, plus a `#e79b34` honey accent for primary actions. All defined as CSS custom properties in `css/styles.css`, with a dark-mode palette alongside. Confirmed pixel-identical to `BRAND GUIDELINE.pptx`'s palette slide — see `docs/proposed-changes.md`.
- **Type** — **Disko Phonic** for the brand wordmark only; **CDA Independence** (Deck weights) for all headings and (Text weights) for body copy. Both are explicitly named in the brand guideline too. See `assets/fonts/README.md` — it flags a licensing constraint on Disko Phonic that affects whether this repo can go public as-is.
- **Icons** — Home/Tracker/Trading Simulation/Profile/Marketplace/Browse-playlists nav icons (28px) and the streak/currency (banana) stat-chip icons are all the supplied illustrated PNG set (`assets/images/`), matching the palette — Marketplace and Browse playlists reuse `marketplace.png` and `files.png`, which were already sitting in the folder unused rather than needing new placeholders. CMS has no supplied asset, so it's a plain inline SVG (shield/check) sized the same as the rest via the shared `.nav-icon` class. The sidebar brand mark and the topline avatar shortcut both use the real mascot art (`assets/images/logo-mark.png`) rather than the placeholder inline-SVG faces they started as.
- **Theme** — a Light/Dark toggle on the Profile page (`assets/js/theme.js`); it persists the explicit choice in `localStorage` and otherwise follows the OS `prefers-color-scheme`. All colors are CSS custom properties, so both themes are already fully styled.
- **i18n** — English and Vietnamese, switched on the Profile page; see "Languages" below.
- **Home's empty state** — the static "Series 2 · Reading a business" lesson demo (continue-card + trail) is commented out in `index.html`, not deleted — search for "Saved for later" there. In its place: "You currently have no playlists" + a button to Browse playlists, matching the reference screenshot's style but with this site's own palette/components, not its indigo theme. That box now only shows for someone with no playlists (or a visitor who isn't signed in); once a user has added one, Home shows the current-playlist box instead (see Your playlists below).
- **Account area** — Profile lives at the bottom of the sidebar (on mobile it rejoins the bottom tab bar as a 4th tab, matching the original mobile mockups) instead of in the main Home/Tracker/Simulation nav group, freeing up that spot for the Log in button. It now leads to a real `profile.html` (name, stats, Log out) instead of a dead link. The old "Educational content only..." disclaimer that used to sit under Home's content has since been removed.

- **Social links** — the right-hand column (Home, Profile, Simulation) ends with five round icon buttons linking to the project's Facebook, Instagram, TikTok, YouTube and GitHub. They're spread across the full width of the column (the outer buttons line up with the cards above), open in a new tab, are 44px for easy tapping, and wrap on very narrow screens. The icons are plain inline SVG outlines, drawn in the same line style as the Lucide icon set (ISC licence); the links live in the `.rail-footer` block repeated at the end of each page's `.rail`.
- **Mobile nav** — at phone width the sidebar becomes a bottom tab bar of icons only (no text labels, like most mobile learning apps); the current page gets a boxed highlight. The labels are still in the markup, just hidden with `font-size: 0`, so screen readers announce them.

## Accounts, roles, and moderation

- Signup collects **first name, last name, username** (3–24 chars, letters/numbers/underscore, must be unique), email, and a password typed twice (with a mismatch caught before the account is even created).
- Every new account starts at **0 coins and a 0-day streak** — enforced by the database column defaults, not just the UI.
- Every password field (login, signup, reset) has a show/hide toggle (`assets/js/password-toggle.js`).
- The confirmation email links to `login.html` (`emailRedirectTo` in `signup.js`), not Supabase's default page — this needs the matching URL added under Auth → URL Configuration → Redirect URLs in the dashboard, see `docs/supabase-sql.md`. Landing on `login.html` already signed in (from that link) skips straight to Home instead of showing a login form. If login fails because the email was never confirmed, a "Resend confirmation email" button appears.
- **Forgot password** is a full flow: `login.html` → `reset-password-request.html` (email in, always the same "check your inbox" message whether or not that email has an account — doesn't reveal which emails are registered) → the emailed link lands on `reset-password.html` (which needs its own Redirect URL entry too) → new password → back to Home, signed in.
- **Log out** exists now, on `profile.html` (`supabase.auth.signOut()`), which is also where "Profile" in the sidebar actually leads.
- **Guests** (quizzes marked Anonymous in the CMS) choose a **name for each quiz** before Start. It follows the username rules (3 to 24 letters, numbers or underscores) and must be free: not any real user's username and not another guest's name in that quiz (the database checks, again when the quiz starts). At the end they can **create an account with that name** (the sign-up form opens with it filled in, and the guest id travels with the sign-up so the database moves the result onto the new account as it is created, whichever device the confirmation email is opened on); logging in to an existing account on the same browser moves it too. A guest result that is never saved to an account is deleted a day after the guest last played. See "Guests: their own name..." in `docs/supabase-sql.md`.
- **Names:** the Profile page has two small forms, **Username** and **Display name** (first and last name), each changeable **once every 7 days**; while the week runs the boxes are locked and say when they open again. The week is enforced in the database (`change_username()` / `change_display_name()`, and the old direct way of editing those columns is closed), not just on the page.
- **Sign-up** has a language switch, a note that the confirmation email may be in Spam or Trash, and a short general privacy note (there is no privacy policy yet).
- Once signed in, the Home page greeting uses the real first name (`assets/js/auth.js` fetches it and rewrites the speech bubble) instead of the static placeholder.
- Two roles exist: `user` (default) and `moderator`. There's no self-serve way to become a moderator — you promote someone with a one-line SQL command (see `docs/supabase-sql.md`).
- A moderator sees a **CMS** link in the main nav (everyone else doesn't) leading to `moderator.html` (the CMS, below). This is enforced by Row Level Security + a database trigger, not just a client-side check — a non-moderator's edit request is silently rejected by Postgres even if they bypass the UI entirely. The same column-locking trigger is why `simulation.html`'s practice currency is kept in `localStorage` instead of touching real `profiles.coins` — see Simulation below.

## Trading Simulation (paper trading)

- `simulation.html` is a small stock-trading game: four companies (reusing the names from the Tracker mockup — Vinamilk, FPT, Hoa Phat, Mobile World) with prices in 🍌 banana-coins that move when you click "Next day." Buy/sell, watch a sparkline, track net worth and P&L.
- Its starting 🍌10,000 balance and all holdings live in `localStorage` (`assets/js/simulation.js`), **not** in Supabase and **not** the same balance as the real "coins" shown elsewhere in the app. That's deliberate, not a shortcut: the real `profiles.coins` column is locked by the anti-cheat trigger in `docs/supabase-sql.md` so users can't self-edit it, and a trading game needs to freely add/subtract balance on every trade. Keeping it sandboxed avoids reopening that hole.
- "Reset simulation" wipes the local save and starts over at day 1 — it never touches a real account.

## Browse playlists

- `browse-playlists.html` reads every row from a new `public.playlists` table (schema in `docs/supabase-sql.md`) and renders each as a collapsed row — icon, `display_name_en`, and a chevron. Clicking one expands it in place (chevron rotates 180°) to show `description_en` and the playlist's contents: its videos and quizzes in the order a moderator set in the CMS (video titles link out to YouTube), or "Contents coming soon." if it has none. Contents come from the `playlist_items` table; if the CMS SQL hasn't been run yet, the page falls back to listing the playlists without contents instead of breaking. (`playlists.contents_ids` is no longer used.)
- Reading the table needs no login (`using (true)` on the select policy) since it's public content; only a moderator can insert/update/delete a playlist, reusing the same `is_moderator()` helper the `profiles` policies use.
- The Home page's static "Series 2" lesson demo (a hardcoded example, not real data) was retired in favor of an empty state — see Design system below — so this is currently the only place playlist content actually shows up.

## Languages (English / Vietnamese)

- **The switch** (`assets/js/lang-switch.js`) is on every page, and always shows the language the page is in now ("English" or "Tiếng Việt"); pressing it changes to the other one and reloads the page. It sits at the end of the top bar on the quiz and video pages (a compact "VI"/"EN" while playing a quiz on a phone, where the bar is crowded), above the logo on the login, sign-up and password pages, and in the sidebar (a tab in the bottom bar on a phone, a small badge with the language code when the sidebar is collapsed). The choice is saved on the account (`profiles.language`) and on the device; signed-in users get their account's language on every device. The Profile page keeps its own switch next to the theme switch. Changing language during a quiz run asks first, because the page reloads and the run starts over. Anyone new to the site, signed in or not, starts in Vietnamese.
- **Interface text** lives in `assets/js/i18n-strings.js` (`en` and `vi`, one key per piece of text). In a page, an element carries `data-i18n="key"` (its own text is replaced; icons inside it are left alone) or `data-i18n-placeholder` / `-aria-label` / `-title` / `-alt` / `-content` for attributes. The English text is written in the HTML as usual. Text built by scripts uses `I18N.t('key', { name: value })`. Numbers use `I18N.number()` (Vietnamese writes 10.000 and 1,5).
- **No flash of English:** for Vietnamese, `i18n.js` hides the page (`.i18n-pending`) until the last script in `<body>` (`I18N.apply()`) has translated it; a 1.5 s timeout reveals it regardless. English pages are never touched.
- **Content from the database** is shown in the chosen language when a Vietnamese version exists, otherwise in English: playlist name/description, video name, quiz name, and the quiz's questions and answers. The CMS has a Vietnamese field next to each English one (Playlists and Videos already did; Quizzes gained them). The quiz columns, `profiles.language` and the updated `save_quiz` / `search_quizzes` are in the "Vietnamese content" section of `docs/supabase-sql.md`.
- **Adding or changing text:** edit the dictionary (both languages), put `data-i18n` on the element, and run `python scripts/check-i18n.py`. It fails if a key is missing in either language, a `{placeholder}` differs, or the English written in a page no longer matches the dictionary.
- **Not translated:** the CMS screens themselves (an internal tool; only its content fields are bilingual), and messages that come back from Supabase (like a wrong password), which are English. Company names, the brand name and "banamoney" stay as they are; the Vietnamese wording was drafted by Claude and should be read over by a native speaker.

## Your playlists (Home)

- Each expanded playlist on Browse playlists has an **Add playlist** button between its title and description. A signed-in user's click saves it to the `user_playlists` table (the button then reads "Added"); a visitor who isn't signed in is sent to the login page.
- Home then shows a box with the name of the **current** playlist and a collapse/expand button on its right. The current playlist is the most recently added or chosen one (`user_playlists.last_opened_at`). Collapsed it shows only the name. Expanded: with one playlist it says "Too easy? Click here for more playlists!" above a **Browse playlists** button; with two or more it lists the others as buttons (picking one makes it current, saved through the `open_playlist()` function) above the same button.
- **The path:** under the box, the current playlist's videos and quizzes ("pieces") are drawn as round buttons along a curving path, borrowed from Duolingo's lesson path. The first and last pieces sit on the centre line of the playlist box. Pieces are grouped into curves that start and end on that line: 5 pieces go centre, left, further left, back, centre; 4 go centre, left, straight down, centre; 3 go centre, left, centre. Curves of 5 are chained, sharing the centred piece where they meet, and the remainder becomes a curve of 3 or 4 (or one extra centred piece), so 9 pieces is 5+5, 7 is 5+3 and 10 is 5+5+1. Successive curves alternate between bulging left and right (`PATH_ALTERNATES` in `assets/js/home.js` makes them all bulge left instead). Videos get a rounded play triangle and quizzes a rounded star. A piece lifts slightly on hover and presses flat when clicked; clicking opens a box with its name and a **Watch Video** / **Play Quiz** button which opens the video (`video.html`) or the quiz (`quiz.html`), and it closes on a click elsewhere or Escape. **Progress:** a piece is grey until the player has finished it (a quiz played to the end, a video watched to the end) and in colour, with a tick, once it is done; the box then says "Completed" and offers "Play again" / "Watch again". **Moving on:** a piece is opened with `&playlist=<id>` on its address; when a video is finished (after claiming its reward, if any, which then offers **Continue**) or a quiz's result screen is reached (**Up next: ...** and **Continue**), the player goes to the next piece of that playlist, whatever its type, or back to Home after the last one. Without `?playlist=`, the player's current playlist is used. `get_my_progress()` supplies which ones are done; without that SQL every piece keeps its colour. A quiz a guest finished counts once their results have been carried over to the account.
- With no playlists, Home keeps the original "You currently have no playlists" box.
- It needs the `user_playlists` SQL in `docs/supabase-sql.md`. Until that's run, Home keeps the empty box and Add playlist shows an error.

## CMS (the moderator page)

`moderator.html` shares the normal sidebar and has four tabs (the tab is kept in the URL, e.g. `moderator.html#quizzes`). Only a signed-in moderator gets past the gate; as with everything else here, the real protection is Row Level Security in the database, not the page.

- **Playlists** — create, edit and delete playlists: English and Vietnamese name and description, an optional image link, and the **contents**: an ordered list of videos and quizzes (add from a searchable picker, reorder with the arrow buttons, remove). Saved in one call through the `save_playlist()` database function.
- **Quizzes** — search quizzes by name, description or the text of any question (case- and accent-insensitive, so "co phieu" finds "Cổ phiếu"); edit the name, description and any number of questions, each with its text, an optional time limit in seconds, and any number of answers with one or more ticked as correct (several ticks make it "select all that apply"). Each question is a collapsible card (a quiz opens with all of them collapsed, showing a one-line summary; there's Expand all / Collapse all, and a validation error opens the question it's about). Questions can be reordered; deleting asks first when there's content. Saved in one call through `save_quiz()`.
- **Videos** — the library playlists are built from: English and Vietnamese name plus a YouTube link (checked for a valid YouTube address). Shows which playlists use a video, and won't let you delete one that's still in a playlist. A **Rewards** section sets the EXP and bananas for finishing the video the first time and for finishing it again (a rewatch pays at most once a day).
- **Users** — type part of a username on the left and every match is listed (with nothing typed, the first 50, with their bananas and streak); pick one to change their **bananas** (`profiles.coins`) and **streak**. Their EXP is shown for reference. Only moderators can do this: Row Level Security refuses everyone else.

Things worth knowing:

- Unsaved edits are guarded: switching item or tab (or closing the page) asks before throwing them away.
- Saves match rows by id and update them in place, so a question's or playlist item's id survives re-saving (anything added later that points at them, like progress tracking, won't be wiped by an edit).
- A new playlist is public immediately; a video or quiz becomes visible to visitors only once it's in a playlist. There's no draft/publish switch for playlists themselves yet.
- It needs the CMS SQL in `docs/supabase-sql.md` (new tables, policies and functions). Until that has been run, the Playlists/Quizzes/Videos tabs say so instead of failing quietly.

## Not yet in this repo

- **`docs/supabase-sql.md` needs a re-run after every pull that touches it** (`docs/pending-supabase-sql.md` lists what's outstanding) — I have no tool that can execute SQL against the project, so schema/policy changes in this repo don't reach your actual database until you paste and run them yourself.
- **Two Redirect URLs need adding in the Supabase dashboard**, not just the one from before — see the Notes section at the bottom of `docs/supabase-sql.md`.
- A quiz player for learners (taking a quiz, grading it, awarding coins). Questions and correct answers are moderator-only until it exists; see the notes in `docs/supabase-sql.md`.
- Playlist item types beyond videos and quizzes (`playlist_items` is built to take more)
- The Tracker page, and real progress tracking (which videos/quizzes in a playlist a user has finished); Home's current-playlist box only shows the playlist's name so far
- Native mobile app (a future phase — the design tokens here are meant to carry over)
- A language/theme switch for visitors who aren't signed in (both live on the Profile page, which needs an account; they follow the browser's language and the OS theme until then)
- Translated CMS screens and translated server error messages (see "Languages")

## Local preview

No build step — open `index.html` directly in a browser, or serve the folder with any static file server.
