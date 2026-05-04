import {
  consumeAuthCode,
  issueTokens,
  refreshTokens,
} from "@/lib/services/oauth";
import { ValidationError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

/**
 * RFC 6749 §4.1.3 token exchange + §6 refresh. Branches on grant_type.
 * Accepts both `application/x-www-form-urlencoded` (the spec default) and
 * `application/json` (what most modern clients actually send).
 *
 * Error responses use the OAuth-spec shape (`{ error, error_description }`)
 * — intentionally different from the rest of the app's `mapError` envelope
 * because spec-compliant clients parse the OAuth shape.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError(400, "invalid_request", "Could not parse request body.");
  }

  const grantType = params.grant_type;

  try {
    if (grantType === "authorization_code") {
      const code = required(params, "code");
      const codeVerifier = required(params, "code_verifier");
      const clientId = required(params, "client_id");
      const redirectUri = required(params, "redirect_uri");

      const { userId, scopes, clientId: cid } = await consumeAuthCode(
        code,
        codeVerifier,
        clientId,
        redirectUri,
      );
      const tokens = await issueTokens({ clientId: cid, userId, scopes });
      return tokenResponse(tokens);
    }

    if (grantType === "refresh_token") {
      const refreshToken = required(params, "refresh_token");
      const clientId = required(params, "client_id");
      const tokens = await refreshTokens(refreshToken, clientId);
      return tokenResponse(tokens);
    }

    return oauthError(
      400,
      "unsupported_grant_type",
      `grant_type '${grantType ?? "(missing)"}' is not supported.`,
    );
  } catch (e) {
    if (e instanceof MissingParamError) {
      return oauthError(400, "invalid_request", e.message);
    }
    if (e instanceof ValidationError) {
      return oauthError(400, "invalid_grant", e.message);
    }
    console.error("[oauth] token error:", e);
    return oauthError(500, "server_error", "Internal error.");
  }
}

class MissingParamError extends Error {}

async function readParams(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function required(params: Record<string, string>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new MissingParamError(`Missing required parameter: ${key}`);
  }
  return v;
}

function tokenResponse(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
}) {
  return Response.json(
    {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    },
    {
      // Per RFC 6749 §5.1 token responses must be uncached.
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function oauthError(status: number, error: string, description: string) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
