import { revokeToken } from "@/lib/services/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 7009 — token revocation. Always returns 200, even when the token
 * doesn't exist. The spec is explicit about this: a server "responds with
 * HTTP status code 200 if the token has been revoked successfully or if
 * the client submitted an invalid token" — leaking existence on revoke
 * would defeat the security goal.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return new Response(null, { status: 200 });
  }

  const token = params.token;
  if (typeof token === "string" && token.length > 0) {
    try {
      await revokeToken(token);
    } catch (e) {
      // Don't surface — RFC 7009 requires 200 on every reachable code path.
      console.error("[oauth] revoke error:", e);
    }
  }
  return new Response(null, { status: 200 });
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
