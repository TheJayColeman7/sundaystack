import { and, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PlayerListItem, PlayerListQuery, PlayerListResponse } from "@sundaystack/shared";
import type { Database } from "../client";
import { players, teams } from "../schema";

export async function listPlayers(
  db: Database,
  query: PlayerListQuery,
): Promise<PlayerListResponse> {
  const filters: SQL[] = [];

  if (query.position) {
    filters.push(eq(players.position, query.position.toUpperCase()));
  }

  if (query.team) {
    filters.push(eq(teams.abbreviation, query.team.toUpperCase()));
  }

  if (query.search) {
    const pattern = `%${query.search.trim()}%`;
    const nameMatch = or(
      ilike(players.displayName, pattern),
      ilike(players.firstName, pattern),
      ilike(players.lastName, pattern),
    );
    if (nameMatch) {
      filters.push(nameMatch);
    }
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: players.id,
      firstName: players.firstName,
      lastName: players.lastName,
      displayName: players.displayName,
      position: players.position,
      jerseyNumber: players.jerseyNumber,
      status: players.status,
      headshotUrl: players.headshotUrl,
      teamId: teams.id,
      teamAbbreviation: teams.abbreviation,
      teamName: teams.name,
    })
    .from(players)
    .leftJoin(teams, eq(players.teamId, teams.id))
    .where(whereClause)
    .orderBy(players.lastName, players.firstName)
    .limit(query.limit)
    .offset(query.offset);

  const data: PlayerListItem[] = rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    position: row.position,
    jerseyNumber: row.jerseyNumber,
    status: row.status,
    headshotUrl: row.headshotUrl,
    team:
      row.teamId && row.teamAbbreviation && row.teamName
        ? {
            id: row.teamId,
            abbreviation: row.teamAbbreviation,
            name: row.teamName,
          }
        : null,
  }));

  return {
    data,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total: Number(totalRow?.total ?? 0),
    },
  };
}
