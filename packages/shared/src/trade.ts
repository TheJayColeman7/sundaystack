export const TRADE_STATUSES = ["pending", "completed", "rejected", "cancelled", "expired"] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const TRADE_PLAYER_ROLES = ["send", "drop"] as const;

export type TradePlayerRole = (typeof TRADE_PLAYER_ROLES)[number];

export const MAX_TRADE_PLAYERS = 8;
export const DEFAULT_TRADE_EXPIRY_DAYS = 7;

export function isTradeStatus(value: string): value is TradeStatus {
  return (TRADE_STATUSES as readonly string[]).includes(value);
}

export function isTradeExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export interface TradeSideInput {
  teamId: string;
  rosterPlayerIds: string[];
  sendPlayerIds: string[];
  dropPlayerIds: string[];
}

export interface TradeOfferInput {
  proposer: TradeSideInput;
  counterparty: TradeSideInput;
  capacity: number;
}

export type TradeValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function uniqueIds(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function validateSide(side: TradeSideInput, label: string): TradeValidationResult {
  if (!uniqueIds(side.sendPlayerIds) || !uniqueIds(side.dropPlayerIds)) {
    return { ok: false, code: "DUPLICATE_PLAYER", message: `${label} listed a player more than once` };
  }
  const sendSet = new Set(side.sendPlayerIds);
  for (const playerId of side.dropPlayerIds) {
    if (sendSet.has(playerId)) {
      return { ok: false, code: "DUPLICATE_PLAYER", message: `${label} cannot send and drop the same player` };
    }
  }
  const roster = new Set(side.rosterPlayerIds);
  for (const playerId of side.sendPlayerIds) {
    if (!roster.has(playerId)) {
      return { ok: false, code: "PLAYER_NOT_ON_ROSTER", message: `${label} is offering a player not on their roster` };
    }
  }
  for (const playerId of side.dropPlayerIds) {
    if (!roster.has(playerId)) {
      return { ok: false, code: "PLAYER_NOT_ON_ROSTER", message: `${label} drop is not on their roster` };
    }
  }
  const involved = side.sendPlayerIds.length + side.dropPlayerIds.length;
  if (involved > MAX_TRADE_PLAYERS) {
    return { ok: false, code: "TOO_MANY_PLAYERS", message: `${label} cannot include more than ${MAX_TRADE_PLAYERS} players` };
  }
  return { ok: true };
}

export function validateTradeOffer(input: TradeOfferInput): TradeValidationResult {
  if (input.proposer.teamId === input.counterparty.teamId) {
    return { ok: false, code: "SAME_TEAM", message: "A trade needs two different teams" };
  }
  if (input.proposer.sendPlayerIds.length === 0 || input.counterparty.sendPlayerIds.length === 0) {
    return { ok: false, code: "EMPTY_SIDE", message: "Each side must send at least one player" };
  }

  const proposerCheck = validateSide(input.proposer, "Proposer");
  if (!proposerCheck.ok) {
    return proposerCheck;
  }
  const counterCheck = validateSide(input.counterparty, "Counterparty");
  if (!counterCheck.ok) {
    return counterCheck;
  }

  const all = [
    ...input.proposer.sendPlayerIds,
    ...input.proposer.dropPlayerIds,
    ...input.counterparty.sendPlayerIds,
    ...input.counterparty.dropPlayerIds,
  ];
  if (!uniqueIds(all)) {
    return { ok: false, code: "PLAYER_ON_BOTH_SIDES", message: "A player cannot appear on both sides of a trade" };
  }

  const proposerNext =
    input.proposer.rosterPlayerIds.length -
    input.proposer.sendPlayerIds.length -
    input.proposer.dropPlayerIds.length +
    input.counterparty.sendPlayerIds.length;
  const counterNext =
    input.counterparty.rosterPlayerIds.length -
    input.counterparty.sendPlayerIds.length -
    input.counterparty.dropPlayerIds.length +
    input.proposer.sendPlayerIds.length;

  if (proposerNext > input.capacity) {
    return { ok: false, code: "DROP_REQUIRED", message: "Proposer would exceed roster cap; include a drop" };
  }
  if (counterNext > input.capacity) {
    return { ok: false, code: "DROP_REQUIRED", message: "Counterparty would exceed roster cap; include a drop" };
  }
  if (proposerNext < 0 || counterNext < 0) {
    return { ok: false, code: "INVALID_TRADE", message: "Trade would leave a roster with negative players" };
  }

  return { ok: true };
}

export function previewTradeRosters(input: TradeOfferInput): Map<string, string> {
  const occupancy = new Map<string, string>();
  for (const playerId of input.proposer.rosterPlayerIds) {
    occupancy.set(playerId, input.proposer.teamId);
  }
  for (const playerId of input.counterparty.rosterPlayerIds) {
    occupancy.set(playerId, input.counterparty.teamId);
  }
  for (const playerId of input.proposer.dropPlayerIds) {
    occupancy.delete(playerId);
  }
  for (const playerId of input.counterparty.dropPlayerIds) {
    occupancy.delete(playerId);
  }
  for (const playerId of input.proposer.sendPlayerIds) {
    occupancy.set(playerId, input.counterparty.teamId);
  }
  for (const playerId of input.counterparty.sendPlayerIds) {
    occupancy.set(playerId, input.proposer.teamId);
  }
  return occupancy;
}

export function findPendingPlayerConflict(
  pendingPlayerIds: ReadonlySet<string>,
  offerPlayerIds: string[],
): string | null {
  for (const playerId of offerPlayerIds) {
    if (pendingPlayerIds.has(playerId)) {
      return playerId;
    }
  }
  return null;
}
