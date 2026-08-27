import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "packages/database/package.json"));
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: "require",
  connect_timeout: 15,
});

try {
  const [row] = await sql`select current_database() as db`;
  console.info(`connected to ${row.db}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 });
}
