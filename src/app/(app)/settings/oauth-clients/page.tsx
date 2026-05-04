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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected apps</CardTitle>
        <CardDescription>
          Apps you&rsquo;ve authorized via OAuth. Revoke any to immediately
          cut off its access.
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
  );
}
