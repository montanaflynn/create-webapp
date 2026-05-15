# Plan: Rate limiting + audit log

**Status**: not started
**Effort**: ~3–5 hours total. Audit log is the bigger half.
**Phase**: 7

## Goal

Two cross-cutting concerns, both of which the API-first architecture makes cheap because they instrument the **service layer** — the single place every adapter (server actions, REST, MCP, future CLI) goes through.

1. **Audit log** — every state-changing operation produces an `audit_log` row recording who did what to which resource and when.
2. **Rate limiting** — per-API-key bucket protecting `/api/v1/*` and `/api/mcp` from runaway clients. In-memory for v1, with a `RateLimiter` interface so postgres / redis can swap in later.

## Why now / why this shape

The whole point of Phase 1's service-layer extraction was to make this kind of thing one-place-instrumentation. If we'd left the logic in actions + REST + MCP, we'd be writing the same code three times.

- **Audit insertion happens at the service layer** — `createNote` / `updateNote` / `deleteNote` / `createApiKey` / `revokeApiKey`. Reads aren't audited (would dwarf the table; not what the log is for).
- **Rate limiting happens at the adapter** (REST + MCP), not the service. Cookie-based requests (server actions) aren't rate-limited because they ride session middleware that already limits abuse paths via better-auth. Rate limiting is about *external* clients hitting our API key surface.

## Context the executing Claude needs

- **Service layer**: `src/lib/services/*.ts`. Every mutating function (`createNote`, `updateNote`, `deleteNote`, `createApiKey`, `revokeApiKey`) must gain audit instrumentation. Currently they take `(userId, ...)`. They need to take `(actor, ...)` where `actor = { userId, apiKeyId: string | null }`.
- **Adapter signatures**:
  - Server actions in `src/app/(app)/dashboard/actions.ts` and `src/app/(app)/settings/api-keys-actions.ts` build `actor = { userId, apiKeyId: null }` (cookie session).
  - REST handlers in `src/app/api/v1/**/route.ts` already get `auth = await requireApiUser(...)` which returns `{ apiKeyId, userId, scopes }`. They build `actor = { userId: auth.userId, apiKeyId: auth.apiKeyId }`.
  - MCP tools in `src/lib/mcp/server.ts` similarly get `auth: VerifiedKey` — same translation.
- **Tests**: Playwright e2e in `tests/e2e/*.spec.ts`. After the service signature change, several tests will fail their compile step but should still pass at runtime once you update the few direct service calls (search for `notes.createNote`, `apiKeys.createApiKey`, etc.).

## Plan

### Phase 7a — Audit log

#### 1. Schema migration

Add to `src/lib/db/schema.ts`:

```ts
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKey.id, { onDelete: "set null" }),
    action: text("action").notNull(),         // "note.create" | "note.update" | "note.delete" | "api_key.create" | "api_key.revoke"
    resourceType: text("resource_type").notNull(), // "note" | "api_key"
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_id_idx").on(t.userId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
```

Run: `npm run db:generate` (creates migration), `npm run db:migrate` (applies — must stop dev server first).

#### 2. Actor type + service signature change

In `src/lib/services/audit.ts` (new):

```ts
export type Actor = {
  userId: string;
  apiKeyId: string | null;  // null = browser session, otherwise the API key id
};

export type AuditAction =
  | "note.create" | "note.update" | "note.delete"
  | "api_key.create" | "api_key.revoke";

export async function recordAudit(
  actor: Actor,
  action: AuditAction,
  resource: { type: "note" | "api_key"; id: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: actor.userId,
    apiKeyId: actor.apiKeyId,
    action,
    resourceType: resource.type,
    resourceId: resource.id,
    metadata: resource.metadata ?? null,
  });
}
```

Update every mutating service:

- `src/lib/services/notes.ts` — `createNote(actor: Actor, input)`, etc. After the successful DB write, `await recordAudit(actor, "note.create", { type: "note", id: noteId })`. For updates, include `metadata: { fields: ["title", "content", "tags"] }` so future-you can see what was touched. **Audit write is awaited** (unlike `lastUsedAt` in api-keys which is fire-and-forget) — losing audit rows is worse than failing a request.
- `src/lib/services/api-keys.ts` — `createApiKey(actor, input)`, `revokeApiKey(actor, id)`. Action types `api_key.create` / `api_key.revoke`. Note: the `actor.userId` IS the user creating the key; that user is also the owner — they're the same person here.

