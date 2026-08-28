import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  PlayerListQuery,
  PlayerListResponse,
  WaiverBoardDto,
  WaiverClaimDto,
  WaiverPriorityDto,
} from "@sundaystack/shared";
import {
  DEFAULT_FAAB_BUDGET,
  DEFAULT_ROSTER_CONFIG,
  DEFAULT_WAIVER_PROCESS_HOUR_UTC,
  DEFAULT_WAIVER_PROCESS_WEEKDAY,
  DEFAULT_WAIVER_TYPE,
  MAX_WAIVER_CLAIMS,
  deriveWaiverWindow,
  isWaiverType,
  nextWeeklyInstant,
  resolveWaiverRun,
  rosterCapacity,
  type WaiverClaimInput,
  type WaiverTeamState,
  type WaiverType,
} from "@sundaystack/shared";
import type { Database } from "../client";
import {
  draftOrder,
  drafts,
  faabBalances,
  fantasyTeams,
  players,
  rosterPlayers,
  waiverClaims,
  waiverPeriods,
  waiverPriorities,
} from "../schema";
import { LeagueError, getLeagueSettings, getLeagueSettingsDto, getLeagueStatus, isUniqueViolation } from "./leagues";
import { listWeekLockAts } from "./matchups";
import { listPlayers } from "./players";
import { addRosterPlayer, getLeaguePlayerOccupancy } from "./rosters";

const addPlayer = alias(players, "waiver_add_player");
const dropPlayer = alias(players, "waiver_drop_player");

async function requireActiveLeague(db: Database, leagueId: string): Promise<void> {
  const status = await getLeagueStatus(db, leagueId);
  if (!status) {
    throw new LeagueError("League not found", 404);
  }
  if (status !== "active") {
    throw new LeagueError("Waivers start after the draft completes", 409, "NOT_ACTIVE");
  }
}

async function loadWaiverSettings(db: Database, leagueId: string): Promise<{
  type: WaiverType;
  faabBudget: number;
  processWeekday: number;
  processHourUtc: number;
  capacity: number;
}> {
  const dto = await getLeagueSettingsDto(db, leagueId);
  const type = dto && isWaiverType(dto.waiverType) ? dto.waiverType : DEFAULT_WAIVER_TYPE;
  return {
    type,
    faabBudget: dto?.faabBudget ?? DEFAULT_FAAB_BUDGET,
    processWeekday: dto?.waiverProcessWeekday ?? DEFAULT_WAIVER_PROCESS_WEEKDAY,
    processHourUtc: dto?.waiverProcessHourUtc ?? DEFAULT_WAIVER_PROCESS_HOUR_UTC,
    capacity: rosterCapacity(dto ?? DEFAULT_ROSTER_CONFIG),
  };
}

