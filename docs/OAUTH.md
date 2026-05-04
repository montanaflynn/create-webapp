# OAuth 2.1 + PKCE

This app implements OAuth 2.1 with PKCE on top of the same service layer that powers REST and MCP. The primary use case is **interactive MCP clients** (Claude Code) authorizing against `/api/mcp` without ever pasting a Bearer key — the `WWW-Authenticate` header on a 401 points the client at the discovery URL, and the rest of the dance is automatic.

You don't normally need to touch these endpoints by hand. Spec-compliant OAuth clients (the MCP SDK in Claude Code, MCP Inspector, etc.) drive the whole flow once they know the resource URL.

---

## Discovery

| URL | What |
| --- | --- |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 — names the authorization server for `/api/mcp` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 — endpoints, scopes, supported grant types |

Both return JSON. They're the entry points: an MCP client hits `/api/mcp`, gets a 401 with `WWW-Authenticate: Bearer realm="create-webapp", resource_metadata="<protected-resource URL>"`, follows the metadata to the authorization-server URL, and reads the rest of the endpoints from there.

```bash
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq
```

---

## Endpoints

### `POST /api/oauth/register` — Dynamic Client Registration (RFC 7591)

Open per the MCP spec. Throttled per IP (10 burst, 1/min sustained) — a separate bucket from the per-credential limit, so abusing this endpoint can't drain a real user's budget.

```bash
curl -sX POST http://localhost:3000/api/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["http://127.0.0.1:9999/callback"],
    "client_name": "My MCP client"
  }'
```

Response:

```json
{
  "client_id": "oac_abcd1234...",
  "client_name": "My MCP client",
  "redirect_uris": ["http://127.0.0.1:9999/callback"],
  "client_id_issued_at": 1737000000,
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

**Public clients only.** No `client_secret` is issued; PKCE replaces it. `redirect_uris` are validated at registration:

- `http://localhost:*` and `http://127.0.0.1:*` allowed (loopback CLI clients)
- `https://...` allowed
- Wildcards, fragments, and other schemes rejected

### `GET /api/oauth/authorize` — Consent screen

Browser endpoint. Required query params: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`. Optional: `scope` (space-separated; defaults to all), `state`.

If the user isn't signed in, the page redirects to `/sign-in?redirect=...` and resumes after authentication. The consent screen lists the requesting client by name and the requested scopes with friendly labels. Clicking **Authorize** redirects to `<redirect_uri>?code=<code>&state=<state>`. Clicking **Deny** redirects to `<redirect_uri>?error=access_denied&state=<state>`.

The authorization code is single-use and expires in 10 minutes. PKCE is mandatory: only `S256` is supported.

### `POST /api/oauth/token` — Token exchange + refresh

Accepts `application/x-www-form-urlencoded` (RFC 6749 default) or `application/json`. Branches on `grant_type`:

#### `grant_type=authorization_code`

```bash
curl -sX POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "oac_code_...",
    "code_verifier": "<original PKCE verifier>",
    "client_id": "oac_...",
    "redirect_uri": "http://127.0.0.1:9999/callback"
  }' | jq
```

Response:

```json
{
  "access_token": "oat_acc_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "oat_rfr_...",
  "scope": "notes:read notes:write tags:read"
}
```

#### `grant_type=refresh_token`

```bash
curl -sX POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "oat_rfr_...",
    "client_id": "oac_..."
  }' | jq
```

Returns a fresh access + refresh pair in the same shape. **Refresh tokens rotate**: the old `oat_rfr_...` is invalidated atomically when the new pair is issued. Replaying it returns `invalid_grant`.

### `POST /api/oauth/revoke` — RFC 7009 revocation

Accepts either an access or refresh token. Always returns 200 — the spec is explicit that revoking an unknown token must not leak existence. Idempotent.

```bash
curl -sX POST http://localhost:3000/api/oauth/revoke \
  -H "Content-Type: application/json" \
  -d '{ "token": "oat_acc_..." }'
