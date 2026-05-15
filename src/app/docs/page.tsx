import type { Metadata } from "next";
import Link from "next/link";
import {
  BotIcon,
  BracesIcon,
  FileJsonIcon,
  FileTextIcon,
  GitBranchIcon,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { docsPageHref, sortedDocsPages } from "@/lib/docs/content";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Docs",
  description: "Documentation for the notes app, API, MCP server, and admin.",
};

const machineReadableLinks = [
  {
    title: "llms.txt",
    description: "Concise index for agents and copy/paste context.",
    href: "/llms.txt",
    icon: BotIcon,
  },
  {
    title: "llms-full.txt",
    description: "Full docs bundle as one Markdown-friendly text file.",
    href: "/llms-full.txt",
    icon: GitBranchIcon,
  },
  {
    title: "docs.json",
    description: "Structured manifest of docs pages and Markdown URLs.",
    href: "/docs.json",
    icon: BracesIcon,
  },
  {
    title: "openapi.json",
    description: "OpenAPI 3.1 contract for the public REST API.",
    href: "/openapi.json",
    icon: FileJsonIcon,
  },
] as const;

export default function DocsIndexPage() {
  const categories = [...new Set(sortedDocsPages.map((page) => page.category))];

  return (
    <main className="flex-1">
      <section className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-balance">
              Notes app documentation
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Use the notes workspace, manage account security, script the REST
              API and CLI, connect MCP clients, and run the app in production.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/llms.txt" className={cn(buttonVariants({ size: "sm" }))}>
              <BotIcon data-icon="inline-start" />
              Open llms.txt
            </Link>
            <Link
              href="/llms-full.txt"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <FileTextIcon data-icon="inline-start" />
              Full Markdown
            </Link>
            <Link
              href="/docs.json"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <BracesIcon data-icon="inline-start" />
              Manifest
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-8">
          {categories.map((category) => (
            <div key={category} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {sortedDocsPages
                  .filter((page) => page.category === category)
                  .map((page) => (
                    <Link
                      key={page.slug}
                      href={docsPageHref(page)}
                      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Card
                        size="sm"
                        className="h-full transition-colors hover:bg-muted"
                      >
                        <CardHeader>
                          <CardTitle>{page.title}</CardTitle>
                          <CardDescription className="text-foreground/75">
                            {page.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Machine-readable
          </h2>
          <div className="flex flex-col gap-3">
            {machineReadableLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border p-4 text-sm transition-colors hover:bg-muted"
              >
                <item.icon className="mb-3" aria-hidden />
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-foreground/75">
                  {item.description}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
