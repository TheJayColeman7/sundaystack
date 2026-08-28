import { and, eq, inArray } from "drizzle-orm";
import {
  applyMatchupToStandings,
  emptyStandingsRow,
  scoreLineup,
  scorePlayer,
  sortStandings,
} from "@sundaystack/fantasy-engine";
import type {
  CountingStats,
  MatchupDto,
  PlayerWeekScoreDto,
  ScoringRule,
  StandingsRowDto,
  WeekScoreboardDto,
} from "@sundaystack/shared";
import {
  DEFAULT_REGULAR_SEASON_WEEKS,
  EMPTY_COUNTING_STATS,
  STARTER_SLOTS,
  buildRoundRobin,
  isStatKey,
} from "@sundaystack/shared";
import type { Database } from "../client";
import {
  fantasyTeams,
  games,
  leagueScoringRules,
  leagueSettings,
  leagues,
  matchups,
  playerGameStats,
  players,
  rosterPlayers,
  teams,
  weekLocks,
  weeklyLineups,
} from "../schema";
import { LeagueError, getFantasyTeam, isUniqueViolation } from "./leagues";

function addStats(left: CountingStats, right: CountingStats): CountingStats {
  const next = { ...left };
  for (const key of Object.keys(EMPTY_COUNTING_STATS) as Array<keyof CountingStats>) {
    next[key] = left[key] + right[key];
  }
  return next;
}

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

