# Plan: OAuth on `/api/mcp`

**Status**: not started
**Effort**: ~1–1.5 days. Real chunk of work — plan to commit incrementally.
**Phase**: 8+ (after CLI / audit-log / rate-limit / settings sub-routes — all shipped on `main`)

## Goal

Replace "paste a Bearer token from the settings UI" with "click Authorize in a browser, done." End-user setup for the MCP server becomes:

```bash
claude mcp add --transport http create-webapp --scope project http://localhost:3000/api/mcp
```

No `${CWA_API_KEY}`, no `.claude/settings.local.json`, no copy-paste. On first use, Claude Code follows a `WWW-Authenticate` header to discovery, opens a browser, the user signs in (better-auth session), grants scopes on a consent screen, and Claude Code stores the issued token. This is how PayPal's hosted MCP at `mcp.paypal.com/mcp` works.

**The Bearer + manual-key path stays.** It covers CI, scripts, and "give my coworker a read-only key for an hour" — workflows OAuth doesn't address well.

---

## Open decisions (read before executing)

These are the calls a future Claude session should confirm with the user before starting. Each has a recommendation; defaults baked into the plan reflect them.

| # | Decision | Recommendation | Tradeoff |
|---|----------|----------------|----------|
| 1 | **Token format** — opaque hashed (like API keys, prefix `oat_`) vs. JWT? | **Opaque hashed.** | Mirrors existing `cwa_` keys, instant revocation without a deny list, no JWT validation logic. JWT only wins when external resource servers need stateless validation — ours is in-process. |
| 2 | **Dynamic client registration auth** — open per MCP spec, or require an authenticated session? | **Open + rate-limited.** | Spec compliance: MCP clients can't sign in just to register. Risk: anyone can create client rows. Mitigated by per-IP rate limit on the registration endpoint and bounded `redirect_uris` validation. |
| 3 | **Audit OAuth-flow events** — emit `audit_log` rows for consent grant and token revoke? | **Yes.** | These are the security events users would want visibility into ("when did I authorize Claude Code?"). Refreshes are not user-initiated; skip those. |
| 4 | **Token TTLs** — access 1h, refresh 30d (rotated on use), auth code 10min single-use. | **Accept defaults.** | Tunable via env. |
| 5 | **Token revocation endpoint (RFC 7009)** — implement `/api/oauth/revoke`? | **Yes.** | ~30 LOC; lets clients implement "Sign out from this app" cleanly. |
| 6 | **Token introspection (RFC 7662)** — implement `/api/oauth/introspect`? | **Skip.** | Only needed when external resource servers must validate tokens. Our resource server is in-process; introspection adds surface for no consumer in v1. |
| 7 | **Issuer URL detection** — derive from request host vs. `BETTER_AUTH_URL` env? | **`BETTER_AUTH_URL`.** | Already required by better-auth, single source of truth, no host-header spoofing risk. |

If any of these flips, the plan body needs adjustment. The big one is #1 — switching to JWT changes verification shape and breaks the API-key parallel.

---

## Architectural prerequisite: principal migration (Phase 8a)

The current `Actor = { userId, apiKeyId: string | null }` was designed before OAuth tokens existed. Adding an `oauthTokenId` sibling works but ages poorly — service accounts, agent identities, etc. will be the next thing to land. **Refactor first to a discriminated principal** before introducing OAuth.

### Application shape

```ts
// src/lib/services/audit.ts
export type Principal =
  | { kind: "session" }
  | { kind: "api_key"; id: string }
  | { kind: "oauth_token"; id: string };

export type Actor = {
  userId: string;
  principal: Principal;
};
```

Adapter translation:
- Server actions (cookie session): `{ userId, principal: { kind: "session" } }`
- REST `/api/v1/*` (Bearer key): `{ userId, principal: { kind: "api_key", id: auth.apiKeyId } }`
- MCP `/api/mcp` (Bearer key today, OAuth tomorrow): same as REST until OAuth lands
- After OAuth: third branch with `kind: "oauth_token"`

### Database shape

```sql
ALTER TABLE audit_log
  ADD COLUMN principal_kind text;

UPDATE audit_log
  SET principal_kind = CASE WHEN api_key_id IS NULL THEN 'session' ELSE 'api_key' END;

ALTER TABLE audit_log
  ALTER COLUMN principal_kind SET NOT NULL,
  ADD CONSTRAINT audit_log_principal_consistent CHECK (
    (principal_kind = 'session' AND api_key_id IS NULL) OR
    (principal_kind = 'api_key' AND api_key_id IS NOT NULL)
  );
```

