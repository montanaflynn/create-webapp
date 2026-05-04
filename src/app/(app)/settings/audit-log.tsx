import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKey, auditLog, oauthClient, oauthToken } from "@/lib/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  "note.create": "created note",
  "note.update": "updated note",
  "note.delete": "deleted note",
  "api_key.create": "created API key",
  "api_key.revoke": "revoked API key",
  "oauth.consent": "authorized app",
  "oauth.token.revoke": "revoked OAuth access",
};

const LIMIT = 50;

type AuditRow = {
  principalKind: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  oauthTokenId: string | null;
  oauthClientName: string | null;
};

function renderSource(r: AuditRow) {
  switch (r.principalKind) {
    case "session":
      return <Badge variant="outline">Web session</Badge>;
    case "api_key":
      return (
        <Badge variant="secondary">
          key: {truncate(r.apiKeyName ?? r.apiKeyId?.slice(0, 8) ?? "(revoked)")}
        </Badge>
      );
    case "oauth_token":
      return (
        <Badge variant="secondary">
          oauth: {truncate(r.oauthClientName ?? r.oauthTokenId?.slice(0, 8) ?? "(revoked)")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{r.principalKind}</Badge>;
  }
}

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function AuditLogSection({ userId }: { userId: string }) {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      principalKind: auditLog.principalKind,
      apiKeyId: auditLog.apiKeyId,
      apiKeyName: apiKey.name,
      oauthTokenId: auditLog.oauthTokenId,
      oauthClientName: oauthClient.name,
    })
    .from(auditLog)
    .leftJoin(apiKey, eq(auditLog.apiKeyId, apiKey.id))
    .leftJoin(oauthToken, eq(auditLog.oauthTokenId, oauthToken.id))
    .leftJoin(oauthClient, eq(oauthToken.clientId, oauthClient.id))
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity log</CardTitle>
        <CardDescription>
          Last {LIMIT} state-changing actions on your account, including the
          source (web session or API key).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Resource</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = r.metadata as
                    | { name?: string; title?: string }
                    | null;
                  const label =
                    meta?.title ?? meta?.name ?? r.resourceId.slice(0, 8);
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="py-2 pr-4">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs">{label}</span>
                      </td>
                      <td className="py-2">{renderSource(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
