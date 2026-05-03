---
name: tailwind
description: Tailwind CSS rules and CSS layout gotchas - flex/grid intrinsic sizing (the min-w-0 trap), responsive design, truncation/overflow, Tailwind v4 specifics, and semantic theme tokens. Apply when writing or reviewing Tailwind classes, debugging horizontal scrollbars, fixing truncation, making layouts responsive, or any time CSS doesn't behave as expected.
user-invocable: false
---

# Tailwind & CSS Layout

This project uses **Tailwind v4** with `@theme inline` in `src/app/globals.css`. There is no `tailwind.config.js`. Apply these rules when writing or reviewing classes; the rules are ordered by how often they bite.

## Critical rules

These are the ones that actually break layouts. Each links to a file with Incorrect/Correct pairs.

### 1. The `min-w-0` trap → [min-width-zero.md](./min-width-zero.md)

**Flex and grid items default to `min-width: auto`**, meaning they refuse to shrink below their content's intrinsic width. This is the #1 cause of:

- Horizontal scrollbars on mobile
- `truncate` not working
- Children of a flex container blowing out the parent

Fix: add `min-w-0` to the flex/grid item that contains the long content. Symmetric `min-h-0` exists for vertical analogues.

### 2. Truncation chain → [truncation-overflow.md](./truncation-overflow.md)

`truncate` (alias for `overflow-hidden text-ellipsis whitespace-nowrap`) only works if **every ancestor allows shrinking**. If the chain is `flex item → div → h2.truncate`, the flex item needs `min-w-0`.

For multi-line, use `line-clamp-N`. For long unbroken strings (URLs, IDs), `break-all` or `break-words`.

### 3. Mobile-first responsive → [responsive.md](./responsive.md)

Tailwind breakpoints are **min-width**: `sm:` = `≥640px`, not `≤640px`. Base classes apply to mobile; `sm:`/`md:`/`lg:` add or override at wider breakpoints. Designing desktop-first and trying to undo at `sm:max-` is painful — start mobile-first.

Default breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`.

### 4. Tailwind v4 specifics → [tailwind-v4.md](./tailwind-v4.md)

- Configuration lives in **CSS** (`@theme inline { ... }`), not `tailwind.config.js`.
- `@import "tailwindcss";` replaces the three `@tailwind` directives.
- Dark mode: this project uses `@custom-variant dark (&:is(.dark *));` — the dark class is on a parent, not html.
- Some v3 utilities renamed or behave differently (`bg-opacity-*` removed in favor of `bg-color/opacity`).
- Arbitrary values: `[color:var(--x)]` for properties that aren't a default utility.

### 5. Semantic theme tokens → [theme-tokens.md](./theme-tokens.md)

Use `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `bg-destructive`, etc. They auto-handle dark mode via the CSS variables in `globals.css`. **Never** hand-write `bg-white dark:bg-gray-950` — it diverges from the theme on the next palette change.

If you genuinely need a color that doesn't exist as a token, add it to `@theme inline` in `globals.css` rather than scattering raw colors.

Token contrast is *context-dependent*: `bg-muted` lifts above `bg-background` but can be darker than a `Card` surface. For nested chips/pills, `bg-foreground/15` adapts.

### 6. `table-fixed` width budgeting → [tables.md](./tables.md)

`table-fixed` allocates exact column widths summing to 100%. Cells overflow into the *last* column when the budget is wrong. Specific traps: header sort-link `-mx-2` pushing past the cell box, `toLocaleString()` widths varying per locale, sizing for the cell but forgetting the header. This bit us three times in one session — get the column percentages right by auditing the longest realistic content at the narrowest viewport.

---

## Quick reference

