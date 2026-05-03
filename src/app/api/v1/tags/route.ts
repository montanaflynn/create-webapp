import { requireApiUser } from "@/lib/api/auth";
import { mapError, serializeTag } from "@/lib/api/response";
import { listTagsWithCounts } from "@/lib/services/tags";

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request, ["tags:read"]);
    const tags = await listTagsWithCounts(auth.userId);
    return Response.json({ tags: tags.map(serializeTag) });
  } catch (e) {
    return mapError(e);
  }
}
