"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const GAP_PX = 4; // matches gap-1

/**
 * Renders tag chips that fit on a single line; the rest are collapsed into a
 * `+N` badge. Measures with a ResizeObserver so the cut-off updates when the
 * column resizes (window resize, sidebar toggle, etc.).
 */
export function TagsCell({ tags }: { tags: string[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Start with hidden = 0 so the server-rendered HTML and the first client
  // render match (no hydration mismatch). The effect below recomputes.
  const [hidden, setHidden] = React.useState(0);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function update() {
      if (!container) return;
      const chipEls = Array.from(
        container.querySelectorAll<HTMLElement>("[data-chip]"),
      );
      const badgeEl = container.querySelector<HTMLElement>("[data-badge]");

      // Reset everything to visible so widths are measurable.
      chipEls.forEach((el) => {
        el.style.display = "";
        el.removeAttribute("aria-hidden");
      });
      if (badgeEl) badgeEl.style.display = "";

      const containerWidth = container.clientWidth;
      const badgeWidth = badgeEl ? badgeEl.offsetWidth + GAP_PX : 0;

      let used = 0;
      let fitCount = chipEls.length;
      for (let i = 0; i < chipEls.length; i++) {
        const w = chipEls[i].offsetWidth + (i === 0 ? 0 : GAP_PX);
        // Reserve room for the badge if we'd be hiding any chip after this.
        const reservedForBadge = i < chipEls.length - 1 ? badgeWidth : 0;
        if (used + w + reservedForBadge > containerWidth) {
          fitCount = i;
          break;
        }
        used += w;
      }

      chipEls.forEach((el, i) => {
        const visible = i < fitCount;
        el.style.display = visible ? "" : "none";
        if (visible) {
          el.removeAttribute("aria-hidden");
        } else {
          el.setAttribute("aria-hidden", "true");
        }
      });
      const hiddenNow = chipEls.length - fitCount;
      if (badgeEl) badgeEl.style.display = hiddenNow > 0 ? "" : "none";
      setHidden(hiddenNow);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [tags]);

  if (tags.length === 0) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }

  return (
    <div
      ref={containerRef}
      className="flex w-full flex-nowrap items-center gap-1 overflow-hidden"
    >
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          data-chip
          className="shrink-0"
          render={
            <Link href={`/dashboard?tag=${encodeURIComponent(tag)}`} />
          }
        >
          {tag}
        </Badge>
      ))}
      <Badge
        variant="secondary"
        data-badge
        aria-label={`${hidden} more tag${hidden === 1 ? "" : "s"}`}
        className="shrink-0"
        style={hidden === 0 ? { display: "none" } : undefined}
      >
        +{hidden}
      </Badge>
    </div>
  );
}
