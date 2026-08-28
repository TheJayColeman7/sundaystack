import { Router } from "express";
import { z } from "zod";
import {
  LeagueError,
  createDraftLobby,
  expireIfNeeded,
  getDraftState,
  getLeagueSettings,
  getLeagueStatus,
  listDraftAvailable,
  makeManualPick,
  patchDraftLobby,
  replaceDraftQueue,
  requireLeagueMember,
  startDraft,
  type Database,
} from "@sundaystack/database";
import { requireUser } from "../middleware";

const uuidParam = z.string().uuid();

const createSchema = z.object({
  secondsPerPick: z.number().int().min(30).max(300).optional(),
});

const patchSchema = z
  .object({
    secondsPerPick: z.number().int().min(30).max(300).optional(),
    order: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine((value) => value.secondsPerPick !== undefined || value.order !== undefined, {
    message: "Provide order or secondsPerPick",
  });

const queueSchema = z.object({
  playerIds: z.array(z.string().uuid()).max(25),
});

const pickSchema = z.object({
  playerId: z.string().uuid(),
});

const availableSchema = z.object({
  search: z.string().trim().max(100).optional(),
  team: z.string().trim().max(10).optional(),
  position: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

function sendError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown): void {
  if (error instanceof LeagueError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.includes("DATABASE_URL") || message.includes("SESSION_SECRET") ? 503 : 500;
  res.status(status).json({ error: message });
}

async function settingsOrThrow(db: Database, leagueId: string) {
  const settings = await getLeagueSettings(db, leagueId);
  if (!settings) {
    throw new LeagueError("League settings not found", 404);
  }
  return settings;
}

export function draftsRouter(getDb: () => Database): Router {
  const router = Router();

  router.post("/api/leagues/:id/draft", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      if (membership.role !== "commissioner") {
        res.status(403).json({ error: "Only the commissioner can open the draft lobby" });
        return;
      }
      const status = await getLeagueStatus(getDb(), id.data);
      if (status !== "pre_draft") {
        res.status(409).json({ error: "League is not in pre-draft", code: "NOT_PRE_DRAFT" });
        return;
      }
      const settings = await settingsOrThrow(getDb(), id.data);
      const state = await createDraftLobby(getDb(), {
        leagueId: id.data,
        userId: user.id,
        secondsPerPick: parsed.data.secondsPerPick,
        config: settings,
      });
      res.status(201).json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id/draft", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const settings = await settingsOrThrow(getDb(), id.data);
      await expireIfNeeded(getDb(), id.data, settings);
      const state = await getDraftState(getDb(), id.data, user.id);
      if (!state) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }
      res.json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/leagues/:id/draft", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = patchSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      if (membership.role !== "commissioner") {
        res.status(403).json({ error: "Only the commissioner can change the lobby" });
        return;
      }
      await patchDraftLobby(getDb(), {
        leagueId: id.data,
        orderTeamIds: parsed.data.order,
        secondsPerPick: parsed.data.secondsPerPick,
      });
      const state = await getDraftState(getDb(), id.data, user.id);
      res.json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/draft/start", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      if (membership.role !== "commissioner") {
        res.status(403).json({ error: "Only the commissioner can start the draft" });
        return;
      }
      const settings = await settingsOrThrow(getDb(), id.data);
      await startDraft(getDb(), id.data, settings);
      const state = await getDraftState(getDb(), id.data, user.id);
      res.json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id/draft/available", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = availableSchema.safeParse(req.query);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const settings = await settingsOrThrow(getDb(), id.data);
      await expireIfNeeded(getDb(), id.data, settings);
      const result = await listDraftAvailable(getDb(), id.data, {
        search: parsed.data.search || undefined,
        team: parsed.data.team || undefined,
        position: parsed.data.position || undefined,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put("/api/leagues/:id/draft/queue", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = queueSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const settings = await settingsOrThrow(getDb(), id.data);
      await expireIfNeeded(getDb(), id.data, settings);
      await replaceDraftQueue(getDb(), {
        leagueId: id.data,
        userId: user.id,
        playerIds: parsed.data.playerIds,
      });
      const state = await getDraftState(getDb(), id.data, user.id);
      res.json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/draft/picks", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = pickSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      const settings = await settingsOrThrow(getDb(), id.data);
      await expireIfNeeded(getDb(), id.data, settings);
      await makeManualPick({
        db: getDb(),
        leagueId: id.data,
        userId: user.id,
        role: membership.role,
        playerId: parsed.data.playerId,
        config: settings,
      });
      const state = await getDraftState(getDb(), id.data, user.id);
      res.status(201).json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
