import { SCOPES } from "@/lib/services/api-keys";

export const dynamic = "force-static";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata. The /api/mcp 401's
 * WWW-Authenticate header points clients at this URL so they can discover
 * which authorization server to use for this resource.
 */
export function GET() {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
  });
}
