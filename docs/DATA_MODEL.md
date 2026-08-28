# Data Model

Canonical SQL: `supabase/migrations`. Drizzle: `packages/database/src/schema.ts`.

Sports tables (Phase 0.1) stay separate from fantasy tables (Phase 0.2+). Counting stats still have **no fantasy points**. Scoring rules live on the league; the engine that applies them is Phase 0.4.

## Principles

- UUID primary keys for every application object.
- External provider IDs live in mapping tables, unique on `(provider, external_id)`.
- `created_at` / `updated_at` on every table.
- `players.team_id` is the **current** NFL roster team (nullable).
- `roster_players.league_id` is an intentional denorm so a player can appear on only one fantasy team per league.

## Entity relationship

```text
auth.users 1──1 public.users

sports 1──* teams 1──* team_external_ids
sports 1──* players 1──* player_external_ids
teams  1──* players

sports 1──* seasons 1──* games 1──* game_external_ids
players 1──* player_game_stats
games   1──* player_game_stats

users 1──* leagues (commissioner)
leagues 1──* league_members
leagues 1──* fantasy_teams
leagues 1──1 league_settings
leagues 1──* league_scoring_rules
leagues 1──1 drafts
drafts 1──* draft_order
drafts 1──* draft_picks
drafts 1──* draft_queues
fantasy_teams 1──* roster_players
players 1──* roster_players
```

## Sports tables (0.1)

Unchanged: `users`, `sports`, `teams`, `team_external_ids`, `players`, `player_external_ids`, `seasons`, `games`, `game_external_ids`, `player_game_stats`.

### DST players

Team defense is not in nflverse player stats. We seed 32 `players` rows with `position = DEF` (e.g. “Chiefs D/ST”), `team_id` set to that franchise, and `player_external_ids.provider = sundaystack`. Kickers come from nflverse.

## Fantasy tables (0.2)

### leagues

`sport_id`, `season_id`, `name`, `commissioner_user_id`, unique `invite_code`, `status` (`pre_draft` | `drafting` | `active`), `max_teams` (8–14).

Flow: `pre_draft` (lobby allowed) → `drafting` when the snake starts → `active` when the draft completes.

### league_members

Unique `(league_id, user_id)`. `role` is `commissioner` or `member`.

### fantasy_teams

One team per member. Unique `(league_id, owner_user_id)`.

### league_settings

1:1 with league. Slot counts: `qb`, `rb`, `wr`, `te`, `flex`, `superflex` (default 0), `k`, `def`, `bench`, `ir` (default 0). Frozen after the draft goes live. Draft rounds = roster capacity (IR excluded).

### league_scoring_rules

Unique `(league_id, stat_key)` with `points_per` numeric. Presets (Standard / Half PPR / PPR) expand to these rows. **Not** stored on `player_game_stats`.

### roster_players

Current roster + lineup slot (`QB` | `RB` | `WR` | `TE` | `FLEX` | `SUPERFLEX` | `K` | `DEF` | `BENCH`). Unique `(fantasy_team_id, player_id)` and unique `(league_id, player_id)`. Draft picks insert here. Weekly lineups are Phase 0.4.

## Draft tables (0.3)

One redraft snake draft per league. Available players are derived (not stored): NFL `players` minus `roster_players` for that league.

### drafts

`league_id` unique. `status` (`lobby` | `live` | `complete`). `seconds_per_pick` (default 90). `current_pick_number`. `current_pick_started_at`. `total_picks`.

### draft_order

`(draft_id, slot)` unique. `slot` is 1..N (snake position). `fantasy_team_id`.

### draft_picks

`(draft_id, pick_number)` unique. `player_id` nullable when `source = passed_full` (team already at roster capacity). `source` is `manual` | `queue` | `autopick` | `passed_full`.

### draft_queues

Per user ranked list. Unique `(draft_id, user_id, player_id)`. Stale entries (already drafted) are skipped at pick time.

Clock expiry is **lazy**: the next authenticated draft GET/POST that sees an expired clock performs queue-then-BPA. No worker.

Autopick ranking uses counting stats from the latest ingested season (yards + TDs). That score is **not** stored and is **not** league fantasy points.

## Identity

Dev login (Phase 0.2) upserts stub `auth.users` + `public.users` so FKs match future Supabase Auth (`public.users.id` = `auth.users.id`). No passwords.

## Ingest identity

| Entity | Join key |
|--------|----------|
| Player | GSIS (`00-0033873`) |
| DST player | `sundaystack` / `dst-{ABBR}` |
| Team | nflverse abbreviation |
| Game | nflverse `game_id` |
| Stats | GSIS + `game_id` |

## RLS

- Sports tables: `SELECT` for `anon` and `authenticated`.
- `users`: read/update own row only.
- Fantasy tables: not readable by `anon`. `authenticated` may select leagues they belong to.
- Express uses the database owner (bypasses RLS). League and draft rules are enforced in the API.
