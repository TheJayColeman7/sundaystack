import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createDb } from "../client";
import { seedTeamDefenses } from "../seed/dst";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(root, ".env") });

try {
  const db = createDb();
  const result = await seedTeamDefenses(db);
  console.info(`DST seed complete: created ${result.created}, already present ${result.skipped}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