async function deriveWindow(db: Database, leagueId: string, now = new Date()) {
  const settings = await loadWaiverSettings(db, leagueId);
  const lockAts = await listWeekLockAts(db, leagueId);
  const derived = deriveWaiverWindow({
    now,
    lockAts,
    processWeekday: settings.processWeekday,
    processHourUtc: settings.processHourUtc,
  });
  const occurred = lockAts
    .filter((lock) => lock.getTime() <= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  const lastLock = occurred[occurred.length - 1];
  const cycleProcessAt = lastLock
    ? nextWeeklyInstant(lastLock, settings.processWeekday, settings.processHourUtc)
    : null;
  return { ...derived, cycleProcessAt, settings, now };
}

async function ensureWaiverState(db: Database, leagueId: string): Promise<void> {
  const settings = await loadWaiverSettings(db, leagueId);
  const teams = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId));
  if (teams.length === 0) {
    return;
  }

  const existing = await db
    .select({ fantasyTeamId: waiverPriorities.fantasyTeamId, rank: waiverPriorities.rank })
    .from(waiverPriorities)
    .where(eq(waiverPriorities.leagueId, leagueId));
  const have = new Set(existing.map((row) => row.fantasyTeamId));

  if (existing.length === 0) {
    const [draft] = await db.select({ id: drafts.id }).from(drafts).where(eq(drafts.leagueId, leagueId)).limit(1);
    let orderedIds = teams.map((row) => row.id);
    if (draft) {
      const orderRows = await db
        .select({ fantasyTeamId: draftOrder.fantasyTeamId, slot: draftOrder.slot })
        .from(draftOrder)
        .where(eq(draftOrder.draftId, draft.id))
        .orderBy(desc(draftOrder.slot));
      if (orderRows.length > 0) {
        orderedIds = orderRows.map((row) => row.fantasyTeamId);
        for (const team of teams) {
          if (!orderedIds.includes(team.id)) {
            orderedIds.push(team.id);
          }
        }
      }
    }
    try {
      await db.insert(waiverPriorities).values(
        orderedIds.map((fantasyTeamId, index) => ({
          leagueId,
          fantasyTeamId,
          rank: index + 1,
        })),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  } else {
    const missing = teams.filter((team) => !have.has(team.id));
    if (missing.length > 0) {
      const maxRank = existing.reduce((max, row) => Math.max(max, row.rank), 0);
      try {
        await db.insert(waiverPriorities).values(
          missing.map((team, index) => ({
            leagueId,
            fantasyTeamId: team.id,
            rank: maxRank + index + 1,
          })),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
  }

  const balances = await db
    .select({ fantasyTeamId: faabBalances.fantasyTeamId })
    .from(faabBalances)
    .where(eq(faabBalances.leagueId, leagueId));
  const haveBalance = new Set(balances.map((row) => row.fantasyTeamId));
  const missingBalances = teams.filter((team) => !haveBalance.has(team.id));
  if (missingBalances.length > 0) {
    try {
      await db.insert(faabBalances).values(
        missingBalances.map((team) => ({
          leagueId,
          fantasyTeamId: team.id,
          remaining: settings.faabBudget,
        })),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}

async function ensurePeriod(db: Database, leagueId: string, processAt: Date): Promise<void> {
  try {
    await db.insert(waiverPeriods).values({ leagueId, processAt });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}

async function applyAward(
  db: Database,
  input: {
    leagueId: string;
    teamId: string;
    playerId: string;
    dropPlayerId: string | null;
  },
): Promise<boolean> {
  let dropped: { playerId: string; slot: string } | null = null;
  if (input.dropPlayerId) {
    const [row] = await db
      .select({ playerId: rosterPlayers.playerId, slot: rosterPlayers.slot })
      .from(rosterPlayers)
      .where(
        and(eq(rosterPlayers.fantasyTeamId, input.teamId), eq(rosterPlayers.playerId, input.dropPlayerId)),
      )
      .limit(1);
    if (row) {
      dropped = row;
      await db
        .delete(rosterPlayers)
        .where(
          and(eq(rosterPlayers.fantasyTeamId, input.teamId), eq(rosterPlayers.playerId, input.dropPlayerId)),
        );
    }
  }

  const config = await getLeagueSettings(db, input.leagueId);
  if (!config) {
    if (dropped) {
      await restoreDrop(db, input.leagueId, input.teamId, dropped);
    }
    return false;
  }

  try {
    await addRosterPlayer(db, {
      leagueId: input.leagueId,
      teamId: input.teamId,
      playerId: input.playerId,
      config,
    });
    return true;
  } catch {
    if (dropped) {
      await restoreDrop(db, input.leagueId, input.teamId, dropped);
    }
    return false;
  }
}

async function restoreDrop(
  db: Database,
  leagueId: string,
  teamId: string,
  dropped: { playerId: string; slot: string },
): Promise<void> {
  try {
    await db.insert(rosterPlayers).values({
      leagueId,
      fantasyTeamId: teamId,
      playerId: dropped.playerId,
      slot: dropped.slot,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}

async function rewriteRanks(
  db: Database,
  leagueId: string,
  ranks: Array<{ teamId: string; rank: number }>,
): Promise<void> {
  const current = await db
    .select({ id: waiverPriorities.id, fantasyTeamId: waiverPriorities.fantasyTeamId, rank: waiverPriorities.rank })
    .from(waiverPriorities)
    .where(eq(waiverPriorities.leagueId, leagueId));
  for (const row of current) {
    await db
      .update(waiverPriorities)
      .set({ rank: row.rank + 1000, updatedAt: new Date() })
      .where(eq(waiverPriorities.id, row.id));
  }
  for (const next of ranks) {
    await db
      .update(waiverPriorities)
      .set({ rank: next.rank, updatedAt: new Date() })
      .where(and(eq(waiverPriorities.leagueId, leagueId), eq(waiverPriorities.fantasyTeamId, next.teamId)));
  }
}

async function processPeriod(db: Database, leagueId: string, periodId: string, type: WaiverType): Promise<void> {
  const [period] = await db
    .select({ id: waiverPeriods.id, processedAt: waiverPeriods.processedAt })
    .from(waiverPeriods)
    .where(eq(waiverPeriods.id, periodId))
    .limit(1);
  if (!period || period.processedAt) {
    return;
  }

  const settings = await loadWaiverSettings(db, leagueId);
  const priorityRows = await db
    .select({
      teamId: waiverPriorities.fantasyTeamId,
      rank: waiverPriorities.rank,
    })
    .from(waiverPriorities)
    .where(eq(waiverPriorities.leagueId, leagueId));
  const balanceRows = await db
    .select({
      teamId: faabBalances.fantasyTeamId,
      remaining: faabBalances.remaining,
    })
    .from(faabBalances)
    .where(eq(faabBalances.leagueId, leagueId));
  const remainingByTeam = new Map(balanceRows.map((row) => [row.teamId, row.remaining]));
  const rosterRows = await db
    .select({
      teamId: rosterPlayers.fantasyTeamId,
      playerId: rosterPlayers.playerId,
    })
    .from(rosterPlayers)
    .where(eq(rosterPlayers.leagueId, leagueId));
  const rosterByTeam = new Map<string, string[]>();
  for (const row of rosterRows) {
    const list = rosterByTeam.get(row.teamId) ?? [];
    list.push(row.playerId);
    rosterByTeam.set(row.teamId, list);
  }

  const teams: WaiverTeamState[] = priorityRows.map((row) => ({
    teamId: row.teamId,
    rank: row.rank,
    faabRemaining: remainingByTeam.get(row.teamId) ?? settings.faabBudget,
    rosterPlayerIds: rosterByTeam.get(row.teamId) ?? [],
    capacity: settings.capacity,
  }));

  const pendingRows = await db
    .select({
      id: waiverClaims.id,
      teamId: waiverClaims.fantasyTeamId,
      playerId: waiverClaims.playerId,
      dropPlayerId: waiverClaims.dropPlayerId,
      bid: waiverClaims.bid,
      rank: waiverClaims.rank,
    })
    .from(waiverClaims)
    .where(and(eq(waiverClaims.periodId, periodId), eq(waiverClaims.status, "pending")));

  const claims: WaiverClaimInput[] = pendingRows.map((row) => ({
    teamId: row.teamId,
    playerId: row.playerId,
    dropPlayerId: row.dropPlayerId,
    bid: row.bid,
    rank: row.rank,
  }));

  const result = resolveWaiverRun(type, teams, claims);
  const appliedKeys = new Set<string>();
  for (const award of result.awards) {
    const ok = await applyAward(db, {
      leagueId,
      teamId: award.teamId,
      playerId: award.playerId,
      dropPlayerId: award.dropPlayerId,
    });
    if (ok) {
      appliedKeys.add(`${award.teamId}:${award.playerId}`);
      if (type === "faab") {
        const [balance] = await db
          .select({ remaining: faabBalances.remaining })
          .from(faabBalances)
          .where(and(eq(faabBalances.leagueId, leagueId), eq(faabBalances.fantasyTeamId, award.teamId)))
          .limit(1);
        if (balance) {
          await db
            .update(faabBalances)
            .set({ remaining: Math.max(0, balance.remaining - award.bid), updatedAt: new Date() })
            .where(and(eq(faabBalances.leagueId, leagueId), eq(faabBalances.fantasyTeamId, award.teamId)));
        }
      }
    }
  }

  await rewriteRanks(db, leagueId, result.ranks);

  for (const row of pendingRows) {
    const won = appliedKeys.has(`${row.teamId}:${row.playerId}`);
    await db
      .update(waiverClaims)
      .set({ status: won ? "won" : "lost", updatedAt: new Date() })
      .where(eq(waiverClaims.id, row.id));
  }

  await db
    .update(waiverPeriods)
    .set({ processedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(waiverPeriods.id, periodId), isNull(waiverPeriods.processedAt)));
}

export async function processWaiversIfDue(db: Database, leagueId: string): Promise<void> {
  const status = await getLeagueStatus(db, leagueId);
  if (status !== "active") {
    return;
  }

  await ensureWaiverState(db, leagueId);
  const derived = await deriveWindow(db, leagueId);
  if (derived.cycleProcessAt) {
    await ensurePeriod(db, leagueId, derived.cycleProcessAt);
  }

  const due = await db
    .select({ id: waiverPeriods.id })
    .from(waiverPeriods)
    .where(
      and(
        eq(waiverPeriods.leagueId, leagueId),
        lte(waiverPeriods.processAt, derived.now),
        isNull(waiverPeriods.processedAt),
      ),
    )
    .orderBy(asc(waiverPeriods.processAt));

  for (const period of due) {
    await processPeriod(db, leagueId, period.id, derived.settings.type);
  }
}

export async function assertInstantAddAllowed(db: Database, leagueId: string): Promise<void> {
  const status = await getLeagueStatus(db, leagueId);
  if (status !== "active") {
    return;
  }
  await processWaiversIfDue(db, leagueId);
  const derived = await deriveWindow(db, leagueId);
  if (derived.window === "waiver") {
    throw new LeagueError("Instant adds are closed during the waiver period", 409, "WAIVER_PERIOD");
  }
}

async function myTeamId(db: Database, leagueId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(and(eq(fantasyTeams.leagueId, leagueId), eq(fantasyTeams.ownerUserId, userId)))
    .limit(1);
  return row?.id ?? null;
}

async function loadClaimDtos(db: Database, periodId: string, teamId: string | null): Promise<WaiverClaimDto[]> {
  if (!teamId) {
    return [];
  }
  const rows = await db
    .select({
      id: waiverClaims.id,
      playerId: waiverClaims.playerId,
      playerDisplayName: addPlayer.displayName,
      playerPosition: addPlayer.position,
      dropPlayerId: waiverClaims.dropPlayerId,
      dropDisplayName: dropPlayer.displayName,
      bid: waiverClaims.bid,
      rank: waiverClaims.rank,
      status: waiverClaims.status,
    })
    .from(waiverClaims)
    .innerJoin(addPlayer, eq(waiverClaims.playerId, addPlayer.id))
    .leftJoin(dropPlayer, eq(waiverClaims.dropPlayerId, dropPlayer.id))
    .where(and(eq(waiverClaims.periodId, periodId), eq(waiverClaims.fantasyTeamId, teamId)))
    .orderBy(asc(waiverClaims.rank));

  return rows.map((row) => ({
    id: row.id,
    playerId: row.playerId,
    playerDisplayName: row.playerDisplayName,
    playerPosition: row.playerPosition,
    dropPlayerId: row.dropPlayerId,
    dropDisplayName: row.dropDisplayName,
    bid: row.bid,
    rank: row.rank,
    status: row.status as WaiverClaimDto["status"],
  }));
}

async function loadPriority(db: Database, leagueId: string): Promise<WaiverPriorityDto[]> {
  const rows = await db
    .select({
      teamId: waiverPriorities.fantasyTeamId,
      teamName: fantasyTeams.name,
      rank: waiverPriorities.rank,
      remaining: faabBalances.remaining,
    })
    .from(waiverPriorities)
    .innerJoin(fantasyTeams, eq(waiverPriorities.fantasyTeamId, fantasyTeams.id))
    .leftJoin(
      faabBalances,
      and(eq(faabBalances.leagueId, leagueId), eq(faabBalances.fantasyTeamId, waiverPriorities.fantasyTeamId)),
    )
    .where(eq(waiverPriorities.leagueId, leagueId))
    .orderBy(asc(waiverPriorities.rank));

  return rows.map((row) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    rank: row.rank,
    faabRemaining: row.remaining ?? 0,
  }));
}

async function claimsPeriodId(
  db: Database,
  leagueId: string,
  window: "fa" | "waiver",
  processAt: Date | null,
): Promise<{ id: string; processedAt: Date | null } | null> {
  if (window === "waiver" && processAt) {
    const [open] = await db
      .select({ id: waiverPeriods.id, processedAt: waiverPeriods.processedAt })
      .from(waiverPeriods)
      .where(and(eq(waiverPeriods.leagueId, leagueId), eq(waiverPeriods.processAt, processAt)))
      .limit(1);
    if (open) {
      return open;
    }
  }

  const [latest] = await db
    .select({ id: waiverPeriods.id, processedAt: waiverPeriods.processedAt })
    .from(waiverPeriods)
    .where(eq(waiverPeriods.leagueId, leagueId))
    .orderBy(desc(waiverPeriods.processAt))
    .limit(1);
  return latest ?? null;
}

export async function getWaiverBoard(db: Database, leagueId: string, userId: string): Promise<WaiverBoardDto> {
  await requireActiveLeague(db, leagueId);
  await processWaiversIfDue(db, leagueId);
  const derived = await deriveWindow(db, leagueId);
  const teamId = await myTeamId(db, leagueId, userId);
  const period = await claimsPeriodId(db, leagueId, derived.window, derived.processAt);
  const priority = await loadPriority(db, leagueId);
  const claims = period ? await loadClaimDtos(db, period.id, teamId) : [];
  const mine = priority.find((row) => row.teamId === teamId);

  return {
    window: derived.window,
    waiverType: derived.settings.type,
    processAt: derived.window === "waiver" ? (derived.processAt?.toISOString() ?? null) : null,
    processedAt: period?.processedAt?.toISOString() ?? null,
    secondsToProcess: derived.secondsToProcess,
    faabRemaining: derived.settings.type === "faab" ? (mine?.faabRemaining ?? derived.settings.faabBudget) : null,
    myTeamId: teamId,
    claims,
    priority,
  };
}

export async function listWaiverAvailable(
  db: Database,
  leagueId: string,
  query: PlayerListQuery,
): Promise<PlayerListResponse> {
  await requireActiveLeague(db, leagueId);
  await processWaiversIfDue(db, leagueId);
  const occupancy = await getLeaguePlayerOccupancy(db, leagueId);
  return listPlayers(db, {
    ...query,
    excludePlayerIds: [...occupancy.keys()],
  });
}

export async function replaceWaiverClaims(
  db: Database,
  input: {
    leagueId: string;
    userId: string;
    claims: Array<{ playerId: string; dropPlayerId: string | null; bid: number }>;
  },
): Promise<WaiverBoardDto> {
  await requireActiveLeague(db, input.leagueId);
  await processWaiversIfDue(db, input.leagueId);
  const derived = await deriveWindow(db, input.leagueId);
  if (derived.window !== "waiver" || !derived.processAt) {
    throw new LeagueError("Claims are only accepted during the waiver period", 409, "FA_PERIOD");
  }
  if (input.claims.length > MAX_WAIVER_CLAIMS) {
    throw new LeagueError(`At most ${MAX_WAIVER_CLAIMS} claims`, 400);
  }

  const teamId = await myTeamId(db, input.leagueId, input.userId);
  if (!teamId) {
    throw new LeagueError("You need a team in this league to submit claims", 403);
  }

  await ensurePeriod(db, input.leagueId, derived.processAt);
  const [period] = await db
    .select({ id: waiverPeriods.id, processedAt: waiverPeriods.processedAt })
    .from(waiverPeriods)
    .where(and(eq(waiverPeriods.leagueId, input.leagueId), eq(waiverPeriods.processAt, derived.processAt)))
    .limit(1);
  if (!period || period.processedAt) {
    throw new LeagueError("No open waiver period", 409, "FA_PERIOD");
  }

  const occupancy = await getLeaguePlayerOccupancy(db, input.leagueId);
  const myRoster = [...occupancy.entries()].filter(([, owner]) => owner === teamId).map(([playerId]) => playerId);
  const config = await getLeagueSettings(db, input.leagueId);
  const capacity = rosterCapacity(config ?? DEFAULT_ROSTER_CONFIG);
  const full = myRoster.length >= capacity;
  const priority = await loadPriority(db, input.leagueId);
  const remaining = priority.find((row) => row.teamId === teamId)?.faabRemaining ?? derived.settings.faabBudget;

  const seen = new Set<string>();
  for (const claim of input.claims) {
    if (seen.has(claim.playerId)) {
      throw new LeagueError("Duplicate add player in claims", 400);
    }
    seen.add(claim.playerId);
    if (claim.bid < 0 || (derived.settings.type === "faab" && claim.bid > remaining)) {
      throw new LeagueError("Bid exceeds remaining FAAB", 400, "BID_TOO_HIGH");
    }
    const owner = occupancy.get(claim.playerId);
    if (owner) {
      throw new LeagueError("Player is already on a roster", 409, "PLAYER_TAKEN");
    }
    if (full && !claim.dropPlayerId) {
      throw new LeagueError("Full roster claims must include a drop", 400, "DROP_REQUIRED");
    }
    if (claim.dropPlayerId && !myRoster.includes(claim.dropPlayerId)) {
      throw new LeagueError("Drop player is not on your roster", 400, "DROP_NOT_ON_ROSTER");
    }
    if (claim.dropPlayerId === claim.playerId) {
      throw new LeagueError("Cannot drop the same player you are adding", 400);
    }
    const [exists] = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, claim.playerId))
      .limit(1);
    if (!exists) {
      throw new LeagueError("Player not found", 404);
    }
  }

  await db
    .delete(waiverClaims)
    .where(
      and(
        eq(waiverClaims.periodId, period.id),
        eq(waiverClaims.fantasyTeamId, teamId),
        eq(waiverClaims.status, "pending"),
      ),
    );

  if (input.claims.length > 0) {
    try {
      await db.insert(waiverClaims).values(
        input.claims.map((claim, index) => ({
          leagueId: input.leagueId,
          periodId: period.id,
          fantasyTeamId: teamId,
          playerId: claim.playerId,
          dropPlayerId: claim.dropPlayerId,
          bid: derived.settings.type === "faab" ? claim.bid : 0,
          rank: index + 1,
          status: "pending",
        })),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LeagueError("Duplicate claim for this player", 409);
      }
      throw error;
    }
  }

  return getWaiverBoard(db, input.leagueId, input.userId);
}

export async function cancelWaiverClaim(
  db: Database,
  input: { leagueId: string; userId: string; claimId: string },
): Promise<WaiverBoardDto> {
  await requireActiveLeague(db, input.leagueId);
  const teamId = await myTeamId(db, input.leagueId, input.userId);
  if (!teamId) {
    throw new LeagueError("You need a team in this league to cancel claims", 403);
  }

  const [row] = await db
    .select({
      id: waiverClaims.id,
      status: waiverClaims.status,
      fantasyTeamId: waiverClaims.fantasyTeamId,
      leagueId: waiverClaims.leagueId,
    })
    .from(waiverClaims)
    .where(eq(waiverClaims.id, input.claimId))
    .limit(1);

  if (!row || row.leagueId !== input.leagueId) {
    throw new LeagueError("Claim not found", 404);
  }
  if (row.fantasyTeamId !== teamId) {
    throw new LeagueError("Only your own claims can be cancelled", 403);
  }
  if (row.status !== "pending") {
    throw new LeagueError("Only pending claims can be cancelled", 409);
  }

  await db
    .update(waiverClaims)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(waiverClaims.id, row.id));

  return getWaiverBoard(db, input.leagueId, input.userId);
}
