import {
  EMPTY_COUNTING_STATS,
  type NormalizedGame,
  type NormalizedPlayer,
  type NormalizedPlayerGameStats,
  type NormalizedTeam,
} from "@sundaystack/shared";
import type { SportsDataProvider } from "../provider";

const TEAMS: NormalizedTeam[] = [
  {
    abbreviation: "KC",
    name: "Kansas City Chiefs",
    city: "Kansas City",
    conference: "AFC",
    division: "West",
    primaryColor: "#E31837",
    secondaryColor: "#FFB81C",
    tertiaryColor: null,
    externalIds: [{ provider: "nflverse", externalId: "KC" }],
  },
  {
    abbreviation: "BUF",
    name: "Buffalo Bills",
    city: "Buffalo",
    conference: "AFC",
    division: "East",
    primaryColor: "#00338D",
    secondaryColor: "#C60C30",
    tertiaryColor: null,
    externalIds: [{ provider: "nflverse", externalId: "BUF" }],
  },
];

const PLAYERS: NormalizedPlayer[] = [
  {
    firstName: "Patrick",
    lastName: "Mahomes",
    displayName: "Patrick Mahomes",
    position: "QB",
    jerseyNumber: 15,
    status: "ACT",
    headshotUrl: null,
    teamAbbreviation: "KC",
    season: 2025,
    externalIds: [
      { provider: "gsis", externalId: "00-0033873" },
      { provider: "sleeper", externalId: "4046" },
    ],
  },
  {
    firstName: "Josh",
    lastName: "Allen",
    displayName: "Josh Allen",
    position: "QB",
    jerseyNumber: 17,
    status: "ACT",
    headshotUrl: null,
    teamAbbreviation: "BUF",
    season: 2025,
    externalIds: [{ provider: "gsis", externalId: "00-0034857" }],
  },
];

const GAMES: NormalizedGame[] = [
  {
    season: 2025,
    week: 1,
    seasonType: "REG",
    homeTeamAbbreviation: "KC",
    awayTeamAbbreviation: "BUF",
    kickoffAt: "2025-09-07T17:00:00.000Z",
    status: "final",
    homeScore: 20,
    awayScore: 17,
    externalIds: [{ provider: "nflverse", externalId: "2025_01_BUF_KC" }],
  },
];

const STATS: NormalizedPlayerGameStats[] = [
  {
    gsisId: "00-0033873",
    gameExternalId: "2025_01_BUF_KC",
    teamAbbreviation: "KC",
    season: 2025,
    week: 1,
    stats: {
      ...EMPTY_COUNTING_STATS,
      completions: 25,
      attempts: 35,
      passingYards: 285,
      passingTds: 2,
      interceptions: 1,
      rushingYards: 34,
    },
  },
];

export class MockProvider implements SportsDataProvider {
  async getTeams(): Promise<NormalizedTeam[]> {
    return TEAMS;
  }

  async getPlayers(): Promise<NormalizedPlayer[]> {
    return PLAYERS;
  }

  async getSchedule(season: number, week?: number): Promise<NormalizedGame[]> {
    return GAMES.filter((game) => game.season === season).filter((game) =>
      week === undefined ? true : game.week === week,
    );
  }

  async getPlayerStats(season: number, week?: number): Promise<NormalizedPlayerGameStats[]> {
    return STATS.filter((stat) => stat.season === season).filter((stat) =>
      week === undefined ? true : stat.week === week,
    );
  }
}