```tsx
// 1. Truncation in a flex/grid layout — min-w-0 on the item that contains the truncating element.
<div className="flex items-center gap-4">
  <Avatar />
  <div className="min-w-0 flex-1">           {/* ← min-w-0 here */}
    <h2 className="truncate">{longTitle}</h2>
  </div>
  <time className="whitespace-nowrap">…</time>
</div>

// 2. Single-column grid that must truncate on mobile — min-w-0 on the grid item.
<ul className="grid gap-3 sm:grid-cols-2">
  <li className="min-w-0 …">                 {/* ← min-w-0 here */}
    <h2 className="truncate">{longTitle}</h2>
  </li>
</ul>

// 3. Spacing — gap, not space.
<div className="flex flex-col gap-4">…</div>     // correct
<div className="space-y-4">…</div>              // wrong — see shadcn skill

// 4. Equal dimensions — size-*, not w-* h-*.
<div className="size-10" />                     // correct
<div className="w-10 h-10" />                   // wrong

// 5. Mobile-first responsive.
<div className="px-4 sm:px-6 lg:px-8">…</div>   // mobile padding, then larger
<div className="hidden md:block">…</div>        // hide on mobile, show ≥768px

// 6. Conditional classes — cn(), not template ternaries.
import { cn } from "@/lib/utils"
<div className={cn("flex items-center", isActive && "bg-primary")}>

// 7. Semantic colors, not raw.
<div className="bg-card text-card-foreground border">  // correct
<div className="bg-white dark:bg-gray-900">           // wrong
```

---

## Diagnosis recipes

### "The page has a horizontal scrollbar."

1. Open devtools, find the element wider than the viewport (Chrome: select `<body>`, look for outline overflow). Or `document.querySelectorAll('*')` and `getBoundingClientRect()` to find anything with `right > viewport.width`.
2. Walk up the DOM. The first ancestor that's a flex or grid item is usually the culprit.
3. Add `min-w-0` to that item. If it's already there, the next ancestor up.
4. If no flex/grid involved: check for fixed widths (`w-[1200px]`), unbroken strings (use `break-all`), or images without `max-w-full`.

### "`truncate` isn't working."

1. The element with `truncate` is in a flex or grid container? → ancestor chain needs `min-w-0`.
2. The element's parent has `width: max-content` / `w-fit`? → that defeats truncation; use `w-full` or remove `w-fit`.
3. The element is `display: inline`? → `truncate` requires block-level or inline-block.

### "It works on desktop, breaks on mobile."

You designed desktop-first. Audit base classes (no breakpoint prefix) — those run on mobile. `flex` defaults to row direction; consider `flex-col sm:flex-row`. Wide gaps that look fine at 1440px crowd at 375px.

### "The `dark:` override isn't applying."

This project uses `@custom-variant dark (&:is(.dark *))`. The `dark` class is on a parent (managed by `next-themes`), not `<html>`. If you're testing in isolation (e.g. a Storybook), wrap in a `.dark` parent. **Better answer: don't write `dark:` at all — use semantic tokens.**

---

## When this skill applies vs. shadcn skill

This skill: **CSS layout fundamentals, Tailwind v4 specifics, theme tokens at the CSS-variable level.**

Shadcn skill: **shadcn component composition rules** (Field, FieldGroup, asChild/render, data-icon, no z-50 on overlays, etc).

There is overlap on `gap-* vs space-*`, `size-* vs w/h`, and `truncate` shorthand — both skills mention them; treat them as the same rule.

## Detailed references

- [min-width-zero.md](./min-width-zero.md) — The flex/grid intrinsic sizing trap
- [truncation-overflow.md](./truncation-overflow.md) — `truncate`, `line-clamp`, `break-all`, `break-words`
- [responsive.md](./responsive.md) — Mobile-first, breakpoints, container queries, hiding patterns
- [tailwind-v4.md](./tailwind-v4.md) — v4 vs v3 differences that bite migrators
- [theme-tokens.md](./theme-tokens.md) — Semantic tokens, dark mode, token-contrast in nested surfaces, custom CSS vars
- [tables.md](./tables.md) — `table-fixed` width budgets, header/locale traps, scroll-wrapper fallback
