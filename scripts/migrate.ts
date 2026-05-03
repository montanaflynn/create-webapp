import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL?.trim() || "./pgdata";
const isRemote = url.startsWith("postgres:") || url.startsWith("postgresql:");

async function main() {
  if (isRemote) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await client.end();
    console.log("✓ migrations applied (postgres)");
  } else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(url);
    const db = drizzle({ client });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await client.close();
    console.log(`✓ migrations applied (pglite at ${url})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
