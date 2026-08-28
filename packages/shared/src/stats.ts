import type { CountingStats } from "./ids";
import type { StatKey } from "./scoring";

export function countingStatValue(stats: CountingStats, key: StatKey): number {
  switch (key) {
    case "passing_yards":
      return stats.passingYards;
    case "passing_tds":
      return stats.passingTds;
    case "interceptions":
      return stats.interceptions;
    case "rushing_yards":
      return stats.rushingYards;
    case "rushing_tds":
      return stats.rushingTds;
    case "receptions":
      return stats.receptions;
    case "receiving_yards":
      return stats.receivingYards;
    case "receiving_tds":
      return stats.receivingTds;
    case "extra_points_made":
      return stats.extraPointsMade;
    case "field_goals_made_0_19":
      return stats.fieldGoalsMade0to19;
    case "field_goals_made_20_29":
      return stats.fieldGoalsMade20to29;
    case "field_goals_made_30_39":
      return stats.fieldGoalsMade30to39;
    case "field_goals_made_40_49":
      return stats.fieldGoalsMade40to49;
    case "field_goals_made_50_plus":
      return stats.fieldGoalsMade50Plus;
  }
}
