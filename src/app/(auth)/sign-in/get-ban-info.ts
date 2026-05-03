"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

// Returns the ban info for a given email IF the user is banned. Returns null
// otherwise (including when the email doesn't exist) — so we don't leak account
// existence beyond what better-auth already discloses on a banned sign-in.
export async function getBanInfo(
  email: string,
): Promise<{ reason: string | null; expiresAt: Date | null } | null> {
  if (!email) return null;
  const rows = await db
    .select({
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(eq(user.email, email));
  const row = rows[0];
  if (!row || !row.banned) return null;
  return {
    reason: row.banReason ?? null,
    expiresAt: row.banExpires ?? null,
  };
}
