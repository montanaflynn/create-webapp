import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { APP_SLUG } from "@/lib/branding";
import { listConnectedApps } from "@/lib/services/oauth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectedAppsList } from "./connected-apps-list";

export default async function OauthClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const apps = await listConnectedApps(session.user.id);
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const claudeCmd = `claude mcp add --transport http ${APP_SLUG} ${base}/api/mcp`;
  const codexCmd = `codex mcp add ${APP_SLUG} --url ${base}/api/mcp`;
  const opencodeCmd = `opencode mcp add`;
  const otherCmd = `npx add-mcp ${base}/api/mcp`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add an MCP client</CardTitle>
          <CardDescription>
            Connect an MCP client to this account. The browser opens, you
            sign in, click Authorize on the consent screen, and the client
            stores the token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude-code">
            <TabsList>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="codex">Codex</TabsTrigger>
              <TabsTrigger value="opencode">OpenCode</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="space-y-3 pt-3">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                <code>{claudeCmd}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                Claude Code enables the server on add and triggers the OAuth
                flow on the first tool call. For Claude Desktop or CI scripts
                (where opening a browser isn&rsquo;t viable), use a
                long-lived API key from{" "}
                <strong>Settings → API keys</strong> instead.
              </p>
            </TabsContent>

            <TabsContent value="codex" className="space-y-3 pt-3">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                <code>{codexCmd}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                The browser opens immediately for the OAuth flow. Codex
                stores the token in{" "}
                <code className="rounded bg-muted px-1">~/.codex/config.toml</code>.
                For CI scripts, use a long-lived API key from{" "}
                <strong>Settings → API keys</strong> with{" "}
                <code className="rounded bg-muted px-1">
                  bearer_token_env_var
                </code>{" "}
                instead.
              </p>
            </TabsContent>

            <TabsContent value="opencode" className="space-y-3 pt-3">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                <code>{opencodeCmd}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                Interactive — pick <strong>remote</strong>, name it{" "}
                <strong>{APP_SLUG}</strong>, enter{" "}
                <code className="rounded bg-muted px-1">
                  {base}/api/mcp
                </code>
                , answer <strong>Yes</strong> to OAuth. Then trigger the
                browser flow:
              </p>
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                <code>opencode mcp auth {APP_SLUG}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                OpenCode does dynamic client registration on the 401 and
                stores the token at{" "}
                <code className="rounded bg-muted px-1">
                  ~/.local/share/opencode/mcp-auth.json
                </code>
                .
              </p>
            </TabsContent>

            <TabsContent value="other" className="space-y-3 pt-3">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-xs">
                <code>{otherCmd}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                <a
                  href="https://github.com/neondatabase/add-mcp"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  add-mcp
                </a>{" "}
                auto-detects installed MCP clients (Cursor, Zed, VS Code,
                Cline, Gemini CLI, Claude Desktop, GitHub Copilot CLI, and
                more) and writes the right config snippet for each. The
                OAuth handshake then runs per-client on first tool call.
              </p>
            </TabsContent>
          </Tabs>
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
