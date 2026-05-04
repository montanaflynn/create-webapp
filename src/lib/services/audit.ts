import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Identity of who is performing a state-changing operation. Cookie-session
// callers (server actions) set apiKeyId to null; Bearer-authenticated callers
// (REST, MCP, CLI) set it to the verified key id.
export type Actor = {
  userId: string;
  apiKeyId: string | null;
};

export type AuditAction =
  | "note.create"
  | "note.update"
  | "note.delete"
  | "api_key.create"
  | "api_key.revoke";

export type AuditResource = {
  type: "note" | "api_key";
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
  await conn.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: actor.userId,
    apiKeyId: actor.apiKeyId,
    action,
    resourceType: resource.type,
    resourceId: resource.id,
    metadata: resource.metadata ?? null,
  });
}
