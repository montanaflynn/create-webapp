# MCP server

Lets agents (Claude Code, Codex, Claude Desktop — anything that speaks MCP) use this app's data.

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

Claude Code enables the server on add and triggers the OAuth flow on the first tool call: it follows the `WWW-Authenticate` header on the initial 401, opens a browser, and the consent screen lists the requested scopes. Authorize → Claude stores the token → you're connected.

**No `Authorization` header in the config.** That's the whole point of OAuth on MCP — discovery + dynamic client registration + the consent flow replace the manual paste.

Revoke at any time from **Settings → MCP clients**. The token dies immediately on the server side.

See **`docs/OAUTH.md`** for the full endpoint reference (discovery URLs, register/authorize/token/revoke).

### Codex via OAuth

```bash
codex mcp add create-webapp --url http://localhost:3000/api/mcp
```

Codex opens the browser immediately for the OAuth flow. After you click Authorize, the token is stored in `~/.codex/config.toml` and `codex mcp list` will show `create-webapp` as connected.

The Codex CLI and Codex IDE extension share `~/.codex/config.toml`, so this one-time setup covers both.

### OpenCode via OAuth

```bash
opencode mcp add                          # interactive walkthrough
opencode mcp auth create-webapp           # triggers the OAuth browser flow
```

`opencode mcp add` is interactive (no `--url` or other flags — every value comes from prompts). Pick **remote**, name it `create-webapp`, enter `http://localhost:3000/api/mcp`, answer **Yes** to "requires OAuth". That writes the config to `opencode.json`.

The OAuth handshake itself is a separate explicit step. `opencode mcp auth create-webapp` does RFC 7591 dynamic client registration, opens the browser for consent, and stores the resulting token at `~/.local/share/opencode/mcp-auth.json`.

If you'd rather edit the config directly, drop this into `opencode.json` at the repo root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "create-webapp": {
      "type": "remote",
      "url": "http://localhost:3000/api/mcp",
      "oauth": {}
    }
  }
}
```

The empty `"oauth": {}` is the magic — it tells OpenCode to discover OAuth from `WWW-Authenticate` rather than expecting a static Bearer header.

### Other clients via OAuth (`npx add-mcp`)

[`add-mcp`](https://github.com/neondatabase/add-mcp) is a Neon-maintained CLI that auto-detects installed MCP clients and writes the right config snippet for each:

```bash
npx add-mcp http://localhost:3000/api/mcp
```

Supports 13+ agents: Antigravity, Claude Code, Claude Desktop, Cline (CLI + VSCode), Codex, Cursor, Gemini CLI, Goose, GitHub Copilot CLI, MCPorter, OpenCode, VS Code, Zed. No `--header` needed for our server because OAuth discovery handles auth on its own. The handshake runs per-client on first tool call.

For per-client commands or config-file snippets, see each client's own MCP setup docs — `add-mcp` is a convenience layer, not a requirement.

### Bearer key (CI / scripted use, Claude Desktop)

For non-interactive clients, generate a long-lived API key and paste it into the client's MCP config.

1. **Settings → API keys → Create** in the dev app. Pick the scopes the agent actually needs (read-only agents only need `notes:read` + `tags:read`). Copy the `cwa_...` secret on the reveal banner — it isn't shown again.

2. Add an entry to your client's MCP config that includes the Bearer header.

#### Claude Code

Project-scoped via `.mcp.json` at the repo root:

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

Then make the env var available to the project:

```bash
cp .claude/settings.local.example.json .claude/settings.local.json
# edit .claude/settings.local.json:
# { "env": { "CWA_API_KEY": "cwa_..." } }
```

Restart Claude Code. Run `/mcp` — `create-webapp` should show `connected`. If it shows `failed: 401`, the env var didn't expand (dev server stopped, port mismatch, or the key is for the test database).

#### Codex

```toml
# ~/.codex/config.toml
[mcp_servers.create-webapp]
url = "http://localhost:3000/api/mcp"
bearer_token_env_var = "CWA_API_KEY"
```

Export `CWA_API_KEY` in the shell that launches Codex.

#### Claude Desktop

Claude Desktop's MCP client doesn't yet do OAuth. Paste the Bearer key inline at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

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
