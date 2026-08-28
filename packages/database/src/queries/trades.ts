import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { TradeBoardDto, TradeDto, TradePlayerDto } from "@sundaystack/shared";
import {
  DEFAULT_TRADE_EXPIRY_DAYS,
  findPendingPlayerConflict,
  isTradeExpired,
  rosterCapacity,
  validateTradeOffer,
  type TradeOfferInput,
} from "@sundaystack/shared";
import type { Database } from "../client";
import { fantasyTeams, players, rosterPlayers, tradePlayers, trades } from "../schema";
import { LeagueError, getFantasyTeam, getLeagueSettings, getLeagueStatus, isUniqueViolation } from "./leagues";
import { addRosterPlayer, getRoster } from "./rosters";

async function requireActiveLeague(db: Database, leagueId: string): Promise<void> {
  const status = await getLeagueStatus(db, leagueId);
  if (!status) {
    throw new LeagueError("League not found", 404);
  }
  if (status !== "active") {
    throw new LeagueError("Trades start after the draft completes", 409, "NOT_ACTIVE");
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

export async function expireTradesIfDue(db: Database, leagueId: string): Promise<void> {
  const status = await getLeagueStatus(db, leagueId);
  if (status !== "active") {
    return;
  }
  const now = new Date();
  const due = await db
    .select({ id: trades.id, expiresAt: trades.expiresAt })
    .from(trades)
    .where(and(eq(trades.leagueId, leagueId), eq(trades.status, "pending"), lte(trades.expiresAt, now)));
  for (const row of due) {
    if (!isTradeExpired(row.expiresAt, now)) {
      continue;
    }
    await db
      .update(trades)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(trades.id, row.id), eq(trades.status, "pending")));
  }
}

async function pendingPlayerIds(db: Database, leagueId: string, exceptTradeId?: string): Promise<Set<string>> {
  const pending = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.leagueId, leagueId), eq(trades.status, "pending")));
  const ids = pending.map((row) => row.id).filter((id) => id !== exceptTradeId);
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ playerId: tradePlayers.playerId })
    .from(tradePlayers)
    .where(inArray(tradePlayers.tradeId, ids));
  return new Set(rows.map((row) => row.playerId));
}

function splitDrops(
  dropPlayerIds: string[],
  proposerRoster: string[],
  counterRoster: string[],
): { proposer: string[]; counterparty: string[] } {
  const proposerSet = new Set(proposerRoster);
  const counterSet = new Set(counterRoster);
  const proposer: string[] = [];
  const counterparty: string[] = [];
  for (const playerId of dropPlayerIds) {
    if (proposerSet.has(playerId)) {
      proposer.push(playerId);
    } else if (counterSet.has(playerId)) {
      counterparty.push(playerId);
    } else {
      throw new LeagueError("Drop player is not on either trade roster", 400, "PLAYER_NOT_ON_ROSTER");
    }
  }
  return { proposer, counterparty };
}

async function buildOffer(
  db: Database,
  input: {
    proposerTeamId: string;
    counterpartyTeamId: string;
    givePlayerIds: string[];
    receivePlayerIds: string[];
    dropPlayerIds: string[];
  },
): Promise<TradeOfferInput> {
  const proposerRoster = await getRoster(db, input.proposerTeamId);
  const counterRoster = await getRoster(db, input.counterpartyTeamId);
  if (!proposerRoster || !counterRoster) {
    throw new LeagueError("Team not found", 404);
  }
  const settings = await getLeagueSettings(db, proposerRoster.team.leagueId);
  if (!settings) {
    throw new LeagueError("Settings not found", 404);
  }
  const drops = splitDrops(
    input.dropPlayerIds,
    proposerRoster.players.map((row) => row.playerId),
    counterRoster.players.map((row) => row.playerId),
  );
  return {
    capacity: rosterCapacity(settings),
    proposer: {
      teamId: input.proposerTeamId,
      rosterPlayerIds: proposerRoster.players.map((row) => row.playerId),
      sendPlayerIds: input.givePlayerIds,
      dropPlayerIds: drops.proposer,
    },
    counterparty: {
      teamId: input.counterpartyTeamId,
      rosterPlayerIds: counterRoster.players.map((row) => row.playerId),
      sendPlayerIds: input.receivePlayerIds,
      dropPlayerIds: drops.counterparty,
    },
  };
}

function throwIfInvalid(result: ReturnType<typeof validateTradeOffer>): void {
  if (!result.ok) {
    const status = result.code === "PLAYER_NOT_ON_ROSTER" || result.code === "DROP_REQUIRED" ? 409 : 400;
    throw new LeagueError(result.message, status, result.code);
  }
}

