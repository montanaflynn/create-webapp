import {
  docsMarkdownHref,
  docsPageHref,
  repoUrl,
  sortedDocsPages,
} from "@/lib/docs/content";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/branding";

export function GET() {
  return Response.json(
    {
      name: APP_NAME,
      description: APP_DESCRIPTION,
      repository: repoUrl,
      llmsTxt: "/llms.txt",
      llmsFullTxt: "/llms-full.txt",
      pages: sortedDocsPages.map((page) => ({
        slug: page.slug,
        title: page.title,
        description: page.description,
        category: page.category,
        href: docsPageHref(page),
        markdownHref: docsMarkdownHref(page),
      })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
