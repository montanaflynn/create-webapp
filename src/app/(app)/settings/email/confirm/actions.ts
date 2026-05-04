"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pendingEmailChange, user } from "@/lib/db/schema";

export async function confirmEmailChangeAction(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Sign in to confirm the change.");

  const token = String(formData.get("token") ?? "");
  const typedEmail = String(formData.get("typedEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!token) throw new Error("Missing token");

  const rows = await db
    .select()
    .from(pendingEmailChange)
    .where(eq(pendingEmailChange.token, token));
  const row = rows[0];

  if (!row) throw new Error("This confirmation link is no longer valid.");
  if (row.userId !== session.user.id) {
    throw new Error("This link belongs to a different account.");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .delete(pendingEmailChange)
      .where(eq(pendingEmailChange.id, row.id));
    throw new Error("This confirmation link has expired.");
  }
  if (typedEmail !== row.newEmail.toLowerCase()) {
    throw new Error("That doesn't match the pending new email.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        email: row.newEmail,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, row.userId));
    await tx
      .delete(pendingEmailChange)
      .where(eq(pendingEmailChange.id, row.id));
  });

  redirect("/settings/profile?email-changed=1");
}

export async function cancelEmailChangeAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Sign in to cancel the change.");
  await db
    .delete(pendingEmailChange)
    .where(eq(pendingEmailChange.userId, session.user.id));
  redirect("/settings/profile?email-cancelled=1");
}
