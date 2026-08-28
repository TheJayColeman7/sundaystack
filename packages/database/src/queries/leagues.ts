import { randomBytes, randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type {
  FantasyTeamSummaryDto,
  LeagueDetailDto,
  LeagueSettingsDto,
  LeagueSummaryDto,
  ScoringRuleDto,
} from "@sundaystack/shared";
import { DEFAULT_ROSTER_CONFIG, rosterCapacity, totalPicks, type RosterConfig } from "@sundaystack/shared";
import type { Database } from "../client";
import {
  draftOrder,
  drafts,
  fantasyTeams,
  leagueMembers,
  leagueScoringRules,
  leagueSettings,
  leagues,
  seasons,
  sports,
  users,
} from "../schema";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class LeagueError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LeagueError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; message?: string };
  return record.code === "23505" || (record.message ?? "").includes("duplicate key");
}

export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) {
    out += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  return out;
}

function settingsToDto(row: {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  k: number;
  def: number;
  bench: number;
  ir: number;
}): LeagueSettingsDto {
  return {
    qb: row.qb,
    rb: row.rb,
    wr: row.wr,
    te: row.te,
    flex: row.flex,
    superflex: row.superflex,
    k: row.k,
    def: row.def,
    bench: row.bench,
    ir: row.ir,
  };
}

export async function getNflContext(db: Database): Promise<{ sportId: string; seasonId: string; year: number }> {
  const [row] = await db
    .select({
      sportId: sports.id,
      seasonId: seasons.id,
      year: seasons.year,
    })
    .from(seasons)
    .innerJoin(sports, eq(seasons.sportId, sports.id))
    .where(eq(sports.code, "nfl"))
    .orderBy(desc(seasons.year))
    .limit(1);

  if (!row) {
    throw new LeagueError("No NFL season ingested yet", 503);
  }

  return row;
}

export async function listLeaguesForUser(db: Database, userId: string): Promise<LeagueSummaryDto[]> {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      status: leagues.status,
      inviteCode: leagues.inviteCode,
      maxTeams: leagues.maxTeams,
      seasonYear: seasons.year,
      role: leagueMembers.role,
      teamId: fantasyTeams.id,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
    .leftJoin(
      fantasyTeams,
      and(eq(fantasyTeams.leagueId, leagues.id), eq(fantasyTeams.ownerUserId, userId)),
    )
    .where(eq(leagueMembers.userId, userId))
    .orderBy(leagues.name);

  const leagueIds = rows.map((row) => row.id);
  const teamCounts = new Map<string, number>();

  if (leagueIds.length > 0) {
    const counts = await db
      .select({
        leagueId: fantasyTeams.leagueId,
        total: count(),
      })
      .from(fantasyTeams)
      .where(inArray(fantasyTeams.leagueId, leagueIds))
      .groupBy(fantasyTeams.leagueId);

    for (const row of counts) {
      teamCounts.set(row.leagueId, Number(row.total));
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status as LeagueSummaryDto["status"],
    inviteCode: row.inviteCode,
    maxTeams: row.maxTeams,
    seasonYear: row.seasonYear,
    teamCount: teamCounts.get(row.id) ?? 0,
    myTeamId: row.teamId,
    role: row.role as LeagueSummaryDto["role"],
  }));
}

