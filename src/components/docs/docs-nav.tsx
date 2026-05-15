import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  docsPageHref,
  sortedDocsPages,
  type DocsPage,
} from "@/lib/docs/content";
import {
  getApiOperationsByTag,
  type OpenApiMethod,
} from "@/lib/docs/openapi";
import { cn } from "@/lib/utils";

const methodClassName: Record<OpenApiMethod, string> = {
  get: "text-foreground",
  post: "text-foreground",
  patch: "text-foreground",
  delete: "text-foreground",
};

export function DocsNav({ currentSlug }: { currentSlug?: string }) {
  const categories = [...new Set(sortedDocsPages.map((page) => page.category))];

  return (
    <nav aria-label="Docs" className="flex flex-col gap-6">
      {categories.map((category) => (
        <div key={category} className="flex flex-col gap-2">
          <div className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {category}
          </div>
          <div className="flex flex-col gap-1">
            {sortedDocsPages
              .filter((page) => page.category === category)
              .map((page) => (
                <div key={page.slug} className="flex flex-col gap-1">
                  <DocsNavLink
                    page={page}
                    active={page.slug === currentSlug}
                  />
                  {page.slug === "api" && currentSlug === "api" ? (
                    <ApiRouteLinks />
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DocsNavLink({
  page,
  active,
}: {
  page: DocsPage;
  active: boolean;
}) {
  return (
    <Link
      href={docsPageHref(page)}
      className={cn(
        "rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      {page.title}
    </Link>
  );
}

function ApiRouteLinks() {
  const groups = getApiOperationsByTag();

  return (
    <div className="ml-2 flex flex-col gap-3 border-l pl-3">
      {Object.entries(groups).map(([tag, operations]) => (
        <div key={tag} className="flex flex-col gap-1">
          <div className="px-2 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            {tag}
          </div>
          {operations.map(({ method, path, operation }) => (
            <Link
              key={operation.operationId}
              href={`/docs/api#${operation.operationId}`}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span
                className={cn(
                  "w-10 shrink-0 font-mono font-medium uppercase",
                  methodClassName[method],
                )}
              >
                {method.toUpperCase()}
              </span>
              <span className="min-w-0 truncate font-mono">{path}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DocsCategoryBadge({ page }: { page: DocsPage }) {
  return <Badge variant="secondary">{page.category}</Badge>;
}
