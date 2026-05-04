import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { note, noteTag, tag } from "@/lib/db/schema";
import { noteInputSchema, type NoteInput } from "@/lib/notes-schema";
import { recordAudit, type Actor } from "./audit";
import { NotFoundError, ValidationError } from "./errors";

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
};

export type NoteSort = "title" | "created" | "updated";
export type SortDir = "asc" | "desc";

export type ListNotesFilter = {
  tag?: string | null;
  sort?: NoteSort;
  dir?: SortDir;
  page?: number;
  pageSize?: number;
};

export type ListNotesResult = {
  notes: Note[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export async function listNotes(
  userId: string,
  filter: ListNotesFilter = {},
): Promise<ListNotesResult> {
  const sort: NoteSort = filter.sort ?? "updated";
  const dir: SortDir = filter.dir ?? "desc";
  const pageSize = Math.min(
    Math.max(1, filter.pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const tagFilter = filter.tag?.trim() || null;

  const sortColumn =
    sort === "title"
      ? note.title
      : sort === "created"
        ? note.createdAt
        : note.updatedAt;

  // When filtering by tag, fetch the matching note IDs first. The notes query
  // then runs with `inArray(note.id, ids)` — keeps sort + pagination in SQL
  // while letting Drizzle's relational query stay simple.
  let filteredIds: string[] | null = null;
  if (tagFilter) {
    const matches = await db
      .select({ noteId: noteTag.noteId })
      .from(noteTag)
      .innerJoin(tag, eq(tag.id, noteTag.tagId))
      .where(and(eq(tag.userId, userId), eq(tag.name, tagFilter)));
    filteredIds = matches.map((r) => r.noteId);
  }

  const total = filteredIds
    ? filteredIds.length
    : (
        await db
          .select({ total: sql<number>`count(*)::int` })
          .from(note)
          .where(eq(note.userId, userId))
      )[0].total;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.max(1, filter.page ?? 1);
  const page = Math.min(requestedPage, totalPages);

  const whereClause = filteredIds
    ? filteredIds.length === 0
      ? sql`false` // tag exists but matches nothing in this user's notes
      : and(eq(note.userId, userId), inArray(note.id, filteredIds))
    : eq(note.userId, userId);

  const rows = await db.query.note.findMany({
    where: whereClause,
    orderBy: dir === "asc" ? asc(sortColumn) : desc(sortColumn),
    limit: pageSize,
    offset: (page - 1) * pageSize,
    with: { noteTags: { with: { tag: true } } },
  });

  return {
    notes: rows.map(toNote),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function findNote(
  userId: string,
  id: string,
): Promise<Note | null> {
  const row = await db.query.note.findFirst({
    where: and(eq(note.id, id), eq(note.userId, userId)),
    with: { noteTags: { with: { tag: true } } },
  });
  return row ? toNote(row) : null;
}

export async function getNote(userId: string, id: string): Promise<Note> {
  const n = await findNote(userId, id);
  if (!n) throw new NotFoundError("note", id);
  return n;
}

export async function createNote(
  actor: Actor,
  input: unknown,
): Promise<Note> {
  const { title, content, tags } = parseAndNormalize(input);
  const noteId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .insert(note)
      .values({ id: noteId, userId: actor.userId, title, content });
    if (tags.length > 0) await upsertTagsAndLink(tx, actor.userId, noteId, tags);
    await recordAudit(tx, actor, "note.create", {
      type: "note",
      id: noteId,
      metadata: { title, tagCount: tags.length },
    });
  });

  return getNote(actor.userId, noteId);
}

export async function updateNote(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<Note> {
  const { title, content, tags } = parseAndNormalize(input);

  const ok = await db.transaction(async (tx) => {
    const updated = await tx
      .update(note)
      .set({ title, content, updatedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, actor.userId)))
      .returning({ id: note.id });

    if (updated.length === 0) return false;

    // Replace links wholesale — simpler than diffing, atomic inside the tx.
    await tx.delete(noteTag).where(eq(noteTag.noteId, id));
    if (tags.length > 0) await upsertTagsAndLink(tx, actor.userId, id, tags);
    await recordAudit(tx, actor, "note.update", {
      type: "note",
      id,
      metadata: { title, tagCount: tags.length },
    });
    return true;
  });

  if (!ok) throw new NotFoundError("note", id);
  return getNote(actor.userId, id);
}

export async function deleteNote(actor: Actor, id: string): Promise<void> {
  // note_tag rows cascade via FK; tag rows are intentionally preserved so the
  // user's autocomplete vocabulary survives note deletion.
  await db.transaction(async (tx) => {
    const result = await tx
      .delete(note)
      .where(and(eq(note.id, id), eq(note.userId, actor.userId)))
      .returning({ id: note.id });
    if (result.length === 0) throw new NotFoundError("note", id);
    await recordAudit(tx, actor, "note.delete", { type: "note", id });
  });
}

// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parseAndNormalize(input: unknown): {
  title: string;
  content: string;
  tags: string[];
} {
  const result = noteInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        path: i.path.map(String),
        message: i.message,
      })),
    );
  }
  return normalize(result.data);
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

async function upsertTagsAndLink(
  tx: Tx,
  userId: string,
  noteId: string,
  tags: string[],
): Promise<void> {
  // Upsert tags and grab IDs in one round-trip. The no-op `set` on conflict
  // makes RETURNING fire for already-existing rows too — that's the canonical
  // pg-upsert-and-read-ids pattern.
  const upserted = await tx
    .insert(tag)
    .values(tags.map((name) => ({ id: crypto.randomUUID(), userId, name })))
    .onConflictDoUpdate({
      target: [tag.userId, tag.name],
      set: { name: sql`EXCLUDED.name` },
    })
    .returning({ id: tag.id });

  await tx
    .insert(noteTag)
    .values(upserted.map(({ id }) => ({ noteId, tagId: id })));
}

function toNote(row: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  noteTags: { tag: { name: string } }[];
}): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: row.noteTags.map((nt) => nt.tag.name).sort(),
  };
}
