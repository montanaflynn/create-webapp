import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findNote } from "@/lib/services/notes";
import { listTagSuggestions } from "@/lib/services/tags";
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
    findNote(session.user.id, id),
    listTagSuggestions(session.user.id),
  ]);

  if (!n) notFound();

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
        initialValues={{ title: n.title, content: n.content, tags: n.tags }}
        tagSuggestions={tagSuggestions}
        onSubmit={saveThisNote}
        cancelHref={`/dashboard/notes/${id}`}
      />
    </>
  );
}
