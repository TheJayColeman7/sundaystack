import {
  EMPTY_COUNTING_STATS,
  STARTER_SLOTS,
  countingStatValue,
  isStatKey,
  type CountingStats,
  type ScoringRule,
  type StarterSlot,
} from "@sundaystack/shared";

export interface ScoredPlayerInput {
  playerId: string;
  position: string;
  slot: string;
  stats: CountingStats | null;
}

export function scorePlayer(
  stats: CountingStats | null | undefined,
  rules: ScoringRule[],
  position: string,
): number {
  if (position.trim().toUpperCase() === "DEF") {
    return 0;
  }
  if (!stats) {
    return 0;
  }

  let total = 0;
  for (const rule of rules) {
    if (!isStatKey(rule.statKey)) {
      continue;
    }
    total += countingStatValue(stats, rule.statKey) * rule.pointsPer;
  }
  return total;
}

function isStarterSlot(slot: string): slot is StarterSlot {
  return (STARTER_SLOTS as readonly string[]).includes(slot);
}

export function scoreLineup(players: ScoredPlayerInput[], rules: ScoringRule[]): number {
  let total = 0;
  for (const player of players) {
    if (!isStarterSlot(player.slot)) {
      continue;
    }
    total += scorePlayer(player.stats, rules, player.position);
  }
  return total;
}

export type MatchupOutcome = "home" | "away" | "tie";

export function matchupResult(homePoints: number, awayPoints: number): MatchupOutcome {
  if (homePoints > awayPoints) {
    return "home";
  }
  if (awayPoints > homePoints) {
    return "away";
  }
  return "tie";
}

export interface StandingsAccumulator {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export function emptyStandingsRow(teamId: string): StandingsAccumulator {
  return {
    teamId,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

export function applyMatchupToStandings(
  rows: Map<string, StandingsAccumulator>,
  input: { homeTeamId: string; awayTeamId: string; homePoints: number; awayPoints: number },
): void {
  const home = rows.get(input.homeTeamId) ?? emptyStandingsRow(input.homeTeamId);
  const away = rows.get(input.awayTeamId) ?? emptyStandingsRow(input.awayTeamId);
  home.pointsFor += input.homePoints;
  home.pointsAgainst += input.awayPoints;
  away.pointsFor += input.awayPoints;
  away.pointsAgainst += input.homePoints;

  const outcome = matchupResult(input.homePoints, input.awayPoints);
  if (outcome === "home") {
    home.wins += 1;
    away.losses += 1;
  } else if (outcome === "away") {
    away.wins += 1;
    home.losses += 1;
  } else {
    home.ties += 1;
    away.ties += 1;
  }

  rows.set(input.homeTeamId, home);
  rows.set(input.awayTeamId, away);
}

export function sortStandings(rows: StandingsAccumulator[]): StandingsAccumulator[] {
  return [...rows].sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (right.pointsFor !== left.pointsFor) {
      return right.pointsFor - left.pointsFor;
    }
    return left.teamId.localeCompare(right.teamId);
  });
}

export { EMPTY_COUNTING_STATS };
