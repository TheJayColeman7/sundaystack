# SundayStack

NFL fantasy football platform. Phase 0.1 is foundation only: sports data models, nflverse ingest, and a public player search API. There is no player-facing UI yet.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable` then `corepack prepare pnpm@10.14.0 --activate`)
- Docker (for local Supabase) **or** a free [Supabase](https://supabase.com) project

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill `DATABASE_URL` in `.env`.

### Local database (Supabase CLI)

```bash
npx supabase start
npx supabase status
```

Use the local Postgres URL (port `54322` by default) as `DATABASE_URL`. Migrations in `supabase/migrations` apply on start.

### Cloud Supabase

Create a free project, set `DATABASE_URL` to the **direct** connection (port `5432`), not the pooler, then run the SQL in `supabase/migrations` against the project.

## Commands

```bash
pnpm ingest          # download nflverse CSVs, normalize, upsert into Postgres
pnpm dev:api         # Express API on http://localhost:3001
pnpm dev:web         # Next.js shell on http://localhost:3000
pnpm test            # unit tests (normalizers; no database)
pnpm typecheck
```

## Verify Phase 0.1

After ingest:

```bash
curl "http://localhost:3001/health"
curl "http://localhost:3001/api/players?search=mahomes&position=QB"
curl "http://localhost:3001/api/players?team=KC&limit=10"
```

If port 3001 is already in use, set `API_PORT` in `.env` and point `NEXT_PUBLIC_API_URL` at the same origin.

## Workspace

| Path | Role |
|------|------|
| `apps/web` | Next.js UI (placeholder in 0.1) |
| `apps/api` | Express REST |
| `packages/shared` | Domain types and API DTOs |
| `packages/database` | Drizzle schema and queries |
| `packages/sports-data` | Providers + ingest CLI |
| `supabase/migrations` | Canonical SQL |
| `docs/` | Architecture, data model, roadmap |

All HTTP APIs live in Express. Next.js does not duplicate `/api/players`.
