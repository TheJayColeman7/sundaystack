import { Router } from "express";
import { z } from "zod";
import {
  LeagueError,
  acceptTrade,
  cancelTrade,
  getTradeBoard,
  proposeTrade,
  rejectTrade,
  requireLeagueMember,
  type Database,
} from "@sundaystack/database";
import { MAX_TRADE_PLAYERS } from "@sundaystack/shared";
import { requireUser } from "../middleware";

const uuidParam = z.string().uuid();

const proposeSchema = z.object({
  counterpartyTeamId: z.string().uuid(),
  givePlayerIds: z.array(z.string().uuid()).min(1).max(MAX_TRADE_PLAYERS),
  receivePlayerIds: z.array(z.string().uuid()).min(1).max(MAX_TRADE_PLAYERS),
  dropPlayerIds: z.array(z.string().uuid()).max(MAX_TRADE_PLAYERS).default([]),
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

export function tradesRouter(getDb: () => Database): Router {
  const router = Router();

  router.get("/api/leagues/:id/trades", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid league id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const board = await getTradeBoard(getDb(), id.data, user.id);
      res.json(board);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/trades", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const parsed = proposeSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const trade = await proposeTrade(getDb(), {
        leagueId: id.data,
        userId: user.id,
        counterpartyTeamId: parsed.data.counterpartyTeamId,
        givePlayerIds: parsed.data.givePlayerIds,
        receivePlayerIds: parsed.data.receivePlayerIds,
        dropPlayerIds: parsed.data.dropPlayerIds,
      });
      res.status(201).json(trade);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/trades/:tradeId/accept", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const tradeId = uuidParam.safeParse(req.params.tradeId);
    if (!id.success || !tradeId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const trade = await acceptTrade(getDb(), {
        leagueId: id.data,
        userId: user.id,
        tradeId: tradeId.data,
      });
      res.json(trade);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/trades/:tradeId/reject", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const tradeId = uuidParam.safeParse(req.params.tradeId);
    if (!id.success || !tradeId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      await requireLeagueMember(getDb(), id.data, user.id);
      const trade = await rejectTrade(getDb(), {
        leagueId: id.data,
        userId: user.id,
        tradeId: tradeId.data,
      });
      res.json(trade);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/leagues/:id/trades/:tradeId/cancel", async (req, res) => {
    const user = requireUser(req);
    const id = uuidParam.safeParse(req.params.id);
    const tradeId = uuidParam.safeParse(req.params.tradeId);
    if (!id.success || !tradeId.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const membership = await requireLeagueMember(getDb(), id.data, user.id);
      const trade = await cancelTrade(getDb(), {
        leagueId: id.data,
        userId: user.id,
        tradeId: tradeId.data,
        isCommissioner: membership.role === "commissioner",
      });
      res.json(trade);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
