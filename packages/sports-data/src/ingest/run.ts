import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createDb,
  gameExternalIds,
  games,
  playerExternalIds,
  playerGameStats,
  players,
  seasons,
  sports,
  teamExternalIds,
  teams,
  type Database,
} from "@sundaystack/database";
import type {
  CountingStats,
  NormalizedGame,
  NormalizedPlayer,
  NormalizedPlayerGameStats,
  NormalizedTeam,
} from "@sundaystack/shared";
import type { SportsDataProvider } from "../provider";

const NFL_CODE = "nfl";
const BATCH_SIZE = 250;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function requireNflSport(db: Database): Promise<string> {
  const [sport] = await db.select().from(sports).where(eq(sports.code, NFL_CODE)).limit(1);
  if (!sport) {
    throw new Error("NFL sport row is missing. Apply supabase migrations first.");
  }
  return sport.id;
}

async function upsertTeams(
  db: Database,
  sportId: string,
  incoming: NormalizedTeam[],
): Promise<Map<string, string>> {
  const abbreviationToId = new Map<string, string>();

  for (const team of incoming) {
    const [existing] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.sportId, sportId), eq(teams.abbreviation, team.abbreviation)))
      .limit(1);

    const id = existing?.id ?? randomUUID();
    if (existing) {
      await db
        .update(teams)
        .set({
          name: team.name,
          city: team.city,
          conference: team.conference,
          division: team.division,
          updatedAt: new Date(),
        })
        .where(eq(teams.id, existing.id));
    } else {
      await db.insert(teams).values({
        id,
        sportId,
        abbreviation: team.abbreviation,
        name: team.name,
        city: team.city,
        conference: team.conference,
        division: team.division,
      });
    }

    abbreviationToId.set(team.abbreviation, id);

    if (team.externalIds.length > 0) {
      await db
        .insert(teamExternalIds)
        .values(
          team.externalIds.map((external) => ({
            teamId: id,
            provider: external.provider,
            externalId: external.externalId,
          })),
        )
        .onConflictDoNothing({
          target: [teamExternalIds.provider, teamExternalIds.externalId],
        });
    }
  }

  return abbreviationToId;
}

async function upsertSeasons(
  db: Database,
  sportId: string,
  years: number[],
): Promise<Map<number, string>> {
  const yearToId = new Map<number, string>();

  for (const year of years) {
    const [existing] = await db
      .select()
      .from(seasons)
      .where(and(eq(seasons.sportId, sportId), eq(seasons.year, year)))
      .limit(1);

    if (existing) {
      yearToId.set(year, existing.id);
      continue;
    }

    const id = randomUUID();
    await db.insert(seasons).values({ id, sportId, year });
    yearToId.set(year, id);
  }

  return yearToId;
}

async function loadGsisMap(db: Database, gsisIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunk(gsisIds, BATCH_SIZE)) {
    if (batch.length === 0) {
      continue;
    }
    const rows = await db
      .select()
      .from(playerExternalIds)
      .where(and(eq(playerExternalIds.provider, "gsis"), inArray(playerExternalIds.externalId, batch)));
    for (const row of rows) {
      map.set(row.externalId, row.playerId);
    }
  }
  return map;
}

async function upsertPlayers(
  db: Database,
  sportId: string,
  teamIds: Map<string, string>,
  incoming: NormalizedPlayer[],
): Promise<Map<string, string>> {
  const gsisIds = incoming
    .map((player) => player.externalIds.find((id) => id.provider === "gsis")?.externalId)
    .filter((id): id is string => Boolean(id));
  const gsisToPlayerId = await loadGsisMap(db, gsisIds);

  const toInsert: Array<typeof players.$inferInsert> = [];
  const externalInserts: Array<typeof playerExternalIds.$inferInsert> = [];

  for (const player of incoming) {
    const gsis = player.externalIds.find((id) => id.provider === "gsis")?.externalId;
    if (!gsis) {
      continue;
    }

    const teamId = player.teamAbbreviation ? (teamIds.get(player.teamAbbreviation) ?? null) : null;
    const existingId = gsisToPlayerId.get(gsis);

    if (existingId) {
      await db
        .update(players)
        .set({
          teamId,
          firstName: player.firstName,
          lastName: player.lastName,
          displayName: player.displayName,
          position: player.position,
          jerseyNumber: player.jerseyNumber,
          status: player.status,
          headshotUrl: player.headshotUrl,
          updatedAt: new Date(),
        })
        .where(eq(players.id, existingId));
    } else {
      const id = randomUUID();
      gsisToPlayerId.set(gsis, id);
      toInsert.push({
        id,
        sportId,
        teamId,
        firstName: player.firstName,
        lastName: player.lastName,
        displayName: player.displayName,
        position: player.position,
        jerseyNumber: player.jerseyNumber,
        status: player.status,
        headshotUrl: player.headshotUrl,
      });
    }

    for (const external of player.externalIds) {
      const playerId = gsisToPlayerId.get(gsis);
      if (!playerId) {
        continue;
      }
      externalInserts.push({
        playerId,
        provider: external.provider,
        externalId: external.externalId,
      });
    }
  }

  for (const batch of chunk(toInsert, BATCH_SIZE)) {
    if (batch.length === 0) {
      continue;
    }
    await db.insert(players).values(batch);
  }

  for (const batch of chunk(externalInserts, BATCH_SIZE)) {
    if (batch.length === 0) {
      continue;
    }
    await db
      .insert(playerExternalIds)
      .values(batch)
      .onConflictDoNothing({
        target: [playerExternalIds.provider, playerExternalIds.externalId],
      });
  }

  return gsisToPlayerId;
}

