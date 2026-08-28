import { Router } from "express";
import { listCurrentNflTeams, type Database } from "@sundaystack/database";

export function teamsRouter(getDb: () => Database): Router {
  const router = Router();

  router.get("/api/teams", async (_req, res) => {
    try {
      const data = await listCurrentNflTeams(getDb());
      res.json({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("DATABASE_URL") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  return router;
}
