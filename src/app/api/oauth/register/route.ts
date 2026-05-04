import { dcrRateLimiter, getClientIp } from "@/lib/api/rate-limit";
import { registerClient } from "@/lib/services/oauth";
import { ValidationError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration. Open per the MCP spec
 * (clients can register without prior credentials), throttled per IP via
 * a tight bucket separate from per-credential limits.
 *
 * Returns the OAuth-spec response shape directly (snake_case, no error
 * envelope) — this endpoint is consumed by spec-compliant OAuth clients,
 * not the app's own UI.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const decision = await dcrRateLimiter.consume(`dcr:${ip}`);
  if (!decision.ok) {
    return Response.json(
      { error: "too_many_requests", error_description: "Registration rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(decision.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const input = body as { redirect_uris?: unknown; client_name?: unknown };

  try {
    const client = await registerClient({
      redirectUris: input.redirect_uris,
      clientName: input.client_name,
    });
    return Response.json(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return Response.json(
        {
          error: "invalid_client_metadata",
          error_description: e.message,
        },
        { status: 400 },
      );
    }
    console.error("[oauth] register error:", e);
    return Response.json(
      { error: "server_error", error_description: "Internal error." },
      { status: 500 },
    );
  }
}
