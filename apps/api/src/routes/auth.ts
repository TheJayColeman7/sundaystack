import { Router } from "express";
import { z } from "zod";
import { getUserById, upsertDevUser, type Database } from "@sundaystack/database";
import { clearSessionCookie, setSessionCookie, signSession } from "../session";
import { requireUser } from "../middleware";

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(40),
});

export function authRouter(getDb: () => Database): Router {
  const router = Router();

  router.post("/api/auth/dev-login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    try {
      const user = await upsertDevUser(getDb(), parsed.data.email, parsed.data.displayName);
      const token = await signSession(user);
      setSessionCookie(res, token);
      res.json({ user, token });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      const status = message.includes("SESSION_SECRET") || message.includes("DATABASE_URL") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post("/api/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/api/me", async (req, res) => {
    const session = requireUser(req);
    try {
      const user = await getUserById(getDb(), session.id);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      res.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
