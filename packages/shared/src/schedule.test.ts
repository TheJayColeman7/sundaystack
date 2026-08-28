import { describe, expect, it } from "vitest";
import { buildRoundRobin } from "./schedule";

function teamsInWeek(pairings: ReturnType<typeof buildRoundRobin>, week: number): string[] {
  return pairings
    .filter((row) => row.week === week)
    .flatMap((row) => [row.homeTeamId, row.awayTeamId]);
}

describe("buildRoundRobin", () => {
  it("schedules 12 teams for week 1 as 6 games with no team twice", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
    const pairings = buildRoundRobin(ids, 14);
    const week1 = pairings.filter((row) => row.week === 1);
    expect(week1).toHaveLength(6);
    expect(new Set(teamsInWeek(pairings, 1)).size).toBe(12);
  });

  it("gives every 8-team side exactly one game per week across 14 weeks", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `t${i + 1}`);
    const pairings = buildRoundRobin(ids, 14);
    expect(pairings).toHaveLength(14 * 4);
    for (let week = 1; week <= 14; week += 1) {
      expect(new Set(teamsInWeek(pairings, week)).size).toBe(8);
    }
  });
});
