import {
  assertScopes,
  verifyApiKey,
  type Scope,
  type VerifiedKey,
} from "@/lib/services/api-keys";
import {
  RateLimitedError,
  UnauthenticatedError,
} from "@/lib/services/errors";
import { rateLimiter } from "./rate-limit";

const BEARER = "Bearer ";

/**
 * Authenticate a REST request via `Authorization: Bearer <key>` and assert
 * the key holds every scope in `required`. Throws domain errors that the
 * route handler's `mapError` translates to 401/403.
 *
 * Consumes one token from the per-key rate limit bucket after verification.
 * Throws RateLimitedError → 429 if the bucket is empty.
 */
export async function requireApiUser(
  request: Request,
  required: Scope[] = [],
): Promise<VerifiedKey> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(BEARER)) {
    throw new UnauthenticatedError(
      "Missing or invalid Authorization header. Expected `Bearer <key>`.",
    );
  }
  const secret = header.slice(BEARER.length).trim();
  if (!secret) throw new UnauthenticatedError("Missing API key.");

  const verified = await verifyApiKey(secret);

  const decision = await rateLimiter.consume(`api_key:${verified.apiKeyId}`);
  if (!decision.ok) {
    throw new RateLimitedError(
      decision.retryAfter,
      `Rate limit exceeded. Retry after ${decision.retryAfter}s.`,
    );
  }

  if (required.length > 0) assertScopes(verified, required);
  return verified;
}
