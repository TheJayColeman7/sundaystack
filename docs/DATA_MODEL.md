# Data Model

Foundation schema only. Fantasy league tables are intentionally absent.

Canonical SQL: `supabase/migrations`. Drizzle: `packages/database/src/schema.ts`.

## Principles

- UUID primary keys for every application object.
- External provider IDs live in mapping tables, unique on `(provider, external_id)`.
- `created_at` / `updated_at` on every table.
- Counting stats only on `player_game_stats`. **No fantasy points.**
- `players.team_id` is the **current** roster team (nullable). Historical team is on stats/games. This denorm exists so player search can filter by team without a roster history join.

## Entity relationship

```text
auth.users 1──1 public.users

sports 1──* teams 1──* team_external_ids
sports 1──* players 1──* player_external_ids
teams  1──* players          (current team, nullable)

sports 1──* seasons 1──* games 1──* game_external_ids
teams  1──* games (home)
teams  1──* games (away)

players 1──* player_game_stats
games   1──* player_game_stats
seasons 1──* player_game_stats
```

## Tables

### users

Profile row. `id` = `auth.users.id`. Signup trigger inserts a row. No passwords here.

### sports

Reference data. Seeded with `nfl`. Unique `code`.

### teams

NFL franchises. Unique `(sport_id, abbreviation)` using nflverse abbreviations (`KC`, `WAS`, `LAR`, …).

### team_external_ids

`provider` examples: `nflverse`, `gsis`. `external_id` is the provider's team key (usually the same abbreviation).

### players

Identity is our UUID. Names, `position` (text, not a DB enum), jersey, status, headshot. Rows without a GSIS id are skipped at ingest because weekly stats join on GSIS.

### player_external_ids

Stored in Phase 0.1 when present on the roster CSV: `gsis`, `sleeper`, `espn`, `pfr`. Unique `(provider, external_id)`.

### seasons

Unique `(sport_id, year)`. Regular vs postseason is on `games.season_type`, not a separate season row.

### games

`week`, `season_type` (`PRE` | `REG` | `POST`), home/away FKs, `kickoff_at`, `status` (`scheduled` | `in_progress` | `final` | `cancelled`), scores. Unique `(season_id, week, season_type, home_team_id, away_team_id)`.

### game_external_ids

nflverse/Lee Sharpe `game_id` (e.g. `2024_01_BAL_KC`) stored as `provider = nflverse`.

### player_game_stats

One row per player per game. Unique `(player_id, game_id)`. Typed integer columns for fantasy-relevant counting stats (pass / rush / rec / fumbles / 2PT / kicking). `season_id` and `week` are stored for filters. Advanced metrics (EPA, air yards) are out of scope.

## Ingest identity

| Entity | Join key |
|--------|----------|
| Player | GSIS (`00-0033873`) |
| Team | nflverse abbreviation |
| Game | nflverse `game_id` |
| Stats | GSIS + `game_id` |

Rows missing GSIS are skipped and counted in the ingest log.

## RLS

- Sports tables: `SELECT` for `anon` and `authenticated`.
- `users`: read/update own row only.
- Ingest uses the Postgres role (bypasses RLS).