#### 3. Adapter updates

- **Server actions** in `src/app/(app)/dashboard/actions.ts` and `src/app/(app)/settings/api-keys-actions.ts`: change `requireUserId()` → `requireActor()` returning `Actor` with `apiKeyId: null`. Pass to services.
- **REST** `src/app/api/v1/**/route.ts`: where you have `await requireApiUser(...)`, build `const actor: Actor = { userId: auth.userId, apiKeyId: auth.apiKeyId }`. Pass to services.
- **MCP** `src/lib/mcp/server.ts`: same translation in each tool's body.

#### 4. Settings UI for viewing the log

Add `src/app/(app)/settings/audit-log.tsx` — a section on `/settings`. Show the user's last 50 audit rows in a table:

| When | Action | Resource | Source |
| ---- | ------ | -------- | ------ |
| 2 mins ago | created | note `abc-123` | API key `claude-code` |
| 1 hour ago | revoked | api_key `cli-prod` | Web session |

"Source" comes from `apiKeyId`: if null, "Web session"; else look up the key name (one extra query, or a join). Order by `createdAt desc`.

#### 5. Tests

Add `tests/e2e/audit-log.spec.ts`:

- Create a note via REST → assert one row appears in `/settings` audit log with action `note.create`.
- Revoke an API key via the settings UI → assert audit row with action `api_key.revoke` and `apiKeyId: null` (action came from cookie session).

### Phase 7b — Rate limiting

#### 1. Service interface + in-memory implementation

`src/lib/api/rate-limit.ts` (new):

```ts
export interface RateLimiter {
  consume(key: string, cost?: number): Promise<{ ok: true } | { ok: false; retryAfter: number }>;
}

export class InMemoryTokenBucket implements RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();
  constructor(
    private capacity: number,         // burst size
    private refillPerSecond: number,  // sustained rate
  ) {}

  async consume(key: string, cost = 1) {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsed = (now - b.updatedAt) / 1000;
    const tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSecond);
    if (tokens < cost) {
      this.buckets.set(key, { tokens, updatedAt: now });
      const retryAfter = Math.ceil((cost - tokens) / this.refillPerSecond);
      return { ok: false as const, retryAfter };
    }
    this.buckets.set(key, { tokens: tokens - cost, updatedAt: now });
    return { ok: true as const };
  }
}

// Singleton, per-process. Swap in postgres/redis-backed implementation when prod scale demands it.
export const rateLimiter: RateLimiter = new InMemoryTokenBucket(60, 10); // 60 burst, 10 req/s sustained
```

Numbers are conservative defaults — easy to tune via env later.

#### 2. Apply at adapter

In `src/lib/api/auth.ts`, after `requireApiUser` resolves successfully:

```ts
const decision = await rateLimiter.consume(`api_key:${verified.apiKeyId}`);
if (!decision.ok) {
  throw new RateLimitedError(decision.retryAfter);
}
```

Add `RateLimitedError` to `src/lib/services/errors.ts`. Add `RateLimitedError` → 429 + `Retry-After` header to `src/lib/api/response.ts`'s `mapError`.

For MCP, the same `requireApiUser` call covers it — no separate wiring.

#### 3. Tests

Add `tests/e2e/rate-limit.spec.ts`: hammer `/api/v1/notes` with the seeded full key in a tight loop until you get a 429. Assert the response shape and `Retry-After` header. Be careful with the loop — use `pageSize=1` and a moderate count so the test doesn't take 30s.

If the e2e dev server uses the same `InMemoryTokenBucket` instance throughout the run, this test could affect other specs. Either:
- Reset the bucket between tests (export a `reset()` method, call it in `beforeEach`).
- Or use a unique key per test run by keying off the API key's `prefix` not `id` (already done above — we use `apiKeyId` which is unique).

#### 4. Docs

Update `docs/API.md` — error codes table gets a new row for `429 rate_limited`. Brief note on the headers (`Retry-After`).

