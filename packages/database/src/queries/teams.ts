import { and, asc, eq, inArray } from "drizzle-orm";
import { CURRENT_NFL_ABBREVIATIONS, isCurrentNflAbbreviation, type NflTeamDto } from "@sundaystack/shared";
import type { Database } from "../client";
import { sports, teams } from "../schema";

function toDto(row: {
  id: string;
  abbreviation: string;
  name: string;
  city: string | null;
  conference: string | null;
  division: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
}): NflTeamDto {
  return {
    id: row.id,
    abbreviation: row.abbreviation,
    name: row.name,
    city: row.city,
    conference: row.conference,
    division: row.division,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    tertiaryColor: row.tertiaryColor,
  };
}

export async function listCurrentNflTeams(db: Database): Promise<NflTeamDto[]> {
  const [sport] = await db.select({ id: sports.id }).from(sports).where(eq(sports.code, "nfl")).limit(1);
  if (!sport) {
    return [];
  }

  const rows = await db
    .select({
      id: teams.id,
      abbreviation: teams.abbreviation,
      name: teams.name,
      city: teams.city,
      conference: teams.conference,
      division: teams.division,
      primaryColor: teams.primaryColor,
      secondaryColor: teams.secondaryColor,
      tertiaryColor: teams.tertiaryColor,
    })
    .from(teams)
    .where(and(eq(teams.sportId, sport.id), inArray(teams.abbreviation, [...CURRENT_NFL_ABBREVIATIONS])))
    .orderBy(asc(teams.abbreviation));

  return rows.map(toDto);
}

export async function getCurrentNflTeam(db: Database, teamId: string): Promise<NflTeamDto | null> {
  const [sport] = await db.select({ id: sports.id }).from(sports).where(eq(sports.code, "nfl")).limit(1);
  if (!sport) {
    return null;
  }

  const [row] = await db
    .select({
      id: teams.id,
      abbreviation: teams.abbreviation,
      name: teams.name,
      city: teams.city,
      conference: teams.conference,
      division: teams.division,
      primaryColor: teams.primaryColor,
      secondaryColor: teams.secondaryColor,
      tertiaryColor: teams.tertiaryColor,
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.sportId, sport.id)))
    .limit(1);

  if (!row || !isCurrentNflAbbreviation(row.abbreviation)) {
    return null;
  }
  return toDto(row);
}
