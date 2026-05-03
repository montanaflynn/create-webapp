import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listTagSuggestions } from "@/lib/services/tags";
import { createNote } from "../../actions";
import { NoteEditor } from "../note-editor";

export default async function NewNotePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const tagSuggestions = await listTagSuggestions(session.user.id);

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
