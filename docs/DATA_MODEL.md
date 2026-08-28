# Data Model

Canonical SQL: `supabase/migrations`. Drizzle: `packages/database/src/schema.ts`.

Sports tables (Phase 0.1) stay separate from fantasy tables (Phase 0.2). Counting stats still have **no fantasy points**. Scoring rules live on the league; the engine that applies them is Phase 0.4.

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
fantasy_teams 1──* roster_players
players 1──* roster_players
```

## Sports tables (0.1)

Unchanged: `users`, `sports`, `teams`, `team_external_ids`, `players`, `player_external_ids`, `seasons`, `games`, `game_external_ids`, `player_game_stats`.

### DST players

Team defense is not in nflverse player stats. We seed 32 `players` rows with `position = DEF` (e.g. “Chiefs D/ST”), `team_id` set to that franchise, and `player_external_ids.provider = sundaystack`. Kickers come from nflverse.

## Fantasy tables (0.2)

### leagues

`sport_id`, `season_id`, `name`, `commissioner_user_id`, unique `invite_code`, `status` (`pre_draft` | `active`), `max_teams` (8–14).

### league_members

Unique `(league_id, user_id)`. `role` is `commissioner` or `member`.

### fantasy_teams

One team per member. Unique `(league_id, owner_user_id)`.

### league_settings

1:1 with league. Slot counts: `qb`, `rb`, `wr`, `te`, `flex`, `superflex` (default 0), `k`, `def`, `bench`, `ir` (default 0).

### league_scoring_rules

Unique `(league_id, stat_key)` with `points_per` numeric. Presets (Standard / Half PPR / PPR) expand to these rows. **Not** stored on `player_game_stats`.

### roster_players

Current roster + lineup slot (`QB` | `RB` | `WR` | `TE` | `FLEX` | `K` | `DEF` | `BENCH`). Unique `(fantasy_team_id, player_id)` and unique `(league_id, player_id)`. Weekly lineups are Phase 0.4.

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
- Express uses the database owner (bypasses RLS). League rules are enforced in the API.
