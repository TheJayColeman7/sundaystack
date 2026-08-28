import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type {
  AutopickCandidate,
  DraftPickSource,
  DraftStateDto,
  DraftStatus,
  LineupPlayer,
  PlayerListQuery,
  PlayerListResponse,
  RosterConfig,
  RosterSlot,
} from "@sundaystack/shared";
import {
  chooseAutopick,
  isClockExpired,
  rosterCapacity,
  secondsRemaining,
  snakePickOwner,
  totalPicks,
} from "@sundaystack/shared";
import type { Database } from "../client";
import {
  draftOrder,
  draftPicks,
  draftQueues,
  drafts,
  fantasyTeams,
  leagues,
  playerGameStats,
  players,
  teams,
  users,
} from "../schema";
import { LeagueError, getNflContext, isUniqueViolation } from "./leagues";
import { addRosterPlayer, getLeaguePlayerOccupancy, getRoster, listRosterPlayersForLeague } from "./rosters";
import { listPlayers } from "./players";

const QUEUE_CAP = 25;
const BPA_CANDIDATE_LIMIT = 400;
const DRAFTABLE_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

function shuffleIds(ids: string[]): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const current = copy[i];
    const swap = copy[j];
    if (current === undefined || swap === undefined) {
      continue;
    }
    copy[i] = swap;
    copy[j] = current;
  }
  return copy;
}

function asDraftStatus(value: string): DraftStatus {
  if (value === "lobby" || value === "live" || value === "complete") {
    return value;
  }
  throw new LeagueError(`Unexpected draft status ${value}`, 500);
}

function asPickSource(value: string): DraftPickSource {
  if (value === "manual" || value === "queue" || value === "autopick" || value === "passed_full") {
    return value;
  }
  throw new LeagueError(`Unexpected pick source ${value}`, 500);
}

export async function getDraftRow(db: Database, leagueId: string) {
  const [row] = await db.select().from(drafts).where(eq(drafts.leagueId, leagueId)).limit(1);
  return row ?? null;
}

async function loadOrder(db: Database, draftId: string) {
  return db
    .select({
      slot: draftOrder.slot,
      fantasyTeamId: draftOrder.fantasyTeamId,
      teamName: fantasyTeams.name,
      ownerUserId: fantasyTeams.ownerUserId,
      ownerDisplayName: users.displayName,
    })
    .from(draftOrder)
    .innerJoin(fantasyTeams, eq(draftOrder.fantasyTeamId, fantasyTeams.id))
    .innerJoin(users, eq(fantasyTeams.ownerUserId, users.id))
    .where(eq(draftOrder.draftId, draftId))
    .orderBy(asc(draftOrder.slot));
}

function onTheClockTeamId(
  status: DraftStatus,
  pickNumber: number,
  order: Array<{ slot: number; fantasyTeamId: string }>,
): string | null {
  if (status !== "live" || order.length === 0) {
    return null;
  }
  const slot = snakePickOwner(pickNumber, order.length);
  return order.find((row) => row.slot === slot)?.fantasyTeamId ?? null;
}

