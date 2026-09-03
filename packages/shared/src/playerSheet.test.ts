import { describe, expect, it } from "vitest";
import {
  classifyPlayerOwnership,
  leaguePlayerSheetAction,
  pickNextNflGame,
} from "./playerSheet";

describe("classifyPlayerOwnership", () => {
  it("is fa when nobody owns the player", () => {
    expect(classifyPlayerOwnership(null, "mine")).toBe("fa");
    expect(classifyPlayerOwnership(undefined, "mine")).toBe("fa");
  });

  it("is mine when occupancy matches my team", () => {
    expect(classifyPlayerOwnership("mine", "mine")).toBe("mine");
  });

  it("is other when rostered elsewhere, including commissioner viewing", () => {
    expect(classifyPlayerOwnership("theirs", "mine")).toBe("other");
    expect(classifyPlayerOwnership("theirs", null)).toBe("other");
  });
});

describe("leaguePlayerSheetAction", () => {
  const base = {
    myTeamId: "mine",
    waiverWindow: "fa" as const,
    tradesClosed: false,
    leagueStatus: "active" as const,
  };

  it("drops your player when not drafting", () => {
    expect(leaguePlayerSheetAction({ ...base, ownership: "mine" })).toEqual({
      kind: "drop",
      enabled: true,
      reason: null,
    });
  });

  it("locks drop during the draft", () => {
    expect(
      leaguePlayerSheetAction({ ...base, ownership: "mine", leagueStatus: "drafting" }),
    ).toEqual({
      kind: "drop",
      enabled: false,
      reason: "drafting",
    });
  });

  it("adds a free agent in the FA window", () => {
    expect(leaguePlayerSheetAction({ ...base, ownership: "fa" })).toEqual({
      kind: "add",
      enabled: true,
      reason: null,
    });
  });

  it("adds pre-draft (instant add is not waiver-gated yet)", () => {
    expect(
      leaguePlayerSheetAction({
        ...base,
        ownership: "fa",
        leagueStatus: "pre_draft",
        waiverWindow: null,
      }),
    ).toEqual({
      kind: "add",
      enabled: true,
      reason: null,
    });
  });

  it("claims during the waiver window", () => {
    expect(
      leaguePlayerSheetAction({ ...base, ownership: "fa", waiverWindow: "waiver" }),
    ).toEqual({
      kind: "claim",
      enabled: true,
      reason: null,
    });
  });

  it("trades for another club when the league is active", () => {
    expect(leaguePlayerSheetAction({ ...base, ownership: "other" })).toEqual({
      kind: "trade",
      enabled: true,
      reason: null,
    });
  });

  it("disables trade after playoff seeds exist", () => {
    expect(leaguePlayerSheetAction({ ...base, ownership: "other", tradesClosed: true })).toEqual({
      kind: "trade",
      enabled: false,
      reason: "trades_closed",
    });
  });

  it("does not enable trade before the league is active", () => {
    expect(
      leaguePlayerSheetAction({
        ...base,
        ownership: "other",
        leagueStatus: "pre_draft",
      }),
    ).toEqual({
      kind: "trade",
      enabled: false,
      reason: "drafting",
    });
  });
});

describe("pickNextNflGame", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("picks the soonest future REG-style scheduled game", () => {
    const next = pickNextNflGame(
      [
        { status: "final", kickoffAt: new Date("2026-09-07T17:00:00.000Z") },
        { status: "scheduled", kickoffAt: new Date("2026-09-14T17:00:00.000Z") },
        { status: "scheduled", kickoffAt: new Date("2026-09-21T17:00:00.000Z") },
      ],
      now,
    );
    expect(next?.kickoffAt).toEqual(new Date("2026-09-14T17:00:00.000Z"));
  });

  it("keeps an in-progress game even if kickoff is in the past", () => {
    const live = { status: "in_progress", kickoffAt: new Date("2026-09-10T16:00:00.000Z") };
    expect(pickNextNflGame([live], new Date("2026-09-10T18:00:00.000Z"))).toBe(live);
  });

  it("returns null when nothing is upcoming", () => {
    expect(
      pickNextNflGame([{ status: "final", kickoffAt: new Date("2026-09-07T17:00:00.000Z") }], now),
    ).toBeNull();
  });
});
