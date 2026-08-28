# SundayStack

NFL fantasy football platform. Phase 0.2: sports data, dev login, leagues, and clickable rosters. Fantasy **points** and drafts are later phases.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` then `corepack prepare pnpm@10.14.0 --activate`)
- Docker (for local Supabase) **or** a free [Supabase](https://supabase.com) / [Neon](https://neon.tech) project

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill `DATABASE_URL` and `SESSION_SECRET` in `.env`. Set `API_CORS_ORIGIN` to the web origin you actually run (do not assume port 3000).

### Local database (Supabase CLI)

```bash
npx supabase start
npx supabase status
```

Use the local Postgres URL (port `54322` by default) as `DATABASE_URL`. Migrations in `supabase/migrations` apply on start.

### Cloud Postgres (Neon or Supabase)

Apply `supabase/migrations` in order (foundation, then fantasy). Against Neon from a network that blocks outbound 5432, use the HTTP/serverless driver (already selected when `DATABASE_URL` contains `neon.tech`).

## Commands

```bash
pnpm ingest          # download nflverse CSVs, normalize, upsert into Postgres
pnpm seed:dst        # seed 32 team D/ST players (provider sundaystack)
pnpm test            # unit tests (normalizers, scoring presets, lineup rules)
pnpm typecheck
pnpm dev:api         # Express API (default http://localhost:3001)
pnpm dev:web         # Next.js UI (default http://localhost:3000)
```

If 3000/3001 are taken, set `API_PORT`, `API_CORS_ORIGIN`, and `NEXT_PUBLIC_API_URL` in `.env`. For the web app, pass a port: `pnpm --filter @sundaystack/web exec next dev --port 3002`.

## Verify

```bash
curl "http://localhost:3001/health"
curl "http://localhost:3001/api/players?search=mahomes&position=QB"
```

Then open the web app, sign in with the dev login (email + display name, no password), create a league, join from a second session, add a player, set a lineup, drop.

## Workspace

| Path | Role |
|------|------|
| `apps/web` | Next.js UI (login, leagues, roster, player profile) |
| `apps/api` | Express REST |
| `packages/shared` | Domain types, scoring presets, lineup validation, DTOs |
| `packages/database` | Drizzle schema and queries |
| `packages/sports-data` | Providers + ingest CLI |
| `supabase/migrations` | Canonical SQL |
| `docs/` | Architecture, data model, roadmap |

All HTTP APIs live in Express. Next.js does not duplicate `/api` routes.
