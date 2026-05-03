import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { devEmail } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  "reset-password": "Password reset",
  "verify-email": "Verify email",
  "change-email": "Change email",
  other: "Other",
};

export default async function AdminInboxPage() {
  const rows = await db.query.devEmail.findMany({
    orderBy: [desc(devEmail.createdAt)],
    limit: 200,
  });

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
          <p className="text-sm text-muted-foreground">
            Outgoing email captured by the app. Most recent 200.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              No emails captured yet. Trigger one from a user&apos;s detail
              page.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[18%]">Sent</TableHead>
                <TableHead className="w-[20%]">To</TableHead>
                <TableHead className="w-[18%]">Kind</TableHead>
                <TableHead>Subject</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">
                    {row.createdAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="truncate" title={row.to}>
                    {row.to}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {KIND_LABEL[row.kind] ?? row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/inbox/${row.id}`}
                      className="hover:underline"
                    >
                      {row.subject}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
