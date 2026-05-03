import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTagSuggestions } from "@/lib/notes-queries";
import { createNote } from "../../actions";
import { NoteEditor } from "../note-editor";

export default async function NewNotePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const tagSuggestions = await getTagSuggestions(session.user.id);

  return (
    <>
      <h1 className="sr-only">New note</h1>
      <NoteEditor
        cardTitle="New note"
        cardDescription="Add a title, body, and any tags."
        submitLabel="Create"
        tagSuggestions={tagSuggestions}
        onSubmit={createNote}
      />
    </>
  );
}
