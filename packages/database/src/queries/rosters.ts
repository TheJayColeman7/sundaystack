import { and, eq } from "drizzle-orm";
import type { RosterDto } from "@sundaystack/shared";
import {
  isEligibleForSlot,
  isRosterSlot,
  playerAlreadyOnAnotherTeam,
  rosterCapacity,
  validateLineup,
  type RosterConfig,
  type RosterSlot,
} from "@sundaystack/shared";
import type { Database } from "../client";
import { players, rosterPlayers, teams } from "../schema";
import { LeagueError, getFantasyTeam, isUniqueViolation } from "./leagues";

export async function getLeaguePlayerOccupancy(
  db: Database,
  leagueId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      playerId: rosterPlayers.playerId,
      fantasyTeamId: rosterPlayers.fantasyTeamId,
    })
    .from(rosterPlayers)
    .where(eq(rosterPlayers.leagueId, leagueId));

  return new Map(rows.map((row) => [row.playerId, row.fantasyTeamId]));
}

export async function listRosterPlayersForLeague(
  db: Database,
  leagueId: string,
): Promise<Array<{ fantasyTeamId: string; playerId: string; position: string; slot: string }>> {
  return db
    .select({
      fantasyTeamId: rosterPlayers.fantasyTeamId,
      playerId: rosterPlayers.playerId,
      position: players.position,
      slot: rosterPlayers.slot,
    })
    .from(rosterPlayers)
    .innerJoin(players, eq(rosterPlayers.playerId, players.id))
    .where(eq(rosterPlayers.leagueId, leagueId));
}

export async function getRoster(db: Database, teamId: string): Promise<RosterDto | null> {
  const team = await getFantasyTeam(db, teamId);
  if (!team) {
    return null;
  }

  const rows = await db
    .select({
      id: rosterPlayers.id,
      playerId: rosterPlayers.playerId,
      slot: rosterPlayers.slot,
      displayName: players.displayName,
      position: players.position,
      status: players.status,
      teamAbbreviation: teams.abbreviation,
    })
    .from(rosterPlayers)
    .innerJoin(players, eq(rosterPlayers.playerId, players.id))
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(eq(rosterPlayers.fantasyTeamId, teamId));

  return {
    team,
    players: rows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      slot: row.slot,
      displayName: row.displayName,
      position: row.position,
      status: row.status,
      teamAbbreviation: row.teamAbbreviation,
    })),
  };
}

