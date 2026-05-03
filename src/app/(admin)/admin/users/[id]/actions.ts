"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";

async function assertAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string | null } | undefined)?.role;
  if (!session || role !== "admin") {
    throw new Error("forbidden");
  }
  return session;
}

export async function sendPasswordResetEmail(formData: FormData) {
  await assertAdmin();
  const email = String(formData.get("email") ?? "");
  if (!email) throw new Error("email required");
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
  revalidatePath("/dev/inbox");
  revalidatePath("/admin/inbox");
}

export async function resendVerifyEmail(formData: FormData) {
  await assertAdmin();
  const email = String(formData.get("email") ?? "");
  if (!email) throw new Error("email required");

  // Refuse if the user is already verified — re-issuing is a no-op for them
  // and would leak email-existence to a replayed/curl call against this action.
  const rows = await db
    .select({ emailVerified: userTable.emailVerified })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (rows[0]?.emailVerified) {
    throw new Error("already verified");
  }

  await auth.api.sendVerificationEmail({
    body: { email, callbackURL: "/dashboard" },
  });
  revalidatePath("/dev/inbox");
  revalidatePath("/admin/inbox");
}

export async function banUserAction(formData: FormData) {
  await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  const banReason = String(formData.get("banReason") ?? "Banned by admin");
  if (!userId) throw new Error("userId required");

  // Empty `banExpires` (datetime-local input) → permanent ban.
  const banExpires = String(formData.get("banExpires") ?? "").trim();
  let banExpiresIn: number | undefined;
  if (banExpires) {
    const ms = new Date(banExpires).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new Error("Expiry must be in the future");
    }
    banExpiresIn = Math.floor(ms / 1000);
  }

  await auth.api.banUser({
    body: { userId, banReason, banExpiresIn },
    headers: await headers(),
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function unbanUserAction(formData: FormData) {
  await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("userId required");
  await auth.api.unbanUser({
    body: { userId },
    headers: await headers(),
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setRoleAction(formData: FormData) {
  await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "user");
  if (!userId || (role !== "admin" && role !== "user")) {
    throw new Error("userId and valid role required");
  }
  await auth.api.setRole({
    body: { userId, role: role as "admin" | "user" },
    headers: await headers(),
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const session = await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("userId required");
  if (userId === session.user.id) throw new Error("cannot delete yourself");
  await auth.api.removeUser({
    body: { userId },
    headers: await headers(),
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
