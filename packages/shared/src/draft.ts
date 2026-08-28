import {
  rosterCapacity,
  slotLimit,
  type LineupPlayer,
  type RosterConfig,
  type RosterSlot,
} from "./lineup";

export function snakePickOwner(pickNumber: number, teamCount: number): number {
  if (!Number.isInteger(pickNumber) || pickNumber < 1) {
    throw new Error("pickNumber must be a positive integer");
  }
  if (!Number.isInteger(teamCount) || teamCount < 1) {
    throw new Error("teamCount must be a positive integer");
  }

  const round = Math.ceil(pickNumber / teamCount);
  const indexInRound = (pickNumber - 1) % teamCount;
  if (round % 2 === 1) {
    return indexInRound + 1;
  }
  return teamCount - indexInRound;
}

export function totalPicks(teamCount: number, capacity: number): number {
  return teamCount * capacity;
}

export function isClockExpired(startedAt: Date, seconds: number, now: Date): boolean {
  return now.getTime() - startedAt.getTime() >= seconds * 1000;
}

export function secondsRemaining(startedAt: Date, seconds: number, now: Date): number {
  const left = seconds - Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, left);
}

export type AutopickSource = "queue" | "autopick" | "passed_full";

export interface AutopickCandidate {
  playerId: string;
  position: string;
  displayName: string;
  productionScore: number;
}

export type AutopickResult =
  | { source: "passed_full" }
  | { source: "queue" | "autopick"; playerId: string };

function slotCounts(roster: LineupPlayer[]): Record<RosterSlot, number> {
  const counts: Record<RosterSlot, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    FLEX: 0,
    SUPERFLEX: 0,
    K: 0,
    DEF: 0,
    BENCH: 0,
  };
  for (const player of roster) {
    counts[player.slot] += 1;
  }
  return counts;
}

export function positionalNeedRank(
  nflPosition: string,
  roster: LineupPlayer[],
  config: RosterConfig,
): number {
  const position = nflPosition.trim().toUpperCase();
  const counts = slotCounts(roster);

  const starterOpen = (slot: RosterSlot): boolean => counts[slot] < slotLimit(config, slot);

  if (position === "QB" && starterOpen("QB")) {
    return 3;
  }
  if (position === "RB" && starterOpen("RB")) {
    return 3;
  }
  if (position === "WR" && starterOpen("WR")) {
    return 3;
  }
  if (position === "TE" && starterOpen("TE")) {
    return 3;
  }
  if (position === "K" && starterOpen("K")) {
    return 3;
  }
  if (position === "DEF" && starterOpen("DEF")) {
    return 3;
  }
  if ((position === "RB" || position === "WR" || position === "TE") && starterOpen("FLEX")) {
    return 2;
  }
  if (
    (position === "QB" || position === "RB" || position === "WR" || position === "TE") &&
    starterOpen("SUPERFLEX")
  ) {
    return 2;
  }
  return 1;
}

export function chooseAutopick(input: {
  queuePlayerIds: string[];
  available: AutopickCandidate[];
  roster: LineupPlayer[];
  config: RosterConfig;
}): AutopickResult {
  if (input.roster.length >= rosterCapacity(input.config) || input.available.length === 0) {
    return { source: "passed_full" };
  }

  const availableIds = new Set(input.available.map((player) => player.playerId));
  for (const playerId of input.queuePlayerIds) {
    if (availableIds.has(playerId)) {
      return { source: "queue", playerId };
    }
  }

  const ranked = [...input.available].sort((left, right) => {
    const needDelta =
      positionalNeedRank(right.position, input.roster, input.config) -
      positionalNeedRank(left.position, input.roster, input.config);
    if (needDelta !== 0) {
      return needDelta;
    }
    if (right.productionScore !== left.productionScore) {
      return right.productionScore - left.productionScore;
    }
    return left.displayName.localeCompare(right.displayName);
  });

  const best = ranked[0];
  if (!best) {
    return { source: "passed_full" };
  }
  return { source: "autopick", playerId: best.playerId };
}
