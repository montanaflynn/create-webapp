import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagsCell } from "./tags-cell";

export type SortColumn = "title" | "created" | "updated";
export type SortDir = "asc" | "desc";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

type NoteTableProps = {
  notes: Note[];
  sort: SortColumn;
  dir: SortDir;
  tagFilter?: string | null;
};

function ariaSortFor(
  column: SortColumn,
  sort: SortColumn,
  dir: SortDir,
): "none" | "ascending" | "descending" {
  if (sort !== column) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function NoteTable({ notes, sort, dir, tagFilter }: NoteTableProps) {
  return (
    <div className="rounded-lg border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              className="w-[55%]"
              aria-sort={ariaSortFor("title", sort, dir)}
            >
              <SortLink
                column="title"
                label="Title"
                defaultDir="asc"
                sort={sort}
                dir={dir}
                tagFilter={tagFilter}
              />
            </TableHead>
            <TableHead className="hidden w-1/4 sm:table-cell">Tags</TableHead>
            <TableHead
              className="w-[20%]"
              aria-sort={ariaSortFor("updated", sort, dir)}
            >
              <SortLink
                column="updated"
                label="Updated"
                defaultDir="desc"
                sort={sort}
                dir={dir}
                tagFilter={tagFilter}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map((note) => (
            <TableRow key={note.id} className="relative">
              <TableCell className="truncate font-medium">
                <Link
                  href={`/dashboard/notes/${note.id}`}
                  title={note.title}
                  className="after:absolute after:inset-0 after:content-['']"
                >
                  {note.title}
                </Link>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <TagsCell tags={note.tags} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(note.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortLink({
  column,
  label,
  defaultDir,
  sort,
  dir,
  tagFilter,
}: {
  column: SortColumn;
  label: string;
  defaultDir: SortDir;
  sort: SortColumn;
  dir: SortDir;
  tagFilter?: string | null;
}) {
  const active = sort === column;
  const nextDir: SortDir = active
    ? dir === "asc"
      ? "desc"
      : "asc"
    : defaultDir;

  // Build the link URL. We omit sort/dir params when the next state matches
  // the page's defaults (sort=updated + dir=desc), so the common case stays
  // a clean `/dashboard?view=table`. Page is intentionally omitted (sort
  // change resets to page 1). Tag filter is preserved.
  const params = new URLSearchParams();
  params.set("view", "table");
  if (tagFilter) params.set("tag", tagFilter);
  if (!(column === "updated" && nextDir === "desc")) {
    params.set("sort", column);
    params.set("dir", nextDir);
  }
  const href = `/dashboard?${params.toString()}`;

  const Arrow = active
    ? dir === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <Arrow
        className={cn(
          "size-3.5 shrink-0",
          active ? "opacity-100" : "opacity-40",
        )}
      />
    </Link>
  );
}
