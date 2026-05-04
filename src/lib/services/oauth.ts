import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthAuthCode, oauthClient, oauthToken } from "@/lib/db/schema";
import {
  SCOPES,
  type Scope,
  type VerifiedPrincipal,
} from "./api-keys";
import { recordAudit, type Actor } from "./audit";
import {
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "./errors";

// OAuth 2.1 service. Mirrors the shape of `api-keys.ts`: each entry point
// validates input, hits the DB, and throws domain errors that adapters
// translate to HTTP. PKCE-mandatory, single-use refresh tokens (rotation),
// SHA-256 hashed at rest.

const SCOPE_SET = new Set<string>(SCOPES);

const ACCESS_PREFIX = "oat_acc_";
const REFRESH_PREFIX = "oat_rfr_";
const SECRET_BYTES = 32;

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const AUTH_CODE_TTL_SECONDS = 60 * 10; // 10 minutes

const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME_LENGTH = 200;

export type OauthClient = {
  id: string;
  name: string;
  redirectUris: string[];
  createdAt: Date;
};

export type ConnectedApp = {
  tokenId: string;
  clientId: string;
  clientName: string;
  scopes: Scope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: "Bearer";
};

// ---------------------------------------------------------------------------
// Client registration (RFC 7591 — Dynamic Client Registration)

export async function registerClient(input: {
  redirectUris: unknown;
  clientName?: unknown;
}): Promise<OauthClient> {
  const redirectUris = validateRedirectUris(input.redirectUris);
  const name = normalizeClientName(input.clientName);

  const id = `oac_${randomBytes(12).toString("base64url")}`;
  const [row] = await db
    .insert(oauthClient)
    .values({ id, name, redirectUris })
    .returning();

  return toClient(row);
}

export async function getClient(clientId: string): Promise<OauthClient | null> {
  const [row] = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.id, clientId));
  return row ? toClient(row) : null;
}

// ---------------------------------------------------------------------------
// Authorization code (RFC 6749 §4.1 + RFC 7636 PKCE)

