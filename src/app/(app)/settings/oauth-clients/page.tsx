import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listConnectedApps } from "@/lib/services/oauth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectedAppsList } from "./connected-apps-list";

export default async function OauthClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const apps = await listConnectedApps(session.user.id);
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const addCmd = `claude mcp add --transport http create-webapp ${base}/api/mcp`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add an MCP client</CardTitle>
          <CardDescription>
            Connect Claude Code (or any MCP client that speaks OAuth) to this
            account. The browser opens, you sign in, click Authorize on the
            consent screen, and the client stores the token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
            <code>{addCmd}</code>
          </pre>
          <p className="text-xs text-muted-foreground">
            Then run <code className="rounded bg-muted px-1">/mcp</code> inside
            Claude Code and pick <strong>create-webapp</strong>. For Claude
            Desktop or CI scripts (where opening a browser isn&rsquo;t
            viable), use a long-lived API key from{" "}
            <strong>Settings → API keys</strong> instead.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authorized MCP clients</CardTitle>
          <CardDescription>
            Active OAuth grants. Revoking immediately cuts off access — the
            client will need to re-authorize.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAppsList
            apps={apps.map((a) => ({
              tokenId: a.tokenId,
              clientId: a.clientId,
              clientName: a.clientName,
              scopes: a.scopes,
              createdAt: a.createdAt.toISOString(),
              lastUsedAt: a.lastUsedAt ? a.lastUsedAt.toISOString() : null,
              expiresAt: a.expiresAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
