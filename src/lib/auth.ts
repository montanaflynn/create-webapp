import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { pendingEmailChange } from "./db/schema";
import { sendMail } from "./mailer";
import {
  resetPasswordTemplate,
  verifyEmailTemplate,
  changeEmailTemplate,
} from "./mailer/templates";

const bootstrapAdminIds = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Default change-email link TTL. Matches better-auth's verification expiry
// (1h). Kept here so /settings can render a real "expires in" hint.
const CHANGE_EMAIL_TTL_MS = 60 * 60 * 1000;

function newId() {
  return `pec_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// WebAuthn requires rpID = exact hostname and origin = exact origin.
// Mismatch fails the assertion silently with no useful error.
function rpFromUrl(input: string | undefined) {
  const url = new URL(input ?? "http://localhost:3000");
  return { id: url.hostname, origin: url.origin };
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      // void: don't await — better-auth docs flag awaiting as a timing-attack risk on token gen.
      void sendMail({
        to: user.email,
        ...resetPasswordTemplate({ user, url }),
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendMail({
        to: user.email,
        ...verifyEmailTemplate({ user, url }),
      });
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      adminUserIds: bootstrapAdminIds,
    }),
    passkey({
      // rpID must be the bare hostname (no scheme/port). origin is the full URL.
      // Both are derived from BETTER_AUTH_URL so dev (localhost) and prod work
      // without extra env wiring.
      rpID: rpFromUrl(process.env.BETTER_AUTH_URL).id,
      rpName: "create-webapp",
      origin: rpFromUrl(process.env.BETTER_AUTH_URL).origin,
    }),
  ],
  user: {
    changeEmail: {
      enabled: true,
      // sendChangeEmailConfirmation (not sendChangeEmailVerification) — this
      // is the hook that targets the *current* email to approve the change.
      // The other one targets the new address and we don't want that flow.
      sendChangeEmailConfirmation: async ({
        user,
        newEmail,
        token,
      }: {
        user: { id: string; email: string; name?: string | null };
        newEmail: string;
        url: string;
        token: string;
      }) => {
        // Track pending state so /settings can show + cancel.
        // One row per user — re-submitting overwrites the prior token.
        const expiresAt = new Date(Date.now() + CHANGE_EMAIL_TTL_MS);
        await db
          .insert(pendingEmailChange)
          .values({
            id: newId(),
            userId: user.id,
            newEmail,
            token,
            expiresAt,
          })
          .onConflictDoUpdate({
            target: pendingEmailChange.userId,
            set: { id: newId(), newEmail, token, expiresAt },
          });

        // Override better-auth's URL so the link points at our confirmation
        // page (which gates the change behind a re-typed-email step) instead
        // of better-auth's auto-apply endpoint.
        const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
        const customUrl = `${base}/settings/email/confirm?token=${encodeURIComponent(token)}`;

        void sendMail({
          to: user.email,
          ...changeEmailTemplate({ user, newEmail, url: customUrl }),
        });
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
