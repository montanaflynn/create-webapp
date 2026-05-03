import Link from "next/link";
import { formatDateTime } from "@/lib/utils";
import { TagsCell } from "./tags-cell";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: Date;
};

export function NoteCard({ note }: { note: Note }) {
  return (
    <li className="relative min-w-0 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      {/* The title/body Link has an ::after that covers the whole card —
          everything else is clickable through it, except elements that mark
          themselves `relative` (the tag chips below). */}
      <Link
        href={`/dashboard/notes/${note.id}`}
        className="block after:absolute after:inset-0 after:rounded-lg after:content-['']"
      >
        <h2 className="truncate font-medium" title={note.title}>
          {note.title}
        </h2>
        {note.content && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {note.content}
          </p>
        )}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-4">
        {/* `min-w-0 flex-1` lets the TagsCell take remaining space (after the
            date) and shrink below its chip content's intrinsic width — that's
            what enables its overflow → "+N" measurement. */}
        <div className="min-w-0 flex-1">
          <TagsCell tags={note.tags} />
        </div>
        <time className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(note.updatedAt)}
        </time>
      </div>
    </li>
  );
}