export async function getDraftState(
  db: Database,
  leagueId: string,
  userId: string,
): Promise<DraftStateDto | null> {
  const draft = await getDraftRow(db, leagueId);
  if (!draft) {
    return null;
  }

  const [order, pickRows, queueRows, occupancy] = await Promise.all([
    loadOrder(db, draft.id),
    db
      .select({
        pickNumber: draftPicks.pickNumber,
        fantasyTeamId: draftPicks.fantasyTeamId,
        playerId: draftPicks.playerId,
        source: draftPicks.source,
        pickedAt: draftPicks.pickedAt,
        playerDisplayName: players.displayName,
        playerPosition: players.position,
      })
      .from(draftPicks)
      .leftJoin(players, eq(draftPicks.playerId, players.id))
      .where(eq(draftPicks.draftId, draft.id))
      .orderBy(asc(draftPicks.pickNumber)),
    db
      .select({
        playerId: draftQueues.playerId,
        rank: draftQueues.rank,
        displayName: players.displayName,
        position: players.position,
        teamAbbreviation: teams.abbreviation,
      })
      .from(draftQueues)
      .innerJoin(players, eq(draftQueues.playerId, players.id))
      .leftJoin(teams, eq(players.teamId, teams.id))
      .where(and(eq(draftQueues.draftId, draft.id), eq(draftQueues.userId, userId)))
      .orderBy(asc(draftQueues.rank)),
    getLeaguePlayerOccupancy(db, leagueId),
  ]);

  const status = asDraftStatus(draft.status);
  const now = new Date();
  const startedAt = draft.currentPickStartedAt;
  const remaining =
    status === "live" && startedAt ? secondsRemaining(startedAt, draft.secondsPerPick, now) : null;

  return {
    id: draft.id,
    leagueId: draft.leagueId,
    status,
    secondsPerPick: draft.secondsPerPick,
    currentPickNumber: draft.currentPickNumber,
    currentPickStartedAt: startedAt ? startedAt.toISOString() : null,
    secondsRemaining: remaining,
    totalPicks: draft.totalPicks,
    onTheClockTeamId: onTheClockTeamId(status, draft.currentPickNumber, order),
    order: order.map((row) => ({
      slot: row.slot,
      fantasyTeamId: row.fantasyTeamId,
      teamName: row.teamName,
      ownerUserId: row.ownerUserId,
      ownerDisplayName: row.ownerDisplayName,
    })),
    picks: pickRows.map((row) => ({
      pickNumber: row.pickNumber,
      fantasyTeamId: row.fantasyTeamId,
      playerId: row.playerId,
      playerDisplayName: row.playerDisplayName,
      playerPosition: row.playerPosition,
      source: asPickSource(row.source),
      pickedAt: row.pickedAt ? row.pickedAt.toISOString() : null,
    })),
    myQueue: queueRows.map((row) => ({
      playerId: row.playerId,
      rank: row.rank,
      displayName: row.displayName,
      position: row.position,
      teamAbbreviation: row.teamAbbreviation,
    })),
    occupiedPlayerIds: [...occupancy.keys()],
  };
}

async function completeOrAdvance(
  db: Database,
  draft: { id: string; leagueId: string; totalPicks: number },
  completedPickNumber: number,
): Promise<void> {
  if (completedPickNumber >= draft.totalPicks) {
    await db
      .update(drafts)
      .set({
        status: "complete",
        currentPickStartedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(drafts.id, draft.id), eq(drafts.currentPickNumber, completedPickNumber)));
    await db
      .update(leagues)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(leagues.id, draft.leagueId));
    return;
  }

  await db
    .update(drafts)
    .set({
      currentPickNumber: completedPickNumber + 1,
      currentPickStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, draft.id), eq(drafts.currentPickNumber, completedPickNumber)));
}

