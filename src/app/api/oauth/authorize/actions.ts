"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import {
  getClient,
  issueAuthCode,
} from "@/lib/services/oauth";
import { SCOPES, type Scope } from "@/lib/services/api-keys";

const SCOPE_SET = new Set<string>(SCOPES);

/**
 * User clicked "Authorize" on the consent screen. Mints a single-use
 * authorization code, records `oauth.consent` to the audit log, and
 * redirects to the client's redirect_uri with `code` + `state`.
 *
 * The consent action runs in cookie-session context, so the audit `Actor`
 * uses `principal: { kind: "session" }` — the user is consenting via the
 * web UI, not via an existing OAuth credential.
 */
export async function grantConsentAction(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");

  const clientId = readString(formData, "client_id");
  const redirectUri = readString(formData, "redirect_uri");
  const codeChallenge = readString(formData, "code_challenge");
  const codeChallengeMethod = readString(formData, "code_challenge_method");
  const state = formData.get("state");
  const scopesGranted = readString(formData, "scopes_granted");

  // Re-validate everything server-side. The page already checked, but
  // a hostile form re-submit could lie.
  const client = await getClient(clientId);
  if (!client) throw new Error("Unknown client.");
  if (!client.redirectUris.includes(redirectUri))
    throw new Error("redirect_uri is not registered for this client.");

  const scopes = scopesGranted
    .split(/\s+/)
    .filter((s) => s.length > 0 && SCOPE_SET.has(s)) as Scope[];

  const { code } = await issueAuthCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    scopes,
    codeChallenge,
    codeChallengeMethod,
  });

  await recordAudit(
    db,
    { userId: session.user.id, principal: { kind: "session" } },
    "oauth.consent",
    {
      type: "oauth_token",
      // Reference the client at this stage — the token row doesn't exist yet
      // (it's minted at the token-exchange step). The audit-log row carries
      // a metadata.client_id so the activity feed has something to surface.
      id: clientId,
      metadata: { client_id: clientId, client_name: client.name, scopes },
    },
  );

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (typeof state === "string") redirectUrl.searchParams.set("state", state);
  redirect(redirectUrl.toString());
}

export async function denyConsentAction(formData: FormData) {
  const redirectUri = readString(formData, "redirect_uri");
  const state = formData.get("state");

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("error", "access_denied");
  redirectUrl.searchParams.set(
    "error_description",
    "The user denied the authorization request.",
  );
  if (typeof state === "string") redirectUrl.searchParams.set("state", state);
  redirect(redirectUrl.toString());
}

function readString(form: FormData, key: string): string {
  const v = form.get(key);
  if (typeof v !== "string") throw new Error(`Missing field: ${key}`);
  return v;
}
