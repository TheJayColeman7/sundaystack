export const SCORING_PRESETS = ["standard", "half_ppr", "ppr"] as const;

export type ScoringPreset = (typeof SCORING_PRESETS)[number];

export const STAT_KEYS = [
  "passing_yards",
  "passing_tds",
  "interceptions",
  "rushing_yards",
  "rushing_tds",
  "receptions",
  "receiving_yards",
  "receiving_tds",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export interface ScoringRule {
  statKey: StatKey;
  pointsPer: number;
}

export function isScoringPreset(value: string): value is ScoringPreset {
  return (SCORING_PRESETS as readonly string[]).includes(value);
}

export function scoringRulesForPreset(preset: ScoringPreset): ScoringRule[] {
  const receptions = preset === "ppr" ? 1 : preset === "half_ppr" ? 0.5 : 0;

  return [
    { statKey: "passing_yards", pointsPer: 0.04 },
    { statKey: "passing_tds", pointsPer: 4 },
    { statKey: "interceptions", pointsPer: -2 },
    { statKey: "rushing_yards", pointsPer: 0.1 },
    { statKey: "rushing_tds", pointsPer: 6 },
    { statKey: "receptions", pointsPer: receptions },
    { statKey: "receiving_yards", pointsPer: 0.1 },
    { statKey: "receiving_tds", pointsPer: 6 },
  ];
}
