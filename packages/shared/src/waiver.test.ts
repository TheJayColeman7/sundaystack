import { describe, expect, it } from "vitest";
import {
  deriveWaiverWindow,
  nextWeeklyInstant,
  resolveWaiverRun,
  type WaiverClaimInput,
  type WaiverTeamState,
} from "./waiver";

function team(partial: Partial<WaiverTeamState> & { teamId: string }): WaiverTeamState {
  return {
    rank: 1,
    faabRemaining: 100,
    rosterPlayerIds: ["keep"],
    capacity: 2,
    ...partial,
  };
}

describe("nextWeeklyInstant", () => {
  it("returns the next Tuesday 07:00 UTC strictly after the given instant", () => {
    const monday = new Date("2026-09-07T12:00:00.000Z");
    expect(nextWeeklyInstant(monday, 2, 7).toISOString()).toBe("2026-09-08T07:00:00.000Z");
  });

  it("skips a Tuesday 07:00 that has already passed", () => {
    const tuesdayAfternoon = new Date("2026-09-08T12:00:00.000Z");
    expect(nextWeeklyInstant(tuesdayAfternoon, 2, 7).toISOString()).toBe("2026-09-15T07:00:00.000Z");
  });
});

describe("deriveWaiverWindow", () => {
  const weekday = 2;
  const hour = 7;

  it("is FA before any lock", () => {
    const result = deriveWaiverWindow({
      now: new Date("2026-09-01T12:00:00.000Z"),
      lockAts: [new Date("2026-09-04T00:20:00.000Z")],
      processWeekday: weekday,
      processHourUtc: hour,
    });
    expect(result.window).toBe("fa");
    expect(result.secondsToProcess).toBeNull();
  });

  it("is waiver after lock until the next Tuesday process", () => {
    const lock = new Date("2026-09-04T00:20:00.000Z");
    const result = deriveWaiverWindow({
      now: new Date("2026-09-05T12:00:00.000Z"),
      lockAts: [lock],
      processWeekday: weekday,
      processHourUtc: hour,
    });
    expect(result.window).toBe("waiver");
    expect(result.processAt?.toISOString()).toBe("2026-09-08T07:00:00.000Z");
  });

  it("is FA after process until the next lock", () => {
    const result = deriveWaiverWindow({
      now: new Date("2026-09-08T08:00:00.000Z"),
      lockAts: [new Date("2026-09-04T00:20:00.000Z"), new Date("2026-09-11T00:20:00.000Z")],
      processWeekday: weekday,
      processHourUtc: hour,
    });
    expect(result.window).toBe("fa");
  });
});

describe("resolveWaiverRun FAAB", () => {
  const teams = [
    team({ teamId: "a", rank: 1, faabRemaining: 50 }),
    team({ teamId: "b", rank: 2, faabRemaining: 50 }),
  ];

  it("awards the highest bid", () => {
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: "keep", bid: 10, rank: 1 },
      { teamId: "b", playerId: "p1", dropPlayerId: "keep", bid: 20, rank: 1 },
    ];
    const result = resolveWaiverRun("faab", teams, claims);
    expect(result.awards).toEqual([
      { teamId: "b", playerId: "p1", dropPlayerId: "keep", bid: 20 },
    ]);
    expect(result.faab.find((row) => row.teamId === "b")?.remaining).toBe(30);
    expect(result.lost).toHaveLength(1);
  });

  it("breaks equal bids with better priority", () => {
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: "keep", bid: 15, rank: 1 },
      { teamId: "b", playerId: "p1", dropPlayerId: "keep", bid: 15, rank: 1 },
    ];
    const result = resolveWaiverRun("faab", teams, claims);
    expect(result.awards[0]?.teamId).toBe("a");
  });
});

describe("resolveWaiverRun priority", () => {
  it("walks teams by rank and moves a winner to last", () => {
    const teams = [
      team({ teamId: "a", rank: 1, rosterPlayerIds: ["a1"], capacity: 2 }),
      team({ teamId: "b", rank: 2, rosterPlayerIds: ["b1"], capacity: 2 }),
    ];
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: null, bid: 0, rank: 1 },
    ];
    const result = resolveWaiverRun("priority", teams, claims);
    expect(result.awards.map((row) => row.teamId)).toEqual(["a"]);
    expect(result.ranks.map((row) => row.teamId)).toEqual(["b", "a"]);
  });

  it("moves each successive winner to last in the same run", () => {
    const teams = [
      team({ teamId: "a", rank: 1, rosterPlayerIds: ["a1"], capacity: 2 }),
      team({ teamId: "b", rank: 2, rosterPlayerIds: ["b1"], capacity: 2 }),
    ];
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: null, bid: 0, rank: 1 },
      { teamId: "b", playerId: "p2", dropPlayerId: null, bid: 0, rank: 1 },
    ];
    const result = resolveWaiverRun("priority", teams, claims);
    expect(result.awards.map((row) => row.teamId)).toEqual(["a", "b"]);
    expect(result.ranks.map((row) => row.teamId)).toEqual(["a", "b"]);
  });

  it("skips a full roster with no drop", () => {
    const teams = [team({ teamId: "a", rank: 1, rosterPlayerIds: ["x", "y"], capacity: 2 })];
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: null, bid: 0, rank: 1 },
    ];
    const result = resolveWaiverRun("priority", teams, claims);
    expect(result.awards).toEqual([]);
    expect(result.lost).toHaveLength(1);
  });

  it("marks a claim lost when the drop is not on the roster", () => {
    const teams = [team({ teamId: "a", rank: 1, rosterPlayerIds: ["keep"], capacity: 2 })];
    const claims: WaiverClaimInput[] = [
      { teamId: "a", playerId: "p1", dropPlayerId: "gone", bid: 0, rank: 1 },
    ];
    const result = resolveWaiverRun("priority", teams, claims);
    expect(result.awards).toEqual([]);
    expect(result.lost[0]?.playerId).toBe("p1");
  });
});
