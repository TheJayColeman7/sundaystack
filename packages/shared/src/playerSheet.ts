export type PlayerOwnershipKind = "mine" | "fa" | "other";

export function classifyPlayerOwnership(
  ownerTeamId: string | null | undefined,
  myTeamId: string | null | undefined,
): PlayerOwnershipKind {
  if (!ownerTeamId) {
    return "fa";
  }
  if (myTeamId && ownerTeamId === myTeamId) {
    return "mine";
  }
  return "other";
}

export type LeaguePlayerSheetActionKind = "drop" | "add" | "claim" | "trade";

export type LeaguePlayerSheetReason = "drafting" | "trades_closed" | "no_team" | null;

export interface LeaguePlayerSheetAction {
  kind: LeaguePlayerSheetActionKind;
  enabled: boolean;
  reason: LeaguePlayerSheetReason;
}

export function leaguePlayerSheetAction(input: {
  ownership: PlayerOwnershipKind;
  leagueStatus: "pre_draft" | "drafting" | "active";
  waiverWindow: "fa" | "waiver" | null;
  tradesClosed: boolean;
  myTeamId: string | null;
}): LeaguePlayerSheetAction {
  const drafting = input.leagueStatus === "drafting";
  const noTeam = !input.myTeamId;

  if (input.ownership === "mine") {
    return {
      kind: "drop",
      enabled: !drafting,
      reason: drafting ? "drafting" : null,
    };
  }

  if (input.ownership === "fa") {
    const claim = input.leagueStatus === "active" && input.waiverWindow === "waiver";
    if (claim) {
      return {
        kind: "claim",
        enabled: !drafting && !noTeam,
        reason: drafting ? "drafting" : noTeam ? "no_team" : null,
      };
    }
    return {
      kind: "add",
      enabled: !drafting && !noTeam,
      reason: drafting ? "drafting" : noTeam ? "no_team" : null,
    };
  }

  if (input.tradesClosed) {
    return { kind: "trade", enabled: false, reason: "trades_closed" };
  }
  if (input.leagueStatus !== "active" || drafting) {
    return { kind: "trade", enabled: false, reason: "drafting" };
  }
  if (noTeam) {
    return { kind: "trade", enabled: false, reason: "no_team" };
  }
  return { kind: "trade", enabled: true, reason: null };
}

export function pickNextNflGame<T extends { status: string; kickoffAt: Date | string | null }>(
  games: T[],
  now: Date,
): T | null {
  const nowMs = now.getTime();

  const eligible = games.filter((game) => {
    if (game.status === "in_progress") {
      return true;
    }
    if (game.status !== "scheduled") {
      return false;
    }
    if (game.kickoffAt == null) {
      return true;
    }
    return kickoffMs(game.kickoffAt) >= nowMs;
  });

  eligible.sort((left, right) => kickoffMs(left.kickoffAt) - kickoffMs(right.kickoffAt));
  return eligible[0] ?? null;
}

function kickoffMs(value: Date | string | null): number {
  if (value == null) {
    return Number.POSITIVE_INFINITY;
  }
  return typeof value === "string" ? Date.parse(value) : value.getTime();
}
