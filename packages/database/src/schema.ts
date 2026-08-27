import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  ...timestamps,
});

export const sports = pgTable("sports", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    abbreviation: text("abbreviation").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    conference: text("conference"),
    division: text("division"),
    ...timestamps,
  },
  (table) => [unique("teams_sport_id_abbreviation_unique").on(table.sportId, table.abbreviation)],
);

export const teamExternalIds = pgTable(
  "team_external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    ...timestamps,
  },
  (table) => [unique("team_external_ids_provider_external_id_unique").on(table.provider, table.externalId)],
);

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  sportId: uuid("sport_id")
    .notNull()
    .references(() => sports.id),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  displayName: text("display_name").notNull(),
  position: text("position").notNull(),
  jerseyNumber: integer("jersey_number"),
  status: text("status"),
  headshotUrl: text("headshot_url"),
  ...timestamps,
});

export const playerExternalIds = pgTable(
  "player_external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("player_external_ids_provider_external_id_unique").on(table.provider, table.externalId),
  ],
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    year: integer("year").notNull(),
    ...timestamps,
  },
  (table) => [unique("seasons_sport_id_year_unique").on(table.sportId, table.year)],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    week: integer("week").notNull(),
    seasonType: text("season_type").notNull(),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => teams.id),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
    status: text("status").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    ...timestamps,
  },
  (table) => [
    unique("games_matchup_unique").on(
      table.seasonId,
      table.week,
      table.seasonType,
      table.homeTeamId,
      table.awayTeamId,
    ),
  ],
);

export const gameExternalIds = pgTable(
  "game_external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    ...timestamps,
  },
  (table) => [unique("game_external_ids_provider_external_id_unique").on(table.provider, table.externalId)],
);

export const playerGameStats = pgTable(
  "player_game_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id),
    teamId: uuid("team_id").references(() => teams.id),
    week: integer("week").notNull(),
    completions: integer("completions").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    passingYards: integer("passing_yards").notNull().default(0),
    passingTds: integer("passing_tds").notNull().default(0),
    interceptions: integer("interceptions").notNull().default(0),
    sacks: integer("sacks").notNull().default(0),
    sackYards: integer("sack_yards").notNull().default(0),
    passingTwoPointConversions: integer("passing_two_point_conversions").notNull().default(0),
    rushingAttempts: integer("rushing_attempts").notNull().default(0),
    rushingYards: integer("rushing_yards").notNull().default(0),
    rushingTds: integer("rushing_tds").notNull().default(0),
    rushingTwoPointConversions: integer("rushing_two_point_conversions").notNull().default(0),
    targets: integer("targets").notNull().default(0),
    receptions: integer("receptions").notNull().default(0),
    receivingYards: integer("receiving_yards").notNull().default(0),
    receivingTds: integer("receiving_tds").notNull().default(0),
    receivingTwoPointConversions: integer("receiving_two_point_conversions").notNull().default(0),
    rushingFumbles: integer("rushing_fumbles").notNull().default(0),
    rushingFumblesLost: integer("rushing_fumbles_lost").notNull().default(0),
    receivingFumbles: integer("receiving_fumbles").notNull().default(0),
    receivingFumblesLost: integer("receiving_fumbles_lost").notNull().default(0),
    sackFumbles: integer("sack_fumbles").notNull().default(0),
    sackFumblesLost: integer("sack_fumbles_lost").notNull().default(0),
    fieldGoalsMade: integer("field_goals_made").notNull().default(0),
    fieldGoalsAttempted: integer("field_goals_attempted").notNull().default(0),
    fieldGoalsMade0to19: integer("field_goals_made_0_19").notNull().default(0),
    fieldGoalsMade20to29: integer("field_goals_made_20_29").notNull().default(0),
    fieldGoalsMade30to39: integer("field_goals_made_30_39").notNull().default(0),
    fieldGoalsMade40to49: integer("field_goals_made_40_49").notNull().default(0),
    fieldGoalsMade50Plus: integer("field_goals_made_50_plus").notNull().default(0),
    extraPointsMade: integer("extra_points_made").notNull().default(0),
    extraPointsAttempted: integer("extra_points_attempted").notNull().default(0),
    ...timestamps,
  },
  (table) => [unique("player_game_stats_player_id_game_id_unique").on(table.playerId, table.gameId)],
);
