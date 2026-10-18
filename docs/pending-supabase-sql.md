# Pending Supabase SQL

The SQL snippets in [`supabase-sql.md`](supabase-sql.md) that have been written but **not yet run** against the live Supabase project.

This file is kept in step with `supabase-sql.md`: whenever a snippet is added there (or an existing one is changed in a way that needs re-running), it is listed here too. **You** are the one who confirms whether a snippet has been run; remove its entry from "Currently pending" once it has.

*Last compared against the live database by Claude: 2026-10-11, with read-only queries (tables, columns, policies, functions, the `unaccent` extension, and whether the anonymous role can call `set_profile_moderator`). That was a snapshot, not a guarantee. Treat your own check as the source of truth.*

## Currently pending

### `podium talk: speech bubbles + CMS options`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Podium talk". Run it after `quiz leaderboard: top-3 emoji` (already applied).
- **Why it's needed:** the speech bubble next to a top-3 player's name, and **CMS > Podium talk**, where moderators set which emojis or phrases a podium holder can choose. Adds the `podium_talk` table (seeded with the 24 emojis and four phrases), `quiz_players.talk_id`, `set_quiz_talk()` (replacing `set_quiz_emoji`), and makes `get_quiz_leaderboard` return `talk_id` / `talk` / `talk_vn`; carries over emojis already chosen, then drops `quiz_players.emoji`.
- **Until it's run:** the leaderboard still shows the emojis chosen so far, but players can't pick a new one and the CMS Podium talk tab can't load.
- **Added:** 2026-10-19.

## Applied

As of the comparison above (plus what you confirmed, and a read-only check of the live database on 2026-10-18), every other snippet in `supabase-sql.md` has been applied:

| Snippet (the "Save as" name) | What it covers |
| --- | --- |
| `profiles: schema + rls + triggers` | profiles table, policies, protection of coins/streak/role, new-user trigger |
| `playlists: schema + rls` | playlists table and policies |
| `profiles: lock down set_profile_moderator` | stops the anonymous API role from promoting users to moderator |
| `cms: videos, quizzes, playlist contents` | videos, quizzes, questions/answers, playlist contents, and the save/search functions |
| `user_playlists: schema + rls` | which playlists each user added, and the current one on Home |
| `i18n: vietnamese content + language` | Vietnamese columns for quizzes, `profiles.language`, new `save_quiz` / `search_quizzes` *(you confirmed 2026-10-14)* |
| `quizzes: shuffle + default language` | quiz shuffle switches, new accounts default to Vietnamese *(you confirmed 2026-10-14)* |
| `quizzes: pictures + player + leaderboard` | question pictures, the quiz player functions, `quiz_players` + leaderboard *(you confirmed 2026-10-14)* |
| `quiz_effects: schema + rls + starter effects` | the effects table and the two starter effects *(you confirmed 2026-10-14)* |
| `signup: username checks` | `username_available()`, case-insensitive usernames, username format check *(found in the live database 2026-10-18)* |
| `quiz-images: storage bucket` | the public quiz-images bucket and its policies *(found in the live database 2026-10-18)* |
| `quizzes: rewards + exp` | `profiles.exp`, per-quiz rewards, finish_quiz paying out *(found in the live database 2026-10-18)* |
| `quizzes: anonymous play + claiming rewards` | guests (Guest1...), pending rewards + claiming, the reward effect kind *(found in the live database 2026-10-18)* |
| `quiz leaderboard: top-3 emoji` | `quiz_players.emoji`, `set_quiz_emoji()`, the leaderboard returning each top-3 player's emoji *(you confirmed 2026-10-18; also found in the live database)* |

(That table is only a record of what the check found. It isn't a to-do list.)

## When something is pending, it's listed like this

> ### `Save as` name of the snippet
> - **Where:** the section of `supabase-sql.md` that has the SQL.
> - **Why it's needed:** what in the site depends on it.
> - **Until it's run:** what the site does (or can't do) without it.
> - **Added:** date.

Then delete the entry once you've run it.
