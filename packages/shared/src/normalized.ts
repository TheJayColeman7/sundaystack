import type { CountingStats, ExternalId, GameStatus, SeasonType } from "./ids";

/** Provider output before we assign database UUIDs. */
export interface NormalizedTeam {
  abbreviation: string;
  name: string;
  city: string | null;
  conference: string | null;
  division: string | null;
  externalIds: ExternalId[];
}

export interface NormalizedPlayer {
  firstName: string;
  lastName: string;
  displayName: string;
  position: string;
  jerseyNumber: number | null;
  status: string | null;
  headshotUrl: string | null;
  teamAbbreviation: string | null;
  /** Highest roster season we saw; used to pick current team. */
  season: number;
  externalIds: ExternalId[];
}

export interface NormalizedGame {
  season: number;
  week: number;
  seasonType: SeasonType;
  homeTeamAbbreviation: string;
  awayTeamAbbreviation: string;
  kickoffAt: string | null;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
  externalIds: ExternalId[];
}

export interface NormalizedPlayerGameStats {
  gsisId: string;
  gameExternalId: string;
  teamAbbreviation: string;
  season: number;
  week: number;
  stats: CountingStats;
}
