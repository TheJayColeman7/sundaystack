import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "@sundaystack/shared";
import { readSessionToken, verifySession } from "./session";

export type AuthedRequest = Request & { user: AuthUser };

function isPublicPath(method: string, path: string): boolean {
  if (method === "OPTIONS") {
    return true;
  }
  if (method === "GET" && (path === "/" || path === "/health")) {
    return true;
  }
  if (method === "POST" && path === "/api/auth/dev-login") {
    return true;
  }
  if (method === "GET" && path === "/api/players") {
    return true;
  }
  if (method === "GET" && /^\/api\/players\/[^/]+$/.test(path)) {
    return true;
  }
  return false;
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req);
  if (token) {
    try {
      const user = await verifySession(token);
      (req as AuthedRequest).user = user;
    } catch {
      // Invalid token: treat as anonymous. Protected routes will 401.
    }
  }

  if (isPublicPath(req.method, req.path)) {
    next();
    return;
  }

  if (!(req as AuthedRequest).user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  next();
}

export function requireUser(req: Request): AuthUser {
  const user = (req as AuthedRequest).user;
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}
