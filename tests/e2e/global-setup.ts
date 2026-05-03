import { exec } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";

const execAsync = promisify(exec);

const TEST_DB = "./pgdata-test";
const TEST_AUTH_SECRET = "test-secret-32-chars-min-do-not-use-in-prod";

async function globalSetup() {
  await rm(TEST_DB, { recursive: true, force: true });

  const env = {
    ...process.env,
    DATABASE_URL: TEST_DB,
    BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    BETTER_AUTH_URL: "http://localhost:3001",
  };

  const { stdout: migrateOut } = await execAsync("tsx scripts/migrate.ts", { env });
  process.stdout.write(migrateOut);

  const { stdout: seedOut } = await execAsync("tsx scripts/seed.ts", { env });
  process.stdout.write(seedOut);
}

export default globalSetup;
