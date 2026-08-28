import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROSTER_CONFIG,
  isEligibleForSlot,
  playerAlreadyOnAnotherTeam,
  validateLineup,
  type LineupPlayer,
} from "./lineup";

const config = DEFAULT_ROSTER_CONFIG;

function player(id: string, position: string, slot: LineupPlayer["slot"]): LineupPlayer {
  return { playerId: id, position, slot, displayName: id };
}

describe("isEligibleForSlot", () => {
  it("allows RB/WR/TE in FLEX and DEF only in DEF", () => {
    expect(isEligibleForSlot("RB", "FLEX")).toBe(true);
    expect(isEligibleForSlot("WR", "FLEX")).toBe(true);
    expect(isEligibleForSlot("TE", "FLEX")).toBe(true);
    expect(isEligibleForSlot("QB", "FLEX")).toBe(false);
    expect(isEligibleForSlot("DEF", "FLEX")).toBe(false);
    expect(isEligibleForSlot("DEF", "DEF")).toBe(true);
    expect(isEligibleForSlot("DEF", "BENCH")).toBe(true);
    expect(isEligibleForSlot("K", "K")).toBe(true);
    expect(isEligibleForSlot("QB", "QB")).toBe(true);
  });
});

describe("playerAlreadyOnAnotherTeam", () => {
  it("is true when the player is rostered elsewhere in the league", () => {
    const occupancy = new Map([
      ["mahomes", "team-a"],
      ["kelce", "team-b"],
    ]);
    expect(playerAlreadyOnAnotherTeam("mahomes", "team-a", occupancy)).toBe(false);
    expect(playerAlreadyOnAnotherTeam("mahomes", "team-b", occupancy)).toBe(true);
    expect(playerAlreadyOnAnotherTeam("pacheco", "team-a", occupancy)).toBe(false);
  });
});

describe("validateLineup", () => {
  it("accepts a legal default-league starter set plus bench", () => {
    const lineup = [
      player("qb1", "QB", "QB"),
      player("rb1", "RB", "RB"),
      player("rb2", "RB", "RB"),
      player("wr1", "WR", "WR"),
      player("wr2", "WR", "WR"),
      player("te1", "TE", "TE"),
      player("flex1", "WR", "FLEX"),
      player("k1", "K", "K"),
      player("dst1", "DEF", "DEF"),
      player("bn1", "RB", "BENCH"),
    ];
    expect(validateLineup(lineup, config)).toEqual({ ok: true });
  });

  it("rejects too many QBs and ineligible FLEX", () => {
    const lineup = [
      player("qb1", "QB", "QB"),
      player("qb2", "QB", "QB"),
      player("flex-qb", "QB", "FLEX"),
    ];
    const result = validateLineup(lineup, config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("QB has 2"))).toBe(true);
      expect(result.errors.some((error) => error.includes("cannot start at FLEX"))).toBe(true);
    }
  });

  it("rejects DEF in a skill slot and duplicate players", () => {
    const lineup = [player("dst1", "DEF", "RB"), player("dst1", "DEF", "BENCH")];
    const result = validateLineup(lineup, config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("assigned more than once"))).toBe(true);
      expect(result.errors.some((error) => error.includes("cannot start at RB"))).toBe(true);
    }
  });

  it("rejects overflowing the bench", () => {
    const bench = Array.from({ length: 7 }, (_, index) => player(`bn${index}`, "WR", "BENCH"));
    const result = validateLineup(bench, config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("BENCH has 7"))).toBe(true);
    }
  });
});