Update `DECISIONS.md` — `## Rate limiting: in-memory token bucket, per API key`. Name the choice (in-memory v1, swap-in interface for postgres/redis later) and why per-key not per-user (one bad script shouldn't lock the user out of the dashboard).

## Files to create / modify

```
src/lib/db/schema.ts                              (edit — add auditLog table)
drizzle/00XX_*.sql                                (new — generated migration)
src/lib/services/audit.ts                         (new)
src/lib/services/notes.ts                         (edit — Actor signature, recordAudit calls)
src/lib/services/api-keys.ts                      (edit — Actor signature, recordAudit calls)
src/lib/services/errors.ts                        (edit — RateLimitedError)
src/lib/api/rate-limit.ts                         (new)
src/lib/api/auth.ts                               (edit — call rateLimiter.consume)
src/lib/api/response.ts                           (edit — 429 mapping, Retry-After)
src/app/(app)/dashboard/actions.ts                (edit — requireActor)
src/app/(app)/settings/api-keys-actions.ts        (edit — requireActor)
src/app/api/v1/**/route.ts                        (edit — build Actor, pass to service)
src/lib/mcp/server.ts                             (edit — build Actor, pass to service)
src/app/(app)/settings/page.tsx                   (edit — fetch + render audit-log section)
src/app/(app)/settings/audit-log.tsx              (new — server component)
tests/e2e/audit-log.spec.ts                       (new)
tests/e2e/rate-limit.spec.ts                      (new)
docs/API.md                                       (edit — 429 row in error table)
DECISIONS.md                                      (edit — audit-log + rate-limit rationale)
TUTORIAL.md                                       (edit — chapter 16)
```

## Acceptance criteria

- `npx tsc --noEmit` clean (Actor type change touches many files; resolve all).
- `npx eslint src` clean.
- All existing e2e specs pass + 2 new ones (audit-log + rate-limit) = at least 23 specs total.
- Manual smoke: create a note via the UI, view `/settings` → audit log shows it. Hammer `/api/v1/notes` from curl until you see a 429 with a sane `Retry-After`.

## Gotchas / prior art

- **The Actor signature change is the biggest mechanical risk.** Every mutating service signature changes. Touch everything in one go (one big find/replace pass + manual fixups), don't try to evolve incrementally — TS will tell you everything that's left.
- **Don't audit reads.** It's tempting (full visibility!), but it's a different feature with different storage characteristics. Read-frequency dwarfs writes; audit table grows orders of magnitude faster; stops being useful to humans. Reads + access logs is observability (Phase 8+ candidate, separate concern).
- **Audit writes go inside the service's transaction** for consistency. Currently `createNote` already uses `db.transaction(...)` — add the audit insert there. Failed audits should fail the request (unlike `lastUsedAt`).
- **In-memory rate-limit state dies on dev server restart.** That's fine for v1 — it's not a security boundary, it's friction protection. When prod traffic justifies persistence, the `RateLimiter` interface is the swap point. Don't preemptively reach for redis.
- **Settings page already imports `desc` and `eq` from drizzle-orm** — see `src/app/(app)/settings/page.tsx`. Reuse the existing patterns there for the audit log query.
- **Client-side timestamps**: render relative time ("2 mins ago") with a small helper, not a library. `formatDateTime` exists in `src/lib/utils.ts` — extend or add a sibling.

## Suggested commit shape

Two or three commits, in order:

```
feat(audit): record state-changing actions to audit_log

Add audit_log table and Actor signature throughout the service layer.
Every mutating service operation (create/update/delete notes, create/
revoke api_keys) writes a row recording who did what to which resource.
Adapters (server actions, REST, MCP) build Actor from their auth path.

feat(rate-limit): in-memory token bucket per API key

Add RateLimiter interface with InMemoryTokenBucket implementation.
requireApiUser consumes a token after verifying the key, throws
RateLimitedError → 429 with Retry-After. Per-key bucket so cookie
sessions are unaffected.

feat(settings): audit log section for the user's recent activity

Last 50 audit rows rendered as a table. Source column shows API key
name (or "Web session" for cookie-authed actions).
```
