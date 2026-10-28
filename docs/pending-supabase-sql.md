# Pending Supabase SQL

The SQL snippets in [`supabase-sql.md`](supabase-sql.md) that have been written but **not yet run** against the live Supabase project.

This file is kept in step with `supabase-sql.md`: whenever a snippet is added there (or an existing one is changed in a way that needs re-running), it is listed here too. **You** are the one who confirms whether a snippet has been run; remove its entry from "Currently pending" once it has.

*Last compared against the live database by Claude: 2026-10-28, with read-only queries (the snippets under Applied are in the database; the one pending above is not). That was a snapshot, not a guarantee. Treat your own check as the source of truth.*

## Currently pending

### `quizzes: keep every player + moderator leaderboards`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Quiz leaderboards for moderators: every player is kept". Run it after `guests: own name + results kept with an account` (already applied).
- **Why it's needed:** **CMS > Quiz leaderboards** (every player of a quiz with their score), and so that a guest result that expires is **kept** (hidden from the public leaderboard, name freed) instead of deleted. Adds `quiz_players.expired`, `admin_quiz_players()`, `admin_quiz_player_counts()`, and replaces `purge_guest_results`, `guest_name_problem`, `move_guest_results`, `quiz_rank`, `get_quiz_intro` and `get_quiz_leaderboard`.
- **Until it's run:** guest results are still **deleted** a day after the guest last played (whenever anyone starts a quiz), and the CMS Quiz leaderboards tab says the database is missing something. Run it soon: guest results deleted before then can't be brought back.
- **Added:** 2026-10-28.

## Applied

As of the comparison above (plus what you confirmed, and read-only checks of the live database), every snippet in `supabase-sql.md` has been applied:

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
| `podium talk: speech bubbles + CMS options` | the `podium_talk` table, `quiz_players.talk_id`, `set_quiz_talk()`, the leaderboard returning each top-3 player's message *(found in the live database 2026-10-22)* |
| `videos: rewards + finished videos` | `videos.reward_*`, the `video_progress` table, `finish_video()`, `claim_video_reward()`, `get_my_progress()` *(you confirmed 2026-10-24; found in the live database)* |
| `guests: own name + results kept with an account` | `guest_name_status()`, `claim_guest_results()` and the helpers behind it, the guest-name index, the new `start_quiz`, `get_quiz_leaderboard` and `handle_new_user` *(you confirmed 2026-10-24; found in the live database)* |
| `profiles: change username + display name` | `profiles.username_changed_at` / `name_changed_at`, `change_username()`, `change_display_name()`, the stricter `protect_privileged_columns()` *(you confirmed 2026-10-24; found in the live database)* |

(That table is only a record of what the check found. It isn't a to-do list.)

## When something is pending, it's listed like this

> ### `Save as` name of the snippet
> - **Where:** the section of `supabase-sql.md` that has the SQL.
> - **Why it's needed:** what in the site depends on it.
> - **Until it's run:** what the site does (or can't do) without it.
> - **Added:** date.

Then delete the entry once you've run it.
