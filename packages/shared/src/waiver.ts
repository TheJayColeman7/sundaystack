export const WAIVER_TYPES = ["priority", "faab"] as const;

export type WaiverType = (typeof WAIVER_TYPES)[number];

export const WAIVER_WINDOWS = ["fa", "waiver"] as const;

export type WaiverWindow = (typeof WAIVER_WINDOWS)[number];

export const DEFAULT_WAIVER_TYPE: WaiverType = "faab";
export const DEFAULT_FAAB_BUDGET = 100;
export const DEFAULT_WAIVER_PROCESS_WEEKDAY = 2;
export const DEFAULT_WAIVER_PROCESS_HOUR_UTC = 7;
export const MAX_WAIVER_CLAIMS = 10;

export function isWaiverType(value: string): value is WaiverType {
  return (WAIVER_TYPES as readonly string[]).includes(value);
}

export function nextWeeklyInstant(after: Date, weekday: number, hourUtc: number): Date {
  const next = new Date(
    Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), hourUtc, 0, 0, 0),
  );
  if (next.getTime() <= after.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  while (next.getUTCDay() !== weekday) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  if (next.getTime() <= after.getTime()) {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

export function deriveWaiverWindow(input: {
  now: Date;
  lockAts: Date[];
  processWeekday: number;
  processHourUtc: number;
}): { window: WaiverWindow; processAt: Date | null; secondsToProcess: number | null } {
  const occurred = input.lockAts
    .filter((lock) => lock.getTime() <= input.now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const upcoming = input.lockAts
    .filter((lock) => lock.getTime() > input.now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const lastLock = occurred[occurred.length - 1];

  if (!lastLock) {
    const processAt = upcoming[0]
      ? nextWeeklyInstant(upcoming[0], input.processWeekday, input.processHourUtc)
      : null;
    return { window: "fa", processAt, secondsToProcess: null };
  }

  const processAfterLock = nextWeeklyInstant(lastLock, input.processWeekday, input.processHourUtc);
  if (input.now.getTime() < processAfterLock.getTime()) {
    return {
      window: "waiver",
      processAt: processAfterLock,
      secondsToProcess: Math.max(
        0,
        Math.floor((processAfterLock.getTime() - input.now.getTime()) / 1000),
      ),
    };
  }

  const nextLock = upcoming[0];
  const processAt = nextLock
    ? nextWeeklyInstant(nextLock, input.processWeekday, input.processHourUtc)
    : nextWeeklyInstant(input.now, input.processWeekday, input.processHourUtc);
  return { window: "fa", processAt, secondsToProcess: null };
}

export interface WaiverTeamState {
  teamId: string;
  rank: number;
  faabRemaining: number;
  rosterPlayerIds: string[];
  capacity: number;
}

export interface WaiverClaimInput {
  teamId: string;
  playerId: string;
  dropPlayerId: string | null;
  bid: number;
  rank: number;
}

export interface WaiverAward {
  teamId: string;
  playerId: string;
  dropPlayerId: string | null;
  bid: number;
}

export interface WaiverRunResult {
  awards: WaiverAward[];
  lost: WaiverClaimInput[];
  ranks: Array<{ teamId: string; rank: number }>;
  faab: Array<{ teamId: string; remaining: number }>;
}

function cloneTeams(teams: WaiverTeamState[]): Map<string, WaiverTeamState> {
  return new Map(
    teams.map((team) => [
      team.teamId,
      {
        ...team,
        rosterPlayerIds: [...team.rosterPlayerIds],
      },
    ]),
  );
}

function isLegalClaim(team: WaiverTeamState, claim: WaiverClaimInput, taken: Set<string>): boolean {
  if (taken.has(claim.playerId)) {
    return false;
  }
  if (team.rosterPlayerIds.includes(claim.playerId)) {
    return false;
  }
  if (claim.dropPlayerId === claim.playerId) {
    return false;
  }
  if (claim.bid < 0 || claim.bid > team.faabRemaining) {
    return false;
  }
  if (claim.dropPlayerId) {
    return team.rosterPlayerIds.includes(claim.dropPlayerId);
  }
  return team.rosterPlayerIds.length < team.capacity;
}

function applyClaim(team: WaiverTeamState, claim: WaiverClaimInput, taken: Set<string>): void {
  if (claim.dropPlayerId) {
    team.rosterPlayerIds = team.rosterPlayerIds.filter((id) => id !== claim.dropPlayerId);
  }
  team.rosterPlayerIds.push(claim.playerId);
  team.faabRemaining -= claim.bid;
  taken.add(claim.playerId);
}

function snapshot(teams: Map<string, WaiverTeamState>): Pick<WaiverRunResult, "ranks" | "faab"> {
  const ranked = [...teams.values()].sort((a, b) => a.rank - b.rank);
  return {
    ranks: ranked.map((team) => ({ teamId: team.teamId, rank: team.rank })),
    faab: ranked.map((team) => ({ teamId: team.teamId, remaining: team.faabRemaining })),
  };
}

function resolvePriority(teams: Map<string, WaiverTeamState>, claims: WaiverClaimInput[]): WaiverRunResult {
  const taken = new Set<string>();
  for (const team of teams.values()) {
    for (const playerId of team.rosterPlayerIds) {
      taken.add(playerId);
    }
  }

  let pending = [...claims].sort((a, b) => a.rank - b.rank);
  const awards: WaiverAward[] = [];
  let order = [...teams.values()].sort((a, b) => a.rank - b.rank).map((team) => team.teamId);

  while (true) {
    let awarded = false;
    for (const teamId of order) {
      const team = teams.get(teamId);
      if (!team) {
        continue;
      }
      const next = pending.find((claim) => claim.teamId === teamId && isLegalClaim(team, claim, taken));
      if (!next) {
        continue;
      }
      applyClaim(team, next, taken);
      awards.push({
        teamId: next.teamId,
        playerId: next.playerId,
        dropPlayerId: next.dropPlayerId,
        bid: next.bid,
      });
      pending = pending.filter((claim) => claim !== next && claim.playerId !== next.playerId);
      order = [...order.filter((id) => id !== teamId), teamId];
      awarded = true;
      break;
    }
    if (!awarded) {
      break;
    }
  }

  for (const [index, teamId] of order.entries()) {
    const team = teams.get(teamId);
    if (team) {
      team.rank = index + 1;
    }
  }

  return { awards, lost: pending, ...snapshot(teams) };
}

function resolveFaab(teams: Map<string, WaiverTeamState>, claims: WaiverClaimInput[]): WaiverRunResult {
  const taken = new Set<string>();
  for (const team of teams.values()) {
    for (const playerId of team.rosterPlayerIds) {
      taken.add(playerId);
    }
  }

  const pending = [...claims];
  const awards: WaiverAward[] = [];
  const lost: WaiverClaimInput[] = [];
  const byPlayer = new Map<string, WaiverClaimInput[]>();
  for (const claim of pending) {
    const list = byPlayer.get(claim.playerId) ?? [];
    list.push(claim);
    byPlayer.set(claim.playerId, list);
  }

  const playerIds = [...byPlayer.keys()].sort((left, right) => {
    const leftBid = Math.max(...(byPlayer.get(left) ?? []).map((claim) => claim.bid));
    const rightBid = Math.max(...(byPlayer.get(right) ?? []).map((claim) => claim.bid));
    if (rightBid !== leftBid) {
      return rightBid - leftBid;
    }
    return left.localeCompare(right);
  });

  const consumed = new Set<WaiverClaimInput>();

  for (const playerId of playerIds) {
    const group = byPlayer.get(playerId) ?? [];
    const eligible = group
      .filter((claim) => {
        const team = teams.get(claim.teamId);
        return team ? isLegalClaim(team, claim, taken) : false;
      })
      .sort((a, b) => {
        if (b.bid !== a.bid) {
          return b.bid - a.bid;
        }
        const aRank = teams.get(a.teamId)?.rank ?? 99;
        const bRank = teams.get(b.teamId)?.rank ?? 99;
        return aRank - bRank;
      });

    const winner = eligible[0];
    if (!winner) {
      for (const claim of group) {
        lost.push(claim);
        consumed.add(claim);
      }
      continue;
    }

    const team = teams.get(winner.teamId);
    if (!team) {
      continue;
    }
    applyClaim(team, winner, taken);
    awards.push({
      teamId: winner.teamId,
      playerId: winner.playerId,
      dropPlayerId: winner.dropPlayerId,
      bid: winner.bid,
    });
    consumed.add(winner);
    for (const claim of group) {
      if (claim !== winner) {
        lost.push(claim);
        consumed.add(claim);
      }
    }
  }

  for (const claim of pending) {
    if (!consumed.has(claim)) {
      lost.push(claim);
    }
  }

  const awardedTeamIds: string[] = [];
  for (const award of awards) {
    if (!awardedTeamIds.includes(award.teamId)) {
      awardedTeamIds.push(award.teamId);
    }
  }
  let order = [...teams.values()].sort((a, b) => a.rank - b.rank).map((team) => team.teamId);
  for (const teamId of awardedTeamIds) {
    order = [...order.filter((id) => id !== teamId), teamId];
  }
  for (const [index, teamId] of order.entries()) {
    const team = teams.get(teamId);
    if (team) {
      team.rank = index + 1;
    }
  }

  return { awards, lost, ...snapshot(teams) };
}

export function resolveWaiverRun(
  type: WaiverType,
  teams: WaiverTeamState[],
  claims: WaiverClaimInput[],
): WaiverRunResult {
  const state = cloneTeams(teams);
  if (type === "faab") {
    return resolveFaab(state, claims);
  }
  return resolvePriority(state, claims);
}
