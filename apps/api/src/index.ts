import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { createDb, listPlayers, type Database } from "@sundaystack/database";
import { z } from "zod";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  team: z.string().trim().max(10).optional(),
  position: z.string().trim().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

let db: Database | undefined;

function getDb(): Database {
  db ??= createDb();
  return db;
}

const app = express();
const origin = process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin,
  }),
);
app.use(express.json());

app.get("/", (_req, res) => {
  const webUrl = process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>SundayStack API</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; background: #0c1016; color: #e8edf4; margin: 2rem; }
      a { color: #3dd68c; }
      code { color: #d6dde8; }
    </style>
  </head>
  <body>
    <p>This is the SundayStack API, not the website.</p>
    <p>Open the app at <a href="${webUrl}">${webUrl}</a> (run <code>pnpm dev:web</code> if it is not up).</p>
    <p>API routes:</p>
    <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/api/players?search=mahomes&amp;position=QB">/api/players?search=mahomes&amp;position=QB</a></li>
    </ul>
  </body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sundaystack-api" });
});

app.get("/api/players", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query",
      details: parsed.error.flatten(),
    });
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

const port = Number(process.env.API_PORT ?? 3001);

app.listen(port, () => {
  console.info(`SundayStack API listening on http://localhost:${port}`);
});
