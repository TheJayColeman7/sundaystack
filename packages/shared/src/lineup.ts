export const ROSTER_SLOTS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SUPERFLEX",
  "K",
  "DEF",
  "BENCH",
] as const;

export type RosterSlot = (typeof ROSTER_SLOTS)[number];

export const STARTER_SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX", "K", "DEF"] as const;

export type StarterSlot = (typeof STARTER_SLOTS)[number];

export interface RosterConfig {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  k: number;
  def: number;
  bench: number;
  ir: number;
}

export const DEFAULT_ROSTER_CONFIG: RosterConfig = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  k: 1,
  def: 1,
  bench: 6,
  ir: 0,
};

export interface LineupPlayer {
  playerId: string;
  position: string;
  slot: RosterSlot;
  displayName?: string;
}

export function isRosterSlot(value: string): value is RosterSlot {
  return (ROSTER_SLOTS as readonly string[]).includes(value);
}

export function rosterCapacity(config: RosterConfig): number {
  return (
    config.qb +
    config.rb +
    config.wr +
    config.te +
    config.flex +
    config.superflex +
    config.k +
    config.def +
    config.bench
  );
}

export function slotLimit(config: RosterConfig, slot: RosterSlot): number {
  switch (slot) {
    case "QB":
      return config.qb;
    case "RB":
      return config.rb;
    case "WR":
      return config.wr;
    case "TE":
      return config.te;
    case "FLEX":
      return config.flex;
    case "SUPERFLEX":
      return config.superflex;
    case "K":
      return config.k;
    case "DEF":
      return config.def;
    case "BENCH":
      return config.bench;
  }
}

export function isEligibleForSlot(nflPosition: string, slot: RosterSlot): boolean {
  const position = nflPosition.trim().toUpperCase();

  if (slot === "BENCH") {
    return true;
  }

  if (slot === "FLEX") {
    return position === "RB" || position === "WR" || position === "TE";
  }

  if (slot === "SUPERFLEX") {
    return position === "QB" || position === "RB" || position === "WR" || position === "TE";
  }

  if (slot === "DEF") {
    return position === "DEF";
  }

  return position === slot;
}

export function playerAlreadyOnAnotherTeam(
  playerId: string,
  targetFantasyTeamId: string,
  occupancy: ReadonlyMap<string, string>,
): boolean {
  const currentTeamId = occupancy.get(playerId);
  return currentTeamId !== undefined && currentTeamId !== targetFantasyTeamId;
}

export function validateLineup(
  lineup: LineupPlayer[],
  config: RosterConfig,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
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

  for (const player of lineup) {
    const label = player.displayName ?? player.playerId;

    if (seen.has(player.playerId)) {
      errors.push(`${label} is assigned more than once`);
    }
    seen.add(player.playerId);

    if (!isEligibleForSlot(player.position, player.slot)) {
      errors.push(`${label} (${player.position}) cannot start at ${player.slot}`);
    }

    counts[player.slot] += 1;
  }

  for (const slot of ROSTER_SLOTS) {
    const used = counts[slot];
    const limit = slotLimit(config, slot);
    if (used > limit) {
      errors.push(`${slot} has ${used} players but the league allows ${limit}`);
    }
  }

  if (lineup.length > rosterCapacity(config)) {
    errors.push(`Roster has ${lineup.length} players but capacity is ${rosterCapacity(config)}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
