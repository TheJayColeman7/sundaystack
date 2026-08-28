# Roadmap

## Done: Phase 0.1 — Foundation

- Monorepo, sports schema, nflverse ingest, public `GET /api/players`

## Done: Phase 0.2 — Fantasy League System

- Dev login, create/join league, settings, scoring **rules**
- Manual add/drop, lineup validation, player search picker, thin profile
- Seeded team DST (`DEF`) players

## Done: Phase 0.3 — Draft System

Snake draft MVP: lobby, order, timer, availability, queue, picks, live board (HTTP polling), roster updates.

**Out of this phase (still later):** linear/auction/dynasty, ADP product, WebSockets, real Supabase Auth.

## Done: Phase 0.4 — Weekly Fantasy Games

Matchups, weekly lineups, fantasy scoring engine (skill + K; DEF = 0), totals, results, records, standings.

**Out of this phase (still later):** projections, DST ingest, persisting fantasy points, scoring worker.

## Current: Phase 0.5 — League Management

**In progress (0.5a):** free agents and waivers (rolling priority and FAAB). ESPN weekly window; lazy process; no worker.

**Later in 0.5:** trades, extra commissioner tools, playoffs.

## Explicitly later

AI roster / trade / start-sit / waiver / draft assistants.

## MVP fantasy scope

NFL, redraft, 8–14 teams, snake draft (0.3), PPR / half PPR / standard, 1QB, FAAB or waiver priority (0.5).
