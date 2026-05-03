import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, note, session as sessionTable } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Privacy-preserving query: never select note content or session metadata,
  // only counts and last-active timestamps.
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      noteCount: sql<number>`count(distinct ${note.id})::int`,
      sessionCount: sql<number>`count(distinct ${sessionTable.id})::int`,
      lastSeen: sql<Date | null>`max(${sessionTable.createdAt})`,
    })
    .from(user)
    .leftJoin(note, eq(note.userId, user.id))
    .leftJoin(sessionTable, eq(sessionTable.userId, user.id))
    .groupBy(user.id)
    .orderBy(desc(user.createdAt));

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "user" : "users"}
          </p>
        </div>
      </header>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="w-[18%]">Name</TableHead>
              <TableHead className="w-[10%]">Role</TableHead>
              <TableHead className="w-[10%]">Status</TableHead>
              <TableHead className="w-[8%] text-right">Notes</TableHead>
              <TableHead className="w-[12%]">Last seen</TableHead>
              <TableHead className="w-[12%]">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={`/admin/users/${r.id}`}
                    className="hover:underline"
                  >
                    {r.email}
                  </Link>
                </TableCell>
                <TableCell className="truncate" title={r.name}>
                  {r.name}
                </TableCell>
                <TableCell>
                  <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                    {r.role ?? "user"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.banned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : !r.emailVerified ? (
                    <Badge variant="outline">Unverified</Badge>
                  ) : (
                    <Badge variant="outline">Verified</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.noteCount}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.lastSeen ? new Date(r.lastSeen).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
