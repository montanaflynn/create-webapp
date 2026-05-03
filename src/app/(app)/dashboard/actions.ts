"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { note, noteTag, tag } from "@/lib/db/schema";
import { noteInputSchema, type NoteInput } from "@/lib/notes-schema";

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

function normalize(input: NoteInput) {
  return {
    title: input.title.trim(),
    content: input.content,
    tags: Array.from(
      new Set(
        input.tags
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0),
      ),
    ),
  };
}

export async function createNote(input: NoteInput) {
  const userId = await requireUserId();
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { title, content, tags } = normalize(parsed.data);
  const noteId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(note).values({ id: noteId, userId, title, content });

    if (tags.length > 0) {
      // Upsert tags and grab IDs in one round-trip. The no-op `set` on
      // conflict makes RETURNING fire for already-existing rows too — that's
      // the canonical pg-upsert-and-read-ids pattern.
      const upserted = await tx
        .insert(tag)
        .values(
          tags.map((name) => ({ id: crypto.randomUUID(), userId, name })),
        )
        .onConflictDoUpdate({
          target: [tag.userId, tag.name],
          set: { name: sql`EXCLUDED.name` },
        })
        .returning({ id: tag.id });

      await tx
        .insert(noteTag)
        .values(upserted.map(({ id }) => ({ noteId, tagId: id })));
    }
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateNote(id: string, input: NoteInput) {
  const userId = await requireUserId();
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { title, content, tags } = normalize(parsed.data);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(note)
      .set({ title, content, updatedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning({ id: note.id });

    // Bail if the note didn't exist or wasn't owned by this user.
    if (updated.length === 0) return;

    // Replace links wholesale — simpler than diffing, atomic inside the tx.
    await tx.delete(noteTag).where(eq(noteTag.noteId, id));

    if (tags.length > 0) {
      const upserted = await tx
        .insert(tag)
        .values(
          tags.map((name) => ({ id: crypto.randomUUID(), userId, name })),
        )
        .onConflictDoUpdate({
          target: [tag.userId, tag.name],
          set: { name: sql`EXCLUDED.name` },
        })
        .returning({ id: tag.id });

      await tx
        .insert(noteTag)
        .values(upserted.map(({ id: tagId }) => ({ noteId: id, tagId })));
    }
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/notes/${id}`);
  redirect(`/dashboard/notes/${id}`);
}

export async function deleteNote(id: string) {
  const userId = await requireUserId();
  // note_tag rows cascade via FK; tag rows are intentionally preserved so the
  // user's autocomplete vocabulary survives note deletion.
  await db.delete(note).where(and(eq(note.id, id), eq(note.userId, userId)));
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
