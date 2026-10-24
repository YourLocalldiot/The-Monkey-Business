# Pending Supabase SQL

The SQL snippets in [`supabase-sql.md`](supabase-sql.md) that have been written but **not yet run** against the live Supabase project.

This file is kept in step with `supabase-sql.md`: whenever a snippet is added there (or an existing one is changed in a way that needs re-running), it is listed here too. **You** are the one who confirms whether a snippet has been run; remove its entry from "Currently pending" once it has.

*Last compared against the live database by Claude: 2026-10-24, with read-only queries (tables, columns and functions: the three snippets below are not in the database yet; podium talk is). That was a snapshot, not a guarantee. Treat your own check as the source of truth.*

## Currently pending

### `videos: rewards + finished videos`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Video rewards, and finished videos / quizzes (Home's coloured pieces)". Run it after `quizzes: anonymous play + claiming rewards`.
- **Why it's needed:** the **Rewards** boxes in **CMS > Videos**, the video page's **Next** button (finishing a video, then **Claim rewards!**), and **Home's path**, where finished videos and quizzes are in colour and the rest grey. Adds `videos.reward_*`, the `video_progress` table, `finish_video()`, `claim_video_reward()` and `get_my_progress()`.
- **Until it's run:** CMS > Videos shows the Rewards boxes switched off, **Next** on the video page just returns to Home (nothing is saved or paid), and every piece on Home keeps its colour.
- **Added:** 2026-10-22.

### `guests: own name + results kept with an account`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Guests: their own name, and results kept only with an account". Run it after `podium talk: speech bubbles + CMS options` (already applied). It replaces the earlier `guests: carry results over to the account` entry, which was never run.
- **Why it's needed:** a guest chooses a name for each quiz (it can't be a real user's username or another guest's name in that quiz); after finishing they can **create an account with that name**, and their result moves onto it (also when they log in to an existing account on the same browser). Adds `guest_name_status()`, `claim_guest_results()`, and the helpers behind them, and replaces `start_quiz`, `get_quiz_leaderboard` and `handle_new_user`.
- **Heads-up:** a guest result that is never claimed is deleted **24 hours** after the guest's last activity, and running this query deletes the guest results that are already older than that (the live database has 10 guest rows from before names existed).
- **Until it's run:** guests are still named `Guest1`, `Guest2`, … and nothing is asked of them; signing up doesn't bring their results along.
- **Added:** 2026-10-22, rewritten 2026-10-24.

### `profiles: change username + display name`
- **Where:** [`supabase-sql.md`](supabase-sql.md), section "Profile: change username and display name (once a week)". Run it after `signup: username checks` (already applied).
- **Why it's needed:** the two name boxes on the Profile page, each changeable once every 7 days. Adds `profiles.username_changed_at` / `name_changed_at`, `change_username()`, `change_display_name()`, and replaces `protect_privileged_columns()` so names can't be changed around the weekly limit.
- **Until it's run:** the Profile page's name boxes say the change isn't available yet.
- **Added:** 2026-10-22.

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
| `podium talk: speech bubbles + CMS options` | the `podium_talk` table, `quiz_players.talk_id`, `set_quiz_talk()`, the leaderboard returning each top-3 player's message *(found in the live database 2026-10-22)* |

(That table is only a record of what the check found. It isn't a to-do list.)

## When something is pending, it's listed like this

> ### `Save as` name of the snippet
> - **Where:** the section of `supabase-sql.md` that has the SQL.
> - **Why it's needed:** what in the site depends on it.
> - **Until it's run:** what the site does (or can't do) without it.
> - **Added:** date.

Then delete the entry once you've run it.
