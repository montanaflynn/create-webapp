import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

// drizzle-kit only needs a real URL for `migrate`, `push`, and `studio`.
// `generate` only diffs the schema. PGlite has no URL, so for local generation
// we provide a placeholder; the actual apply happens via scripts/migrate.ts.
const url = process.env.DATABASE_URL ?? "postgres://placeholder@localhost/db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
