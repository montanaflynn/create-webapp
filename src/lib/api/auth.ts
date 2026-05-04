import {
  assertScopes,
  verifyApiKey,
  type Scope,
  type VerifiedPrincipal,
} from "@/lib/services/api-keys";
import { verifyOauthToken } from "@/lib/services/oauth";
import {
  RateLimitedError,
  UnauthenticatedError,
} from "@/lib/services/errors";
import { rateLimiter } from "./rate-limit";

const BEARER = "Bearer ";

/**
 * Authenticate a Bearer-credentialed request and assert that the credential
 * holds every scope in `required`. Accepts both API keys (`cwa_...`) and
 * OAuth 2.1 access tokens (`oat_acc_...`); they share the `VerifiedPrincipal`
 * shape, so adapters don't need to branch on which authenticator ran.
 *
 * Pass `{ challenge: true }` for endpoints that should advertise OAuth
 * authorization-server discovery via `WWW-Authenticate` on 401 — the MCP
 * spec requires this on `/api/mcp`. REST `/api/v1/*` callers should leave
 * the option off; their clients already know they need a key.
 *
 * Consumes one token from the per-credential rate-limit bucket after
 * verification. Throws `RateLimitedError` → 429 if the bucket is empty.
 */
export async function requireApiUser(
  request: Request,
  required: Scope[] = [],
  opts?: { challenge?: boolean },
): Promise<VerifiedPrincipal> {
  const challenge = opts?.challenge === true;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(BEARER)) {
    throw makeUnauthenticated(
      challenge,
      "Missing or invalid Authorization header. Expected `Bearer <token>`.",
    );
  }
  const secret = header.slice(BEARER.length).trim();
  if (!secret) throw makeUnauthenticated(challenge, "Missing Bearer token.");

  let verified: VerifiedPrincipal;
  try {
    if (secret.startsWith("cwa_")) {
      verified = await verifyApiKey(secret);
    } else if (secret.startsWith("oat_acc_")) {
      verified = await verifyOauthToken(secret);
    } else {
      throw new UnauthenticatedError("Unrecognized token format.");
    }
  } catch (e) {
    if (e instanceof UnauthenticatedError && challenge) {
      throw makeUnauthenticated(true, e.message);
    }
    throw e;
  }

  // verifyApiKey/verifyOauthToken always return a credentialed principal
  // (kind === "api_key" | "oauth_token"); the "session" kind is reserved
  // for cookie-session adapters and never reaches this code path.
  const principalId =
    verified.principal.kind === "session" ? "anon" : verified.principal.id;
  const decision = await rateLimiter.consume(
    `${verified.principal.kind}:${principalId}`,
  );
  if (!decision.ok) {
    throw new RateLimitedError(
      decision.retryAfter,
      `Rate limit exceeded. Retry after ${decision.retryAfter}s.`,
    );
  }

  if (required.length > 0) assertScopes(verified, required);
  return verified;
}

function makeUnauthenticated(challenge: boolean, message: string) {
  const err = new UnauthenticatedError(message) as UnauthenticatedError & {
    challenge?: boolean;
  };
  if (challenge) err.challenge = true;
  return err;
}
