const RELEASE = "https://github.com/nflverse/nflverse-data/releases/download";

export const TEAMS_URLS = [
  `${RELEASE}/teams/teams_colors_logos.csv`,
  "https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv",
] as const;

export function rosterUrl(season: number): string {
  return `${RELEASE}/rosters/roster_${season}.csv`;
}

export function playerWeekStatsUrl(season: number): string {
  return `${RELEASE}/stats_player/stats_player_week_${season}.csv`;
}

export const SCHEDULE_URLS = [
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
  `${RELEASE}/schedules/games.csv`,
] as const;
