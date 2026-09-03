import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { scorePlayer } from "@sundaystack/fantasy-engine";
import type {
  CountingStats,
  LeaguePlayerProfileDto,
  ScoringRule,
} from "@sundaystack/shared";
import { isStatKey, pickNextNflGame } from "@sundaystack/shared";
import type { Database } from "../client";
import {
  fantasyTeams,
  games,
  leagueScoringRules,
  leagues,
  playerGameStats,
  players,
  seasons,
  teams,
} from "../schema";
import { LeagueError, getFantasyTeam } from "./leagues";
import { playoffsHaveStarted } from "./matchups";
import { getLeaguePlayerOccupancy } from "./rosters";
import { getWaiverWindowForLeague } from "./waivers";

function rowToStats(row: {
  completions: number;
  attempts: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  sacks: number;
  sackYards: number;
  passingTwoPointConversions: number;
  rushingAttempts: number;
  rushingYards: number;
  rushingTds: number;
  rushingTwoPointConversions: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  receivingTwoPointConversions: number;
  rushingFumbles: number;
  rushingFumblesLost: number;
  receivingFumbles: number;
  receivingFumblesLost: number;
  sackFumbles: number;
  sackFumblesLost: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsMade0to19: number;
  fieldGoalsMade20to29: number;
  fieldGoalsMade30to39: number;
  fieldGoalsMade40to49: number;
  fieldGoalsMade50Plus: number;
  extraPointsMade: number;
  extraPointsAttempted: number;
}): CountingStats {
  return {
    completions: row.completions,
    attempts: row.attempts,
    passingYards: row.passingYards,
    passingTds: row.passingTds,
    interceptions: row.interceptions,
    sacks: row.sacks,
    sackYards: row.sackYards,
    passingTwoPointConversions: row.passingTwoPointConversions,
    rushingAttempts: row.rushingAttempts,
    rushingYards: row.rushingYards,
    rushingTds: row.rushingTds,
    rushingTwoPointConversions: row.rushingTwoPointConversions,
    targets: row.targets,
    receptions: row.receptions,
    receivingYards: row.receivingYards,
    receivingTds: row.receivingTds,
    receivingTwoPointConversions: row.receivingTwoPointConversions,
    rushingFumbles: row.rushingFumbles,
    rushingFumblesLost: row.rushingFumblesLost,
    receivingFumbles: row.receivingFumbles,
    receivingFumblesLost: row.receivingFumblesLost,
    sackFumbles: row.sackFumbles,
    sackFumblesLost: row.sackFumblesLost,
    fieldGoalsMade: row.fieldGoalsMade,
    fieldGoalsAttempted: row.fieldGoalsAttempted,
    fieldGoalsMade0to19: row.fieldGoalsMade0to19,
    fieldGoalsMade20to29: row.fieldGoalsMade20to29,
    fieldGoalsMade30to39: row.fieldGoalsMade30to39,
    fieldGoalsMade40to49: row.fieldGoalsMade40to49,
    fieldGoalsMade50Plus: row.fieldGoalsMade50Plus,
    extraPointsMade: row.extraPointsMade,
    extraPointsAttempted: row.extraPointsAttempted,
  };
}

async function loadScoringRules(db: Database, leagueId: string): Promise<ScoringRule[]> {
  const rows = await db
    .select({
      statKey: leagueScoringRules.statKey,
      pointsPer: leagueScoringRules.pointsPer,
    })
    .from(leagueScoringRules)
    .where(eq(leagueScoringRules.leagueId, leagueId));

  return rows.flatMap((row) => {
    if (!isStatKey(row.statKey)) {
      return [];
    }
    return [{ statKey: row.statKey, pointsPer: Number(row.pointsPer) }];
  });
}

