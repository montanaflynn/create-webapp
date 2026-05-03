import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { noteTag, tag } from "@/lib/db/schema";

export type TagWithCount = {
  name: string;
  count: number;
};

/**
 * All tags this user has ever defined, in alphabetical order.
 * Tags persist across note deletion — they're the canonical autocomplete list.
 */
export async function listTagSuggestions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tag.name })
    .from(tag)
    .where(eq(tag.userId, userId))
    .orderBy(tag.name);
  return rows.map((r) => r.name);
}

/**
 * Tags with the count of notes that reference each. Includes orphan tags
 * (count 0) so the user's vocabulary is fully represented.
 */
export async function listTagsWithCounts(
  userId: string,
): Promise<TagWithCount[]> {
  return db
    .select({
      name: tag.name,
      count: sql<number>`count(${noteTag.noteId})::int`,
    })
    .from(tag)
    .leftJoin(noteTag, eq(noteTag.tagId, tag.id))
    .where(eq(tag.userId, userId))
    .groupBy(tag.id, tag.name)
    .orderBy(tag.name);
}
