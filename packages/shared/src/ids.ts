export const SPORTS_DATA_PROVIDERS = [
  "nflverse",
  "sleeper",
  "gsis",
  "espn",
  "pfr",
  "sportsdataio",
] as const;

export type SportsDataProviderName = (typeof SPORTS_DATA_PROVIDERS)[number];

export interface ExternalId {
  provider: SportsDataProviderName;
  externalId: string;
}

export type SeasonType = "PRE" | "REG" | "POST";

export type GameStatus = "scheduled" | "in_progress" | "final" | "cancelled";

export interface CountingStats {
  completions: number;
  attempts: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  sacks: number;
  sackYards: number;
  passingTwoPointConversions: number;
  rushingAttempts: number;
  rushingYards: number;
  rushingTds: number;
  rushingTwoPointConversions: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  receivingTwoPointConversions: number;
  rushingFumbles: number;
  rushingFumblesLost: number;
  receivingFumbles: number;
  receivingFumblesLost: number;
  sackFumbles: number;
  sackFumblesLost: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsMade0to19: number;
  fieldGoalsMade20to29: number;
  fieldGoalsMade30to39: number;
  fieldGoalsMade40to49: number;
  fieldGoalsMade50Plus: number;
  extraPointsMade: number;
  extraPointsAttempted: number;
}

export const EMPTY_COUNTING_STATS: CountingStats = {
  completions: 0,
  attempts: 0,
  passingYards: 0,
  passingTds: 0,
  interceptions: 0,
  sacks: 0,
  sackYards: 0,
  passingTwoPointConversions: 0,
  rushingAttempts: 0,
  rushingYards: 0,
  rushingTds: 0,
  rushingTwoPointConversions: 0,
  targets: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTds: 0,
  receivingTwoPointConversions: 0,
  rushingFumbles: 0,
  rushingFumblesLost: 0,
  receivingFumbles: 0,
  receivingFumblesLost: 0,
  sackFumbles: 0,
  sackFumblesLost: 0,
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  fieldGoalsMade0to19: 0,
  fieldGoalsMade20to29: 0,
  fieldGoalsMade30to39: 0,
  fieldGoalsMade40to49: 0,
  fieldGoalsMade50Plus: 0,
  extraPointsMade: 0,
  extraPointsAttempted: 0,
};
