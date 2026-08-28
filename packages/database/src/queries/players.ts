import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  PlayerListItem,
  PlayerListQuery,
  PlayerListResponse,
  PlayerProfile,
} from "@sundaystack/shared";
import type { Database } from "../client";
import { games, playerGameStats, players, seasons, teams } from "../schema";

function toListItem(row: {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position: string;
  jerseyNumber: number | null;
  status: string | null;
  headshotUrl: string | null;
  teamId: string | null;
  teamAbbreviation: string | null;
  teamName: string | null;
}): PlayerListItem {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    position: row.position,
    jerseyNumber: row.jerseyNumber,
    status: row.status,
    headshotUrl: row.headshotUrl,
    team:
      row.teamId && row.teamAbbreviation && row.teamName
        ? {
            id: row.teamId,
            abbreviation: row.teamAbbreviation,
            name: row.teamName,
          }
        : null,
  };
}

export async function listPlayers(
  db: Database,
  query: PlayerListQuery,
): Promise<PlayerListResponse> {
  const filters: SQL[] = [];

  if (query.position) {
    filters.push(eq(players.position, query.position.toUpperCase()));
  }

  if (query.team) {
    filters.push(eq(teams.abbreviation, query.team.toUpperCase()));
  }

  if (query.search) {
    const pattern = `%${query.search.trim()}%`;
    const nameMatch = or(
      ilike(players.displayName, pattern),
      ilike(players.firstName, pattern),
      ilike(players.lastName, pattern),
    );
    if (nameMatch) {
      filters.push(nameMatch);
    }
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      displayName: players.displayName,
      position: players.position,
      jerseyNumber: players.jerseyNumber,
      status: players.status,
      headshotUrl: players.headshotUrl,
      teamId: teams.id,
      teamAbbreviation: teams.abbreviation,
      teamName: teams.name,
    })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(whereClause)
    .orderBy(players.lastName, players.firstName)
    .limit(query.limit)
    .offset(query.offset);

  const data: PlayerListItem[] = rows.map(toListItem);

  return {
    data,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total: Number(totalRow?.total ?? 0),
    },
  };
}

export async function getPlayerProfile(
  db: Database,
  playerId: string,
): Promise<PlayerProfile | null> {
  const [row] = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      displayName: players.displayName,
      position: players.position,
      jerseyNumber: players.jerseyNumber,
      status: players.status,
      headshotUrl: players.headshotUrl,
      teamId: teams.id,
      teamAbbreviation: teams.abbreviation,
      teamName: teams.name,
    })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(eq(players.id, playerId))
    .limit(1);

  if (!row) {
    return null;
  }

  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");

  const recentRows = await db
    .select({
      week: playerGameStats.week,
      seasonYear: seasons.year,
      passingYards: playerGameStats.passingYards,
      rushingYards: playerGameStats.rushingYards,
      receivingYards: playerGameStats.receivingYards,
      receptions: playerGameStats.receptions,
      passingTds: playerGameStats.passingTds,
      rushingTds: playerGameStats.rushingTds,
      receivingTds: playerGameStats.receivingTds,
      statsTeamId: playerGameStats.teamId,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeAbbreviation: homeTeam.abbreviation,
      awayAbbreviation: awayTeam.abbreviation,
    })
    .from(playerGameStats)
    .innerJoin(games, eq(playerGameStats.gameId, games.id))
    .innerJoin(seasons, eq(playerGameStats.seasonId, seasons.id))
    .leftJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .leftJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .where(eq(playerGameStats.playerId, playerId))
    .orderBy(desc(seasons.year), desc(playerGameStats.week))
    .limit(5);

  return {
    ...toListItem(row),
    recentGames: recentRows.map((game) => {
      const opponentAbbreviation =
        game.statsTeamId && game.statsTeamId === game.homeTeamId
          ? game.awayAbbreviation
          : game.homeAbbreviation;
      return {
        week: game.week,
        seasonYear: game.seasonYear,
        opponentAbbreviation,
        passingYards: game.passingYards,
        rushingYards: game.rushingYards,
        receivingYards: game.receivingYards,
        receptions: game.receptions,
        passingTds: game.passingTds,
        rushingTds: game.rushingTds,
        receivingTds: game.receivingTds,
      };
    }),
  };
}
