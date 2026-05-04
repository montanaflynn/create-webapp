import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { passkey, pendingEmailChange } from "@/lib/db/schema";
import { listApiKeys } from "@/lib/services/api-keys";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";
import { PasskeysForm } from "./passkeys-form";
import { ApiKeysForm } from "./api-keys-form";
import { SettingsToasts } from "./settings-toasts";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    "email-changed"?: string;
    "email-cancelled"?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const sp = await searchParams;

  const [pendingRows, passkeyRows, apiKeyRows] = await Promise.all([
    db
      .select({
        newEmail: pendingEmailChange.newEmail,
        expiresAt: pendingEmailChange.expiresAt,
      })
      .from(pendingEmailChange)
      .where(eq(pendingEmailChange.userId, session.user.id)),
    db
      .select({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, session.user.id))
      .orderBy(desc(passkey.createdAt)),
    listApiKeys(session.user.id),
  ]);
  const pending = pendingRows[0];
  // Auto-clear stale rows from view (the row stays in DB until next change submit
  // or manual cancel, but we don't want to show an expired pending banner).
  const pendingActive = pending && !isExpired(pending.expiresAt) ? pending : null;

  return (
    <>
      <SettingsToasts
        emailChanged={sp["email-changed"] === "1"}
        emailCancelled={sp["email-cancelled"] === "1"}
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account.</p>
      </div>
      <div className="space-y-6">
        <ProfileForm
          initialName={session.user.name}
          email={session.user.email}
          pending={
            pendingActive
              ? {
                  newEmail: pendingActive.newEmail,
                  expiresAt: pendingActive.expiresAt.toISOString(),
                }
              : null
          }
        />
        <PasswordForm />
        <PasskeysForm
          passkeys={passkeyRows.map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt ? p.createdAt.toISOString() : null,
          }))}
        />
        <ApiKeysForm
          keys={apiKeyRows.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            scopes: k.scopes,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
          }))}
        />
      </div>
    </>
  );
}

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}
