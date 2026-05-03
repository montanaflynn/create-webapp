import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { ChevronLeftIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user, note, session as sessionTable } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DeleteUserButton } from "./delete-user-button";
import { ActionForm } from "./action-form";
import {
  banUserAction,
  resendVerifyEmail,
  sendPasswordResetEmail,
  setRoleAction,
  unbanUserAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const isSelf = session?.user.id === id;

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      noteCount: sql<number>`count(distinct ${note.id})::int`,
      sessionCount: sql<number>`count(distinct ${sessionTable.id})::int`,
      lastSeen: sql<Date | null>`max(${sessionTable.createdAt})`,
    })
    .from(user)
    .leftJoin(note, eq(note.userId, user.id))
    .leftJoin(sessionTable, eq(sessionTable.userId, user.id))
    .where(eq(user.id, id))
    .groupBy(user.id);

  const u = rows[0];
  if (!u) notFound();

  const role = u.role ?? "user";
  const isAdmin = role === "admin";

  return (
    <section className="space-y-6">
      <Link
        href="/admin/users"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2",
        )}
      >
        <ChevronLeftIcon className="mr-1 size-4" /> Users
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{u.email}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={isAdmin ? "default" : "secondary"}>{role}</Badge>
          {u.banned && <Badge variant="destructive">Banned</Badge>}
          <Badge variant={u.emailVerified ? "secondary" : "outline"}>
            {u.emailVerified ? "Verified" : "Unverified"}
          </Badge>
          {isSelf && <Badge variant="outline">You</Badge>}
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{u.name}</dd>
        <dt className="text-muted-foreground">User ID</dt>
        <dd className="font-mono text-xs">{u.id}</dd>
        <dt className="text-muted-foreground">Notes</dt>
        <dd className="tabular-nums">{u.noteCount}</dd>
        <dt className="text-muted-foreground">Active sessions</dt>
        <dd className="tabular-nums">{u.sessionCount}</dd>
        <dt className="text-muted-foreground">Last seen</dt>
        <dd>{u.lastSeen ? new Date(u.lastSeen).toLocaleString() : "—"}</dd>
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{new Date(u.createdAt).toLocaleString()}</dd>
        {u.banReason && (
          <>
            <dt className="text-muted-foreground">Ban reason</dt>
            <dd>{u.banReason}</dd>
          </>
        )}
        {u.banned && (
          <>
            <dt className="text-muted-foreground">Ban expires</dt>
            <dd>
              {u.banExpires
                ? new Date(u.banExpires).toLocaleString()
                : "Permanent"}
            </dd>
          </>
        )}
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          title="Send password reset email"
          description="Triggers the same flow as the user clicking 'Forgot password' — link goes to their inbox (or /dev/inbox locally)."
        >
          <ActionForm
            action={sendPasswordResetEmail}
            success={`Reset email sent to ${u.email}`}
          >
            <input type="hidden" name="email" value={u.email} />
            <Button type="submit" size="sm" variant="outline">
              Send reset email
            </Button>
          </ActionForm>
        </ActionCard>

        {!u.emailVerified && (
          <ActionCard
            title="Resend verification email"
            description="User has not verified their email yet."
          >
            <ActionForm
              action={resendVerifyEmail}
              success={`Verification email sent to ${u.email}`}
            >
              <input type="hidden" name="email" value={u.email} />
              <Button type="submit" size="sm" variant="outline">
                Send verify email
              </Button>
            </ActionForm>
          </ActionCard>
        )}

        <ActionCard
          title="Role"
          description={
            isSelf
              ? "Demoting yourself would lock you out — disabled."
              : isAdmin
                ? "Demote to regular user."
                : "Promote to admin."
          }
        >
          <ActionForm
            action={setRoleAction}
            success={isAdmin ? "Demoted to user" : "Promoted to admin"}
          >
            <input type="hidden" name="userId" value={u.id} />
            <input
              type="hidden"
              name="role"
              value={isAdmin ? "user" : "admin"}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={isSelf}
            >
              {isAdmin ? "Demote to user" : "Promote to admin"}
            </Button>
          </ActionForm>
        </ActionCard>

        <ActionCard
          title={u.banned ? "Unban user" : "Ban user"}
          description={
            u.banned
              ? "Restore the user's access."
              : "Banned users can't sign in. Their existing sessions are revoked."
          }
        >
          {u.banned ? (
            <ActionForm action={unbanUserAction} success="User unbanned">
              <input type="hidden" name="userId" value={u.id} />
              <Button type="submit" size="sm" variant="outline">
                Unban
              </Button>
            </ActionForm>
          ) : (
            <ActionForm
              action={banUserAction}
              success="User banned"
              className="space-y-4"
            >
              <input type="hidden" name="userId" value={u.id} />
              <div className="space-y-1.5">
                <Label htmlFor="banReason" className="text-xs">
                  Reason
                </Label>
                <Input
                  id="banReason"
                  name="banReason"
                  defaultValue="Banned by admin"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="banExpires" className="text-xs">
                  Expires (optional — empty means permanent)
                </Label>
                <Input
                  id="banExpires"
                  name="banExpires"
                  type="datetime-local"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isSelf}
              >
                Ban
              </Button>
            </ActionForm>
          )}
        </ActionCard>

        <ActionCard
          title="Delete user"
          description="Cascades to notes, tags, and sessions."
        >
          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              Cannot delete yourself.
            </p>
          ) : (
            <DeleteUserButton userId={u.id} userEmail={u.email} />
          )}
        </ActionCard>
      </div>
    </section>
  );
}

function ActionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
