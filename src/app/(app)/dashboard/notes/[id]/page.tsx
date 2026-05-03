import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { findNote } from "@/lib/services/notes";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { DeleteNoteButton } from "../delete-button";

export default async function ViewNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const n = await findNote(session.user.id, id);
  if (!n) notFound();

  const wasEdited = n.updatedAt.getTime() !== n.createdAt.getTime();

  return (
    <article className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="mr-1 size-4" />
        All notes
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{n.title}</h1>
          <p className="text-xs text-muted-foreground">
            {wasEdited ? "Updated" : "Created"} {formatDateTime(n.updatedAt)}
            {wasEdited && ` · Created ${formatDateTime(n.createdAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/notes/${id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            Edit
          </Link>
          <DeleteNoteButton id={id} />
        </div>
      </div>

      {n.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {n.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              render={
                <Link href={`/dashboard?tag=${encodeURIComponent(tag)}`} />
              }
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {n.content && (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {n.content}
        </div>
      )}
    </article>
  );
}
