import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { note } from "@/lib/db/schema";
import { getTagSuggestions } from "@/lib/notes-queries";
import type { NoteInput } from "@/lib/notes-schema";
import { updateNote } from "../../../actions";
import { NoteEditor } from "../../note-editor";

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const [n, tagSuggestions] = await Promise.all([
    db.query.note.findFirst({
      where: and(eq(note.id, id), eq(note.userId, session.user.id)),
      with: { noteTags: { with: { tag: true } } },
    }),
    getTagSuggestions(session.user.id),
  ]);

  if (!n) notFound();

  const tags = n.noteTags.map((nt) => nt.tag.name).sort();

  async function saveThisNote(input: NoteInput) {
    "use server";
    return updateNote(id, input);
  }

  return (
    <>
      <h1 className="sr-only">Edit note</h1>
      <NoteEditor
        cardTitle="Edit note"
        cardDescription={`Last updated ${new Date(n.updatedAt).toLocaleString()}`}
        submitLabel="Save changes"
        initialValues={{ title: n.title, content: n.content, tags }}
        tagSuggestions={tagSuggestions}
        onSubmit={saveThisNote}
        cancelHref={`/dashboard/notes/${id}`}
      />
    </>
  );
}
