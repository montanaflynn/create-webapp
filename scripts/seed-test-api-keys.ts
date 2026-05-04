// Generates API keys for the e2e seeded user and writes the plaintext
// secrets to tests/e2e/.api-keys.json so the REST suite can authenticate.
//
// Runs from globalSetup, before the test dev server boots, so it has
// exclusive access to the PGlite directory. The dev server reads only the
// already-hashed rows from `api_key`; nothing reads this JSON outside the
// test runner.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { user, apiKey } from "../src/lib/db/schema";
import { createApiKey, type Scope } from "../src/lib/services/api-keys";

const SEED_EMAIL = "user@example.com";
const OUT_PATH = "tests/e2e/.api-keys.json";

type Spec = {
  name: string;
  scopes: Scope[];
};

const SPECS: Spec[] = [
  { name: "test-full", scopes: ["notes:read", "notes:write", "tags:read"] },
  { name: "test-readonly", scopes: ["notes:read", "tags:read"] },
  { name: "test-no-scope", scopes: ["tags:read"] },
];

async function main() {
  const u = await db.query.user.findFirst({
    where: eq(user.email, SEED_EMAIL),
  });
  if (!u) {
    throw new Error(`Seeded user ${SEED_EMAIL} not found — run db:seed first.`);
  }

  // Idempotent: wipe this user's existing keys so reruns don't accumulate.
  await db.delete(apiKey).where(eq(apiKey.userId, u.id));

  const out: Record<string, string> = {};
  for (const spec of SPECS) {
    const { secret } = await createApiKey(
      { userId: u.id, principal: { kind: "session" } },
      spec,
    );
    out[spec.name] = secret;
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ wrote ${SPECS.length} test api keys to ${OUT_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
