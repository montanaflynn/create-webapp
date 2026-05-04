import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pendingEmailChange } from "@/lib/db/schema";
import { ProfileForm } from "../profile-form";
import { SettingsToasts } from "../settings-toasts";

export default async function ProfilePage({
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

  const pendingRows = await db
    .select({
      newEmail: pendingEmailChange.newEmail,
      expiresAt: pendingEmailChange.expiresAt,
    })
    .from(pendingEmailChange)
    .where(eq(pendingEmailChange.userId, session.user.id));
  const pending = pendingRows[0];
  const pendingActive =
    pending && !isExpired(pending.expiresAt) ? pending : null;

  return (
    <>
      <SettingsToasts
        emailChanged={sp["email-changed"] === "1"}
        emailCancelled={sp["email-cancelled"] === "1"}
      />
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
    </>
  );
}

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}
