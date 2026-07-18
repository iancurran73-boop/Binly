import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set (Neon connection string) to run drizzle-kit");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/dbSchema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
