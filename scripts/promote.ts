import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema";

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Usage: tsx scripts/promote.ts <email>");
    process.exit(1);
  }

  const rows = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email));

  const u = rows[0];
  if (!u) {
    console.error(`✗ no user found with email ${email}`);
    process.exit(1);
  }

  if (u.role === "admin") {
    console.log(`✓ ${email} is already an admin (id=${u.id})`);
    return;
  }

  await db
    .update(user)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(user.id, u.id));
  console.log(`✓ promoted ${email} to admin (id=${u.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
