import type {
  NormalizedGame,
  NormalizedPlayer,
  NormalizedPlayerGameStats,
  NormalizedTeam,
} from "@sundaystack/shared";

export interface SportsDataProvider {
  getTeams(): Promise<NormalizedTeam[]>;
  getPlayers(): Promise<NormalizedPlayer[]>;
  getSchedule(season: number, week?: number): Promise<NormalizedGame[]>;
  getPlayerStats(season: number, week?: number): Promise<NormalizedPlayerGameStats[]>;
}