export async function issueAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: Scope[];
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<{ code: string }> {
  if (input.codeChallengeMethod !== "S256") {
    throw new ValidationError([
      {
        path: ["code_challenge_method"],
        message: "Only S256 PKCE method is supported.",
      },
    ]);
  }
  if (!input.codeChallenge || input.codeChallenge.length < 16) {
    throw new ValidationError([
      { path: ["code_challenge"], message: "Invalid code_challenge." },
    ]);
  }

  const code = `oac_code_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);
  const scopes = filterValidScopes(input.scopes);

  await db.insert(oauthAuthCode).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scopes,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    expiresAt,
  });

  return { code };
}

export async function consumeAuthCode(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
): Promise<{ userId: string; scopes: Scope[]; clientId: string }> {
  if (!code || !codeVerifier) {
    throw new ValidationError([
      { path: ["code"], message: "code and code_verifier are required." },
    ]);
  }

  // Mark consumed atomically — this both validates "not already used" and
  // claims it for this exchange in a single statement.
  const claimed = await db
    .update(oauthAuthCode)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(oauthAuthCode.code, code), isNull(oauthAuthCode.consumedAt)),
    )
    .returning();

  const row = claimed[0];
  if (!row) {
    throw new ValidationError([
      { path: ["code"], message: "Authorization code is invalid or already used." },
    ]);
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new ValidationError([
      { path: ["code"], message: "Authorization code has expired." },
    ]);
  }
  if (row.clientId !== clientId) {
    throw new ValidationError([
      { path: ["client_id"], message: "client_id does not match the authorization code." },
    ]);
  }
  if (row.redirectUri !== redirectUri) {
    throw new ValidationError([
      { path: ["redirect_uri"], message: "redirect_uri does not match the authorization grant." },
    ]);
  }

  // PKCE verification: SHA-256(code_verifier) base64url-encoded must equal
  // the stored code_challenge.
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  if (
    computed.length !== row.codeChallenge.length ||
    !timingSafeEqual(Buffer.from(computed), Buffer.from(row.codeChallenge))
  ) {
    throw new ValidationError([
      { path: ["code_verifier"], message: "PKCE code_verifier failed verification." },
    ]);
  }

  return {
    userId: row.userId,
    scopes: filterValidScopes(row.scopes),
    clientId: row.clientId,
  };
}

// ---------------------------------------------------------------------------
// Token issuance + refresh (RFC 6749 §4.1.3 / §6)

export async function issueTokens(input: {
  clientId: string;
  userId: string;
  scopes: Scope[];
}): Promise<TokenPair> {
  const accessToken = ACCESS_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
  const refreshToken = REFRESH_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
  const id = `oat_${randomBytes(12).toString("base64url")}`;
  const now = Date.now();

  await db.insert(oauthToken).values({
    id,
    clientId: input.clientId,
    userId: input.userId,
    accessTokenHash: sha256(accessToken),
    refreshTokenHash: sha256(refreshToken),
    scopes: input.scopes,
    expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
    scope: input.scopes.join(" "),
    tokenType: "Bearer",
  };
}

export async function refreshTokens(
  refreshToken: string,
  clientId: string,
): Promise<TokenPair> {
  if (!refreshToken?.startsWith(REFRESH_PREFIX)) {
    throw new ValidationError([
      { path: ["refresh_token"], message: "Invalid refresh token." },
    ]);
  }

  const hash = sha256(refreshToken);
  const [row] = await db
    .select()
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.refreshTokenHash, hash),
        isNull(oauthToken.revokedAt),
      ),
    );

  if (!row) {
    throw new ValidationError([
      { path: ["refresh_token"], message: "Refresh token is invalid or already used." },
    ]);
  }
  if (row.clientId !== clientId) {
    throw new ValidationError([
      { path: ["client_id"], message: "client_id does not match this refresh token." },
    ]);
  }
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < Date.now()) {
    throw new ValidationError([
      { path: ["refresh_token"], message: "Refresh token has expired." },
    ]);
  }

  // Rotation: atomically null the old refresh hash + revoke the row. If
  // another concurrent refresh raced and won, rowCount === 0 and we throw
  // (the winner keeps its new tokens; this caller's refresh is now invalid).
  const rotated = await db
    .update(oauthToken)
    .set({ refreshTokenHash: null, revokedAt: new Date() })
    .where(
      and(
        eq(oauthToken.id, row.id),
        eq(oauthToken.refreshTokenHash, hash),
      ),
    )
    .returning({ id: oauthToken.id });
  if (rotated.length === 0) {
    throw new ValidationError([
      { path: ["refresh_token"], message: "Refresh token is invalid or already used." },
    ]);
  }

  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scopes: filterValidScopes(row.scopes),
  });
}

// ---------------------------------------------------------------------------
// Verification (Bearer access token at /api/mcp)

export async function verifyOauthToken(
  secret: string,
): Promise<VerifiedPrincipal> {
  if (typeof secret !== "string" || !secret.startsWith(ACCESS_PREFIX)) {
    throw new UnauthenticatedError("Invalid access token.");
  }
  const hash = sha256(secret);
  const [row] = await db
    .select()
    .from(oauthToken)
    .where(
      and(eq(oauthToken.accessTokenHash, hash), isNull(oauthToken.revokedAt)),
    );
  if (!row) throw new UnauthenticatedError("Invalid access token.");

  if (row.expiresAt.getTime() < Date.now()) {
    throw new UnauthenticatedError("Access token has expired.");
  }

  // Constant-time compare on the hash bytes for defense in depth.
  const expected = Buffer.from(row.accessTokenHash);
  const presented = Buffer.from(hash);
  if (
    expected.length !== presented.length ||
    !timingSafeEqual(expected, presented)
  ) {
    throw new UnauthenticatedError("Invalid access token.");
  }

  // Best-effort lastUsedAt update — mirrors verifyApiKey.
  void db
    .update(oauthToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthToken.id, row.id))
    .catch(() => undefined);

  return {
    userId: row.userId,
    scopes: filterValidScopes(row.scopes),
    principal: { kind: "oauth_token", id: row.id },
  };
}

// ---------------------------------------------------------------------------
// Revocation (RFC 7009)

/**
 * RFC 7009 revocation by token secret. Idempotent — returns void whether
 * or not the token existed (don't leak existence). Records an audit row
 * the first time a real token is revoked.
 */
export async function revokeToken(secret: string): Promise<void> {
  if (typeof secret !== "string") return;

  const hash = sha256(secret);
  const isAccess = secret.startsWith(ACCESS_PREFIX);
  const isRefresh = secret.startsWith(REFRESH_PREFIX);
  if (!isAccess && !isRefresh) return; // unknown shape — no-op

  const [row] = await db
    .select()
    .from(oauthToken)
    .where(
      isAccess
        ? eq(oauthToken.accessTokenHash, hash)
        : eq(oauthToken.refreshTokenHash, hash),
    );
  if (!row) return;
  if (row.revokedAt) return; // already revoked

  await db.transaction(async (tx) => {
    await tx
      .update(oauthToken)
      .set({ revokedAt: new Date(), refreshTokenHash: null })
      .where(eq(oauthToken.id, row.id));
    await recordAudit(
      tx,
      { userId: row.userId, principal: { kind: "session" } },
      "oauth.token.revoke",
      { type: "oauth_token", id: row.id, metadata: { source: "rfc7009" } },
    );
  });
}

/**
 * Revoke a token by its row id — for the user revoking via the
 * `/settings/oauth-clients` UI. Records the audit with the user as the
 * cookie-session actor.
 */
export async function revokeTokenById(actor: Actor, tokenId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(oauthToken)
      .set({ revokedAt: new Date(), refreshTokenHash: null })
      .where(
        and(
          eq(oauthToken.id, tokenId),
          eq(oauthToken.userId, actor.userId),
          isNull(oauthToken.revokedAt),
        ),
      )
      .returning({ id: oauthToken.id });
    if (updated.length === 0) throw new NotFoundError("oauth_token", tokenId);
    await recordAudit(tx, actor, "oauth.token.revoke", {
      type: "oauth_token",
      id: tokenId,
      metadata: { source: "user_ui" },
    });
  });
}

// ---------------------------------------------------------------------------
// Listing for the MCP clients settings page

export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const rows = await db
    .select({
      tokenId: oauthToken.id,
      clientId: oauthToken.clientId,
      clientName: oauthClient.name,
      scopes: oauthToken.scopes,
      createdAt: oauthToken.createdAt,
      lastUsedAt: oauthToken.lastUsedAt,
      expiresAt: oauthToken.expiresAt,
    })
    .from(oauthToken)
    .innerJoin(oauthClient, eq(oauthToken.clientId, oauthClient.id))
    .where(
      and(
        eq(oauthToken.userId, userId),
        isNull(oauthToken.revokedAt),
        isNotNull(oauthToken.refreshTokenHash),
        sql`${oauthToken.expiresAt} > now()`,
      ),
    );

  return rows
    .map((r) => ({
      tokenId: r.tokenId,
      clientId: r.clientId,
      clientName: r.clientName,
      scopes: filterValidScopes(r.scopes),
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function filterValidScopes(input: unknown): Scope[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is Scope => typeof s === "string" && SCOPE_SET.has(s));
}

function validateRedirectUris(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError([
      { path: ["redirect_uris"], message: "redirect_uris must be a non-empty array." },
    ]);
  }
  if (input.length > MAX_REDIRECT_URIS) {
    throw new ValidationError([
      {
        path: ["redirect_uris"],
        message: `At most ${MAX_REDIRECT_URIS} redirect_uris allowed.`,
      },
    ]);
  }

  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      throw new ValidationError([
        { path: ["redirect_uris"], message: "redirect_uris must be strings." },
      ]);
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError([
        { path: ["redirect_uris"], message: `Invalid URI: ${raw}` },
      ]);
    }
    if (url.hash) {
      throw new ValidationError([
        {
          path: ["redirect_uris"],
          message: "redirect_uri must not contain a fragment.",
        },
      ]);
    }
    if (raw.includes("*")) {
      throw new ValidationError([
        {
          path: ["redirect_uris"],
          message: "Wildcards are not allowed in redirect_uri.",
        },
      ]);
    }

    const isLocalhost =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    const isHttps = url.protocol === "https:";
    if (!isLocalhost && !isHttps) {
      throw new ValidationError([
        {
          path: ["redirect_uris"],
          message: `redirect_uri must be https or http://localhost (got ${raw}).`,
        },
      ]);
    }

    out.push(raw);
  }
  return out;
}

function normalizeClientName(input: unknown): string {
  if (input === undefined || input === null) return "Unnamed client";
  if (typeof input !== "string") {
    throw new ValidationError([
      { path: ["client_name"], message: "client_name must be a string." },
    ]);
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) return "Unnamed client";
  if (trimmed.length > MAX_CLIENT_NAME_LENGTH) {
    throw new ValidationError([
      {
        path: ["client_name"],
        message: `client_name must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`,
      },
    ]);
  }
  return trimmed;
}

function toClient(row: typeof oauthClient.$inferSelect): OauthClient {
  return {
    id: row.id,
    name: row.name,
    redirectUris: row.redirectUris,
    createdAt: row.createdAt,
  };
}

export const SCOPE_LABELS: Record<Scope, string> = {
  "notes:read": "Read notes",
  "notes:write": "Create, edit, and delete notes",
  "tags:read": "Read tags",
};