export async function getLeaguePlayerProfile(
  db: Database,
  input: { leagueId: string; playerId: string; userId: string },
): Promise<LeaguePlayerProfileDto | null> {
  const [league] = await db
    .select({
      id: leagues.id,
      status: leagues.status,
      seasonId: leagues.seasonId,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    throw new LeagueError("League not found", 404);
  }

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
      primaryColor: teams.primaryColor,
      secondaryColor: teams.secondaryColor,
    })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(eq(players.id, input.playerId))
    .limit(1);

  if (!row) {
    return null;
  }

  const occupancy = await getLeaguePlayerOccupancy(db, input.leagueId);
  const ownerTeamId = occupancy.get(input.playerId) ?? null;
  const ownerTeam = ownerTeamId ? await getFantasyTeam(db, ownerTeamId) : null;

  const [myTeam] = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(and(eq(fantasyTeams.leagueId, input.leagueId), eq(fantasyTeams.ownerUserId, input.userId)))
    .limit(1);

  const rules = await loadScoringRules(db, input.leagueId);
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");

  const recentRows = await db
    .select({
      week: playerGameStats.week,
      seasonYear: seasons.year,
      statsTeamId: playerGameStats.teamId,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeAbbreviation: homeTeam.abbreviation,
      awayAbbreviation: awayTeam.abbreviation,
      completions: playerGameStats.completions,
      attempts: playerGameStats.attempts,
      passingYards: playerGameStats.passingYards,
      passingTds: playerGameStats.passingTds,
      interceptions: playerGameStats.interceptions,
      sacks: playerGameStats.sacks,
      sackYards: playerGameStats.sackYards,
      passingTwoPointConversions: playerGameStats.passingTwoPointConversions,
      rushingAttempts: playerGameStats.rushingAttempts,
      rushingYards: playerGameStats.rushingYards,
      rushingTds: playerGameStats.rushingTds,
      rushingTwoPointConversions: playerGameStats.rushingTwoPointConversions,
      targets: playerGameStats.targets,
      receptions: playerGameStats.receptions,
      receivingYards: playerGameStats.receivingYards,
      receivingTds: playerGameStats.receivingTds,
      receivingTwoPointConversions: playerGameStats.receivingTwoPointConversions,
      rushingFumbles: playerGameStats.rushingFumbles,
      rushingFumblesLost: playerGameStats.rushingFumblesLost,
      receivingFumbles: playerGameStats.receivingFumbles,
      receivingFumblesLost: playerGameStats.receivingFumblesLost,
      sackFumbles: playerGameStats.sackFumbles,
      sackFumblesLost: playerGameStats.sackFumblesLost,
      fieldGoalsMade: playerGameStats.fieldGoalsMade,
      fieldGoalsAttempted: playerGameStats.fieldGoalsAttempted,
      fieldGoalsMade0to19: playerGameStats.fieldGoalsMade0to19,
      fieldGoalsMade20to29: playerGameStats.fieldGoalsMade20to29,
      fieldGoalsMade30to39: playerGameStats.fieldGoalsMade30to39,
      fieldGoalsMade40to49: playerGameStats.fieldGoalsMade40to49,
      fieldGoalsMade50Plus: playerGameStats.fieldGoalsMade50Plus,
      extraPointsMade: playerGameStats.extraPointsMade,
      extraPointsAttempted: playerGameStats.extraPointsAttempted,
    })
    .from(playerGameStats)
    .innerJoin(games, eq(playerGameStats.gameId, games.id))
    .innerJoin(seasons, eq(playerGameStats.seasonId, seasons.id))
    .leftJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .leftJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .where(eq(playerGameStats.playerId, input.playerId))
    .orderBy(desc(seasons.year), desc(playerGameStats.week))
    .limit(5);

  const recentGames = recentRows.map((game) => {
    const opponentAbbreviation =
      game.statsTeamId && game.statsTeamId === game.homeTeamId
        ? game.awayAbbreviation
        : game.homeAbbreviation;
    const stats = rowToStats(game);
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
      points: scorePlayer(stats, rules, row.position),
    };
  });

  let nextGame: LeaguePlayerProfileDto["nextGame"] = null;
  if (row.teamId) {
    const nflGames = await db
      .select({
        week: games.week,
        status: games.status,
        kickoffAt: games.kickoffAt,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeAbbreviation: homeTeam.abbreviation,
        awayAbbreviation: awayTeam.abbreviation,
      })
      .from(games)
      .leftJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .leftJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
      .where(
        and(
          eq(games.seasonId, league.seasonId),
          eq(games.seasonType, "REG"),
          or(eq(games.homeTeamId, row.teamId), eq(games.awayTeamId, row.teamId)),
        ),
      );

    const picked = pickNextNflGame(nflGames, new Date());
    if (picked) {
      const home = picked.homeTeamId === row.teamId;
      nextGame = {
        week: picked.week,
        kickoffAt: picked.kickoffAt ? picked.kickoffAt.toISOString() : null,
        opponentAbbreviation: home ? picked.awayAbbreviation : picked.homeAbbreviation,
        home,
      };
    }
  }

  const leagueStatus = league.status as LeaguePlayerProfileDto["leagueStatus"];
  const [waiverWindow, tradesClosed] = await Promise.all([
    getWaiverWindowForLeague(db, input.leagueId),
    playoffsHaveStarted(db, input.leagueId),
  ]);

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
            primaryColor: row.primaryColor,
            secondaryColor: row.secondaryColor,
          }
        : null,
    ownership:
      ownerTeam && ownerTeam.leagueId === input.leagueId
        ? {
            teamId: ownerTeam.id,
            teamName: ownerTeam.name,
            ownerDisplayName: ownerTeam.ownerDisplayName,
          }
        : null,
    myTeamId: myTeam?.id ?? null,
    leagueStatus,
    waiverWindow,
    tradesClosed,
    recentGames,
    nextGame,
  };
}
