import { CURRENT_NFL_ABBREVIATIONS } from "@sundaystack/shared";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { playerExternalIds, players, sports, teams } from "../schema";

export { CURRENT_NFL_ABBREVIATIONS };

export async function seedTeamDefenses(db: Database): Promise<{ created: number; skipped: number }> {
  const [sport] = await db.select({ id: sports.id }).from(sports).where(eq(sports.code, "nfl")).limit(1);
  if (!sport) {
    throw new Error("NFL sport row is missing");
  }

  const nflTeams = await db
    .select({
      id: teams.id,
      abbreviation: teams.abbreviation,
      name: teams.name,
    })
    .from(teams)
    .where(and(eq(teams.sportId, sport.id), inArray(teams.abbreviation, [...CURRENT_NFL_ABBREVIATIONS])));

  let created = 0;
  let skipped = 0;

  for (const team of nflTeams) {
    const externalId = `dst-${team.abbreviation}`;
    const [existing] = await db
      .select({ playerId: playerExternalIds.playerId })
      .from(playerExternalIds)
      .where(
        and(eq(playerExternalIds.provider, "sundaystack"), eq(playerExternalIds.externalId, externalId)),
      )
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    const displayName = `${team.name} D/ST`;
    const playerId = randomUUID();
    await db.insert(players).values({
      id: playerId,
      sportId: sport.id,
      teamId: team.id,
      firstName: team.name,
      lastName: "D/ST",
      displayName,
      position: "DEF",
      status: "Active",
    });

    await db.insert(playerExternalIds).values({
      playerId,
      provider: "sundaystack",
      externalId,
    });
    created += 1;
  }

  return { created, skipped };
}