The `oauth_token` FK column is deferred to Phase 8b (the table doesn't exist yet). Phase 8b extends the constraint to add the third branch.

This shape (two nullable FKs + a discriminator) beats a single polymorphic column because Postgres can't FK polymorphically and we want `ON DELETE SET NULL` so revoking a key/token doesn't destroy its trail.

### Files touched in 8a

- `src/lib/db/schema.ts` (audit_log)
- `drizzle/00XX_*.sql` (generated migration with backfill UPDATE)
- `src/lib/services/audit.ts` (Principal type + recordAudit signature)
- `src/lib/services/notes.ts`, `api-keys.ts` (Actor.apiKeyId → Actor.principal.id)
- `src/app/(app)/dashboard/actions.ts`, `src/app/(app)/settings/api-keys-actions.ts` (build new Actor shape)
- `src/app/api/v1/notes/route.ts`, `[id]/route.ts` (REST adapter)
- `src/lib/mcp/server.ts` (MCP adapter)
- `src/app/(app)/settings/audit-log.tsx` (read `principal_kind` and render based on discriminator; the `oauth_token` branch lands as a placeholder until 8b)
- `scripts/seed-test-api-keys.ts` (test seeding)

Existing e2e specs should pass with no test changes — the wire shapes don't move. tsc will tell you everything that broke. Estimate ~1 hour for 8a end-to-end.

**Ship Phase 8a as its own commit before starting 8b.** Smaller diff, easier review, and 8a works correctly without 8b.

---

## OAuth implementation (Phase 8b)

### Architecture

```
                                    Browser-side                Server-side
                                    -------------               -----------
1. Claude Code POST /api/mcp        [no token yet]              401 + WWW-Authenticate
2. Claude Code GET                  /.well-known/               200 — RFC 8414 metadata
                                    oauth-authorization-server
3. Claude Code POST                 /api/oauth/register         200 — { client_id }
   (DCR, RFC 7591)
4. Claude Code opens browser        /api/oauth/authorize?       Cookie-authed (better-auth).
                                    client_id&scope&            No session → redirect to
                                    redirect_uri&               /sign-in?redirect=…
                                    code_challenge&...          Else: render consent UI.
5. User clicks "Authorize"          POST authorize action       Issue auth code, redirect
                                                                to redirect_uri?code=…
6. Claude Code exchanges            POST /api/oauth/token       Validate PKCE, issue
                                    + code_verifier             access + refresh tokens
7. Claude Code retries              POST /api/mcp               Bearer header succeeds →
                                    Authorization: Bearer       tools available
                                    oat_…
```

### Schema (Phase 8b)

```ts
export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),                      // "oac_..."
  name: text("name").notNull(),                     // From DCR client_name (or "Unnamed client")
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  // No client_secret column — public clients only in v1 (PKCE is mandatory).
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const oauthAuthCode = pgTable("oauth_auth_code", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(), // "S256" only
  expiresAt: timestamp("expires_at").notNull(),                  // now() + 10min
  consumedAt: timestamp("consumed_at"),
});

export const oauthToken = pgTable(
  "oauth_token",
  {
    id: text("id").primaryKey(),                                 // "oat_..."
    clientId: text("client_id").notNull().references(() => oauthClient.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessTokenHash: text("access_token_hash").notNull(),        // SHA-256 of presented token
    refreshTokenHash: text("refresh_token_hash"),                // null after rotation consumed
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at").notNull(),                // access token expiry
    refreshExpiresAt: timestamp("refresh_expires_at"),           // refresh token expiry
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("oauth_token_access_hash_uniq").on(t.accessTokenHash),
    index("oauth_token_user_id_idx").on(t.userId),
  ],
);
```

Then extend the audit_log constraint from 8a to include `oauth_token_id`:

```sql
ALTER TABLE audit_log ADD COLUMN oauth_token_id text REFERENCES oauth_token(id) ON DELETE SET NULL;
ALTER TABLE audit_log DROP CONSTRAINT audit_log_principal_consistent;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_principal_consistent CHECK (
  (principal_kind = 'session'     AND api_key_id IS NULL     AND oauth_token_id IS NULL) OR
  (principal_kind = 'api_key'     AND api_key_id IS NOT NULL AND oauth_token_id IS NULL) OR
  (principal_kind = 'oauth_token' AND oauth_token_id IS NOT NULL AND api_key_id IS NULL)
);
```

### Token service — `src/lib/services/oauth.ts`

Mirrors `src/lib/services/api-keys.ts` for shape so anyone reading both can pattern-match:

- `verifyOauthToken(secret: string): Promise<VerifiedPrincipal>` — same return type as `verifyApiKey` (rename `VerifiedKey` → `VerifiedPrincipal` with discriminator during 8a)
- `issueAuthCode(...)`, `consumeAuthCode(code, codeVerifier)` (validates PKCE), `issueTokens(...)`, `refreshTokens(...)`, `revokeToken(...)`
- Tokens prefixed `oat_acc_` (OAuth access) and `oat_rfr_` (OAuth refresh), distinguishable from API keys (`cwa_`). Hash storage: SHA-256, lookup by hash, `timingSafeEqual` for defense in depth — same pattern as `verifyApiKey`.

### Endpoints

#### Discovery — `src/app/.well-known/oauth-authorization-server/route.ts`

```ts
export function GET() {
  const base = process.env.BETTER_AUTH_URL!;
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    scopes_supported: ["notes:read", "notes:write", "tags:read"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], // public clients only
  });
}
```

Mirror at `/.well-known/oauth-protected-resource/route.ts` (RFC 9728) — points back at the authorization-server URL so MCP clients can chain discovery from a `WWW-Authenticate` header.

#### Dynamic client registration — `src/app/api/oauth/register/route.ts`

Accepts JSON `{ redirect_uris: string[], client_name?: string }`. Validates redirect_uris strictly:
- `http://localhost:*` allowed (dev)
- `http://127.0.0.1:*` allowed (dev)
- `https://*` allowed (prod)
- No fragments, no wildcards, no `javascript:`

Returns `{ client_id, redirect_uris, client_name, ... }` per RFC 7591. **Rate-limited per IP** (separate bucket from API-key buckets, e.g. 10 burst / 1/min sustained — registration is a rare operation).

#### Authorization endpoint — `src/app/api/oauth/authorize/page.tsx`

Server component reads query params: `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`, `response_type=code`.

Logic:
1. Look up `oauth_client` by `client_id` — 400 if missing.
2. Validate `redirect_uri` is in registered list (exact match) — 400 if not.
3. Read better-auth session. No session → redirect to `/sign-in?redirect=${encodeURIComponent(originalUrl)}` (verify the sign-in flow already supports this redirect param before starting).
4. Validate every requested `scope` ∈ `SCOPES`. 400 otherwise.
5. Render consent screen: client name (large), scope list with friendly labels matching `api-keys-form.tsx`, Authorize / Deny buttons.

Authorize button → server action `grantConsentAction(formData)`:
- Calls `issueAuthCode({ clientId, userId, redirectUri, scopes, codeChallenge, codeChallengeMethod })`
- Records audit: `{ action: "oauth.consent", resource: { type: "oauth_client", id: clientId, metadata: { scopes } } }`
- `redirect()` to `${redirect_uri}?code=...&state=...`

Deny → `redirect()` to `${redirect_uri}?error=access_denied&state=...`

UI: shadcn `Card`, `Button`, scope cards from `api-keys-form.tsx` for visual consistency.

#### Token endpoint — `src/app/api/oauth/token/route.ts`

POST. Branches on `grant_type`:
- `authorization_code`: requires `code`, `code_verifier`, `client_id`, `redirect_uri`. PKCE: `SHA256(code_verifier)` base64url-encoded must match stored `code_challenge`. Mark `consumedAt` to prevent reuse. Issue access + refresh tokens.
- `refresh_token`: requires `refresh_token`, `client_id`. Look up by hash, verify not expired/revoked, **rotate** (issue new access + new refresh, mark old refresh consumed). Concurrent refresh races → second call gets `invalid_grant`.

Errors return 400 with `{ "error": "invalid_grant" | "invalid_request" | ... }` per RFC 6749 — different envelope than the rest of our API on purpose. OAuth clients expect this shape.

Success returns:
```json
{
  "access_token": "oat_acc_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "oat_rfr_...",
  "scope": "notes:read notes:write tags:read"
}
```

#### Revocation — `src/app/api/oauth/revoke/route.ts`

Per RFC 7009. POST `{ token, token_type_hint? }`. Look up by either access or refresh hash, set `revokedAt`. Always return 200 (per spec — don't leak whether the token existed). Records audit `{ action: "oauth.token.revoke", resource: { type: "oauth_token", id } }`.

### Wiring `/api/mcp` (and the rest of `/api/v1/*`)

#### Update `src/lib/api/auth.ts`

```ts
export async function requireApiUser(
  request: Request,
  required: Scope[] = [],
): Promise<VerifiedPrincipal> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw unauthenticatedWithChallenge(request);
  }
  const secret = header.slice(7).trim();
  if (!secret) throw unauthenticatedWithChallenge(request);

  let verified: VerifiedPrincipal;
  if (secret.startsWith("cwa_")) {
    verified = await verifyApiKey(secret);
  } else if (secret.startsWith("oat_acc_")) {
    verified = await verifyOauthToken(secret);
  } else {
    throw unauthenticatedWithChallenge(request);
  }

  // Rate-limit per principal — same limiter, different key namespace.
  const limiterKey = `${verified.principal.kind}:${verified.principal.id}`;
  const decision = await rateLimiter.consume(limiterKey);
  if (!decision.ok) throw new RateLimitedError(decision.retryAfter, ...);

  if (required.length > 0) assertScopes(verified, required);
  return verified;
}
```

`unauthenticatedWithChallenge` throws `UnauthenticatedError` carrying a `challenge` payload. `mapError` in `src/lib/api/response.ts` reads it and adds the header:

```
WWW-Authenticate: Bearer realm="create-webapp", resource_metadata="https://<host>/.well-known/oauth-protected-resource"
```

**Only `/api/mcp` should emit `WWW-Authenticate`.** The MCP client handshake reads it. `/api/v1/*` 401s stay headerless — those callers know they need a key. Implement by passing a flag from the route handler when calling `mapError`, or via a different error subclass.

### Settings UI (Phase 8c)

Add a fifth nav item to `src/app/(app)/settings/settings-nav.tsx`:

```ts
{ href: "/settings/oauth-clients", label: "Connected apps" },
```

New route `src/app/(app)/settings/oauth-clients/page.tsx` lists the user's active `oauth_token` rows. For each: client name (joined from `oauth_client`), granted scopes, `lastUsedAt`, revoke button. "Connected apps" framing reads better than "OAuth tokens" for end users.

Audit log "Source" column gains a third state: `oauth: <client name>`. Update `src/app/(app)/settings/audit-log.tsx` to read `principal_kind` and join `oauth_client` for the third branch. (Phase 8a renders the placeholder string; 8c wires the real label.)

### Tests (Phase 8d)

`tests/e2e/oauth.spec.ts` exercises the full flow:

1. POST `/api/mcp` no auth → 401, `WWW-Authenticate` header points at discovery URL.
2. GET discovery metadata → 200, valid JSON, all expected fields.
3. POST `/api/oauth/register` with valid redirect_uris → 200, returns `client_id`.
4. GET `/api/oauth/authorize?...` (using Playwright's authenticated browser context) → consent screen renders, scopes listed.
5. Click "Authorize" → URL redirects with `code=...&state=...`.
6. POST `/api/oauth/token` with code + PKCE verifier → tokens.
7. POST `/api/mcp` with access token → tools/list works.
8. POST `/api/oauth/token` with refresh_token → new tokens; old refresh now invalid.
9. POST `/api/oauth/revoke` → access token rejected on next call.
10. Settings UI: `/settings/oauth-clients` shows the connected app, revoke button works, audit log shows `oauth: <name>` source.

PKCE helper for tests:
```ts
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
```

### Docs (Phase 8e)

- `docs/MCP.md`: promote OAuth from "future direction" to "preferred path"; demote bearer to "advanced / CI use case".
- `docs/OAUTH.md`: new, full reference.
- `README.md`: simplify the 3-step MCP setup to 1 step (`claude mcp add ...`).
- `DECISIONS.md`: flip the OAuth entry from "deferred" to "shipped"; new entries for principal model and token format choice.
- `TUTORIAL.md`: chapter 17 (after MCP) walks through the build.

---

## Files to create / modify

```
# Phase 8a — principal migration
src/lib/db/schema.ts                              (edit — audit_log gains principal_kind + check)
drizzle/00XX_*.sql                                (new — migration with backfill UPDATE)
src/lib/services/audit.ts                         (edit — Principal discriminated union)
src/lib/services/notes.ts                         (edit — Actor signature)
src/lib/services/api-keys.ts                      (edit — Actor signature, VerifiedPrincipal rename)
src/lib/api/auth.ts                               (edit — return type rename)
src/app/(app)/dashboard/actions.ts                (edit — build new Actor)
src/app/(app)/settings/api-keys-actions.ts        (edit — build new Actor)
src/app/api/v1/notes/route.ts, [id]/route.ts      (edit — build new Actor)
src/lib/mcp/server.ts                             (edit — build new Actor)
src/app/(app)/settings/audit-log.tsx              (edit — read principal_kind)
scripts/seed-test-api-keys.ts                     (edit — build new Actor)

# Phase 8b — OAuth core
src/lib/db/schema.ts                              (edit — three new tables, extend audit constraint)
drizzle/00XY_*.sql                                (new)
src/lib/services/oauth.ts                         (new)
src/lib/services/errors.ts                        (edit — RFC 6749 vocabulary errors)
src/lib/api/auth.ts                               (edit — try-both Bearer flow + WWW-Authenticate)
src/lib/api/response.ts                           (edit — challenge-aware UnauthenticatedError)
src/lib/api/rate-limit.ts                         (edit — separate IP bucket for /register)
src/app/.well-known/oauth-authorization-server/route.ts   (new)
src/app/.well-known/oauth-protected-resource/route.ts     (new)
src/app/api/oauth/register/route.ts               (new)
src/app/api/oauth/authorize/page.tsx              (new — consent UI)
src/app/api/oauth/authorize/actions.ts            (new — Authorize/Deny server actions)
src/app/api/oauth/token/route.ts                  (new)
src/app/api/oauth/revoke/route.ts                 (new)
src/app/api/mcp/route.ts                          (edit — emit WWW-Authenticate on 401)

# Phase 8c — Settings UI
src/app/(app)/settings/settings-nav.tsx           (edit — fifth nav item)
src/app/(app)/settings/oauth-clients/page.tsx     (new)
src/app/(app)/settings/oauth-clients/actions.ts   (new — revoke action)
src/app/(app)/settings/oauth-clients-list.tsx     (new — client component)
src/app/(app)/settings/audit-log.tsx              (edit — third source state)

# Phase 8d — Tests
tests/e2e/oauth.spec.ts                           (new)

# Phase 8e — Docs
docs/MCP.md, docs/OAUTH.md (new), README.md, DECISIONS.md, TUTORIAL.md
```

## Acceptance criteria

- All 29 existing e2e specs pass (Bearer key path unchanged).
- New `oauth.spec.ts` covers full discovery → register → authorize → token → use → refresh → revoke + settings UI.
- `claude mcp add --transport http create-webapp http://localhost:3000/api/mcp` succeeds end-to-end with no header config — verified manually in a real Claude Code session.
- `npx tsc --noEmit` clean.
- `npx eslint src tests scripts` clean.
- Audit log "Source" column shows three states correctly.

## Gotchas / prior art

- **PKCE is non-negotiable for public clients** per MCP spec. Reject `authorization_code` grants without `code_verifier` with `invalid_grant`.
- **Redirect URI matching must be exact** — exact string match against the registered list. No path-prefix, no host-only, no fragment-stripping. Sloppy matching here is a credential-leak vulnerability.
- **Authorization codes are single-use, short-lived.** 10 minutes max, mark `consumedAt` on first exchange, reject any second use even if not expired.
- **Refresh-token rotation race**: two concurrent refresh requests must result in exactly one success. Implement by `UPDATE oauth_token SET refresh_token_hash = ... WHERE id = ? AND refresh_token_hash = <old hash>` returning row count — the loser sees 0 rows updated and returns `invalid_grant`.
- **`WWW-Authenticate` header parsing is finicky**, the spec is specific. Test with Claude Code (which is the actual consumer), not just curl — the SDK may parse stricter than your manual reading suggests.
- **Better-auth session for the consent step**, not the API key path. The user authorizing the OAuth client is signing in as a user (cookie session); the OAuth token they're issuing is a separate credential for a *machine* (the MCP client) acting on their behalf.
- **The MCP spec is moving.** Pin behavior to the latest stable revision when starting (currently 2025-06-18). When the next revision lands, treat it as a breaking-change candidate — read the diff, run e2e, update docs deliberately.
- **Distinct prefixes for access vs refresh tokens** (`oat_acc_` vs `oat_rfr_`) make logging and incident response easier — you can tell at a glance which kind leaked.

## Suggested commit shape

Seven commits, in order. Each leaves the e2e suite green.

```
refactor(audit): migrate Actor to discriminated principal model

feat(oauth): add oauth_client, oauth_auth_code, oauth_token tables
feat(oauth): token + code service (issue, verify, consume, refresh, revoke)
feat(oauth): discovery + protected-resource metadata endpoints
feat(oauth): /api/oauth/{register,authorize,token,revoke}
feat(oauth): /api/mcp accepts both Bearer cwa_ and Bearer oat_

feat(settings): connected-apps section with revoke
docs(oauth): promote OAuth path in MCP docs; flip DECISIONS entry
```

Stretch the last two commits if 8c+8d turn out to be larger than expected.
