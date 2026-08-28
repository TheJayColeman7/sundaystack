import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ingestSportsData, ingestTeams } from "../ingest/run";
import { NflverseProvider } from "../nflverse/provider";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: resolve(root, ".env") });

function parseSeasons(): number[] {
  const raw = process.env.INGEST_SEASONS ?? "2024,2025,2026";
  const years = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((year) => Number.isInteger(year) && year >= 1999);
  if (years.length === 0) {
    throw new Error("INGEST_SEASONS must contain at least one year");
  }
  return years;
}

try {
  const seasons = parseSeasons();
  const provider = new NflverseProvider({ seasons });
  const teamsOnly = process.argv.includes("--teams-only");

  if (teamsOnly) {
    console.info("Ingesting nflverse team colors only");
    const summary = await ingestTeams(provider);
    console.info("Ingest complete:");
    console.info(`  teams:  ${summary.teams}`);
    process.exit(0);
  }

  console.info(`Ingesting nflverse seasons: ${seasons.join(", ")}`);

  const summary = await ingestSportsData(provider, seasons);

  console.info("Ingest complete:");
  console.info(`  teams:  ${summary.teams}`);
  console.info(`  players:${summary.players}`);
  console.info(`  games:  ${summary.games}`);
  console.info(`  stats:  ${summary.stats}`);
  if (summary.statsSkipped > 0) {
    console.info(`  stats skipped (unmatched player/game): ${summary.statsSkipped}`);
  }

  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