async function recordPick(input: {
  db: Database;
  leagueId: string;
  draft: { id: string; leagueId: string; currentPickNumber: number; totalPicks: number };
  fantasyTeamId: string;
  playerId: string | null;
  source: DraftPickSource;
  config: RosterConfig;
}): Promise<void> {
  const pickNumber = input.draft.currentPickNumber;
  try {
    await input.db.insert(draftPicks).values({
      draftId: input.draft.id,
      pickNumber,
      fantasyTeamId: input.fantasyTeamId,
      playerId: input.playerId,
      source: input.source,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LeagueError("This pick was already made", 409, "PICK_TAKEN");
    }
    throw error;
  }

  if (input.playerId) {
    try {
      await addRosterPlayer(input.db, {
        leagueId: input.leagueId,
        teamId: input.fantasyTeamId,
        playerId: input.playerId,
        config: input.config,
      });
    } catch (error) {
      await input.db
        .delete(draftPicks)
        .where(and(eq(draftPicks.draftId, input.draft.id), eq(draftPicks.pickNumber, pickNumber)));
      throw error;
    }
  }

  await completeOrAdvance(input.db, input.draft, pickNumber);
}

function rosterToLineup(
  rows: Array<{ playerId: string; position: string; slot: string }>,
): LineupPlayer[] {
  return rows.map((row) => ({
    playerId: row.playerId,
    position: row.position,
    slot: row.slot as RosterSlot,
  }));
}

async function loadAutopickCandidates(
  db: Database,
  leagueId: string,
  extraPlayerIds: string[],
): Promise<AutopickCandidate[]> {
  const occupancy = await getLeaguePlayerOccupancy(db, leagueId);
  const occupiedIds = [...occupancy.keys()];
  const { seasonId } = await getNflContext(db);

  const productionExpr = sql<number>`coalesce(sum(
    ${playerGameStats.passingYards} + ${playerGameStats.rushingYards} + ${playerGameStats.receivingYards}
    + ${playerGameStats.passingTds} + ${playerGameStats.rushingTds} + ${playerGameStats.receivingTds}
  ), 0)`;

  const filters = [inArray(players.position, [...DRAFTABLE_POSITIONS])];
  if (occupiedIds.length > 0) {
    filters.push(notInArray(players.id, occupiedIds));
  }

  const top = await db
    .select({
      playerId: players.id,
      position: players.position,
      displayName: players.displayName,
      productionScore: productionExpr,
    })
    .from(players)
    .leftJoin(
      playerGameStats,
      and(eq(playerGameStats.playerId, players.id), eq(playerGameStats.seasonId, seasonId)),
    )
    .where(and(...filters))
    .groupBy(players.id)
    .orderBy(desc(productionExpr), players.displayName)
    .limit(BPA_CANDIDATE_LIMIT);

  const byId = new Map(top.map((row) => [row.playerId, row]));
  const missing = extraPlayerIds.filter((id) => !byId.has(id) && !occupancy.has(id));
  if (missing.length > 0) {
    const extras = await db
      .select({
        playerId: players.id,
        position: players.position,
        displayName: players.displayName,
        productionScore: productionExpr,
      })
      .from(players)
      .leftJoin(
        playerGameStats,
        and(eq(playerGameStats.playerId, players.id), eq(playerGameStats.seasonId, seasonId)),
      )
      .where(inArray(players.id, missing))
      .groupBy(players.id);
    for (const row of extras) {
      byId.set(row.playerId, row);
    }
  }

  return [...byId.values()].map((row) => ({
    playerId: row.playerId,
    position: row.position,
    displayName: row.displayName,
    productionScore: Number(row.productionScore ?? 0),
  }));
}

async function queueIdsForOwner(db: Database, draftId: string, ownerUserId: string): Promise<string[]> {
  const rows = await db
    .select({ playerId: draftQueues.playerId })
    .from(draftQueues)
    .where(and(eq(draftQueues.draftId, draftId), eq(draftQueues.userId, ownerUserId)))
    .orderBy(asc(draftQueues.rank));
  return rows.map((row) => row.playerId);
}

async function performAutopick(
  db: Database,
  leagueId: string,
  draft: {
    id: string;
    leagueId: string;
    currentPickNumber: number;
    totalPicks: number;
  },
  config: RosterConfig,
): Promise<void> {
  const order = await loadOrder(db, draft.id);
  const teamId = onTheClockTeamId("live", draft.currentPickNumber, order);
  if (!teamId) {
    throw new LeagueError("Could not resolve team on the clock", 500);
  }

  const owner = order.find((row) => row.fantasyTeamId === teamId);
  const rostered = await listRosterPlayersForLeague(db, leagueId);
  const teamRoster = rosterToLineup(rostered.filter((row) => row.fantasyTeamId === teamId));

  if (teamRoster.length >= rosterCapacity(config)) {
    await recordPick({
      db,
      leagueId,
      draft,
      fantasyTeamId: teamId,
      playerId: null,
      source: "passed_full",
      config,
    });
    return;
  }

  const queued = owner ? await queueIdsForOwner(db, draft.id, owner.ownerUserId) : [];
  const available = await loadAutopickCandidates(db, leagueId, queued);
  const choice = chooseAutopick({
    queuePlayerIds: queued,
    available,
    roster: teamRoster,
    config,
  });

  if (choice.source === "passed_full") {
    await recordPick({
      db,
      leagueId,
      draft,
      fantasyTeamId: teamId,
      playerId: null,
      source: "passed_full",
      config,
    });
    return;
  }

  await recordPick({
    db,
    leagueId,
    draft,
    fantasyTeamId: teamId,
    playerId: choice.playerId,
    source: choice.source,
    config,
  });
}

export async function expireIfNeeded(db: Database, leagueId: string, config: RosterConfig): Promise<void> {
  const draft = await getDraftRow(db, leagueId);
  if (!draft || draft.status !== "live" || !draft.currentPickStartedAt) {
    return;
  }
  if (!isClockExpired(draft.currentPickStartedAt, draft.secondsPerPick, new Date())) {
    return;
  }

  try {
    await performAutopick(db, leagueId, draft, config);
  } catch (error) {
    if (error instanceof LeagueError && error.code === "PICK_TAKEN") {
      return;
    }
    throw error;
  }
}

export async function createDraftLobby(
  db: Database,
  input: { leagueId: string; userId: string; secondsPerPick?: number; config: RosterConfig },
): Promise<DraftStateDto> {
  const existing = await getDraftRow(db, input.leagueId);
  if (existing) {
    throw new LeagueError("A draft already exists for this league", 409, "DRAFT_EXISTS");
  }

  const teamRows = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, input.leagueId));

  if (teamRows.length < 1) {
    throw new LeagueError("League has no teams", 400);
  }

  const orderedIds = shuffleIds(teamRows.map((row) => row.id));
  const draftId = randomUUID();
  const seconds = input.secondsPerPick ?? 90;

  try {
    await db.insert(drafts).values({
      id: draftId,
      leagueId: input.leagueId,
      status: "lobby",
      secondsPerPick: seconds,
      currentPickNumber: 1,
      totalPicks: totalPicks(orderedIds.length, rosterCapacity(input.config)),
    });
    await db.insert(draftOrder).values(
      orderedIds.map((fantasyTeamId, index) => ({
        draftId,
        slot: index + 1,
        fantasyTeamId,
      })),
    );
  } catch (error) {
    await db.delete(drafts).where(eq(drafts.id, draftId));
    if (isUniqueViolation(error)) {
      throw new LeagueError("A draft already exists for this league", 409, "DRAFT_EXISTS");
    }
    throw error;
  }

  const state = await getDraftState(db, input.leagueId, input.userId);
  if (!state) {
    throw new LeagueError("Draft created but could not be loaded", 500);
  }
  return state;
}

