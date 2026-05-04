import { SCOPES } from "@/lib/services/api-keys";

export const dynamic = "force-static";

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata. The MCP spec
 * (revision 2025-06-18) tells clients to look here after a 401 to discover
 * the authorize/token/registration endpoints. The shape is fixed by the
 * spec; resist the urge to add app-specific fields.
 */
export function GET() {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
