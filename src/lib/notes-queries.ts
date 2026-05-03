import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tag } from "@/lib/db/schema";

/**
 * All tags this user has ever defined, in alphabetical order.
 * Tags persist across note deletion — they're the canonical autocomplete list.
 */
export async function getTagSuggestions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tag.name })
    .from(tag)
    .where(eq(tag.userId, userId))
    .orderBy(tag.name);
  return rows.map((r) => r.name);
}
