/**
 * Postgres connection (Neon). Replaces the old Supabase REST client.
 *
 * DATABASE_URL should be Neon's pooled connection string (the one with
 * `-pooler` in the hostname) — see MIGRATION_RUNBOOK.md. `postgres-js` keeps
 * a small connection pool internally; `max` is capped low because Neon's
 * pooler already multiplexes connections and this is a single small service.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@shared/dbSchema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set in .env (Neon connection string)");
}

export const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "require",
});

export const db = drizzle(sql, { schema });
