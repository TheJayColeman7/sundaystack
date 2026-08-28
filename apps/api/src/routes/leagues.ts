import { Router } from "express";
import { z } from "zod";
import {
  LeagueError,
  addRosterPlayer,
  createLeague,
  dropRosterPlayer,
  getFantasyTeam,
  getLeagueDetail,
  getLeagueSettings,
  getRoster,
  joinLeague,
  listLeaguesForUser,
  listRosterPlayersForLeague,
  replaceLeagueScoring,
  requireLeagueMember,
  setLineup,
  updateLeagueSettings,
  type Database,
} from "@sundaystack/database";
import {
  DEFAULT_ROSTER_CONFIG,
  ROSTER_SLOTS,
  scoringRulesForPreset,
  validateLineup,
  type RosterConfig,
  type RosterSlot,
} from "@sundaystack/shared";
import { requireUser } from "../middleware";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  maxTeams: z.number().int().min(8).max(14).optional(),
  scoringPreset: z.enum(["standard", "half_ppr", "ppr"]).optional(),
  settings: z
    .object({
      qb: z.number().int().min(0).max(4).optional(),
      rb: z.number().int().min(0).max(6).optional(),
      wr: z.number().int().min(0).max(6).optional(),
      te: z.number().int().min(0).max(4).optional(),
      flex: z.number().int().min(0).max(4).optional(),
      superflex: z.number().int().min(0).max(2).optional(),
      k: z.number().int().min(0).max(2).optional(),
      def: z.number().int().min(0).max(2).optional(),
      bench: z.number().int().min(0).max(12).optional(),
      ir: z.number().int().min(0).max(4).optional(),
    })
    .optional(),
});

const joinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(16),
});

const settingsSchema = z.object({
  qb: z.number().int().min(0).max(4).optional(),
  rb: z.number().int().min(0).max(6).optional(),
  wr: z.number().int().min(0).max(6).optional(),
  te: z.number().int().min(0).max(4).optional(),
  flex: z.number().int().min(0).max(4).optional(),
  superflex: z.number().int().min(0).max(2).optional(),
  k: z.number().int().min(0).max(2).optional(),
  def: z.number().int().min(0).max(2).optional(),
  bench: z.number().int().min(0).max(12).optional(),
  ir: z.number().int().min(0).max(4).optional(),
});

const scoringSchema = z
  .object({
    preset: z.enum(["standard", "half_ppr", "ppr"]).optional(),
    rules: z
      .array(
        z.object({
          statKey: z.string().min(1).max(64),
          pointsPer: z.number(),
        }),
      )
      .optional(),
  })
  .refine((value) => Boolean(value.preset || value.rules), {
    message: "Provide preset or rules",
  });

const addPlayerSchema = z.object({
  playerId: z.string().uuid(),
  slot: z.enum(ROSTER_SLOTS).optional(),
});

const lineupSchema = z.object({
  assignments: z.array(
    z.object({
      playerId: z.string().uuid(),
      slot: z.enum(ROSTER_SLOTS),
    }),
  ),
});

const uuidParam = z.string().uuid();