export async function appendTeamToLobbyOrder(
  db: Database,
  leagueId: string,
  fantasyTeamId: string,
  config: RosterConfig,
): Promise<void> {
  const draft = await getDraftRow(db, leagueId);
  if (!draft || draft.status !== "lobby") {
    return;
  }

  const [maxRow] = await db
    .select({ slot: draftOrder.slot })
    .from(draftOrder)
    .where(eq(draftOrder.draftId, draft.id))
    .orderBy(desc(draftOrder.slot))
    .limit(1);

  const nextSlot = (maxRow?.slot ?? 0) + 1;
  await db.insert(draftOrder).values({
    draftId: draft.id,
    slot: nextSlot,
    fantasyTeamId,
  });
  await db
    .update(drafts)
    .set({
      totalPicks: totalPicks(nextSlot, rosterCapacity(config)),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draft.id));
}

export async function patchDraftLobby(
  db: Database,
  input: {
    leagueId: string;
    orderTeamIds?: string[];
    secondsPerPick?: number;
  },
): Promise<void> {
  const draft = await getDraftRow(db, input.leagueId);
  if (!draft) {
    throw new LeagueError("Draft not found", 404);
  }
  if (draft.status !== "lobby") {
    throw new LeagueError("Draft order can only change in the lobby", 409, "NOT_LOBBY");
  }

  if (input.secondsPerPick !== undefined) {
    await db
      .update(drafts)
      .set({ secondsPerPick: input.secondsPerPick, updatedAt: new Date() })
      .where(eq(drafts.id, draft.id));
  }

  if (!input.orderTeamIds) {
    return;
  }

  const current = await loadOrder(db, draft.id);
  const currentIds = current.map((row) => row.fantasyTeamId).sort();
  const nextIds = [...input.orderTeamIds].sort();
  if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
    throw new LeagueError("Order must include every team exactly once", 400);
  }

  await db
    .update(draftOrder)
    .set({ slot: sql`${draftOrder.slot} + 1000` })
    .where(eq(draftOrder.draftId, draft.id));

  for (let index = 0; index < input.orderTeamIds.length; index += 1) {
    const fantasyTeamId = input.orderTeamIds[index];
    if (!fantasyTeamId) {
      continue;
    }
    await db
      .update(draftOrder)
      .set({ slot: index + 1, updatedAt: new Date() })
      .where(and(eq(draftOrder.draftId, draft.id), eq(draftOrder.fantasyTeamId, fantasyTeamId)));
  }
}

