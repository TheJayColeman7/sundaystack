# Architecture

SundayStack is a TypeScript monorepo (pnpm + Turborepo). Phase 0.1 delivers sports data ingestion and a public player search API. Fantasy leagues, scoring, drafts, and player UI come later.

## Why this shape

The original long-term tree included `apps/mobile`, `packages/ui`, `packages/scoring`, `packages/fantasy-engine`, and always-on `services/*`. Those packages have no second consumer yet. Standing them up now would add wiring without buying flexibility.

What we protect instead is the boundary: **no provider JSON leaves `packages/sports-data`**. Internal models in `packages/shared` are the only types the API (and later UI) may import.

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
packages/database queries
        ↓
Express GET /api/players
        ↓
Next.js (later) / React Native (later)
```

## Workspace

```text
apps/web                 Next.js App Router + Tailwind (shell only in 0.1)
apps/api                 Express REST
packages/shared          Domain types, enums, API DTOs
packages/database        Drizzle schema + player queries
packages/sports-data     SportsDataProvider, NflverseProvider, MockProvider, ingest
supabase/migrations      Canonical PostgreSQL
docs/
```

Deferred: mobile, `packages/ui`, `packages/fantasy-engine` (scoring belongs there), Redis, paid sports APIs, deployed Express host.

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
| `apps/web` | 3000 | UI |
| `apps/api` | 3001 | REST |

`GET /api/players` is public. Auth is scaffolded (`public.users` ↔ `auth.users`) but does not gate sports reads.

Secrets stay in environment variables. Never send provider keys to the client.

## Database access

The API and ingest CLI use a server-side `DATABASE_URL`. Phase 0.1 currently runs on Neon over HTTP because this network blocks outbound 5432. Prefer `postgres.js` against local/Supabase direct connections when those exist. If you must use a pooler, disable prepared statements.

Default ports are web `3000` and API `3001`. This machine uses `3002` / `3010` when those defaults are taken — see `.env`.

Row Level Security allows public `SELECT` on sports tables. Writes go through the Postgres/service role used by ingest.

## Cost

Phase 0.1 targets $0/month: local or free-tier Supabase, no Redis, no commercial sports API, no hosted worker. Ingest is a CLI, not a deployed service.
