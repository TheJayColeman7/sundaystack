import { describe, expect, it } from "vitest";
import { scoringRulesForPreset } from "./scoring";

function pointsFor(preset: "standard" | "half_ppr" | "ppr", key: string): number {
  const rule = scoringRulesForPreset(preset).find((row) => row.statKey === key);
  if (!rule) {
    throw new Error(`missing ${key}`);
  }
  return rule.pointsPer;
}

describe("scoringRulesForPreset", () => {
  it("uses 4-point passing TDs and -2 INTs for every preset", () => {
    for (const preset of ["standard", "half_ppr", "ppr"] as const) {
      expect(pointsFor(preset, "passing_yards")).toBe(0.04);
      expect(pointsFor(preset, "passing_tds")).toBe(4);
      expect(pointsFor(preset, "interceptions")).toBe(-2);
      expect(pointsFor(preset, "rushing_yards")).toBe(0.1);
      expect(pointsFor(preset, "rushing_tds")).toBe(6);
      expect(pointsFor(preset, "receiving_yards")).toBe(0.1);
      expect(pointsFor(preset, "receiving_tds")).toBe(6);
    }
  });

  it("awards 0 / 0.5 / 1 per reception", () => {
    expect(pointsFor("standard", "receptions")).toBe(0);
    expect(pointsFor("half_ppr", "receptions")).toBe(0.5);
    expect(pointsFor("ppr", "receptions")).toBe(1);
  });
});