```

The user-facing **Settings → Connected apps → Revoke** button calls a different code path (it knows the user's identity, so it records `oauth.token.revoke` to the audit log with a real actor; the RFC 7009 endpoint can't, since it's reachable without authentication).

---

## Scopes

Same set as the REST/MCP API:

| Scope | Lets the client |
| --- | --- |
| `notes:read` | List, filter, paginate, and read notes |
| `notes:write` | Create, edit, and delete notes |
| `tags:read` | List tags with usage counts |

Scopes requested at `/api/oauth/authorize` are surfaced verbatim on the consent screen. Granting a scope at consent time means it's encoded into the issued token; the server enforces it on every tool/REST call.

---

## TTLs

| Credential | TTL | Notes |
| --- | --- | --- |
| Authorization code | 10 minutes | Single-use, PKCE-bound |
| Access token | 1 hour | Bearer at `/api/mcp` and `/api/v1/*` |
| Refresh token | 30 days | Single-use; rotates on every use |

Tunables live as constants at the top of `src/lib/services/oauth.ts`. They're not env-configurable on purpose — these values are well-tuned defaults, and changing them per-deploy invites drift between environments.

---

## Error codes

OAuth endpoints return the spec-mandated `{ "error": "<code>", "error_description": "<text>" }` shape (intentionally different from the rest of the API's `{ "error": { code, message } }` envelope — spec-compliant clients parse the OAuth shape).

| HTTP | error | When |
| --- | --- | --- |
| 400 | `invalid_request` | Missing required parameter |
| 400 | `invalid_grant` | Code expired/used/PKCE mismatch, refresh token invalid/used/expired, redirect_uri mismatch |
| 400 | `unsupported_grant_type` | Anything other than `authorization_code` or `refresh_token` |
| 400 | `invalid_client_metadata` | Bad input to `/api/oauth/register` |
| 429 | `too_many_requests` | DCR rate limit (per IP) tripped |
| 500 | `server_error` | Internal — check server logs |

---

## End-to-end example with curl + jq

Walks the full flow from registration to revocation. Useful for debugging when something downstream is off.

```bash
BASE=http://localhost:3000

# 1. Register a client.
CLIENT_ID=$(curl -sX POST "$BASE/api/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["http://127.0.0.1:9999/cb"],"client_name":"curl-demo"}' \
  | jq -r .client_id)
echo "Client: $CLIENT_ID"

# 2. Generate a PKCE verifier + challenge.
VERIFIER=$(openssl rand -base64 32 | tr -d '=+/' | tr -d '\n')
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr -d '=+/' | tr -d '\n')

# 3. Open the authorize URL in a browser.
echo "$BASE/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=http://127.0.0.1:9999/cb&scope=notes:read%20notes:write%20tags:read&state=demo&code_challenge=$CHALLENGE&code_challenge_method=S256"
# … sign in if needed, click Authorize, copy the `code` from the URL bar.
read -p "code? " CODE

# 4. Exchange the code for tokens.
TOKENS=$(curl -sX POST "$BASE/api/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"code_verifier\":\"$VERIFIER\",\"client_id\":\"$CLIENT_ID\",\"redirect_uri\":\"http://127.0.0.1:9999/cb\"}")
echo "$TOKENS" | jq
ACCESS=$(echo "$TOKENS" | jq -r .access_token)
REFRESH=$(echo "$TOKENS" | jq -r .refresh_token)

# 5. Use the access token at /api/mcp.
curl -sX POST "$BASE/api/mcp" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq

# 6. Refresh.
TOKENS=$(curl -sX POST "$BASE/api/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH\",\"client_id\":\"$CLIENT_ID\"}")
echo "$TOKENS" | jq

# 7. Revoke.
ACCESS=$(echo "$TOKENS" | jq -r .access_token)
curl -sX POST "$BASE/api/oauth/revoke" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$ACCESS\"}" -i
```

---

## Architecture notes

- `src/lib/services/oauth.ts` mirrors the shape of `src/lib/services/api-keys.ts`. `verifyOauthToken` returns the same `VerifiedPrincipal` type as `verifyApiKey`, so adapters consume both authenticators uniformly.
- Tokens are stored as **SHA-256 hashes**. The plaintext (`oat_acc_...` / `oat_rfr_...`) is returned to the client at issuance and never persisted.
- Refresh-token rotation is **atomic at the SQL level** — the rotating UPDATE checks the old hash in its WHERE; if a concurrent refresh raced and won, the loser's row count is 0 and we throw `invalid_grant`. No application-level locks.
- The `audit_log.oauth_token_id` column lets every state-changing call from an OAuth-authorized client trace back to the connection. **Settings → Activity** renders this as `oauth: <client name>`, peer to `key: <key name>` and `Web session`.
- The MCP route opts into RFC 9728 discovery via `requireApiUser(request, [], { challenge: true })`. REST routes don't pass `challenge` — their clients already know they need a key.
