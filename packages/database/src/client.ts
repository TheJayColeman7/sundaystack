import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema> | NeonHttpDatabase<typeof schema>;

function isNeonUrl(url: string): boolean {
  return url.includes("neon.tech");
}

function createPostgresDb(url: string): PostgresJsDatabase<typeof schema> {
  const usePooler =
    url.includes("6543") || url.includes("pgbouncer=true") || url.includes("-pooler.");
  const client = postgres(url, {
    max: 10,
    prepare: !usePooler,
  });
  return drizzlePostgres(client, { schema });
}

function createNeonHttpDb(url: string): NeonHttpDatabase<typeof schema> {
  return drizzleNeonHttp(neon(url), { schema });
}

export function createDb(url = process.env.DATABASE_URL): Database {
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  // This machine blocks outbound 5432; Neon HTTP uses 443.
  if (isNeonUrl(url)) {
    return createNeonHttpDb(url);
  }

  return createPostgresDb(url);
}
