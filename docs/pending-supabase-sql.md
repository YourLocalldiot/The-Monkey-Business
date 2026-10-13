# Pending Supabase SQL

The SQL snippets in [`supabase-sql.md`](supabase-sql.md) that have been written but **not yet run** against the live Supabase project.

This file is kept in step with `supabase-sql.md`: whenever a snippet is added there (or an existing one is changed in a way that needs re-running), it is listed here too. **You** are the one who confirms whether a snippet has been run; remove its entry from "Currently pending" once it has.

*Last compared against the live database by Claude: 2026-10-11, with read-only queries (tables, columns, policies, functions, the `unaccent` extension, and whether the anonymous role can call `set_profile_moderator`). That was a snapshot, not a guarantee. Treat your own check as the source of truth.*

## Currently pending

### `i18n: vietnamese content + language`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Vietnamese content (the language switch)". Run it after the `cms` query.
- **Why it's needed:** the CMS Quizzes tab now has Vietnamese fields for the quiz name, description, questions and answers, and `profiles.language` stores the language a user chose on their Profile page. It also replaces `save_quiz` (new Vietnamese arguments) and `search_quizzes` (searches the Vietnamese text too).
- **Until it's run:** the CMS **Quizzes tab can't load or save** (it asks for columns that don't exist yet). The rest of the site works: quiz names fall back to English on Browse playlists and Home, and the chosen language is saved on the device only, not on the account.
- **Added:** 2026-10-11.

### `quizzes: shuffle + default language`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Quiz shuffling + Vietnamese for new accounts". Run it **after** `i18n: vietnamese content + language` (and don't re-run the `i18n` query afterwards).
- **Why it's needed:** adds `quizzes.shuffle_questions` / `quizzes.shuffle_answers` (the two "shuffle" switches in the CMS Quizzes tab) and replaces `save_quiz` to save them. It also makes new accounts start in Vietnamese (`handle_new_user` sets `profiles.language = 'vi'`).
- **Until it's run:** the CMS shuffle switches are disabled, and a quiz saves without them. New accounts still pick up Vietnamese on the device they signed up on (the sign-up page stores it), but the account itself has no language saved, so on another device the browser's language decides.
- **Added:** 2026-10-13.

## Applied

As of the comparison above, every other snippet in `supabase-sql.md` appears to have been applied:

| Snippet (the "Save as" name) | What it covers |
| --- | --- |
| `profiles: schema + rls + triggers` | profiles table, policies, protection of coins/streak/role, new-user trigger |
| `playlists: schema + rls` | playlists table and policies |
| `profiles: lock down set_profile_moderator` | stops the anonymous API role from promoting users to moderator |
| `cms: videos, quizzes, playlist contents` | videos, quizzes, questions/answers, playlist contents, and the save/search functions |
| `user_playlists: schema + rls` | which playlists each user added, and the current one on Home |

(That table is only a record of what the check found. It isn't a to-do list.)

## When something is pending, it's listed like this

> ### `Save as` name of the snippet
> - **Where:** the section of `supabase-sql.md` that has the SQL.
> - **Why it's needed:** what in the site depends on it.
> - **Until it's run:** what the site does (or can't do) without it.
> - **Added:** date.

Then delete the entry once you've run it.
