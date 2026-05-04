import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireApiUser } from "@/lib/api/auth";
import { mapError } from "@/lib/api/response";
import { buildMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/**
 * MCP endpoint over Streamable HTTP. Stateless — each POST builds a per-
 * request server bound to the verified API key. Tool authorization is
 * checked per-call via `assertScopes` inside `buildMcpServer`.
 *
 * Configuration on the client side is just a URL + Bearer header:
 *
 *   {
 *     "mcpServers": {
 *       "create-webapp": {
 *         "type": "http",
 *         "url": "http://localhost:3000/api/mcp",
 *         "headers": { "Authorization": "Bearer cwa_..." }
 *       }
 *     }
 *   }
 */
async function handle(request: Request): Promise<Response> {
  let auth;
  try {
    // `challenge: true` makes 401 responses include a WWW-Authenticate header
    // that points OAuth-aware MCP clients at /.well-known/oauth-protected-resource
    // for discovery. Bearer-only clients (CLIs that already paste a key) just
    // see a plain 401.
    auth = await requireApiUser(request, [], { challenge: true });
  } catch (e) {
    return mapError(e);
  }

  const server = buildMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
