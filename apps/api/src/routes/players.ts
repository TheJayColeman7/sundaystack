import { Router } from "express";
import { z } from "zod";
import { getPlayerProfile, listPlayers, type Database } from "@sundaystack/database";

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  team: z.string().trim().max(10).optional(),
  position: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const idSchema = z.string().uuid();

export function playersRouter(getDb: () => Database): Router {
  const router = Router();

  router.get("/api/players", async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await listPlayers(getDb(), {
        search: parsed.data.search || undefined,
        team: parsed.data.team || undefined,
        position: parsed.data.position || undefined,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("DATABASE_URL") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.get("/api/players/:id", async (req, res) => {
    const parsed = idSchema.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid player id" });
      return;
    }

    try {
      const player = await getPlayerProfile(getDb(), parsed.data);
      if (!player) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      res.json(player);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
