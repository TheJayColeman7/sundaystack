import {
  EMPTY_COUNTING_STATS,
  formatHexColor,
  type CountingStats,
  type ExternalId,
  type GameStatus,
  type NormalizedGame,
  type NormalizedPlayer,
  type NormalizedPlayerGameStats,
  type NormalizedTeam,
  type SeasonType,
  type SportsDataProviderName,
} from "@sundaystack/shared";
import type { CsvRow } from "./download";

export function cell(row: CsvRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact.trim() !== "") {
      return exact.trim();
    }
  }

  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const [column, value] of Object.entries(row)) {
    if (value && lowerKeys.has(column.toLowerCase()) && value.trim() !== "") {
      return value.trim();
    }
  }

  return undefined;
}

export function num(row: CsvRow, ...keys: string[]): number {
  const value = cell(row, ...keys);
  if (value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function numOrNull(row: CsvRow, ...keys: string[]): number | null {
  const value = cell(row, ...keys);
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function pushExternalId(
  ids: ExternalId[],
  provider: SportsDataProviderName,
  value: string | undefined,
): void {
  if (!value) {
    return;
  }
  if (ids.some((id) => id.provider === provider && id.externalId === value)) {
    return;
  }
  ids.push({ provider, externalId: value });
}

export function mapTeamRow(row: CsvRow): NormalizedTeam | null {
  const abbreviation = cell(row, "team_abbr", "team", "abbreviation");
  const name = cell(row, "team_name", "team_nick", "name");
  if (!abbreviation || !name || abbreviation === "NFL" || abbreviation.length > 4) {
    return null;
  }

  return {
    abbreviation,
    name,
    city: cell(row, "team_nick") ?? null,
    conference: cell(row, "team_conf", "conference") ?? null,
    division: cell(row, "team_division", "division") ?? null,
    primaryColor: formatHexColor(cell(row, "team_color") ?? null),
    secondaryColor: formatHexColor(cell(row, "team_color2") ?? null),
    tertiaryColor: formatHexColor(cell(row, "team_color3") ?? null),
    externalIds: [{ provider: "nflverse", externalId: abbreviation }],
  };
}

export function mapRosterRow(row: CsvRow): NormalizedPlayer | null {
  const gsisId = cell(row, "gsis_id", "player_id");
  if (!gsisId) {
    return null;
  }

  const firstName = cell(row, "first_name") ?? "";
  const lastName = cell(row, "last_name") ?? "";
  const displayName =
    cell(row, "full_name", "player_display_name", "player_name") ?? `${firstName} ${lastName}`.trim();
  if (!displayName) {
    return null;
  }

  const season = num(row, "season");
  const externalIds: ExternalId[] = [];
  pushExternalId(externalIds, "gsis", gsisId);
  pushExternalId(externalIds, "sleeper", cell(row, "sleeper_id"));
  pushExternalId(externalIds, "espn", cell(row, "espn_id"));
  pushExternalId(externalIds, "pfr", cell(row, "pfr_id"));

  return {
    firstName: firstName || displayName.split(" ")[0] || displayName,
    lastName: lastName || displayName.split(" ").slice(-1)[0] || displayName,
    displayName,
    position: cell(row, "position") ?? "UNK",
    jerseyNumber: numOrNull(row, "jersey_number"),
    status: cell(row, "status") ?? null,
    headshotUrl: cell(row, "headshot_url") ?? null,
    teamAbbreviation: cell(row, "team") ?? null,
    season,
    externalIds,
  };
}

export function mergePlayersByGsis(players: NormalizedPlayer[]): NormalizedPlayer[] {
  const byGsis = new Map<string, NormalizedPlayer>();

  for (const player of players) {
    const gsis = player.externalIds.find((id) => id.provider === "gsis")?.externalId;
    if (!gsis) {
      continue;
    }

    const previous = byGsis.get(gsis);
    if (!previous) {
      byGsis.set(gsis, { ...player, externalIds: [...player.externalIds] });
      continue;
    }

    const mergedIds = [...previous.externalIds];
    for (const id of player.externalIds) {
      pushExternalId(mergedIds, id.provider, id.externalId);
    }

    if (player.season >= previous.season) {
      byGsis.set(gsis, { ...player, externalIds: mergedIds });
    } else {
      previous.externalIds = mergedIds;
    }
  }

  return [...byGsis.values()];
}

export function mapSeasonType(value: string | undefined): SeasonType {
  const normalized = (value ?? "REG").toUpperCase();
  if (normalized === "PRE") {
    return "PRE";
  }
  if (normalized === "REG") {
    return "REG";
  }
  return "POST";
}

function padTime(value: string): string {
  const [hours, minutes] = value.split(":");
  if (hours === undefined || minutes === undefined) {
    return "17:00";
  }
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

export function mapKickoffAt(gameday: string | undefined, gametime: string | undefined): string | null {
  if (!gameday) {
    return null;
  }
  const time = gametime ? padTime(gametime) : "17:00";
  return `${gameday}T${time}:00.000Z`;
}

export function mapGameStatus(row: CsvRow, kickoffAt: string | null): GameStatus {
  const home = cell(row, "home_score");
  const away = cell(row, "away_score");
  if (home !== undefined && away !== undefined) {
    return "final";
  }
  if (kickoffAt && Date.parse(kickoffAt) > Date.now()) {
    return "scheduled";
  }
  return "scheduled";
}

export function mapGameRow(row: CsvRow): NormalizedGame | null {
  const gameId = cell(row, "game_id");
  const homeTeam = cell(row, "home_team");
  const awayTeam = cell(row, "away_team");
  const season = num(row, "season");
  if (!gameId || !homeTeam || !awayTeam || !season) {
    return null;
  }

  const kickoffAt = mapKickoffAt(cell(row, "gameday"), cell(row, "gametime"));

  return {
    season,
    week: num(row, "week"),
    seasonType: mapSeasonType(cell(row, "game_type", "season_type")),
    homeTeamAbbreviation: homeTeam,
    awayTeamAbbreviation: awayTeam,
    kickoffAt,
    status: mapGameStatus(row, kickoffAt),
    homeScore: numOrNull(row, "home_score"),
    awayScore: numOrNull(row, "away_score"),
    externalIds: [{ provider: "nflverse", externalId: gameId }],
  };
}

function countingStatsFromRow(row: CsvRow): CountingStats {
  return {
    ...EMPTY_COUNTING_STATS,
    completions: num(row, "completions"),
    attempts: num(row, "attempts"),
    passingYards: num(row, "passing_yards"),
    passingTds: num(row, "passing_tds"),
    interceptions: num(row, "interceptions", "passing_interceptions"),
    sacks: num(row, "sacks", "sacks_suffered"),
    sackYards: num(row, "sack_yards", "sack_yards_lost"),
    passingTwoPointConversions: num(row, "passing_2pt_conversions"),
    rushingAttempts: num(row, "carries", "rushing_attempts", "rushing_att"),
    rushingYards: num(row, "rushing_yards"),
    rushingTds: num(row, "rushing_tds"),
    rushingTwoPointConversions: num(row, "rushing_2pt_conversions"),
    targets: num(row, "targets"),
    receptions: num(row, "receptions"),
    receivingYards: num(row, "receiving_yards"),
    receivingTds: num(row, "receiving_tds"),
    receivingTwoPointConversions: num(row, "receiving_2pt_conversions"),
    rushingFumbles: num(row, "rushing_fumbles"),
    rushingFumblesLost: num(row, "rushing_fumbles_lost"),
    receivingFumbles: num(row, "receiving_fumbles"),
    receivingFumblesLost: num(row, "receiving_fumbles_lost"),
    sackFumbles: num(row, "sack_fumbles"),
    sackFumblesLost: num(row, "sack_fumbles_lost"),
    fieldGoalsMade: num(row, "fg_made", "field_goals_made"),
    fieldGoalsAttempted: num(row, "fg_att", "field_goals_attempted"),
    fieldGoalsMade0to19: num(row, "fg_made_0_19"),
    fieldGoalsMade20to29: num(row, "fg_made_20_29"),
    fieldGoalsMade30to39: num(row, "fg_made_30_39"),
    fieldGoalsMade40to49: num(row, "fg_made_40_49"),
    fieldGoalsMade50Plus: num(row, "fg_made_50_59", "fg_made_60plus", "fg_made_50_plus") + num(row, "fg_made_60_plus"),
    extraPointsMade: num(row, "pat_made", "extra_points_made", "xp_made"),
    extraPointsAttempted: num(row, "pat_att", "extra_points_attempted", "xp_att"),
  };
}

export function mapPlayerStatRow(row: CsvRow): NormalizedPlayerGameStats | null {
  const gsisId = cell(row, "player_id", "gsis_id");
  const gameExternalId = cell(row, "game_id");
  const teamAbbreviation = cell(row, "team", "recent_team");
  if (!gsisId || !gameExternalId || !teamAbbreviation) {
    return null;
  }

  return {
    gsisId,
    gameExternalId,
    teamAbbreviation,
    season: num(row, "season"),
    week: num(row, "week"),
    stats: countingStatsFromRow(row),
  };
}
