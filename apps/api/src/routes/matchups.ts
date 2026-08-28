import { Router } from "express";
import { z } from "zod";
import {
  LeagueError,
  getMatchupDetail,
  getScoreboard,
  getStandings,
  processWaiversIfDue,
  expireTradesIfDue,
  requireLeagueMember,
  type Database,
} from "@sundaystack/database";
import { requireUser } from "../middleware";

const uuidParam = z.string().uuid();
const weekQuery = z.coerce.number().int().min(1).max(17).optional();

function sendError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown): void {
  if (error instanceof LeagueError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("DATABASE_URL") || message.includes("SESSION_SECRET") ? 503 : 500;
  res.status(status).json({ error: message });
}

export function matchupsRouter(getDb: () => Database): Router {
  const router = Router();

  router.get("/api/leagues/:id/scoreboard", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const week = weekQuery.safeParse(req.query.week);
    if (!id.success || !week.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      await processWaiversIfDue(getDb(), id.data);
      await expireTradesIfDue(getDb(), id.data);
      const board = await getScoreboard(getDb(), id.data, week.data);
      res.json(board);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id/standings", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const standings = await getStandings(getDb(), id.data);
      res.json({ data: standings });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id/matchups/:matchupId", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const matchupId = uuidParam.safeParse(req.params.matchupId);
    if (!id.success || !matchupId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const matchup = await getMatchupDetail(getDb(), id.data, matchupId.data);
      res.json(matchup);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