async function requireActiveLeague(db: Database, leagueId: string) {
  const [row] = await db
    .select({
      id: leagues.id,
      status: leagues.status,
      seasonId: leagues.seasonId,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);

  if (!row) {
    throw new LeagueError("League not found", 404);
  }
  if (row.status !== "active") {
    throw new LeagueError("Matchups start after the draft completes", 409, "NOT_ACTIVE");
  }
  return row;
}

async function getRegularSeasonWeeks(db: Database, leagueId: string): Promise<number> {
  const [row] = await db
    .select({ weeks: leagueSettings.regularSeasonWeeks })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  return row?.weeks ?? DEFAULT_REGULAR_SEASON_WEEKS;
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

async function loadRegGames(
  db: Database,
  seasonId: string,
): Promise<Array<{ week: number; status: string; kickoffAt: Date | null }>> {
  return db
    .select({
      week: games.week,
      status: games.status,
      kickoffAt: games.kickoffAt,
    })
    .from(games)
    .where(and(eq(games.seasonId, seasonId), eq(games.seasonType, "REG")));
}

export function deriveCurrentWeek(
  weekGames: Array<{ week: number; status: string }>,
  regularSeasonWeeks: number,
): number {
  const capped = weekGames.filter((game) => game.week >= 1 && game.week <= regularSeasonWeeks);
  if (capped.length === 0) {
    return 1;
  }

  const weeks = [...new Set(capped.map((game) => game.week))].sort((a, b) => a - b);
  for (const week of weeks) {
    const gamesInWeek = capped.filter((game) => game.week === week);
    if (!gamesInWeek.every((game) => game.status === "final")) {
      return week;
    }
  }

  return Math.min(regularSeasonWeeks, weeks[weeks.length - 1] ?? 1);
}

export async function listWeekLockAts(db: Database, leagueId: string): Promise<Date[]> {
  const [league] = await db
    .select({ seasonId: leagues.seasonId })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league) {
    throw new LeagueError("League not found", 404);
  }

  const weeks = await getRegularSeasonWeeks(db, leagueId);
  const weekGames = await loadRegGames(db, league.seasonId);
  const lockAts: Date[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    const lockAt = weekLockAt(weekGames, week);
    if (lockAt) {
      lockAts.push(lockAt);
    }
  }
  return lockAts;
}

export function weekLockAt(
  weekGames: Array<{ week: number; status: string; kickoffAt: Date | null }>,
  week: number,
): Date | null {
  const gamesInWeek = weekGames.filter((game) => game.week === week);
  const kickoffs = gamesInWeek
    .map((game) => game.kickoffAt)
    .filter((value): value is Date => value instanceof Date);
  if (kickoffs.length > 0) {
    return new Date(Math.min(...kickoffs.map((value) => value.getTime())));
  }
  if (gamesInWeek.some((game) => game.status === "in_progress" || game.status === "final")) {
    return new Date(0);
  }
  return null;
}

function isLocked(lockAt: Date | null, now: Date): boolean {
  return lockAt !== null && now.getTime() >= lockAt.getTime();
}

export async function ensureSchedule(db: Database, leagueId: string): Promise<void> {
  await requireActiveLeague(db, leagueId);
  const [existing] = await db
    .select({ id: matchups.id })
    .from(matchups)
    .where(eq(matchups.leagueId, leagueId))
    .limit(1);
  if (existing) {
    return;
  }

  const teamRows = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId));
  const teamIds = teamRows.map((row) => row.id);
  if (teamIds.length < 2 || teamIds.length % 2 !== 0) {
    throw new LeagueError("Need an even number of teams for matchups", 400, "ODD_TEAMS");
  }

  const weeks = await getRegularSeasonWeeks(db, leagueId);
  const pairings = buildRoundRobin(teamIds, weeks);
  try {
    await db.insert(matchups).values(
      pairings.map((row) => ({
        leagueId,
        week: row.week,
        homeFantasyTeamId: row.homeTeamId,
        awayFantasyTeamId: row.awayTeamId,
      })),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}

async function snapshotWeek(db: Database, leagueId: string, week: number): Promise<void> {
  const [existing] = await db
    .select({ id: weekLocks.id })
    .from(weekLocks)
    .where(and(eq(weekLocks.leagueId, leagueId), eq(weekLocks.week, week)))
    .limit(1);
  if (existing) {
    return;
  }

  const rostered = await db
    .select({
      fantasyTeamId: rosterPlayers.fantasyTeamId,
      playerId: rosterPlayers.playerId,
      slot: rosterPlayers.slot,
    })
    .from(rosterPlayers)
    .where(eq(rosterPlayers.leagueId, leagueId));

  if (rostered.length > 0) {
    try {
      await db.insert(weeklyLineups).values(
        rostered.map((row) => ({
          leagueId,
          week,
          fantasyTeamId: row.fantasyTeamId,
          playerId: row.playerId,
          slot: row.slot,
        })),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  try {
    await db.insert(weekLocks).values({
      leagueId,
      week,
      lockedAt: new Date(),
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}

async function ensureWeekLockedIfDue(
  db: Database,
  leagueId: string,
  week: number,
  weekGames: Array<{ week: number; status: string; kickoffAt: Date | null }>,
  now: Date,
): Promise<boolean> {
  const [lockRow] = await db
    .select({ lockedAt: weekLocks.lockedAt })
    .from(weekLocks)
    .where(and(eq(weekLocks.leagueId, leagueId), eq(weekLocks.week, week)))
    .limit(1);
  if (lockRow) {
    return true;
  }
  const lockAt = weekLockAt(weekGames, week);
  if (!isLocked(lockAt, now)) {
    return false;
  }
  await snapshotWeek(db, leagueId, week);
  return true;
}

async function loadWeekStats(
  db: Database,
  seasonId: string,
  week: number,
): Promise<Map<string, CountingStats>> {
  const rows = await db
    .select({
      playerId: playerGameStats.playerId,
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
    .where(
      and(
        eq(playerGameStats.seasonId, seasonId),
        eq(playerGameStats.week, week),
        eq(games.seasonType, "REG"),
      ),
    );

  const byPlayer = new Map<string, CountingStats>();
  for (const row of rows) {
    const current = byPlayer.get(row.playerId) ?? { ...EMPTY_COUNTING_STATS };
    byPlayer.set(row.playerId, addStats(current, rowToStats(row)));
  }
  return byPlayer;
}

type LineupRow = {
  fantasyTeamId: string;
  playerId: string;
  slot: string;
  displayName: string;
  position: string;
  teamAbbreviation: string | null;
};

async function loadLineupsByTeam(
  db: Database,
  leagueId: string,
  week: number,
  locked: boolean,
): Promise<Map<string, LineupRow[]>> {
  const rows = locked
    ? await db
        .select({
          fantasyTeamId: weeklyLineups.fantasyTeamId,
          playerId: weeklyLineups.playerId,
          slot: weeklyLineups.slot,
          displayName: players.displayName,
          position: players.position,
          teamAbbreviation: teams.abbreviation,
        })
        .from(weeklyLineups)
        .innerJoin(players, eq(weeklyLineups.playerId, players.id))
        .leftJoin(teams, eq(players.teamId, teams.id))
        .where(and(eq(weeklyLineups.leagueId, leagueId), eq(weeklyLineups.week, week)))
    : await db
        .select({
          fantasyTeamId: rosterPlayers.fantasyTeamId,
          playerId: rosterPlayers.playerId,
          slot: rosterPlayers.slot,
          displayName: players.displayName,
          position: players.position,
          teamAbbreviation: teams.abbreviation,
        })
        .from(rosterPlayers)
        .innerJoin(players, eq(rosterPlayers.playerId, players.id))
        .leftJoin(teams, eq(players.teamId, teams.id))
        .where(eq(rosterPlayers.leagueId, leagueId));

  const byTeam = new Map<string, LineupRow[]>();
  for (const row of rows) {
    const list = byTeam.get(row.fantasyTeamId) ?? [];
    list.push(row);
    byTeam.set(row.fantasyTeamId, list);
  }
  return byTeam;
}

function scoreSide(
  lineup: Array<{
    playerId: string;
    slot: string;
    displayName: string;
    position: string;
    teamAbbreviation: string | null;
  }>,
  statsByPlayer: Map<string, CountingStats>,
  rules: ScoringRule[],
): { points: number; players: PlayerWeekScoreDto[] } {
  const playersDto: PlayerWeekScoreDto[] = lineup.map((row) => ({
    playerId: row.playerId,
    displayName: row.displayName,
    position: row.position,
    slot: row.slot,
    teamAbbreviation: row.teamAbbreviation,
    points: (STARTER_SLOTS as readonly string[]).includes(row.slot)
      ? scorePlayer(statsByPlayer.get(row.playerId) ?? null, rules, row.position)
      : 0,
  }));

  const points = scoreLineup(
    lineup.map((row) => ({
      playerId: row.playerId,
      position: row.position,
      slot: row.slot,
      stats: statsByPlayer.get(row.playerId) ?? null,
    })),
    rules,
  );

  return { points, players: playersDto };
}

export async function isCurrentWeekLineupLocked(db: Database, leagueId: string): Promise<boolean> {
  const [league] = await db
    .select({
      status: leagues.status,
      seasonId: leagues.seasonId,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league || league.status !== "active") {
    return false;
  }
  const weeks = await getRegularSeasonWeeks(db, leagueId);
  const weekGames = await loadRegGames(db, league.seasonId);
  const currentWeek = deriveCurrentWeek(weekGames, weeks);
  const [lockRow] = await db
    .select({ id: weekLocks.id })
    .from(weekLocks)
    .where(and(eq(weekLocks.leagueId, leagueId), eq(weekLocks.week, currentWeek)))
    .limit(1);
  if (lockRow) {
    return true;
  }
  return isLocked(weekLockAt(weekGames, currentWeek), new Date());
}

export async function getScoreboard(
  db: Database,
  leagueId: string,
  requestedWeek?: number,
): Promise<WeekScoreboardDto> {
  const league = await requireActiveLeague(db, leagueId);
  await ensureSchedule(db, leagueId);
  const regularSeasonWeeks = await getRegularSeasonWeeks(db, leagueId);
  const weekGames = await loadRegGames(db, league.seasonId);
  const currentWeek = deriveCurrentWeek(weekGames, regularSeasonWeeks);
  const week = requestedWeek ?? currentWeek;
  if (week < 1 || week > regularSeasonWeeks) {
    throw new LeagueError("Invalid week", 400);
  }

  const now = new Date();
  const locked = await ensureWeekLockedIfDue(db, leagueId, week, weekGames, now);
  const lockAt = weekLockAt(weekGames, week);
  const secondsToLock =
    !locked && lockAt ? Math.max(0, Math.floor((lockAt.getTime() - now.getTime()) / 1000)) : locked ? 0 : null;

  const rules = await loadScoringRules(db, leagueId);
  const statsByPlayer = await loadWeekStats(db, league.seasonId, week);
  const matchupRows = await db
    .select({
      id: matchups.id,
      homeTeamId: matchups.homeFantasyTeamId,
      awayTeamId: matchups.awayFantasyTeamId,
      homeName: fantasyTeams.name,
    })
    .from(matchups)
    .innerJoin(fantasyTeams, eq(matchups.homeFantasyTeamId, fantasyTeams.id))
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.week, week)));

  const awayIds = matchupRows.map((row) => row.awayTeamId);
  const awayNames = new Map<string, string>();
  if (awayIds.length > 0) {
    const awayTeams = await db
      .select({ id: fantasyTeams.id, name: fantasyTeams.name })
      .from(fantasyTeams)
      .where(inArray(fantasyTeams.id, awayIds));
    for (const team of awayTeams) {
      awayNames.set(team.id, team.name);
    }
  }

  const lineups = await loadLineupsByTeam(db, leagueId, week, locked);
  const board = [];
  for (const row of matchupRows) {
    const home = scoreSide(lineups.get(row.homeTeamId) ?? [], statsByPlayer, rules);
    const away = scoreSide(lineups.get(row.awayTeamId) ?? [], statsByPlayer, rules);
    board.push({
      id: row.id,
      homeTeamId: row.homeTeamId,
      homeTeamName: row.homeName,
      homePoints: home.points,
      awayTeamId: row.awayTeamId,
      awayTeamName: awayNames.get(row.awayTeamId) ?? "Away",
      awayPoints: away.points,
    });
  }

  return {
    week,
    currentWeek,
    regularSeasonWeeks,
    locked,
    lockedAt: locked && lockAt ? lockAt.toISOString() : locked ? now.toISOString() : null,
    secondsToLock,
    matchups: board,
  };
}

export async function getStandings(db: Database, leagueId: string): Promise<StandingsRowDto[]> {
  const league = await requireActiveLeague(db, leagueId);
  await ensureSchedule(db, leagueId);
  const regularSeasonWeeks = await getRegularSeasonWeeks(db, leagueId);
  const weekGames = await loadRegGames(db, league.seasonId);
  const currentWeek = deriveCurrentWeek(weekGames, regularSeasonWeeks);
  const now = new Date();
  const rules = await loadScoringRules(db, leagueId);

  const teamRows = await db
    .select({
      id: fantasyTeams.id,
      name: fantasyTeams.name,
    })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId));

  const acc = new Map(teamRows.map((team) => [team.id, emptyStandingsRow(team.id)]));
  const names = new Map(teamRows.map((team) => [team.id, team.name]));

  for (let week = 1; week <= currentWeek; week += 1) {
    const locked = await ensureWeekLockedIfDue(db, leagueId, week, weekGames, now);
    const statsByPlayer = await loadWeekStats(db, league.seasonId, week);
    const lineups = await loadLineupsByTeam(db, leagueId, week, locked);
    const weekMatchups = await db
      .select()
      .from(matchups)
      .where(and(eq(matchups.leagueId, leagueId), eq(matchups.week, week)));

    for (const row of weekMatchups) {
      const home = scoreSide(lineups.get(row.homeFantasyTeamId) ?? [], statsByPlayer, rules);
      const away = scoreSide(lineups.get(row.awayFantasyTeamId) ?? [], statsByPlayer, rules);
      applyMatchupToStandings(acc, {
        homeTeamId: row.homeFantasyTeamId,
        awayTeamId: row.awayFantasyTeamId,
        homePoints: home.points,
        awayPoints: away.points,
      });
    }
  }

  return sortStandings([...acc.values()]).map((row) => ({
    teamId: row.teamId,
    teamName: names.get(row.teamId) ?? row.teamId,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
  }));
}

export async function getMatchupDetail(db: Database, leagueId: string, matchupId: string): Promise<MatchupDto> {
  const league = await requireActiveLeague(db, leagueId);
  await ensureSchedule(db, leagueId);

  const [row] = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.id, matchupId), eq(matchups.leagueId, leagueId)))
    .limit(1);
  if (!row) {
    throw new LeagueError("Matchup not found", 404);
  }

  const weekGames = await loadRegGames(db, league.seasonId);
  const now = new Date();
  const locked = await ensureWeekLockedIfDue(db, leagueId, row.week, weekGames, now);
  const rules = await loadScoringRules(db, leagueId);
  const statsByPlayer = await loadWeekStats(db, league.seasonId, row.week);

  const homeTeam = await getFantasyTeam(db, row.homeFantasyTeamId);
  const awayTeam = await getFantasyTeam(db, row.awayFantasyTeamId);
  if (!homeTeam || !awayTeam) {
    throw new LeagueError("Team not found", 404);
  }

  const lineups = await loadLineupsByTeam(db, leagueId, row.week, locked);
  const home = scoreSide(lineups.get(row.homeFantasyTeamId) ?? [], statsByPlayer, rules);
  const away = scoreSide(lineups.get(row.awayFantasyTeamId) ?? [], statsByPlayer, rules);

  return {
    id: row.id,
    leagueId,
    week: row.week,
    locked,
    home: { team: homeTeam, points: home.points, players: home.players },
    away: { team: awayTeam, points: away.points, players: away.players },
  };
}
