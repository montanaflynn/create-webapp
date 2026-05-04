import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  primaryKey,
  jsonb,
  index,
  integer,
  check,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Admin plugin fields. `role` is comma-separated for multi-role; null means
  // default ("user"). `banned`/`banReason`/`banExpires` are populated when an
  // admin bans a user; better-auth checks `banExpires` at sign-in time.
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Admin plugin: ID of admin currently impersonating, null otherwise.
  // The (app) layout surfaces a banner when this is set.
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Passkey plugin (@better-auth/passkey). Property names must stay camelCase
// — the better-auth drizzle adapter looks them up by JS key, not column name.
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
    aaguid: text("aaguid"),
  },
  (t) => [
    index("passkey_user_id_idx").on(t.userId),
    index("passkey_credential_id_idx").on(t.credentialID),
  ],
);

export const note = pgTable("note", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tag = pgTable(
  "tag",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tag_user_name_uniq").on(t.userId, t.name)],
);

export const noteTag = pgTable(
  "note_tag",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);

// Relations — used by the relational query API (`db.query.note.findMany({ with: ... })`).
// Drizzle resolves m:m by chaining two many-to-one relations through the junction table.

export const noteRelations = relations(note, ({ many }) => ({
  noteTags: many(noteTag),
}));

export const tagRelations = relations(tag, ({ many }) => ({
  noteTags: many(noteTag),
}));

export const noteTagRelations = relations(noteTag, ({ one }) => ({
  note: one(note, { fields: [noteTag.noteId], references: [note.id] }),
  tag: one(tag, { fields: [noteTag.tagId], references: [tag.id] }),
}));

// API keys for programmatic access (CLI, MCP, custom integrations). Stored
// hashed — the full secret is shown only once at creation. `prefix` is the
// visible label (e.g. `cwa_a1b2c3d4`) that lets users identify a key in the
// UI without exposing the secret. `scopes` is a flat list of capability
// strings ("notes:read", "notes:write", ...). `revokedAt` lets us soft-delete
// without orphaning audit-log rows that reference this key.
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [
    index("api_key_user_id_idx").on(t.userId),
    uniqueIndex("api_key_hash_uniq").on(t.hash),
  ],
);

// OAuth 2.1 (RFC 6749 + 7636 PKCE + 7591 DCR + 7009 revocation). Public
// clients only — no client_secret column. Each `oauth_client` is created
// dynamically via `/api/oauth/register`; registration is open per the MCP
// spec, throttled per IP. Redirect URIs are validated at registration time
// (localhost + https only) and matched exactly at authorize/token time.
export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One-shot authorization codes. Issued by the consent screen (signed-in
// user clicks "Authorize"), exchanged at /api/oauth/token within 10 minutes.
// `consumedAt` is set on first use — replay attempts after that throw
// `invalid_grant`. PKCE is mandatory: every row has a code_challenge that
// the token endpoint verifies against the presented code_verifier.
export const oauthAuthCode = pgTable("oauth_auth_code", {
  code: text("code").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClient.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
});

// Issued access + refresh token pair. We store SHA-256 hashes only — the
// plaintext (`oat_acc_...` / `oat_rfr_...`) is returned to the client once
// at issuance and never stored. Refresh tokens are single-use: refreshing
// nulls the old `refreshTokenHash` atomically and issues a new row.
// `revokedAt` covers explicit RFC 7009 revocation and rotation.
export const oauthToken = pgTable(
  "oauth_token",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash"),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at"),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("oauth_token_access_hash_uniq").on(t.accessTokenHash),
    index("oauth_token_user_id_idx").on(t.userId),
  ],
);

// State-changing actions across every adapter (server actions, REST, MCP, CLI)
// land here. `principalKind` discriminates the auth context (cookie session,
// API key, OAuth token). For "api_key" rows, `apiKeyId` points at the
// verified key; for "oauth_token" rows, `oauthTokenId` points at the issued
// token. Both FKs use ON DELETE SET NULL so revoking a credential never
// destroys its audit trail. The CHECK constraint keeps principal_kind and
// the credential FK columns in sync. `metadata` is freeform JSON for
// per-action context (e.g. `{ fields: ["title"] }` on an update).
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKey.id, {
      onDelete: "set null",
    }),
    oauthTokenId: text("oauth_token_id").references(() => oauthToken.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    principalKind: text("principal_kind").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_id_idx").on(t.userId),
    index("audit_log_created_at_idx").on(t.createdAt),
    check(
      "audit_log_principal_consistent",
      sql`
        (principal_kind = 'session'     AND api_key_id IS NULL     AND oauth_token_id IS NULL) OR
        (principal_kind = 'api_key'     AND api_key_id IS NOT NULL AND oauth_token_id IS NULL) OR
        (principal_kind = 'oauth_token' AND oauth_token_id IS NOT NULL AND api_key_id IS NULL)
      `,
    ),
  ],
);

// One row per user with a pending email-change verification. Lets /settings
// show "change to X pending — cancel" without re-querying better-auth's
// internal verification table, and lets our custom confirmation page look up
// the staged email by token without consuming better-auth's row prematurely.
export const pendingEmailChange = pgTable("pending_email_change", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  newEmail: text("new_email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Captured outgoing emails when the active transport is the DB inbox
// (dev + staging). Browse at /dev/inbox locally; future /admin/inbox in
// staging once the admin-RBAC plugin lands.
export const devEmail = pgTable(
  "dev_email",
  {
    id: text("id").primaryKey(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    kind: text("kind").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("dev_email_created_at_idx").on(t.createdAt)],
);