function sendError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown): void {
  if (error instanceof LeagueError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("DATABASE_URL") || message.includes("SESSION_SECRET") ? 503 : 500;
  res.status(status).json({ error: message });
}

async function requireOwnerOrCommissioner(
  db: Database,
  leagueId: string,
  teamId: string,
  userId: string,
): Promise<{ leagueId: string; role: "commissioner" | "member" }> {
  const membership = await requireLeagueMember(db, leagueId, userId);
  const team = await getFantasyTeam(db, teamId);
  if (!team || team.leagueId !== leagueId) {
    throw new LeagueError("Team not found in this league", 404);
  }
  if (team.ownerUserId !== userId && membership.role !== "commissioner") {
    throw new LeagueError("Only the team owner or commissioner can change this roster", 403);
  }
  return { leagueId, role: membership.role };
}

export function leaguesRouter(getDb: () => Database): Router {
  const router = Router();

  router.post("/api/leagues", async (req, res) => {
    const user = requireUser(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const settings: RosterConfig = { ...DEFAULT_ROSTER_CONFIG, ...parsed.data.settings };
    const preset = parsed.data.scoringPreset ?? "ppr";
    const scoring = scoringRulesForPreset(preset);

    try {
      const league = await createLeague(getDb(), {
        userId: user.id,
        displayName: user.displayName,
        name: parsed.data.name,
        maxTeams: parsed.data.maxTeams ?? 12,
        settings,
        scoring,
      });
      res.status(201).json(league);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues", async (req, res) => {
    const user = requireUser(req);
    try {
      const leagues = await listLeaguesForUser(getDb(), user.id);
      res.json({ data: leagues });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/join", async (req, res) => {
    const user = requireUser(req);
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    try {
      const league = await joinLeague(getDb(), {
        userId: user.id,
        displayName: user.displayName,
        inviteCode: parsed.data.inviteCode,
      });
      res.json(league);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const league = await getLeagueDetail(getDb(), id.data);
      if (!league) {
        res.status(404).json({ error: "League not found" });
        return;
      }
      res.json(league);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/leagues/:id/settings", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = settingsSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      if (membership.role !== "commissioner") {
        res.status(403).json({ error: "Only the commissioner can change settings" });
        return;
      }

      const current = await getLeagueSettings(getDb(), id.data);
      if (!current) {
        res.status(404).json({ error: "Settings not found" });
        return;
      }

      const next: RosterConfig = { ...current, ...parsed.data };
      const rostered = await listRosterPlayersForLeague(getDb(), id.data);
      const byTeam = new Map<string, typeof rostered>();
      for (const row of rostered) {
        const list = byTeam.get(row.fantasyTeamId) ?? [];
        list.push(row);
        byTeam.set(row.fantasyTeamId, list);
      }
      for (const rows of byTeam.values()) {
        const check = validateLineup(
          rows.map((row) => ({
            playerId: row.playerId,
            position: row.position,
            slot: row.slot as RosterSlot,
          })),
          next,
        );
        if (!check.ok) {
          res.status(400).json({
            error: "Settings would make an existing roster illegal",
            details: check.errors,
          });
          return;
        }
      }

      const settings = await updateLeagueSettings(getDb(), id.data, next);
      res.json(settings);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/leagues/:id/scoring", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = scoringSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      if (membership.role !== "commissioner") {
        res.status(403).json({ error: "Only the commissioner can change scoring" });
        return;
      }

      const scoringRules = parsed.data.preset
        ? scoringRulesForPreset(parsed.data.preset)
        : (parsed.data.rules ?? []);
      const scoring = await replaceLeagueScoring(getDb(), id.data, scoringRules);
      res.json({ scoring });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:leagueId/teams/:teamId/roster", async (req, res) => {
    const user = requireUser(req);
    const leagueId = uuidParam.safeParse(req.params.leagueId);
    const teamId = uuidParam.safeParse(req.params.teamId);
    if (!leagueId.success || !teamId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), leagueId.data, user.id);
      const roster = await getRoster(getDb(), teamId.data);
      if (!roster || roster.team.leagueId !== leagueId.data) {
        res.status(404).json({ error: "Roster not found" });
        return;
      }
      res.json(roster);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:leagueId/teams/:teamId/roster", async (req, res) => {
    const user = requireUser(req);
    const leagueId = uuidParam.safeParse(req.params.leagueId);
    const teamId = uuidParam.safeParse(req.params.teamId);
    const parsed = addPlayerSchema.safeParse(req.body);
    if (!leagueId.success || !teamId.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireOwnerOrCommissioner(getDb(), leagueId.data, teamId.data, user.id);
      const settings = await getLeagueSettings(getDb(), leagueId.data);
      if (!settings) {
        res.status(404).json({ error: "Settings not found" });
        return;
      }

      const roster = await addRosterPlayer(getDb(), {
        leagueId: leagueId.data,
        teamId: teamId.data,
        playerId: parsed.data.playerId,
        slot: parsed.data.slot,
        config: settings,
      });
      res.status(201).json(roster);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/api/leagues/:leagueId/teams/:teamId/roster/:playerId", async (req, res) => {
    const user = requireUser(req);
    const leagueId = uuidParam.safeParse(req.params.leagueId);
    const teamId = uuidParam.safeParse(req.params.teamId);
    const playerId = uuidParam.safeParse(req.params.playerId);
    if (!leagueId.success || !teamId.success || !playerId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireOwnerOrCommissioner(getDb(), leagueId.data, teamId.data, user.id);
      const roster = await dropRosterPlayer(getDb(), {
        teamId: teamId.data,
        playerId: playerId.data,
      });
      res.json(roster);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put("/api/leagues/:leagueId/teams/:teamId/lineup", async (req, res) => {
    const user = requireUser(req);
    const leagueId = uuidParam.safeParse(req.params.leagueId);
    const teamId = uuidParam.safeParse(req.params.teamId);
    const parsed = lineupSchema.safeParse(req.body);
    if (!leagueId.success || !teamId.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireOwnerOrCommissioner(getDb(), leagueId.data, teamId.data, user.id);
      const settings = await getLeagueSettings(getDb(), leagueId.data);
      if (!settings) {
        res.status(404).json({ error: "Settings not found" });
        return;
      }
      const roster = await setLineup(getDb(), {
        teamId: teamId.data,
        config: settings,
        assignments: parsed.data.assignments,
      });
      res.json(roster);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
