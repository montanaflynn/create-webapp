import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pendingEmailChange } from "@/lib/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });
  // proxy.ts already redirects unauthenticated users to /sign-in for /settings/*

  let body: React.ReactNode;
  if (!token) {
    body = invalid("Missing token. Open the link from your email again.");
  } else {
    const rows = await db
      .select()
      .from(pendingEmailChange)
      .where(eq(pendingEmailChange.token, token));
    const row = rows[0];

    if (!row) {
      body = invalid(
        "This confirmation link is no longer valid. The change may have already been confirmed, cancelled, or expired.",
      );
    } else if (isExpired(row.expiresAt)) {
      body = invalid(
        "This confirmation link has expired. Submit the change again from settings.",
      );
    } else if (session && session.user.id !== row.userId) {
      body = invalid("This link belongs to a different account.");
    } else {
      body = (
        <ConfirmForm
          token={token}
          newEmail={row.newEmail}
          currentEmail={session?.user.email ?? ""}
        />
      );
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Confirm email change</CardTitle>
        <CardDescription>
          One last step before we update your account email.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

function invalid(msg: string) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{msg}</p>
      <Link href="/settings" className="underline underline-offset-2">
        Back to settings
      </Link>
    </div>
  );
}
