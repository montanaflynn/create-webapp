import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Discriminated principal — the auth context behind a state-changing call.
// Cookie-session callers (server actions) are "session"; Bearer-authenticated
// callers (REST, MCP, CLI) are "api_key" with the verified key id. The
// "oauth_token" branch is reserved for Phase 8b — included now so the union
// stays exhaustive at every match site, even though no adapter constructs one
// yet (and the audit_log CHECK constraint would reject it until 8b adds the
// oauth_token_id column).
export type Principal =
  | { kind: "session" }
  | { kind: "api_key"; id: string }
  | { kind: "oauth_token"; id: string };

export type Actor = {
  userId: string;
  principal: Principal;
};

export type AuditAction =
  | "note.create"
  | "note.update"
  | "note.delete"
  | "api_key.create"
  | "api_key.revoke"
  | "oauth.consent"
  | "oauth.token.revoke";

export type AuditResource = {
  type: "note" | "api_key" | "oauth_token";
  id: string;
  metadata?: Record<string, unknown>;
};

// Awaited intentionally — losing an audit row is worse than failing the
// triggering request. Pass `tx` from inside a `db.transaction(...)` block so
// the audit row commits atomically with the data write.
export async function recordAudit(
  conn: Tx | typeof db,
  actor: Actor,
  action: AuditAction,
  resource: AuditResource,
): Promise<void> {
  const apiKeyId =
    actor.principal.kind === "api_key" ? actor.principal.id : null;
  const oauthTokenId =
    actor.principal.kind === "oauth_token" ? actor.principal.id : null;
  await conn.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: actor.userId,
    apiKeyId,
    oauthTokenId,
    principalKind: actor.principal.kind,
    action,
    resourceType: resource.type,
    resourceId: resource.id,
    metadata: resource.metadata ?? null,
  });
}