async function loadTradeDto(db: Database, tradeId: string): Promise<TradeDto | null> {
  const [row] = await db
    .select({
      id: trades.id,
      proposerTeamId: trades.proposerFantasyTeamId,
      counterpartyTeamId: trades.counterpartyFantasyTeamId,
      status: trades.status,
      expiresAt: trades.expiresAt,
      acceptedAt: trades.acceptedAt,
    })
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);
  if (!row) {
    return null;
  }

  const [proposer, counterparty] = await Promise.all([
    getFantasyTeam(db, row.proposerTeamId),
    getFantasyTeam(db, row.counterpartyTeamId),
  ]);
  if (!proposer || !counterparty) {
    return null;
  }

  const assetRows = await db
    .select({
      playerId: tradePlayers.playerId,
      fromTeamId: tradePlayers.fromFantasyTeamId,
      role: tradePlayers.role,
      displayName: players.displayName,
      position: players.position,
    })
    .from(tradePlayers)
    .innerJoin(players, eq(tradePlayers.playerId, players.id))
    .where(eq(tradePlayers.tradeId, tradeId));

  const assets: TradePlayerDto[] = assetRows.map((asset) => ({
    playerId: asset.playerId,
    displayName: asset.displayName,
    position: asset.position,
    fromTeamId: asset.fromTeamId,
    role: asset.role === "drop" ? "drop" : "send",
  }));

  return {
    id: row.id,
    proposerTeamId: row.proposerTeamId,
    proposerTeamName: proposer.name,
    counterpartyTeamId: row.counterpartyTeamId,
    counterpartyTeamName: counterparty.name,
    status: row.status as TradeDto["status"],
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    players: assets,
  };
}

