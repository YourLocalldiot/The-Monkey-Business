# Pending Supabase SQL

The SQL snippets in [`supabase-sql.md`](supabase-sql.md) that have been written but **not yet run** against the live Supabase project.

This file is kept in step with `supabase-sql.md`: whenever a snippet is added there (or an existing one is changed in a way that needs re-running), it is listed here too. **You** are the one who confirms whether a snippet has been run; remove its entry from "Currently pending" once it has.

*Last compared against the live database by Claude: 2026-10-11, with read-only queries (tables, columns, policies, functions, the `unaccent` extension, and whether the anonymous role can call `set_profile_moderator`). That was a snapshot, not a guarantee. Treat your own check as the source of truth.*

## Currently pending

**Nothing.** As of that comparison, every snippet in `supabase-sql.md` appears to have been applied:

| Snippet (the "Save as" name) | What it covers |
| --- | --- |
| `profiles: schema + rls + triggers` | profiles table, policies, protection of coins/streak/role, new-user trigger |
| `playlists: schema + rls` | playlists table and policies |
| `profiles: lock down set_profile_moderator` | stops the anonymous API role from promoting users to moderator |
| `cms: videos, quizzes, playlist contents` | videos, quizzes, questions/answers, playlist contents, and the save/search functions |
| `user_playlists: schema + rls` | which playlists each user added, and the current one on Home |

(That table is only a record of what the check found, so you can see what the file is tracking. It isn't a to-do list.)

## When something is pending, it's listed like this

> ### `Save as` name of the snippet
> - **Where:** the section of `supabase-sql.md` that has the SQL.
> - **Why it's needed:** what in the site depends on it.
> - **Until it's run:** what the site does (or can't do) without it.
> - **Added:** date.

Then delete the entry once you've run it.
