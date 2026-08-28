import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { createDb, type Database } from "@sundaystack/database";
import { sessionMiddleware } from "./middleware";
import { authRouter } from "./routes/auth";
import { draftsRouter } from "./routes/drafts";
import { leaguesRouter } from "./routes/leagues";
import { matchupsRouter } from "./routes/matchups";
import { playersRouter } from "./routes/players";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

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
    credentials: true,
  }),
);
app.use(express.json());
app.use(sessionMiddleware);

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

app.use(authRouter(getDb));
app.use(playersRouter(getDb));
app.use(leaguesRouter(getDb));
app.use(draftsRouter(getDb));
app.use(matchupsRouter(getDb));

const port = Number(process.env.API_PORT ?? 3001);

app.listen(port, () => {
  console.info(`SundayStack API listening on http://localhost:${port}`);
});