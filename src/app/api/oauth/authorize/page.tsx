import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClient, SCOPE_LABELS } from "@/lib/services/oauth";
import { SCOPES, type Scope } from "@/lib/services/api-keys";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { grantConsentAction, denyConsentAction } from "./actions";

// OAuth 2.1 authorize endpoint as a Next route. The user (already signed
// in via the cookie session) sees a consent screen naming the client and
// the scopes it's requesting; clicking Authorize fires a server action
// that mints an authorization code and redirects back to the client's
// redirect_uri. Deny redirects with `error=access_denied`.

type SearchParams = Promise<{
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}>;

const SCOPE_SET = new Set<string>(SCOPES);

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  // Build the URL we'd return to after sign-in.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const continueUrl = `/api/oauth/authorize?${qs.toString()}`;

  if (!session) {
    redirect(`/sign-in?redirect=${encodeURIComponent(continueUrl)}`);
  }

  // Validate request shape. These are config-level errors that don't
  // round-trip to the client because we can't trust an attacker-controlled
  // redirect_uri yet — render an inline error page instead.
  if (params.response_type !== "code") {
    return <ErrorCard message="Unsupported response_type. Only 'code' is supported." />;
  }
  if (params.code_challenge_method !== "S256") {
    return <ErrorCard message="Unsupported code_challenge_method. Only 'S256' is supported." />;
  }
  if (!params.code_challenge) {
    return <ErrorCard message="code_challenge is required (PKCE is mandatory)." />;
  }
  if (!params.client_id) {
    return <ErrorCard message="client_id is required." />;
  }
  if (!params.redirect_uri) {
    return <ErrorCard message="redirect_uri is required." />;
  }

  const client = await getClient(params.client_id);
  if (!client) {
    return <ErrorCard message={`Unknown client_id: ${params.client_id}`} />;
  }
  if (!client.redirectUris.includes(params.redirect_uri)) {
    return (
      <ErrorCard message="The provided redirect_uri is not registered for this client." />
    );
  }

  const requestedScopes = (params.scope ?? "")
    .split(/\s+/)
    .filter((s) => s.length > 0);
  const invalid = requestedScopes.filter((s) => !SCOPE_SET.has(s));
  if (invalid.length > 0) {
    return <ErrorCard message={`Unknown scope(s): ${invalid.join(", ")}`} />;
  }
  // Default to all scopes if none specified — matches how the API-keys
  // form defaults at creation.
  const finalScopes: Scope[] =
    requestedScopes.length === 0
      ? [...SCOPES]
      : (requestedScopes as Scope[]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Authorize {client.name}</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{client.name}</span>{" "}
            wants permission to access your account. Review the requested
            permissions below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm font-medium">This will let it:</p>
            <ul className="space-y-2">
              {finalScopes.map((s) => (
                <li
                  key={s}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{SCOPE_LABELS[s]}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {s}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {scopeShortBadge(s)}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="pt-2 text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {session.user.email}
              </span>
              . You can revoke this access any time from{" "}
              <span className="font-medium text-foreground">
                Settings → Connected apps
              </span>
              .
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <form action={denyConsentAction} className="contents">
            <HiddenParams params={params} />
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              Deny
            </Button>
          </form>
          <form action={grantConsentAction} className="contents">
            <HiddenParams params={params} />
            <input
              type="hidden"
              name="scopes_granted"
              value={finalScopes.join(" ")}
            />
            <Button type="submit" className="w-full sm:w-auto">
              Authorize
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}

function HiddenParams({
  params,
}: {
  params: Awaited<SearchParams>;
}) {
  return (
    <>
      {Object.entries(params).map(([k, v]) =>
        typeof v === "string" ? (
          <input key={k} type="hidden" name={k} value={v} />
        ) : null,
      )}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Authorization request rejected</CardTitle>
          <CardDescription>
            We can&rsquo;t process this OAuth request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function scopeShortBadge(scope: string): string {
  return scope.split(":")[1] ?? scope;
}
