import { describe, expect, it } from "vitest";
import { EMPTY_COUNTING_STATS, scoringRulesForPreset, type CountingStats } from "@sundaystack/shared";
import { applyMatchupToStandings, emptyStandingsRow, scoreLineup, scorePlayer, sortStandings } from "./score";

const ppr = scoringRulesForPreset("ppr");

function stats(partial: Partial<CountingStats>): CountingStats {
  return { ...EMPTY_COUNTING_STATS, ...partial };
}

describe("scorePlayer", () => {
  it("scores a Mahomes-like passing line at 4 points per TD", () => {
    const points = scorePlayer(
      stats({ passingYards: 300, passingTds: 3, interceptions: 1 }),
      ppr,
      "QB",
    );
    expect(points).toBeCloseTo(300 * 0.04 + 3 * 4 + -2, 5);
  });

  it("awards a PPR reception", () => {
    expect(scorePlayer(stats({ receptions: 1, receivingYards: 10 }), ppr, "WR")).toBeCloseTo(2, 5);
  });

  it("awards 5 points for a 50+ FG", () => {
    expect(scorePlayer(stats({ fieldGoalsMade50Plus: 1 }), ppr, "K")).toBe(5);
  });

  it("scores DEF as 0 even with counting stats", () => {
    expect(scorePlayer(stats({ rushingYards: 100 }), ppr, "DEF")).toBe(0);
  });

  it("scores missing stats as 0", () => {
    expect(scorePlayer(null, ppr, "QB")).toBe(0);
  });

  it("applies negative interceptions", () => {
    expect(scorePlayer(stats({ interceptions: 2 }), ppr, "QB")).toBe(-4);
  });
});

describe("scoreLineup", () => {
  it("ignores bench", () => {
    const points = scoreLineup(
      [
        { playerId: "a", position: "WR", slot: "WR", stats: stats({ receptions: 1 }) },
        { playerId: "b", position: "WR", slot: "BENCH", stats: stats({ receptions: 8 }) },
      ],
      ppr,
    );
    expect(points).toBe(1);
  });

  it("treats an empty starter slot as 0", () => {
    expect(scoreLineup([], ppr)).toBe(0);
  });
});

describe("standings", () => {
  it("sorts by wins then points for", () => {
    const rows = new Map([
      ["a", { ...emptyStandingsRow("a"), wins: 1, pointsFor: 10 }],
      ["b", { ...emptyStandingsRow("b"), wins: 2, pointsFor: 5 }],
      ["c", { ...emptyStandingsRow("c"), wins: 1, pointsFor: 20 }],
    ]);
    applyMatchupToStandings(rows, {
      homeTeamId: "b",
      awayTeamId: "a",
      homePoints: 1,
      awayPoints: 0,
    });
    const sorted = sortStandings([...rows.values()]);
    expect(sorted.map((row) => row.teamId)).toEqual(["b", "c", "a"]);
  });
});
