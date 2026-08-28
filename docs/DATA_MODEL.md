# Data Model

Canonical SQL: `supabase/migrations`. Drizzle: `packages/database/src/schema.ts`.

Sports tables (Phase 0.1) stay separate from fantasy tables (Phase 0.2+). Counting stats still have **no fantasy points**. Scoring rules live on the league; `packages/fantasy-engine` applies them on read.

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
leagues 1──* matchups
leagues 1──* weekly_lineups
leagues 1──* week_locks
leagues 1──* waiver_priorities
leagues 1──* faab_balances
leagues 1──* waiver_periods
waiver_periods 1──* waiver_claims
```

## Sports tables (0.1)

Unchanged: `users`, `sports`, `teams`, `team_external_ids`, `players`, `player_external_ids`, `seasons`, `games`, `game_external_ids`, `player_game_stats`.

### DST players

Team defense is not in nflverse player stats. We seed 32 `players` rows with `position = DEF` (e.g. “Chiefs D/ST”), `team_id` set to that franchise, and `player_external_ids.provider = sundaystack`. Kickers come from nflverse. Phase 0.4 scores DEF as **0** until team-week stats are ingested.

## Fantasy tables (0.2)

### leagues

`sport_id`, `season_id`, `name`, `commissioner_user_id`, unique `invite_code`, `status` (`pre_draft` | `drafting` | `active`), `max_teams` (8–14).

Flow: `pre_draft` (lobby allowed) → `drafting` when the snake starts → `active` when the draft completes. Matchups require `active`.

### league_members

Unique `(league_id, user_id)`. `role` is `commissioner` or `member`.

### fantasy_teams

One team per member. Unique `(league_id, owner_user_id)`.

### league_settings

1:1 with league. Slot counts: `qb`, `rb`, `wr`, `te`, `flex`, `superflex` (default 0), `k`, `def`, `bench`, `ir` (default 0). `regular_season_weeks` (default 14, 1–17). Waiver: `waiver_type` (`priority` | `faab`, default `faab`), `faab_budget` (default 100), `waiver_process_weekday` (0–6, default 2 = Tuesday), `waiver_process_hour_utc` (0–23, default 7). Frozen after the draft goes live. Draft rounds = roster capacity (IR excluded).

### league_scoring_rules

Unique `(league_id, stat_key)` with `points_per` numeric. Presets (Standard / Half PPR / PPR) expand to skill keys plus kicker FG/XP. **Not** stored on `player_game_stats`. 2-pt conversions and fumbles are ingested but not in presets (score 0). DST keys are not in 0.4.

### roster_players

Current roster + live lineup slot (`QB` | `RB` | `WR` | `TE` | `FLEX` | `SUPERFLEX` | `K` | `DEF` | `BENCH`). Unique `(fantasy_team_id, player_id)` and unique `(league_id, player_id)`. Draft picks insert here. Historical weeks use `weekly_lineups`, not this table.

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

## Weekly games (0.4)

H2H only. Regular season is NFL `REG` weeks 1–14. No playoffs. Fantasy points are **computed on read** (locked lineup × week stats × current league rules). Nothing writes points onto `player_game_stats` or `matchups`.

Schedule is generated lazily on first scoreboard fetch for an `active` league (circle round-robin, repeated to 14 weeks).

Lineup **lock is lazy**: first authenticated scoreboard/matchup GET after the week’s earliest REG `kickoff_at` snapshots `roster_players` into `weekly_lineups`. `week_locks` marks the snapshot done. Before lock, scores use the live roster. After lock, the live roster can still change (drops and waiver awards) but **not** that week’s snapshot.

Starters score; bench is 0. DEF is 0 until DST ingest.

### matchups

`league_id`, `week`, `home_fantasy_team_id`, `away_fantasy_team_id`. Unique home and away per `(league_id, week)`. Home ≠ away.

### weekly_lineups

`league_id`, `week`, `fantasy_team_id`, `player_id`, `slot`. Unique `(league_id, week, fantasy_team_id, player_id)`.

### week_locks

`league_id`, `week`, `locked_at`. Unique `(league_id, week)`. Presence means the snapshot finished.

## Waivers (0.5a)

ESPN-style week: after process, **free agency until that week’s lineup lock**; after lock, **claims only** until the next process. Process is **lazy** (no worker): the next authenticated waivers/scoreboard/roster GET after `process_at` runs awards. Instant add is blocked during the claim window (`WAIVER_PERIOD`). Drop stays allowed; the player goes on the next wire, not to FA.

After draft completes: FA until week 1 lock, then the lock → claims → process → FA cycle.

Priority is **rolling**, not reverse standings (standings are compute-on-read and move if scoring is PATCHed). Init from reverse draft order (`draft_order.slot` descending = rank 1), lazily on first waivers fetch — not inside draft `completeOrAdvance`. A successful claim moves that team to last. FAAB uses the list only for bid ties.

Awards mutate live `roster_players` only. Never rewrite `weekly_lineups` for a locked week. Claim add+drop is delete-then-insert; unique `(league_id, player_id)` serializes races (Neon HTTP has no transactions).

Public `GET /api/players` stays unfiltered. The FA/waiver pool is a member-only league route.

### waiver_priorities

`league_id`, `fantasy_team_id`, `rank` (1 = first). Unique team, unique `(league_id, rank)`.

### faab_balances

`league_id`, `fantasy_team_id`, `remaining`. Unique team. Initialized for every team; ignored when `waiver_type = priority`.

### waiver_periods

`league_id`, `process_at`, `processed_at` (null until the run finishes). Unique `(league_id, process_at)`.

### waiver_claims

`league_id`, `period_id`, `fantasy_team_id`, `player_id`, `drop_player_id` (nullable), `bid`, `rank`, `status` (`pending` | `won` | `lost` | `cancelled`). Unique `(period_id, fantasy_team_id, player_id)`. Full roster requires `drop_player_id`.

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
- Express uses the database owner (bypasses RLS). League, draft, matchup, and waiver rules are enforced in the API.
