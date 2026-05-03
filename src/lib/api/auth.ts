import {
  assertScopes,
  verifyApiKey,
  type Scope,
  type VerifiedKey,
} from "@/lib/services/api-keys";
import { UnauthenticatedError } from "@/lib/services/errors";

const BEARER = "Bearer ";

/**
 * Authenticate a REST request via `Authorization: Bearer <key>` and assert
 * the key holds every scope in `required`. Throws domain errors that the
 * route handler's `mapError` translates to 401/403.
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
  if (required.length > 0) assertScopes(verified, required);
  return verified;
}
