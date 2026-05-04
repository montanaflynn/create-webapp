import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL?.trim() || "./pgdata";
const isRemote = url.startsWith("postgres:") || url.startsWith("postgresql:");

declare global {
  var __pglite__: PGlite | undefined;
}

// Both drivers return the same `PgDatabase`-based shape; the runtime object is
// whichever driver matched `DATABASE_URL`. We expose a single concrete type so
// callers (and method-overload resolution) don't see a union.
type DrizzleDb = ReturnType<typeof drizzlePglite<typeof schema>>;

let _db: DrizzleDb | undefined;

function getDb(): DrizzleDb {
  if (_db) return _db;
  if (isRemote) {
    const client = postgres(url, { max: 1, prepare: false });
    _db = drizzlePostgres(client, { schema }) as unknown as DrizzleDb;
  } else {
    // Reuse a single PGlite instance across hot-reloads in dev so the data
    // folder isn't opened twice (PGlite locks the directory).
    const client =
      globalThis.__pglite__ ?? (globalThis.__pglite__ = new PGlite(url));
    _db = drizzlePglite({ client, schema });
  }
  return _db;
}

// Lazy proxy: defers PGlite/postgres-js instantiation until first query, so
// build-time prerender workers that import the module without touching the DB
// don't try to open the data folder.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
