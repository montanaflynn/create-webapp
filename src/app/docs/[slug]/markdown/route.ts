import { getDocsPage, sortedDocsPages } from "@/lib/docs/content";

type Context = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return sortedDocsPages.map((page) => ({ slug: page.slug }));
}

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(`${page.markdown.trim()}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