export async function getLeagueDetail(db: Database, leagueId: string): Promise<LeagueDetailDto | null> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      status: leagues.status,
      inviteCode: leagues.inviteCode,
      maxTeams: leagues.maxTeams,
      commissionerUserId: leagues.commissionerUserId,
      seasonYear: seasons.year,
    })
    .from(leagues)
    .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
    .where(eq(leagues.id, leagueId))
    .limit(1);

  if (!league) {
    return null;
  }

  const [settingsRow] = await db
    .select()
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);

  const scoringRows = await db
    .select()
    .from(leagueScoringRules)
    .where(eq(leagueScoringRules.leagueId, leagueId));

  const memberRows = await db
    .select({
      userId: leagueMembers.userId,
      role: leagueMembers.role,
      displayName: users.displayName,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId));

  const teamRows = await db
    .select({
      id: fantasyTeams.id,
      name: fantasyTeams.name,
      ownerUserId: fantasyTeams.ownerUserId,
      ownerDisplayName: users.displayName,
    })
    .from(fantasyTeams)
    .innerJoin(users, eq(fantasyTeams.ownerUserId, users.id))
    .where(eq(fantasyTeams.leagueId, leagueId));

  const scoring: ScoringRuleDto[] = scoringRows.map((row) => ({
    statKey: row.statKey,
    pointsPer: Number(row.pointsPer),
  }));

  return {
    id: league.id,
    name: league.name,
    status: league.status as LeagueDetailDto["status"],
    inviteCode: league.inviteCode,
    maxTeams: league.maxTeams,
    seasonYear: league.seasonYear,
    commissionerUserId: league.commissionerUserId,
    members: memberRows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      role: row.role as "commissioner" | "member",
    })),
    teams: teamRows.map((row) => ({
      id: row.id,
      leagueId,
      name: row.name,
      ownerUserId: row.ownerUserId,
      ownerDisplayName: row.ownerDisplayName,
    })),
    settings: settingsRow ? settingsToDto(settingsRow) : DEFAULT_ROSTER_CONFIG,
    scoring,
  };
}

export async function requireLeagueMember(
  db: Database,
  leagueId: string,
  userId: string,
): Promise<{ role: "commissioner" | "member" }> {
  const [row] = await db
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);

  if (!row) {
    throw new LeagueError("Not a member of this league", 403);
  }

  return { role: row.role as "commissioner" | "member" };
}

export async function createLeague(
  db: Database,
  input: {
    userId: string;
    displayName: string;
    name: string;
    maxTeams: number;
    settings: RosterConfig;
    scoring: Array<{ statKey: string; pointsPer: number }>;
  },
): Promise<LeagueDetailDto> {
  const { sportId, seasonId } = await getNflContext(db);
  const leagueId = randomUUID();
  const teamId = randomUUID();
  let inviteCode = generateInviteCode();

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await db.insert(leagues).values({
          id: leagueId,
          sportId,
          seasonId,
          name: input.name,
          commissionerUserId: input.userId,
          inviteCode,
          status: "pre_draft",
          maxTeams: input.maxTeams,
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) {
          throw error;
        }
        inviteCode = generateInviteCode();
      }
    }

    await db.insert(leagueMembers).values({
      leagueId,
      userId: input.userId,
      role: "commissioner",
    });

    await db.insert(leagueSettings).values({
      leagueId,
      qb: input.settings.qb,
      rb: input.settings.rb,
      wr: input.settings.wr,
      te: input.settings.te,
      flex: input.settings.flex,
      superflex: input.settings.superflex,
      k: input.settings.k,
      def: input.settings.def,
      bench: input.settings.bench,
      ir: input.settings.ir,
    });

    if (input.scoring.length > 0) {
      await db.insert(leagueScoringRules).values(
        input.scoring.map((rule) => ({
          leagueId,
          statKey: rule.statKey,
          pointsPer: rule.pointsPer.toFixed(4),
        })),
      );
    }

    const teamName = input.displayName ? `${input.displayName}'s Team` : "Team 1";
    await db.insert(fantasyTeams).values({
      id: teamId,
      leagueId,
      ownerUserId: input.userId,
      name: teamName,
    });
  } catch (error) {
    await db.delete(leagues).where(eq(leagues.id, leagueId));
    throw error;
  }

  const detail = await getLeagueDetail(db, leagueId);
  if (!detail) {
    throw new LeagueError("League created but could not be loaded", 500);
  }
  return detail;
}

