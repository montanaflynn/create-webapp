import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { XIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { note, noteTag, tag } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";
import { NoteCard } from "./note-card";
import { NoteTable, type SortColumn, type SortDir } from "./note-table";
import { Pagination } from "./pagination";
import { ViewToggle, type NotesView } from "./view-toggle";

const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    sort?: string;
    dir?: string;
    page?: string;
    tag?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const {
    view: viewParam,
    sort: sortParam,
    dir: dirParam,
    page: pageParam,
    tag: tagParam,
  } = await searchParams;
  const view: NotesView = viewParam === "table" ? "table" : "card";
  const sort: SortColumn =
    sortParam === "title" || sortParam === "created" ? sortParam : "updated";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  const tagFilter = tagParam?.trim() || null;

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
      .where(
        and(eq(tag.userId, session.user.id), eq(tag.name, tagFilter)),
      );
    filteredIds = matches.map((r) => r.noteId);
  }

  const total = filteredIds
    ? filteredIds.length
    : (
        await db
          .select({ total: sql<number>`count(*)::int` })
          .from(note)
          .where(eq(note.userId, session.user.id))
      )[0].total;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const page = Math.min(requestedPage, totalPages);

  const whereClause = filteredIds
    ? filteredIds.length === 0
      ? sql`false` // tag exists but matches nothing in this user's notes
      : and(eq(note.userId, session.user.id), inArray(note.id, filteredIds))
    : eq(note.userId, session.user.id);

  const rows = await db.query.note.findMany({
    where: whereClause,
    orderBy: dir === "asc" ? asc(sortColumn) : desc(sortColumn),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    with: {
      noteTags: { with: { tag: true } },
    },
  });

  const notes = rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    tags: n.noteTags.map((nt) => nt.tag.name).sort(),
  }));

  // Params we want pagination + sort links to carry forward.
  const preserve: Record<string, string> = {};
  if (view === "table") preserve.view = "table";
  if (sort !== "updated") preserve.sort = sort;
  if (dir !== "desc") preserve.dir = dir;
  if (tagFilter) preserve.tag = tagFilter;

  // URL that clears the tag filter, keeping everything else (page resets).
  const clearTagParams = new URLSearchParams();
  if (view === "table") clearTagParams.set("view", "table");
  if (sort !== "updated") clearTagParams.set("sort", sort);
  if (dir !== "desc") clearTagParams.set("dir", dir);
  const clearTagHref = clearTagParams.toString()
    ? `/dashboard?${clearTagParams}`
    : "/dashboard";

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} />
          <Link href="/dashboard/notes/new" className={buttonVariants()}>
            New note
          </Link>
        </div>
      </div>

      {tagFilter && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filtered by</span>
          <Badge variant="secondary">
            {tagFilter}
            <Link
              href={clearTagHref}
              aria-label="Clear tag filter"
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </Link>
          </Badge>
        </div>
      )}

      {total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              {tagFilter
                ? `No notes with tag "${tagFilter}" yet.`
                : "Start by creating your first note."}
            </EmptyDescription>
          </EmptyHeader>
          {!tagFilter && (
            <EmptyContent>
              <Link
                href="/dashboard/notes/new"
                className={buttonVariants()}
              >
                New note
              </Link>
            </EmptyContent>
          )}
        </Empty>
      ) : view === "table" ? (
        <NoteTable
          notes={notes}
          sort={sort}
          dir={dir}
          tagFilter={tagFilter}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} preserve={preserve} />
    </>
  );
}
