import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { DocsActions } from "@/components/docs/docs-actions";
import { DocsCategoryBadge, DocsNav } from "@/components/docs/docs-nav";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { ApiReference } from "@/components/docs/api-reference";
import { buttonVariants } from "@/components/ui/button";
import {
  buildAgentCommand,
  buildAgentPrompt,
  docsMarkdownHref,
  docsPageHref,
  getDocsPage,
  repoUrl,
  sortedDocsPages,
} from "@/lib/docs/content";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return sortedDocsPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    return { title: "Docs" };
  }

  return {
    title: `${page.title} - Docs`,
    description: page.description,
  };
}

export default async function DocsPage({ params }: Props) {
  const { slug } = await params;
  const page = getDocsPage(slug);
  if (!page) notFound();

  const index = sortedDocsPages.findIndex((item) => item.slug === page.slug);
  const previous = index > 0 ? sortedDocsPages[index - 1] : null;
  const next =
    index >= 0 && index < sortedDocsPages.length - 1
      ? sortedDocsPages[index + 1]
      : null;

  return (
    <main className="flex-1">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[14rem_1fr]">
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <DocsNav currentSlug={page.slug} />
          </div>
        </div>

        <article className="min-w-0">
          <div className="mb-8 flex flex-col gap-5 border-b pb-6">
            <div className="flex flex-col gap-3">
              <DocsCategoryBadge page={page} />
              <h1 className="text-4xl font-semibold tracking-tight text-balance">
                {page.title}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                {page.description}
              </p>
            </div>
            <DocsActions
              markdown={page.markdown}
              markdownHref={docsMarkdownHref(page)}
              repoUrl={repoUrl}
              agentPrompt={buildAgentPrompt(page)}
              commands={[
                {
                  label: "Open in Codex",
                  value: buildAgentCommand("codex", page),
                },
                {
                  label: "Open in Cursor",
                  value: buildAgentCommand("cursor", page),
                },
                {
                  label: "Open in Claude",
                  value: buildAgentCommand("claude", page),
                },
              ]}
            />
          </div>

          {page.slug === "api" ? (
            <ApiReference />
          ) : (
            <MarkdownRenderer markdown={page.markdown} skipFirstHeading />
          )}

          <nav
            aria-label="Docs pagination"
            className="mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-between"
          >
            {previous ? (
              <Link
                href={docsPageHref(previous)}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={docsPageHref(next)}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {next.title}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            ) : null}
          </nav>
        </article>
      </div>
    </main>
  );
}
