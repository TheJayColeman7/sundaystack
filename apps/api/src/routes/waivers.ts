import { Router } from "express";
import { z } from "zod";
import {
  LeagueError,
  cancelWaiverClaim,
  getWaiverBoard,
  listWaiverAvailable,
  replaceWaiverClaims,
  requireLeagueMember,
  type Database,
} from "@sundaystack/database";
import { MAX_WAIVER_CLAIMS } from "@sundaystack/shared";
import { requireUser } from "../middleware";

const uuidParam = z.string().uuid();

const availableSchema = z.object({
  search: z.string().trim().max(100).optional(),
  team: z.string().trim().max(10).optional(),
  position: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const claimsSchema = z.object({
  claims: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        dropPlayerId: z.string().uuid().nullable().optional(),
        bid: z.number().int().min(0).max(10000).default(0),
      }),
    )
    .max(MAX_WAIVER_CLAIMS),
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

export function waiversRouter(getDb: () => Database): Router {
  const router = Router();

  router.get("/api/leagues/:id/waivers", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const board = await getWaiverBoard(getDb(), id.data, user.id);
      res.json(board);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/leagues/:id/waivers/available", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = availableSchema.safeParse(req.query);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const result = await listWaiverAvailable(getDb(), id.data, parsed.data);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put("/api/leagues/:id/waivers/claims", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = claimsSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const board = await replaceWaiverClaims(getDb(), {
        leagueId: id.data,
        userId: user.id,
        claims: parsed.data.claims.map((claim) => ({
          playerId: claim.playerId,
          dropPlayerId: claim.dropPlayerId ?? null,
          bid: claim.bid,
        })),
      });
      res.json(board);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/api/leagues/:id/waivers/claims/:claimId", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const claimId = uuidParam.safeParse(req.params.claimId);
    if (!id.success || !claimId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const board = await cancelWaiverClaim(getDb(), {
        leagueId: id.data,
        userId: user.id,
        claimId: claimId.data,
      });
      res.json(board);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

