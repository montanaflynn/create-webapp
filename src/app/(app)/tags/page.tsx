import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { noteTag, tag } from "@/lib/db/schema";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";

export default async function TagsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const rows = await db
    .select({
      name: tag.name,
      count: sql<number>`count(${noteTag.noteId})::int`,
    })
    .from(tag)
    .leftJoin(noteTag, eq(noteTag.tagId, tag.id))
    .where(eq(tag.userId, session.user.id))
    .groupBy(tag.id, tag.name)
    .orderBy(tag.name);

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "Tags you use on notes will show up here."
            : `${rows.length} tag${rows.length === 1 ? "" : "s"} across your notes.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              Add tags to a note in the editor — they&apos;ll appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <li key={t.name}>
              <Link
                href={`/dashboard?tag=${encodeURIComponent(t.name)}`}
                className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <span className="truncate font-medium">{t.name}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {t.count} {t.count === 1 ? "note" : "notes"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
