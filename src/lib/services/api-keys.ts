import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import { recordAudit, type Actor } from "./audit";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "./errors";

// The full set of scopes a key can hold. Every entry point into the system
// (REST handlers, MCP tools, CLI commands) names one or more of these to
// declare what it needs. Adding a new resource means adding new scopes here
// and at the call sites — no implicit privilege growth.
export const SCOPES = [
  "notes:read",
  "notes:write",
  "tags:read",
] as const;
export type Scope = (typeof SCOPES)[number];

const SCOPE_SET = new Set<string>(SCOPES);

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type CreatedKey = {
  key: ApiKey;
  /** Full secret. Returned only once — at creation. */
  secret: string;
};

export type VerifiedKey = {
  apiKeyId: string;
  userId: string;
  scopes: Scope[];
};

const SECRET_BYTES = 32; // 256 bits of entropy
const KEY_PREFIX = "cwa_";
const VISIBLE_PREFIX_LENGTH = KEY_PREFIX.length + 8;
const MAX_NAME_LENGTH = 80;
const MAX_KEYS_PER_USER = 50;

export async function createApiKey(
  actor: Actor,
  input: { name: string; scopes: Scope[] },
): Promise<CreatedKey> {
  const name = input.name?.trim() ?? "";
  if (name.length === 0) {
    throw new ValidationError([
      { path: ["name"], message: "Name is required." },
    ]);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError([
      { path: ["name"], message: `Name must be at most ${MAX_NAME_LENGTH} characters.` },
    ]);
  }
  const scopes = normalizeScopes(input.scopes);

  // Cap per-user to keep the key list manageable and prevent runaway creation.
  const existing = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.userId, actor.userId), isNull(apiKey.revokedAt)));
  if (existing.length >= MAX_KEYS_PER_USER) {
    throw new ForbiddenError(
      `Limit of ${MAX_KEYS_PER_USER} active keys reached. Revoke one before creating another.`,
    );
  }

  const secret = generateSecret();
  const hash = sha256(secret);
  const id = crypto.randomUUID();

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(apiKey)
      .values({
        id,
        userId: actor.userId,
        name,
        prefix: secret.slice(0, VISIBLE_PREFIX_LENGTH),
        hash,
        scopes,
      })
      .returning();
    await recordAudit(tx, actor, "api_key.create", {
      type: "api_key",
      id,
      metadata: { name, scopes },
    });
    return inserted;
  });

  return { key: toApiKey(row), secret };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.userId, userId));
  return rows.map(toApiKey).sort((a, b) => {
    // Active first, then by created descending.
    const aActive = a.revokedAt ? 1 : 0;
    const bActive = b.revokedAt ? 1 : 0;
    if (aActive !== bActive) return aActive - bActive;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function revokeApiKey(actor: Actor, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKey.id, id),
          eq(apiKey.userId, actor.userId),
          isNull(apiKey.revokedAt),
        ),
      )
      .returning({ id: apiKey.id });
    if (result.length === 0) throw new NotFoundError("api_key", id);
    await recordAudit(tx, actor, "api_key.revoke", { type: "api_key", id });
  });
}

/**
 * Verify a presented bearer secret. Returns the owning user + scopes if the
 * key exists, hasn't been revoked, and matches. Updates `lastUsedAt` as a
 * side effect.
 *
 * Lookup is by hash (full-length SHA-256), which is stored uniquely indexed —
 * the secret entropy is in the hash input, so a direct `eq(hash)` lookup is
 * not a timing-attack vector. We still use `timingSafeEqual` on the hash bytes
 * for defense in depth.
 */
export async function verifyApiKey(secret: string): Promise<VerifiedKey> {
  if (typeof secret !== "string" || !secret.startsWith(KEY_PREFIX)) {
    throw new UnauthenticatedError("Invalid API key.");
  }
  const hash = sha256(secret);
  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)));
  if (!row) throw new UnauthenticatedError("Invalid API key.");

  const expected = Buffer.from(row.hash, "hex");
  const presented = Buffer.from(hash, "hex");
  if (
    expected.length !== presented.length ||
    !timingSafeEqual(expected, presented)
  ) {
    throw new UnauthenticatedError("Invalid API key.");
  }

  // Best-effort timestamp update; failure here must not block the request.
  void db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, row.id))
    .catch(() => undefined);

  return {
    apiKeyId: row.id,
    userId: row.userId,
    scopes: filterValidScopes(row.scopes),
  };
}

/** Throws ForbiddenError if the key lacks any of the required scopes. */
export function assertScopes(verified: VerifiedKey, required: Scope[]): void {
  const held = new Set(verified.scopes);
  const missing = required.filter((s) => !held.has(s));
  if (missing.length > 0) {
    throw new ForbiddenError(
      `Key is missing required scope${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------

function generateSecret(): string {
  // base64url, no padding — URL-safe and shell-safe.
  return KEY_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeScopes(input: unknown): Scope[] {
  if (!Array.isArray(input)) {
    throw new ValidationError([
      { path: ["scopes"], message: "Scopes must be an array." },
    ]);
  }
  const filtered = filterValidScopes(input);
  if (filtered.length === 0) {
    throw new ValidationError([
      { path: ["scopes"], message: "At least one valid scope is required." },
    ]);
  }
  // Dedupe, preserve insertion order.
  return Array.from(new Set(filtered));
}

function filterValidScopes(input: unknown): Scope[] {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is Scope => typeof s === "string" && SCOPE_SET.has(s));
}

function toApiKey(row: typeof apiKey.$inferSelect): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: filterValidScopes(row.scopes),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}
