import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type PaginationProps = {
  page: number;
  totalPages: number;
  /**
   * Other URL params to preserve when paging — e.g. `?view=table&sort=title&dir=asc`.
   * `page` itself is omitted from this map; the component sets it.
   */
  preserve: Record<string, string>;
};

export function Pagination({ page, totalPages, preserve }: PaginationProps) {
  if (totalPages <= 1) return null;

  function urlFor(target: number) {
    const params = new URLSearchParams(preserve);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  }

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <PaginationRoot>
      <PaginationContent className="w-full justify-between gap-4">
        <PaginationItem>
          <PaginationPrevious
            href={canPrev ? urlFor(page - 1) : undefined}
            disabled={!canPrev}
            scroll={false}
          />
        </PaginationItem>
        <PaginationItem className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href={canNext ? urlFor(page + 1) : undefined}
            disabled={!canNext}
            scroll={false}
          />
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}