export async function addRosterPlayer(
  db: Database,
  input: {
    leagueId: string;
    teamId: string;
    playerId: string;
    slot?: RosterSlot;
    config: RosterConfig;
  },
): Promise<RosterDto> {
  const occupancy = await getLeaguePlayerOccupancy(db, input.leagueId);
  if (playerAlreadyOnAnotherTeam(input.playerId, input.teamId, occupancy)) {
    throw new LeagueError("Player is already on another team in this league", 409, "PLAYER_TAKEN");
  }
  if (occupancy.get(input.playerId) === input.teamId) {
    throw new LeagueError("Player is already on this roster", 409, "ALREADY_ROSTERED");
  }

  const [nflPlayer] = await db
    .select({
      id: players.id,
      position: players.position,
      displayName: players.displayName,
    })
    .from(players)
    .where(eq(players.id, input.playerId))
    .limit(1);

  if (!nflPlayer) {
    throw new LeagueError("Player not found", 404);
  }

  const current = await getRoster(db, input.teamId);
  if (!current) {
    throw new LeagueError("Fantasy team not found", 404);
  }

  if (current.players.length >= rosterCapacity(input.config)) {
    throw new LeagueError("Roster is full", 409, "ROSTER_FULL");
  }

  const slot =
    input.slot ??
    defaultAddSlot(
      nflPlayer.position,
      current.players.map((row) => row.slot),
      input.config,
    );

  const nextLineup = [
    ...current.players.map((row) => ({
      playerId: row.playerId,
      position: row.position,
      slot: row.slot as RosterSlot,
      displayName: row.displayName,
    })),
    {
      playerId: nflPlayer.id,
      position: nflPlayer.position,
      slot,
      displayName: nflPlayer.displayName,
    },
  ];

  const check = validateLineup(nextLineup, input.config);
  if (!check.ok) {
    throw new LeagueError(check.errors[0] ?? "Illegal roster", 400, "INVALID_LINEUP");
  }

  if (!isEligibleForSlot(nflPlayer.position, slot)) {
    throw new LeagueError(
      `${nflPlayer.displayName} (${nflPlayer.position}) cannot play ${slot}`,
      400,
    );
  }

  try {
    await db.insert(rosterPlayers).values({
      leagueId: input.leagueId,
      fantasyTeamId: input.teamId,
      playerId: input.playerId,
      slot,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LeagueError("Player is already on a team in this league", 409, "PLAYER_TAKEN");
    }
    throw error;
  }

  const roster = await getRoster(db, input.teamId);
  if (!roster) {
    throw new LeagueError("Roster could not be loaded", 500);
  }
  return roster;
}

export async function dropRosterPlayer(
  db: Database,
  input: { teamId: string; playerId: string },
): Promise<RosterDto> {
  const [existingRow] = await db
    .select({ id: rosterPlayers.id })
    .from(rosterPlayers)
    .where(
      and(eq(rosterPlayers.fantasyTeamId, input.teamId), eq(rosterPlayers.playerId, input.playerId)),
    )
    .limit(1);

  if (!existingRow) {
    throw new LeagueError("Player is not on this roster", 404);
  }

  await db
    .delete(rosterPlayers)
    .where(
      and(eq(rosterPlayers.fantasyTeamId, input.teamId), eq(rosterPlayers.playerId, input.playerId)),
    );

  const roster = await getRoster(db, input.teamId);
  if (!roster) {
    throw new LeagueError("Roster could not be loaded", 500);
  }
  return roster;
}

export async function setLineup(
  db: Database,
  input: {
    teamId: string;
    config: RosterConfig;
    assignments: Array<{ playerId: string; slot: string }>;
  },
): Promise<RosterDto> {
  const current = await getRoster(db, input.teamId);
  if (!current) {
    throw new LeagueError("Fantasy team not found", 404);
  }

  const byId = new Map(current.players.map((row) => [row.playerId, row]));
  if (input.assignments.length !== current.players.length) {
    throw new LeagueError("Lineup must include every player on the roster", 400);
  }

  const next = input.assignments.map((assignment) => {
    if (!isRosterSlot(assignment.slot)) {
      throw new LeagueError(`Invalid slot ${assignment.slot}`, 400);
    }
    const existing = byId.get(assignment.playerId);
    if (!existing) {
      throw new LeagueError("Lineup includes a player who is not on this roster", 400);
    }
    return {
      playerId: existing.playerId,
      position: existing.position,
      slot: assignment.slot,
      displayName: existing.displayName,
    };
  });

  const seen = new Set(next.map((row) => row.playerId));
  if (seen.size !== next.length) {
    throw new LeagueError("Lineup contains duplicate players", 400);
  }

  const check = validateLineup(next, input.config);
  if (!check.ok) {
    throw new LeagueError(check.errors[0] ?? "Illegal lineup", 400, "INVALID_LINEUP");
  }

  for (const assignment of next) {
    await db
      .update(rosterPlayers)
      .set({ slot: assignment.slot, updatedAt: new Date() })
      .where(
        and(
          eq(rosterPlayers.fantasyTeamId, input.teamId),
          eq(rosterPlayers.playerId, assignment.playerId),
        ),
      );
  }

  const roster = await getRoster(db, input.teamId);
  if (!roster) {
    throw new LeagueError("Roster could not be loaded", 500);
  }
  return roster;
}

export function defaultAddSlot(
  position: string,
  currentSlots: string[],
  config: RosterConfig,
): RosterSlot {
  const counts = new Map<string, number>();
  for (const slot of currentSlots) {
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  const benchUsed = counts.get("BENCH") ?? 0;
  if (benchUsed < config.bench) {
    return "BENCH";
  }

  const pos = position.toUpperCase();
  const preferred: RosterSlot[] = [];
  if (pos === "QB") {
    preferred.push("QB", "SUPERFLEX");
  } else if (pos === "RB") {
    preferred.push("RB", "FLEX", "SUPERFLEX");
  } else if (pos === "WR") {
    preferred.push("WR", "FLEX", "SUPERFLEX");
  } else if (pos === "TE") {
    preferred.push("TE", "FLEX", "SUPERFLEX");
  } else if (pos === "K") {
    preferred.push("K");
  } else if (pos === "DEF") {
    preferred.push("DEF");
  }

  const limits: Record<RosterSlot, number> = {
    QB: config.qb,
    RB: config.rb,
    WR: config.wr,
    TE: config.te,
    FLEX: config.flex,
    SUPERFLEX: config.superflex,
    K: config.k,
    DEF: config.def,
    BENCH: config.bench,
  };

  for (const slot of preferred) {
    if ((counts.get(slot) ?? 0) < limits[slot] && isEligibleForSlot(position, slot)) {
      return slot;
    }
  }

  return "BENCH";
}