export async function joinLeague(
  db: Database,
  input: { userId: string; displayName: string; inviteCode: string },
): Promise<LeagueDetailDto> {
  const code = input.inviteCode.trim().toUpperCase();
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.inviteCode, code))
    .limit(1);

  if (!league) {
    throw new LeagueError("Invalid invite code", 404);
  }

  if (league.status !== "pre_draft") {
    throw new LeagueError("Cannot join after the draft has started", 409, "JOIN_LOCKED");
  }

  const [existing] = await db
    .select({ id: leagueMembers.id })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, input.userId)))
    .limit(1);

  if (existing) {
    throw new LeagueError("Already in this league", 409, "ALREADY_MEMBER");
  }

  const [countRow] = await db
    .select({ total: count() })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, league.id));

  if (Number(countRow?.total ?? 0) >= league.maxTeams) {
    throw new LeagueError("League is full", 409, "LEAGUE_FULL");
  }

  const teamId = randomUUID();

  try {
    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: input.userId,
      role: "member",
    });
    await db.insert(fantasyTeams).values({
      id: teamId,
      leagueId: league.id,
      ownerUserId: input.userId,
      name: input.displayName ? `${input.displayName}'s Team` : "New Team",
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LeagueError("Already in this league", 409, "ALREADY_MEMBER");
    }
    throw error;
  }

  const [lobby] = await db.select().from(drafts).where(eq(drafts.leagueId, league.id)).limit(1);
  if (lobby?.status === "lobby") {
    const [maxRow] = await db
      .select({ slot: draftOrder.slot })
      .from(draftOrder)
      .where(eq(draftOrder.draftId, lobby.id))
      .orderBy(desc(draftOrder.slot))
      .limit(1);
    const nextSlot = (maxRow?.slot ?? 0) + 1;
    const settings = await getLeagueSettings(db, league.id);
    const capacity = rosterCapacity(settings ?? DEFAULT_ROSTER_CONFIG);
    await db.insert(draftOrder).values({
      draftId: lobby.id,
      slot: nextSlot,
      fantasyTeamId: teamId,
    });
    await db
      .update(drafts)
      .set({
        totalPicks: totalPicks(nextSlot, capacity),
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, lobby.id));
  }

  const detail = await getLeagueDetail(db, league.id);
  if (!detail) {
    throw new LeagueError("Joined but league could not be loaded", 500);
  }
  return detail;
}

export async function updateLeagueSettings(
  db: Database,
  leagueId: string,
  settings: RosterConfig,
): Promise<LeagueSettingsDto> {
  const existing = await db
    .select({ id: leagueSettings.id })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);

  if (!existing[0]) {
    throw new LeagueError("League settings not found", 404);
  }

  await db
    .update(leagueSettings)
    .set({
      qb: settings.qb,
      rb: settings.rb,
      wr: settings.wr,
      te: settings.te,
      flex: settings.flex,
      superflex: settings.superflex,
      k: settings.k,
      def: settings.def,
      bench: settings.bench,
      ir: settings.ir,
      updatedAt: new Date(),
    })
    .where(eq(leagueSettings.leagueId, leagueId));

  return settingsToDto(settings);
}

export async function replaceLeagueScoring(
  db: Database,
  leagueId: string,
  rules: Array<{ statKey: string; pointsPer: number }>,
): Promise<ScoringRuleDto[]> {
  await db.delete(leagueScoringRules).where(eq(leagueScoringRules.leagueId, leagueId));
  if (rules.length > 0) {
    await db.insert(leagueScoringRules).values(
      rules.map((rule) => ({
        leagueId,
        statKey: rule.statKey,
        pointsPer: rule.pointsPer.toFixed(4),
      })),
    );
  }

  const rows = await db
    .select()
    .from(leagueScoringRules)
    .where(eq(leagueScoringRules.leagueId, leagueId));

  return rows.map((row) => ({
    statKey: row.statKey,
    pointsPer: Number(row.pointsPer),
  }));
}

export async function getFantasyTeam(
  db: Database,
  teamId: string,
): Promise<(FantasyTeamSummaryDto & { leagueId: string }) | null> {
  const [row] = await db
    .select({
      id: fantasyTeams.id,
      name: fantasyTeams.name,
      ownerUserId: fantasyTeams.ownerUserId,
      ownerDisplayName: users.displayName,
      leagueId: fantasyTeams.leagueId,
    })
    .from(fantasyTeams)
    .innerJoin(users, eq(fantasyTeams.ownerUserId, users.id))
    .where(eq(fantasyTeams.id, teamId))
    .limit(1);

  return row ?? null;
}

export async function getLeagueSettings(
  db: Database,
  leagueId: string,
): Promise<RosterConfig | null> {
  const [row] = await db
    .select()
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  return row ? settingsToDto(row) : null;
}

export async function getLeagueStatus(
  db: Database,
  leagueId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ status: leagues.status })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  return row?.status ?? null;
}
