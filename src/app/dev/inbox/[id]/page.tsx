import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeftIcon } from "lucide-react";
import { db } from "@/lib/db";
import { devEmail } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DevInboxDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await db.query.devEmail.findFirst({
    where: eq(devEmail.id, id),
  });
  if (!row) notFound();

  const meta = row.meta as Record<string, unknown> | null;
  const url = typeof meta?.url === "string" ? meta.url : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6">
      <Link
        href="/dev/inbox"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2",
        )}
      >
        <ChevronLeftIcon className="mr-1 size-4" /> Inbox
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {row.subject}
        </h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">To</dt>
          <dd>{row.to}</dd>
          <dt className="text-muted-foreground">Kind</dt>
          <dd>
            <Badge variant="secondary">{row.kind}</Badge>
          </dd>
          <dt className="text-muted-foreground">Sent</dt>
          <dd>{row.createdAt.toLocaleString()}</dd>
          {url && (
            <>
              <dt className="text-muted-foreground">Action link</dt>
              <dd>
                <a
                  href={url}
                  className="break-all text-primary underline-offset-2 hover:underline"
                >
                  {url}
                </a>
              </dd>
            </>
          )}
        </dl>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Rendered HTML
        </h2>
        <iframe
          srcDoc={row.html}
          title="Email preview"
          sandbox=""
          className="h-96 w-full rounded-md border bg-white"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Plain text
        </h2>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">
          {row.text}
        </pre>
      </section>
    </main>
  );
}
