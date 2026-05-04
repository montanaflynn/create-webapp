import { requireApiUser } from "@/lib/api/auth";
import {
  jsonError,
  mapError,
  serializeNote,
} from "@/lib/api/response";
import {
  createNote,
  listNotes,
  type NoteSort,
  type SortDir,
} from "@/lib/services/notes";

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request, ["notes:read"]);
    const url = new URL(request.url);

    const sortParam = url.searchParams.get("sort");
    const sort: NoteSort =
      sortParam === "title" || sortParam === "created" ? sortParam : "updated";
    const dir: SortDir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
    const page = parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
    const pageSizeRaw = parseInt(url.searchParams.get("pageSize") ?? "10", 10);
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 10;

    const result = await listNotes(auth.userId, {
      tag: url.searchParams.get("tag"),
      sort,
      dir,
      page,
      pageSize,
    });

    return Response.json({
      notes: result.notes.map(serializeNote),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (e) {
    return mapError(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(request, ["notes:write"]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "bad_request", "Request body must be valid JSON.");
    }
    const note = await createNote(
      { userId: auth.userId, principal: auth.principal },
      body,
    );
    return Response.json(serializeNote(note), { status: 201 });
  } catch (e) {
    return mapError(e);
  }
}
