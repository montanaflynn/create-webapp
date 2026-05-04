# MCP server

Lets agents (Claude Desktop, Claude Code, anything that speaks MCP) use this app's data.

The endpoint is mounted at `POST /api/mcp` inside the Next app — same process, same service layer, same scopes as the REST API. There's **no separate process to install or run**.

Two auth paths are supported, in order of preference:

1. **OAuth 2.1 + PKCE** — interactive, browser-based, no key copy-paste. The right shape for end users on fresh machines.
2. **Bearer API key** — long-lived `cwa_...` token, manually pasted into the client config. The right shape for CI, scripts, and clients (like Claude Desktop) that don't speak OAuth yet.

---

## Configure your client

### Claude Code via OAuth (preferred)

```bash
claude mcp add --transport http create-webapp http://localhost:3000/api/mcp
```

Run `/mcp` and pick **create-webapp**. Claude follows the `WWW-Authenticate` header on the first 401, opens a browser, and the consent screen lists the requested scopes. Authorize → Claude stores the token → you're connected.

**No `Authorization` header in the config.** That's the whole point of OAuth on MCP — discovery + dynamic client registration + the consent flow replace the manual paste.

Revoke at any time from **Settings → MCP clients**. The token dies immediately on the server side.

See **`docs/OAUTH.md`** for the full endpoint reference (discovery URLs, register/authorize/token/revoke).

### Claude Code via Bearer key (CI / scripted use)

The committed `.mcp.json` already wires the Bearer path:

```jsonc
// .mcp.json
{
  "mcpServers": {
    "create-webapp": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${CWA_API_KEY}" }
    }
  }
}
```

To activate it:

1. **Settings → API keys → Create** in the dev app. Copy the `cwa_...` secret on the reveal banner — it isn't shown again.

2. ```bash
   cp .claude/settings.local.example.json .claude/settings.local.json
   ```

3. Edit `.claude/settings.local.json`:

   ```jsonc
   { "env": { "CWA_API_KEY": "cwa_..." } }
   ```

4. Restart Claude Code. Run `/mcp` — `create-webapp` should show `connected`.

If it shows `failed: 401`, the env var didn't expand. Most common cause: dev server isn't running, port mismatch, or the key is for the test database.

For read-only agents, create a key with only `notes:read` and `tags:read` checked.

### Claude Desktop

Claude Desktop's MCP client doesn't yet do OAuth, so paste a Bearer key inline at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "create-webapp": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer cwa_..."
      }
    }
  }
}
```

---

## Tools

| Tool | Scope | Behavior |
| ---- | ----- | -------- |
| `notes_list` | `notes:read` | List notes; supports `tag`, `sort`, `dir`, `page`, `pageSize` |
| `notes_get` | `notes:read` | Fetch one note by id |
| `notes_create` | `notes:write` | Create a note. Returns the created note |
| `notes_update` | `notes:write` | Replace a note's fields. All fields required (no partial updates in v1) |
| `notes_delete` | `notes:write` | Delete a note. Tag rows are preserved |
| `tags_list` | `tags:read` | List tags with note counts (orphan tags included) |

Each tool returns both `content[0].text` (JSON-stringified result) and `structuredContent` (the same data as a typed object). Clients that don't support structured content fall back to text — it's the same payload either way.

Errors come back as `isError: true` tool results. The text body is `{ "error": { "code", "message" } }` with the same stable codes the REST API uses (`unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `internal_error`).

---

## Architecture

The MCP server is **not** a separate process or service:

- `src/app/api/mcp/route.ts` — Next Route Handler. Authenticates via `Authorization: Bearer ...` (accepts both `cwa_` API keys and `oat_acc_` OAuth access tokens), builds a per-request `McpServer`, hands the Web `Request` to `WebStandardStreamableHTTPServerTransport`, returns its `Response`. Emits `WWW-Authenticate` on 401 so OAuth-aware clients can auto-discover the authorization server.
- `src/lib/mcp/server.ts` — `buildMcpServer(auth)` registers all six tools. Each tool calls `assertScopes(auth, [...])`, then a service function (`createNote`, `listNotes`, etc.), then returns the result as a tool response.

REST and MCP are **peer adapters** on top of the same service layer. Neither stacks on the other. Same `requireApiUser`, same scope model, same error envelope. The auth layer takes either credential shape and produces the same `VerifiedPrincipal` — adapters don't branch on which authenticator ran.

Stateless mode is on: no session IDs, no in-memory state across requests. Each POST is fully self-contained. That's the right choice for a tool-only server — sessions matter when you're streaming or pushing notifications, neither of which we do.

---

## Local development

The dev server already serves `/api/mcp` — no extra command. Point your agent at `http://localhost:3000/api/mcp` and it works.

To verify the OAuth path by hand, see `docs/OAUTH.md`.

To verify the Bearer path:

```bash
KEY=$(cat tests/e2e/.api-keys.json | jq -r '."test-full"')

# initialize
curl -sX POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' | jq

# list tools
curl -sX POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq

# call notes_list
curl -sX POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"notes_list","arguments":{}}}' | jq
```

The `tests/e2e/mcp.spec.ts` and `tests/e2e/oauth.spec.ts` Playwright suites are the canonical regression coverage — auth, scopes, full CRUD, OAuth flow, validation, tag listing.

---

## Versioning

`@modelcontextprotocol/sdk` is **pinned to an exact version** in `package.json`. The MCP spec is still moving; we want bumps to be a deliberate edit, not a side effect of `npm update`. When upgrading: read the SDK changelog, run the e2e suite, update this doc if the wire shape changed.