async function restoreRows(
  db: Database,
  leagueId: string,
  rows: Array<{ fantasyTeamId: string; playerId: string; slot: string }>,
): Promise<void> {
  for (const row of rows) {
    try {
      await db.insert(rosterPlayers).values({
        leagueId,
        fantasyTeamId: row.fantasyTeamId,
        playerId: row.playerId,
        slot: row.slot,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}

async function executeSwap(
  db: Database,
  leagueId: string,
  offer: TradeOfferInput,
): Promise<void> {
  const settings = await getLeagueSettings(db, leagueId);
  if (!settings) {
    throw new LeagueError("Settings not found", 404);
  }

  const expectedTeam = new Map<string, string>();
  for (const playerId of [...offer.proposer.sendPlayerIds, ...offer.proposer.dropPlayerIds]) {
    expectedTeam.set(playerId, offer.proposer.teamId);
  }
  for (const playerId of [...offer.counterparty.sendPlayerIds, ...offer.counterparty.dropPlayerIds]) {
    expectedTeam.set(playerId, offer.counterparty.teamId);
  }
  const toDelete = [...expectedTeam.keys()];
  const snapshot: Array<{ fantasyTeamId: string; playerId: string; slot: string }> = [];
  for (const playerId of toDelete) {
    const [row] = await db
      .select({
        fantasyTeamId: rosterPlayers.fantasyTeamId,
        playerId: rosterPlayers.playerId,
        slot: rosterPlayers.slot,
      })
      .from(rosterPlayers)
      .where(and(eq(rosterPlayers.leagueId, leagueId), eq(rosterPlayers.playerId, playerId)))
      .limit(1);
    if (!row || row.fantasyTeamId !== expectedTeam.get(playerId)) {
      await restoreRows(db, leagueId, snapshot);
      throw new LeagueError("A traded player is no longer on the roster", 409, "STALE");
    }
    snapshot.push(row);
    await db
      .delete(rosterPlayers)
      .where(and(eq(rosterPlayers.leagueId, leagueId), eq(rosterPlayers.playerId, playerId)));
  }

  const inserts = [
    ...offer.proposer.sendPlayerIds.map((playerId) => ({ teamId: offer.counterparty.teamId, playerId })),
    ...offer.counterparty.sendPlayerIds.map((playerId) => ({ teamId: offer.proposer.teamId, playerId })),
  ];
  const inserted: string[] = [];
  try {
    for (const row of inserts) {
      await addRosterPlayer(db, {
        leagueId,
        teamId: row.teamId,
        playerId: row.playerId,
        config: settings,
      });
      inserted.push(row.playerId);
    }
  } catch (error) {
    for (const playerId of inserted) {
      await db
        .delete(rosterPlayers)
        .where(and(eq(rosterPlayers.leagueId, leagueId), eq(rosterPlayers.playerId, playerId)));
    }
    await restoreRows(db, leagueId, snapshot);
    if (error instanceof LeagueError) {
      throw error;
    }
    throw new LeagueError("Trade could not be applied", 409, "STALE");
  }
}

export async function getTradeBoard(db: Database, leagueId: string, userId: string): Promise<TradeBoardDto> {
  await requireActiveLeague(db, leagueId);
  await expireTradesIfDue(db, leagueId);
  const teamId = await myTeamId(db, leagueId, userId);
  const rows = await db
    .select({ id: trades.id, status: trades.status, proposerTeamId: trades.proposerFantasyTeamId, counterpartyTeamId: trades.counterpartyFantasyTeamId })
    .from(trades)
    .where(eq(trades.leagueId, leagueId))
    .orderBy(desc(trades.createdAt));

  const dtos: TradeDto[] = [];
  for (const row of rows) {
    const dto = await loadTradeDto(db, row.id);
    if (dto) {
      dtos.push(dto);
    }
  }

  const incoming = dtos.filter((row) => row.status === "pending" && row.counterpartyTeamId === teamId);
  const outgoing = dtos.filter((row) => row.status === "pending" && row.proposerTeamId === teamId);
  const leaguePending = dtos.filter(
    (row) =>
      row.status === "pending" &&
      row.proposerTeamId !== teamId &&
      row.counterpartyTeamId !== teamId,
  );
  const recent = dtos.filter((row) => row.status !== "pending").slice(0, 20);

  return { myTeamId: teamId, incoming, outgoing, leaguePending, recent };
}

export async function proposeTrade(
  db: Database,
  input: {
    leagueId: string;
    userId: string;
    counterpartyTeamId: string;
    givePlayerIds: string[];
    receivePlayerIds: string[];
    dropPlayerIds: string[];
  },
): Promise<TradeDto> {
  await requireActiveLeague(db, input.leagueId);
  await expireTradesIfDue(db, input.leagueId);
  const proposerTeamId = await myTeamId(db, input.leagueId, input.userId);
  if (!proposerTeamId) {
    throw new LeagueError("You need a team in this league to propose a trade", 403);
  }
  const counter = await getFantasyTeam(db, input.counterpartyTeamId);
  if (!counter || counter.leagueId !== input.leagueId) {
    throw new LeagueError("Counterparty team not found in this league", 404);
  }

  const offer = await buildOffer(db, {
    proposerTeamId,
    counterpartyTeamId: input.counterpartyTeamId,
    givePlayerIds: input.givePlayerIds,
    receivePlayerIds: input.receivePlayerIds,
    dropPlayerIds: input.dropPlayerIds,
  });
  throwIfInvalid(validateTradeOffer(offer));

  const involved = [
    ...offer.proposer.sendPlayerIds,
    ...offer.proposer.dropPlayerIds,
    ...offer.counterparty.sendPlayerIds,
    ...offer.counterparty.dropPlayerIds,
  ];
  const conflict = findPendingPlayerConflict(await pendingPlayerIds(db, input.leagueId), involved);
  if (conflict) {
    throw new LeagueError("A player is already in a pending trade", 409, "PLAYER_IN_TRADE");
  }

  const expiresAt = new Date(Date.now() + DEFAULT_TRADE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const tradeId = randomUUID();
  await db.insert(trades).values({
    id: tradeId,
    leagueId: input.leagueId,
    proposerFantasyTeamId: proposerTeamId,
    counterpartyFantasyTeamId: input.counterpartyTeamId,
    status: "pending",
    expiresAt,
  });

  const assets = [
    ...offer.proposer.sendPlayerIds.map((playerId) => ({
      fromFantasyTeamId: proposerTeamId,
      playerId,
      role: "send" as const,
    })),
    ...offer.proposer.dropPlayerIds.map((playerId) => ({
      fromFantasyTeamId: proposerTeamId,
      playerId,
      role: "drop" as const,
    })),
    ...offer.counterparty.sendPlayerIds.map((playerId) => ({
      fromFantasyTeamId: input.counterpartyTeamId,
      playerId,
      role: "send" as const,
    })),
    ...offer.counterparty.dropPlayerIds.map((playerId) => ({
      fromFantasyTeamId: input.counterpartyTeamId,
      playerId,
      role: "drop" as const,
    })),
  ];
  await db.insert(tradePlayers).values(assets.map((asset) => ({ tradeId, ...asset })));

  const dto = await loadTradeDto(db, tradeId);
  if (!dto) {
    throw new LeagueError("Trade could not be loaded", 500);
  }
  return dto;
}

async function loadPendingTrade(
  db: Database,
  leagueId: string,
  tradeId: string,
): Promise<{
  id: string;
  proposerTeamId: string;
  counterpartyTeamId: string;
  expiresAt: Date;
}> {
  await expireTradesIfDue(db, leagueId);
  const [row] = await db
    .select({
      id: trades.id,
      leagueId: trades.leagueId,
      status: trades.status,
      proposerTeamId: trades.proposerFantasyTeamId,
      counterpartyTeamId: trades.counterpartyFantasyTeamId,
      expiresAt: trades.expiresAt,
    })
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);
  if (!row || row.leagueId !== leagueId) {
    throw new LeagueError("Trade not found", 404);
  }
  if (row.status !== "pending") {
    throw new LeagueError("Trade is no longer pending", 409, "STALE");
  }
  return row;
}

export async function acceptTrade(
  db: Database,
  input: { leagueId: string; userId: string; tradeId: string },
): Promise<TradeDto> {
  await requireActiveLeague(db, input.leagueId);
  const row = await loadPendingTrade(db, input.leagueId, input.tradeId);
  const teamId = await myTeamId(db, input.leagueId, input.userId);
  if (teamId !== row.counterpartyTeamId) {
    throw new LeagueError("Only the receiving team can accept this trade", 403);
  }

  const assets = await db
    .select({
      fromTeamId: tradePlayers.fromFantasyTeamId,
      playerId: tradePlayers.playerId,
      role: tradePlayers.role,
    })
    .from(tradePlayers)
    .where(eq(tradePlayers.tradeId, row.id));

  const givePlayerIds = assets
    .filter((asset) => asset.fromTeamId === row.proposerTeamId && asset.role === "send")
    .map((asset) => asset.playerId);
  const receivePlayerIds = assets
    .filter((asset) => asset.fromTeamId === row.counterpartyTeamId && asset.role === "send")
    .map((asset) => asset.playerId);
  const dropPlayerIds = assets.filter((asset) => asset.role === "drop").map((asset) => asset.playerId);

  const offer = await buildOffer(db, {
    proposerTeamId: row.proposerTeamId,
    counterpartyTeamId: row.counterpartyTeamId,
    givePlayerIds,
    receivePlayerIds,
    dropPlayerIds,
  });
  const validity = validateTradeOffer(offer);
  if (!validity.ok && validity.code === "PLAYER_NOT_ON_ROSTER") {
    throw new LeagueError("A traded player is no longer on the roster", 409, "STALE");
  }
  throwIfInvalid(validity);

  const involved = [
    ...offer.proposer.sendPlayerIds,
    ...offer.proposer.dropPlayerIds,
    ...offer.counterparty.sendPlayerIds,
    ...offer.counterparty.dropPlayerIds,
  ];
  const conflict = findPendingPlayerConflict(await pendingPlayerIds(db, input.leagueId, row.id), involved);
  if (conflict) {
    throw new LeagueError("A player is already in a pending trade", 409, "PLAYER_IN_TRADE");
  }

  await executeSwap(db, input.leagueId, offer);
  const now = new Date();
  await db
    .update(trades)
    .set({ status: "completed", acceptedAt: now, updatedAt: now })
    .where(eq(trades.id, row.id));

  const dto = await loadTradeDto(db, row.id);
  if (!dto) {
    throw new LeagueError("Trade could not be loaded", 500);
  }
  return dto;
}

export async function rejectTrade(
  db: Database,
  input: { leagueId: string; userId: string; tradeId: string },
): Promise<TradeDto> {
  await requireActiveLeague(db, input.leagueId);
  const row = await loadPendingTrade(db, input.leagueId, input.tradeId);
  const teamId = await myTeamId(db, input.leagueId, input.userId);
  if (teamId !== row.counterpartyTeamId) {
    throw new LeagueError("Only the receiving team can reject this trade", 403);
  }
  await db
    .update(trades)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(trades.id, row.id), eq(trades.status, "pending")));
  const dto = await loadTradeDto(db, row.id);
  if (!dto) {
    throw new LeagueError("Trade could not be loaded", 500);
  }
  return dto;
}

export async function cancelTrade(
  db: Database,
  input: { leagueId: string; userId: string; tradeId: string; isCommissioner: boolean },
): Promise<TradeDto> {
  await requireActiveLeague(db, input.leagueId);
  const row = await loadPendingTrade(db, input.leagueId, input.tradeId);
  const teamId = await myTeamId(db, input.leagueId, input.userId);
  if (teamId !== row.proposerTeamId && !input.isCommissioner) {
    throw new LeagueError("Only the proposer or commissioner can cancel this trade", 403);
  }
  await db
    .update(trades)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(trades.id, row.id), eq(trades.status, "pending")));
  const dto = await loadTradeDto(db, row.id);
  if (!dto) {
    throw new LeagueError("Trade could not be loaded", 500);
  }
  return dto;
}
