# Roadmap

## Done: Phase 0.1 — Foundation

- Monorepo (pnpm, Turborepo, TypeScript strict)
- Supabase Postgres schema for sports data + `users` profile
- Sports data provider layer
- nflverse ingest for seasons 2024–2026
- Express `GET /api/players` (`search`, `team`, `position`, `limit`, `offset`)
- Next.js shell (no player UI)

Ingest has loaded teams, players, games, and weekly stats. `GET /api/players` returns real rows.

**Next:** player search UI and a basic player profile page (still no leagues). Then Phase 0.2.

## Phase 0.2 — Fantasy League System

Create/join league, members, fantasy teams, settings, roster configuration, scoring settings, rosters, starters, bench, lineup management.

## Phase 0.3 — Draft System

Snake draft MVP: lobby, order, timer, availability, queue, picks, live board, roster updates.

Later: linear, auction, dynasty startup, rookie drafts.

## Phase 0.4 — Weekly Fantasy Games

Matchups, weekly lineups, fantasy scoring engine, totals, results, records, standings. Projections later.

## Phase 0.5 — League Management

Free agents, waivers (priority and FAAB), trades, commissioner tools, playoffs.

## Explicitly later

AI roster / trade / start-sit / waiver / draft assistants. Keep the data model capable of feeding them (league scoring, rosters, injuries, usage) without building the products now.

## MVP fantasy scope (when leagues start)

NFL, redraft, 8–14 teams, snake draft, PPR / half PPR / standard, 1QB, FAAB or waiver priority.

Architecture should not block: keepers, dynasty, superflex/2QB, TE premium, auction, IR, taxi, 4–32 teams.
