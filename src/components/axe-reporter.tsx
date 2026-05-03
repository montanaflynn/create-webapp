"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

// Dev-only: runs axe-core against the live DOM on every route change and
// reports violations to the browser console. Skipped in production builds.
//
// We use axe-core directly instead of @axe-core/react because the latter
// tries to monkey-patch React.createElement, which throws under React 19's
// frozen ESM module namespace ("Cannot set property createElement of
// [object Module] which has only a getter").
export function AxeReporter() {
  const pathname = usePathname();

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;

    // Debounce so we wait for the new route to settle before scanning.
    const handle = window.setTimeout(async () => {
      const axe = (await import("axe-core")).default;
      const results = await axe.run(document);
      if (results.violations.length === 0) {
        console.log(`[axe] ${pathname}: no violations`);
        return;
      }
      console.groupCollapsed(
        `[axe] ${pathname}: ${results.violations.length} violation(s)`,
      );
      for (const v of results.violations) {
        console.warn(`[${v.impact}] ${v.help}`, {
          rule: v.id,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        });
      }
      console.groupEnd();
    }, 1000);

    return () => window.clearTimeout(handle);
  }, [pathname]);

  return null;
}
