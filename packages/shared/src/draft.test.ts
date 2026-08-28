import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER_CONFIG, type LineupPlayer } from "./lineup";
import {
  chooseAutopick,
  isClockExpired,
  positionalNeedRank,
  snakePickOwner,
  totalPicks,
} from "./draft";

describe("snakePickOwner", () => {
  it("snakes a 12-team draft", () => {
    expect(snakePickOwner(1, 12)).toBe(1);
    expect(snakePickOwner(12, 12)).toBe(12);
    expect(snakePickOwner(13, 12)).toBe(12);
    expect(snakePickOwner(24, 12)).toBe(1);
  });

  it("snakes an 8-team draft", () => {
    expect(snakePickOwner(1, 8)).toBe(1);
    expect(snakePickOwner(8, 8)).toBe(8);
    expect(snakePickOwner(9, 8)).toBe(8);
    expect(snakePickOwner(16, 8)).toBe(1);
  });
});

describe("totalPicks", () => {
  it("is teams times roster capacity", () => {
    expect(totalPicks(12, 15)).toBe(180);
    expect(totalPicks(8, 15)).toBe(120);
  });
});

describe("isClockExpired", () => {
  it("expires at the configured seconds", () => {
    const start = new Date("2026-08-28T15:00:00.000Z");
    expect(isClockExpired(start, 30, new Date("2026-08-28T15:00:29.000Z"))).toBe(false);
    expect(isClockExpired(start, 30, new Date("2026-08-28T15:00:30.000Z"))).toBe(true);
  });
});

describe("chooseAutopick", () => {
  const config = DEFAULT_ROSTER_CONFIG;

  const mahomes = {
    playerId: "mahomes",
    position: "QB",
    displayName: "Patrick Mahomes",
    productionScore: 5000,
  };
  const cmc = {
    playerId: "cmc",
    position: "RB",
    displayName: "Christian McCaffrey",
    productionScore: 2000,
  };
  const chiefs = {
    playerId: "chiefs",
    position: "DEF",
    displayName: "Chiefs D/ST",
    productionScore: 10,
  };

  it("picks the first queued player who is still available", () => {
    const result = chooseAutopick({
      queuePlayerIds: ["gone", "cmc", "mahomes"],
      available: [mahomes, cmc],
      roster: [],
      config,
    });
    expect(result).toEqual({ source: "queue", playerId: "cmc" });
  });

  it("skips queued players who are already taken", () => {
    const result = chooseAutopick({
      queuePlayerIds: ["gone"],
      available: [mahomes, cmc],
      roster: [],
      config,
    });
    expect(result.source).toBe("autopick");
    if (result.source !== "passed_full") {
      expect(result.playerId).toBe("mahomes");
    }
  });

  it("fills an empty QB before a high-scoring DEF", () => {
    const result = chooseAutopick({
      queuePlayerIds: [],
      available: [chiefs, mahomes],
      roster: [],
      config,
    });
    expect(result).toEqual({ source: "autopick", playerId: "mahomes" });
  });

  it("never treats DEF as a FLEX fill", () => {
    const roster: LineupPlayer[] = [
      { playerId: "q", position: "QB", slot: "QB" },
      { playerId: "r1", position: "RB", slot: "RB" },
      { playerId: "r2", position: "RB", slot: "RB" },
      { playerId: "w1", position: "WR", slot: "WR" },
      { playerId: "w2", position: "WR", slot: "WR" },
      { playerId: "t", position: "TE", slot: "TE" },
      { playerId: "d", position: "DEF", slot: "DEF" },
    ];
    expect(positionalNeedRank("WR", roster, config)).toBe(2);
    expect(positionalNeedRank("DEF", roster, config)).toBe(1);
  });

  it("passes when the roster is already at capacity", () => {
    const roster: LineupPlayer[] = Array.from({ length: 15 }, (_, index) => ({
      playerId: `p${index}`,
      position: "WR",
      slot: "BENCH" as const,
    }));
    const result = chooseAutopick({
      queuePlayerIds: ["mahomes"],
      available: [mahomes],
      roster,
      config,
    });
    expect(result).toEqual({ source: "passed_full" });
  });
});
