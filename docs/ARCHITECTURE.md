# Architecture

SundayStack is a TypeScript monorepo (pnpm + Turborepo). Phase 0.4 weekly H2H matchups and fantasy **points** are in (`packages/fantasy-engine`, computed on read; never stored on `player_game_stats`). Playoffs and waivers are Phase 0.5.

## Why this shape

The original long-term tree included `apps/mobile`, `packages/ui`, `packages/scoring`, and always-on `services/*`. Those packages have no second consumer yet. `packages/fantasy-engine` exists now because 0.4 needs a tested scoring module that is not Express or UI.

What we protect instead is the boundary: **no provider JSON leaves `packages/sports-data`**. Internal models in `packages/shared` are the only types the API (and later UI) may import. The engine takes counting stats + league rules and returns points.

Express is the HTTP API from day 1 so React Native can share it later. Next.js is the web app and must not grow a parallel `/api` tree. Domain logic lives in packages so we are not trapped in either runtime.

SQL in `supabase/migrations` is canonical. Drizzle in `packages/database` is a typed mirror. Do not generate a second migration history with drizzle-kit.

## Data flow

```text
nflverse CSVs (GitHub releases)
        ↓
NflverseProvider (download + parse)
        ↓
Normalizer  →  internal models (@sundaystack/shared)
        ↓
Ingest CLI  →  PostgreSQL (UUID PKs + external ID maps)
        ↓
packages/database queries (lineups, week stats, rules)
        ↓
packages/fantasy-engine (points on read)
        ↓
Express REST (session for leagues / drafts / scoreboard)
        ↓
Next.js web app
```

## Workspace

```text
apps/web                 Next.js App Router + Tailwind (login, leagues, roster, draft, matchup, player)
apps/api                 Express REST (dev session + leagues + drafts + matchups + public players)
packages/shared          Domain types, scoring presets, lineup + snake-draft + schedule rules, API DTOs
packages/fantasy-engine  Pure fantasy-point scoring (skill + K; DEF = 0)
packages/database        Drizzle schema + queries (sports + fantasy + drafts + matchups)
packages/sports-data     SportsDataProvider, NflverseProvider, MockProvider, ingest
supabase/migrations      Canonical PostgreSQL
docs/
```

Deferred: mobile, `packages/ui`, `packages/scoring`, Redis, paid sports APIs, deployed Express host, scoring worker, DST ingest.

## Provider isolation

`SportsDataProvider` returns normalized domain objects (`NormalizedTeam`, `NormalizedPlayer`, `NormalizedGame`, `NormalizedPlayerGameStats`). Those objects use **external IDs** for identity (GSIS, nflverse game id, team abbreviation). The ingest layer assigns our UUIDs and writes mapping rows.

Implementations:

- `NflverseProvider` — Phase 0.1
- `MockProvider` — tests
- Later: `SleeperProvider`, `SportsDataIOProvider`

CSV column names and nflverse field types stay inside `packages/sports-data/src/nflverse`.

## HTTP

| Process | Port | Role |
|---------|------|------|
| `apps/web` | 3000 (or `3002` if taken) | UI |
| `apps/api` | 3001 (or `3010` if taken) | REST |

Public (no session): `GET /api/players`, `GET /api/players/:id`.

Dev login upserts stub `auth.users` + `public.users` so IDs stay `uuid = future auth.users.id`. Signed session (`SESSION_SECRET`) via Bearer or httpOnly cookie. League, draft, and matchup routes require a session.

The live draft board **polls** Express (about 1.5s). Scoreboard polls about 15s while a week is live. Draft clock expiry and week lineup lock are **lazy**: the next authenticated GET/POST that sees the condition performs the work. No worker, Redis, or Realtime.

Secrets stay in environment variables. Never send provider keys to the client.

## Database access

The API and ingest CLI use a server-side `DATABASE_URL`. Phase 0.1 currently runs on Neon over HTTP because this network blocks outbound 5432. Prefer `postgres.js` against local/Supabase direct connections when those exist. If you must use a pooler, disable prepared statements.

Default ports are web `3000` and API `3001`. This machine uses `3002` / `3010` when those defaults are taken — see `.env`.

Row Level Security allows public `SELECT` on sports tables. Fantasy tables deny `anon`. Express uses the database owner (bypasses RLS); league rules are enforced in Express.

Neon HTTP (`drizzle-orm/neon-http`) has no interactive transactions. League create, draft picks, matchup inserts, and week snapshots are ordered inserts; unique constraints serialize races. A mid-flight failure returns 409/500.

Fantasy points are not columns. Changing `league_scoring_rules` changes standings on the next read.

## Cost

Target $0/month: Neon/Supabase free tier, no Redis, no commercial sports API, no hosted worker. Ingest and DST seed are CLIs. Draft clock and week lock have no background job.
