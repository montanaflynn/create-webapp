"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import * as notes from "@/lib/services/notes";
import { NotFoundError, ValidationError } from "@/lib/services/errors";
import type { NoteInput } from "@/lib/notes-schema";

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createNote(input: NoteInput) {
  const userId = await requireUserId();
  try {
    await notes.createNote(userId, input);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateNote(id: string, input: NoteInput) {
  const userId = await requireUserId();
  try {
    await notes.updateNote(userId, id, input);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    // Bail silently if the note didn't exist or wasn't owned by this user —
    // the destination page will render notFound().
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/notes/${id}`);
  redirect(`/dashboard/notes/${id}`);
}

export async function deleteNote(id: string) {
  const userId = await requireUserId();
  try {
    await notes.deleteNote(userId, id);
  } catch (e) {
    // Idempotent from the caller's perspective.
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
