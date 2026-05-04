import { requireApiUser } from "@/lib/api/auth";
import { jsonError, mapError, serializeNote } from "@/lib/api/response";
import { deleteNote, getNote, updateNote } from "@/lib/services/notes";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiUser(request, ["notes:read"]);
    const { id } = await ctx.params;
    const note = await getNote(auth.userId, id);
    return Response.json(serializeNote(note));
  } catch (e) {
    return mapError(e);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiUser(request, ["notes:write"]);
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "bad_request", "Request body must be valid JSON.");
    }
    const note = await updateNote(
      { userId: auth.userId, principal: auth.principal },
      id,
      body,
    );
    return Response.json(serializeNote(note));
  } catch (e) {
    return mapError(e);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiUser(request, ["notes:write"]);
    const { id } = await ctx.params;
    await deleteNote(
      { userId: auth.userId, principal: auth.principal },
      id,
    );
    return new Response(null, { status: 204 });
  } catch (e) {
    return mapError(e);
  }
}