async function loadGameIdMap(db: Database, externalIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunk(externalIds, BATCH_SIZE)) {
    if (batch.length === 0) {
      continue;
    }
    const rows = await db
      .select()
      .from(gameExternalIds)
      .where(and(eq(gameExternalIds.provider, "nflverse"), inArray(gameExternalIds.externalId, batch)));
    for (const row of rows) {
      map.set(row.externalId, row.gameId);
    }
  }
  return map;
}

async function upsertGames(
  db: Database,
  seasonIds: Map<number, string>,
  teamIds: Map<string, string>,
  incoming: NormalizedGame[],
): Promise<Map<string, string>> {
  const externalKeys = incoming
    .map((game) => game.externalIds.find((id) => id.provider === "nflverse")?.externalId)
    .filter((id): id is string => Boolean(id));
  const gameIds = await loadGameIdMap(db, externalKeys);

  for (const game of incoming) {
    const externalId = game.externalIds.find((id) => id.provider === "nflverse")?.externalId;
    if (!externalId) {
      continue;
    }

    const seasonId = seasonIds.get(game.season);
    const homeTeamId = teamIds.get(game.homeTeamAbbreviation);
    const awayTeamId = teamIds.get(game.awayTeamAbbreviation);
    if (!seasonId || !homeTeamId || !awayTeamId) {
      continue;
    }

    const existingId = gameIds.get(externalId);
    const fields = {
      seasonId,
      week: game.week,
      seasonType: game.seasonType,
      homeTeamId,
      awayTeamId,
      kickoffAt: game.kickoffAt ? new Date(game.kickoffAt) : null,
      status: game.status,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    };

    if (existingId) {
      await db
        .update(games)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(games.id, existingId));
      continue;
    }

    const id = randomUUID();
    await db.insert(games).values({ id, ...fields });
    await db
      .insert(gameExternalIds)
      .values({
        gameId: id,
        provider: "nflverse",
        externalId,
      })
      .onConflictDoNothing({
        target: [gameExternalIds.provider, gameExternalIds.externalId],
      });
    gameIds.set(externalId, id);
  }

  return gameIds;
}

function statsColumns(stats: CountingStats) {
  return {
    completions: stats.completions,
    attempts: stats.attempts,
    passingYards: stats.passingYards,
    passingTds: stats.passingTds,
    interceptions: stats.interceptions,
    sacks: stats.sacks,
    sackYards: stats.sackYards,
    passingTwoPointConversions: stats.passingTwoPointConversions,
    rushingAttempts: stats.rushingAttempts,
    rushingYards: stats.rushingYards,
    rushingTds: stats.rushingTds,
    rushingTwoPointConversions: stats.rushingTwoPointConversions,
    targets: stats.targets,
    receptions: stats.receptions,
    receivingYards: stats.receivingYards,
    receivingTds: stats.receivingTds,
    receivingTwoPointConversions: stats.receivingTwoPointConversions,
    rushingFumbles: stats.rushingFumbles,
    rushingFumblesLost: stats.rushingFumblesLost,
    receivingFumbles: stats.receivingFumbles,
    receivingFumblesLost: stats.receivingFumblesLost,
    sackFumbles: stats.sackFumbles,
    sackFumblesLost: stats.sackFumblesLost,
    fieldGoalsMade: stats.fieldGoalsMade,
    fieldGoalsAttempted: stats.fieldGoalsAttempted,
    fieldGoalsMade0to19: stats.fieldGoalsMade0to19,
    fieldGoalsMade20to29: stats.fieldGoalsMade20to29,
    fieldGoalsMade30to39: stats.fieldGoalsMade30to39,
    fieldGoalsMade40to49: stats.fieldGoalsMade40to49,
    fieldGoalsMade50Plus: stats.fieldGoalsMade50Plus,
    extraPointsMade: stats.extraPointsMade,
    extraPointsAttempted: stats.extraPointsAttempted,
  };
}

