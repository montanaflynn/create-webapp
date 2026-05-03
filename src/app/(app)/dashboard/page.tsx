import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { XIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { listNotes, type NoteSort, type SortDir } from "@/lib/services/notes";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";
import { NoteCard } from "./note-card";
import { NoteTable } from "./note-table";
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
  const sort: NoteSort =
    sortParam === "title" || sortParam === "created" ? sortParam : "updated";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  const tagFilter = tagParam?.trim() || null;
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const { notes, total, page, totalPages } = await listNotes(session.user.id, {
    tag: tagFilter,
    sort,
    dir,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  });

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