export async function startDraft(db: Database, leagueId: string, config: RosterConfig): Promise<void> {
  const draft = await getDraftRow(db, leagueId);
  if (!draft) {
    throw new LeagueError("Draft not found", 404);
  }
  if (draft.status !== "lobby") {
    throw new LeagueError("Draft has already started", 409, "NOT_LOBBY");
  }

  const order = await loadOrder(db, draft.id);
  const teamRows = await db
    .select({ id: fantasyTeams.id })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId));

  const inOrder = new Set(order.map((row) => row.fantasyTeamId));
  for (const team of teamRows) {
    if (!inOrder.has(team.id)) {
      await appendTeamToLobbyOrder(db, leagueId, team.id, config);
    }
  }

  const synced = await loadOrder(db, draft.id);
  if (synced.length < 8) {
    throw new LeagueError("Need at least 8 teams to start the draft", 400, "NOT_ENOUGH_TEAMS");
  }

  const picks = totalPicks(synced.length, rosterCapacity(config));
  const now = new Date();
  await db
    .update(drafts)
    .set({
      status: "live",
      currentPickNumber: 1,
      currentPickStartedAt: now,
      totalPicks: picks,
      updatedAt: now,
    })
    .where(eq(drafts.id, draft.id));
  await db.update(leagues).set({ status: "drafting", updatedAt: now }).where(eq(leagues.id, leagueId));
}

export async function replaceDraftQueue(
  db: Database,
  input: { leagueId: string; userId: string; playerIds: string[] },
): Promise<void> {
  const draft = await getDraftRow(db, input.leagueId);
  if (!draft) {
    throw new LeagueError("Draft not found", 404);
  }
  if (draft.status === "complete") {
    throw new LeagueError("Draft is complete", 409, "COMPLETE");
  }
  if (input.playerIds.length > QUEUE_CAP) {
    throw new LeagueError(`Queue is limited to ${QUEUE_CAP} players`, 400);
  }

  const unique = [...new Set(input.playerIds)];
  if (unique.length !== input.playerIds.length) {
    throw new LeagueError("Queue contains duplicate players", 400);
  }

  const occupancy = await getLeaguePlayerOccupancy(db, input.leagueId);
  for (const playerId of unique) {
    if (occupancy.has(playerId)) {
      throw new LeagueError("Queue includes a player who is already rostered", 400, "PLAYER_TAKEN");
    }
  }

  if (unique.length > 0) {
    const found = await db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, unique));
    if (found.length !== unique.length) {
      throw new LeagueError("Queue includes an unknown player", 400);
    }
  }

  await db
    .delete(draftQueues)
    .where(and(eq(draftQueues.draftId, draft.id), eq(draftQueues.userId, input.userId)));

  if (unique.length === 0) {
    return;
  }

  await db.insert(draftQueues).values(
    unique.map((playerId, index) => ({
      draftId: draft.id,
      userId: input.userId,
      playerId,
      rank: index + 1,
    })),
  );
}

export async function makeManualPick(input: {
  db: Database;
  leagueId: string;
  userId: string;
  role: "commissioner" | "member";
  playerId: string;
  config: RosterConfig;
}): Promise<void> {
  const draft = await getDraftRow(input.db, input.leagueId);
  if (!draft) {
    throw new LeagueError("Draft not found", 404);
  }
  if (draft.status !== "live") {
    throw new LeagueError("Draft is not live", 409, "NOT_LIVE");
  }

  const order = await loadOrder(input.db, draft.id);
  const teamId = onTheClockTeamId("live", draft.currentPickNumber, order);
  if (!teamId) {
    throw new LeagueError("Could not resolve team on the clock", 500);
  }

  const owner = order.find((row) => row.fantasyTeamId === teamId);
  if (!owner) {
    throw new LeagueError("Could not resolve team on the clock", 500);
  }
  if (owner.ownerUserId !== input.userId && input.role !== "commissioner") {
    throw new LeagueError("It is not your turn to pick", 403);
  }

  const occupancy = await getLeaguePlayerOccupancy(input.db, input.leagueId);
  if (occupancy.has(input.playerId)) {
    throw new LeagueError("Player is already on a team in this league", 409, "PLAYER_TAKEN");
  }

  const roster = await getRoster(input.db, teamId);
  if (roster && roster.players.length >= rosterCapacity(input.config)) {
    await recordPick({
      db: input.db,
      leagueId: input.leagueId,
      draft,
      fantasyTeamId: teamId,
      playerId: null,
      source: "passed_full",
      config: input.config,
    });
    return;
  }

  await recordPick({
    db: input.db,
    leagueId: input.leagueId,
    draft,
    fantasyTeamId: teamId,
    playerId: input.playerId,
    source: "manual",
    config: input.config,
  });
}

export async function listDraftAvailable(
  db: Database,
  leagueId: string,
  query: PlayerListQuery,
): Promise<PlayerListResponse> {
  const occupancy = await getLeaguePlayerOccupancy(db, leagueId);
  return listPlayers(db, {
    ...query,
    excludePlayerIds: [...occupancy.keys()],
  });
}