const STAT_EXCLUDED = {
  seasonId: sql`excluded.season_id`,
  teamId: sql`excluded.team_id`,
  week: sql`excluded.week`,
  completions: sql`excluded.completions`,
  attempts: sql`excluded.attempts`,
  passingYards: sql`excluded.passing_yards`,
  passingTds: sql`excluded.passing_tds`,
  interceptions: sql`excluded.interceptions`,
  sacks: sql`excluded.sacks`,
  sackYards: sql`excluded.sack_yards`,
  passingTwoPointConversions: sql`excluded.passing_two_point_conversions`,
  rushingAttempts: sql`excluded.rushing_attempts`,
  rushingYards: sql`excluded.rushing_yards`,
  rushingTds: sql`excluded.rushing_tds`,
  rushingTwoPointConversions: sql`excluded.rushing_two_point_conversions`,
  targets: sql`excluded.targets`,
  receptions: sql`excluded.receptions`,
  receivingYards: sql`excluded.receiving_yards`,
  receivingTds: sql`excluded.receiving_tds`,
  receivingTwoPointConversions: sql`excluded.receiving_two_point_conversions`,
  rushingFumbles: sql`excluded.rushing_fumbles`,
  rushingFumblesLost: sql`excluded.rushing_fumbles_lost`,
  receivingFumbles: sql`excluded.receiving_fumbles`,
  receivingFumblesLost: sql`excluded.receiving_fumbles_lost`,
  sackFumbles: sql`excluded.sack_fumbles`,
  sackFumblesLost: sql`excluded.sack_fumbles_lost`,
  fieldGoalsMade: sql`excluded.field_goals_made`,
  fieldGoalsAttempted: sql`excluded.field_goals_attempted`,
  fieldGoalsMade0to19: sql`excluded.field_goals_made_0_19`,
  fieldGoalsMade20to29: sql`excluded.field_goals_made_20_29`,
  fieldGoalsMade30to39: sql`excluded.field_goals_made_30_39`,
  fieldGoalsMade40to49: sql`excluded.field_goals_made_40_49`,
  fieldGoalsMade50Plus: sql`excluded.field_goals_made_50_plus`,
  extraPointsMade: sql`excluded.extra_points_made`,
  extraPointsAttempted: sql`excluded.extra_points_attempted`,
  updatedAt: sql`now()`,
};

async function upsertStats(
  db: Database,
  seasonIds: Map<number, string>,
  teamIds: Map<string, string>,
  playerIds: Map<string, string>,
  gameIds: Map<string, string>,
  incoming: NormalizedPlayerGameStats[],
): Promise<{ written: number; skipped: number }> {
  let skipped = 0;
  const rows: Array<typeof playerGameStats.$inferInsert> = [];

  for (const stat of incoming) {
    const playerId = playerIds.get(stat.gsisId);
    const gameId = gameIds.get(stat.gameExternalId);
    const seasonId = seasonIds.get(stat.season);
    if (!playerId || !gameId || !seasonId) {
      skipped += 1;
      continue;
    }

    rows.push({
      playerId,
      gameId,
      seasonId,
      teamId: teamIds.get(stat.teamAbbreviation) ?? null,
      week: stat.week,
      ...statsColumns(stat.stats),
    });
  }

  for (const batch of chunk(rows, BATCH_SIZE)) {
    if (batch.length === 0) {
      continue;
    }
    await db
      .insert(playerGameStats)
      .values(batch)
      .onConflictDoUpdate({
        target: [playerGameStats.playerId, playerGameStats.gameId],
        set: STAT_EXCLUDED,
      });
  }

  return { written: rows.length, skipped };
}

export interface IngestSummary {
  teams: number;
  players: number;
  games: number;
  stats: number;
  statsSkipped: number;
}

export async function ingestSportsData(
  provider: SportsDataProvider,
  years: number[],
  db = createDb(),
): Promise<IngestSummary> {
  const sportId = await requireNflSport(db);

  console.info("Upserting teams…");
  const teamIds = await upsertTeams(db, sportId, await provider.getTeams());

  console.info("Upserting seasons…");
  const seasonIds = await upsertSeasons(db, sportId, years);

  console.info("Upserting players…");
  const playerIds = await upsertPlayers(db, sportId, teamIds, await provider.getPlayers());

  const allGames: NormalizedGame[] = [];
  const allStats: NormalizedPlayerGameStats[] = [];
  for (const year of years) {
    console.info(`Loading schedule ${year}…`);
    allGames.push(...(await provider.getSchedule(year)));
    console.info(`Loading player stats ${year}…`);
    allStats.push(...(await provider.getPlayerStats(year)));
  }

  console.info("Upserting games…");
  const gameIds = await upsertGames(db, seasonIds, teamIds, allGames);

  console.info("Upserting player game stats…");
  const statsResult = await upsertStats(db, seasonIds, teamIds, playerIds, gameIds, allStats);

  return {
    teams: teamIds.size,
    players: playerIds.size,
    games: gameIds.size,
    stats: statsResult.written,
    statsSkipped: statsResult.skipped,
  };
}
