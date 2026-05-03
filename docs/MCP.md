# MCP server

Lets agents (Claude Desktop, Claude Code, anything that speaks MCP) use this app's data.

The endpoint is mounted at `POST /api/mcp` inside the Next app — same process, same auth, same scopes as the REST API. There's **no separate process to install or run**. Configuration on the client side is just a URL and a Bearer header.

---

## Configure your client

### Claude Code (this repo's default)

The wiring is already in `.mcp.json` at the repo root, project-scoped, committed:

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

The `${CWA_API_KEY}` placeholder is wiring, not a secret. Each contributor supplies their own key via a gitignored file:

1. Sign in to the dev app and go to **Settings → API keys → Create**. Give it a name like `claude-code` and leave all three scopes checked. Copy the secret on the one-time reveal panel — it isn't shown again.

2. Copy the example into the gitignored slot:

   ```bash
   cp .claude/settings.local.example.json .claude/settings.local.json
   ```

3. Edit `.claude/settings.local.json` and paste the key:

   ```jsonc
   { "env": { "CWA_API_KEY": "cwa_..." } }
   ```

4. Restart Claude Code (or open a new session in this repo). Run `/mcp` — `create-webapp` should appear under "Project MCPs" with status `connected`.

If it shows `failed: 401`, the env var didn't expand. Most common cause: dev server isn't running, port mismatch (`:3001` vs `:3000`), or the key is for the test database (`./pgdata-test`) instead of dev (`./pgdata`).

For read-only agents, generate a key with only `notes:read` and `tags:read` checked — the same `.mcp.json` wiring works, the scope just narrows what the tools can do.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) — paste the key inline since Desktop doesn't read `.claude/settings.local.json`:

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

- `src/app/api/mcp/route.ts` — Next Route Handler. Authenticates via `Authorization: Bearer ...`, builds a per-request `McpServer`, hands the Web `Request` to `WebStandardStreamableHTTPServerTransport`, returns its `Response`.
- `src/lib/mcp/server.ts` — `buildMcpServer(auth)` registers all six tools. Each tool calls `assertScopes(auth, [...])`, then a service function (`createNote`, `listNotes`, etc.), then returns the result as a tool response.

REST and MCP are **peer adapters** on top of the same service layer. Neither stacks on the other. Same `requireApiUser`, same scope model, same error envelope.

Stateless mode is on: no session IDs, no in-memory state across requests. Each POST is fully self-contained. That's the right choice for a tool-only server — sessions matter when you're streaming or pushing notifications, neither of which we do.

---

## Local development

The dev server already serves `/api/mcp` — no extra command. Point your agent at `http://localhost:3000/api/mcp` and it works.

To verify by hand:

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

The `tests/e2e/mcp.spec.ts` Playwright suite is the canonical regression coverage — auth, scopes, full CRUD, validation, tag listing.

---

## Versioning

`@modelcontextprotocol/sdk` is **pinned to an exact version** in `package.json`. The MCP spec is still moving; we want bumps to be a deliberate edit, not a side effect of `npm update`. When upgrading: read the SDK changelog, run the e2e suite, update this doc if the wire shape changed.
