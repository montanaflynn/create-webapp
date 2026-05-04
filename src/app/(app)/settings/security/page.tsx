import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { passkey } from "@/lib/db/schema";
import { PasswordForm } from "../password-form";
import { PasskeysForm } from "../passkeys-form";

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const passkeyRows = await db
    .select({
      id: passkey.id,
      name: passkey.name,
      createdAt: passkey.createdAt,
    })
    .from(passkey)
    .where(eq(passkey.userId, session.user.id))
    .orderBy(desc(passkey.createdAt));

  return (
    <>
      <PasswordForm />
      <PasskeysForm
        passkeys={passkeyRows.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        }))}
      />
    </>
  );
}
