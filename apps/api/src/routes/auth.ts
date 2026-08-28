import { Router } from "express";
import { z } from "zod";
import {
  getUserById,
  patchUserAppearance,
  ProfileError,
  upsertDevUser,
  type Database,
} from "@sundaystack/database";
import { clearSessionCookie, setSessionCookie, signSession } from "../session";
import { requireUser } from "../middleware";

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(40),
});

const appearanceSchema = z
  .object({
    favoriteTeamId: z.union([z.string().uuid(), z.null()]).optional(),
    jerseySide: z.enum(["home", "away"]).optional(),
    firstName: z.union([z.string().trim().max(40), z.null()]).optional(),
    lastName: z.union([z.string().trim().max(40), z.null()]).optional(),
    avatarUrl: z.union([z.string().min(1).max(350_000), z.null()]).optional(),
  })
  .refine(
    (value) =>
      value.favoriteTeamId !== undefined ||
      value.jerseySide !== undefined ||
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.avatarUrl !== undefined,
    { message: "Empty patch" },
  );

export function authRouter(getDb: () => Database): Router {
  const router = Router();

  router.post("/api/auth/dev-login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    try {
      const session = await upsertDevUser(getDb(), parsed.data.email, parsed.data.displayName);
      const token = await signSession(session);
      setSessionCookie(res, token);
      const user = (await getUserById(getDb(), session.id)) ?? {
        ...session,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        jerseySide: "home" as const,
        favoriteTeam: null,
      };
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

  router.patch("/api/me", async (req, res) => {
    const session = requireUser(req);
    const parsed = appearanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    try {
      const user = await patchUserAppearance(getDb(), session.id, {
        ...parsed.data,
        firstName: parsed.data.firstName === undefined ? undefined : parsed.data.firstName || null,
        lastName: parsed.data.lastName === undefined ? undefined : parsed.data.lastName || null,
      });
      res.json({ user });
    } catch (error) {
      if (error instanceof ProfileError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
