# Tailwind v4 specifics

This project uses **Tailwind CSS v4**. Key differences from v3 that bite when relying on memory or older docs.

## Configuration lives in CSS, not JS

There is **no `tailwind.config.js`** in this project. Configuration goes in `src/app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* … */
}
```

`@theme inline` is the v4 way to register custom utility tokens. Each `--color-*` declaration produces a `bg-*`, `text-*`, `border-*`, etc. utility automatically. To add a new color: add a `--color-foo` line in `@theme inline` and a `--foo` variable in the `:root` / `.dark` blocks.

## CSS file imports

```css
@import "tailwindcss";   /* v4 — single import */
```

Replaces v3's three directives:

```css
/* v3, NOT used here */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Dark mode is a custom variant

```css
@custom-variant dark (&:is(.dark *));
```

This means the `dark:` prefix targets `.dark` *somewhere up the tree* (managed by `next-themes`), not `<html>` directly. **The recommendation: don't write `dark:` overrides at all.** Use semantic tokens (`bg-background`, `text-muted-foreground`) and the dark theme block in `globals.css` flips the underlying CSS variables.

## Renamed/removed utilities

- `bg-opacity-*` → `bg-color/opacity` (e.g. `bg-black/50`)
- `text-opacity-*` → `text-color/opacity` (e.g. `text-foreground/70`)
- `flex-grow-*` / `flex-shrink-*` → `grow-*` / `shrink-*`
- `decoration-slice` → `box-decoration-slice`

## Arbitrary values & properties

Two forms:

```tsx
{/* arbitrary VALUE for a known utility */}
<div className="bg-[#1a1a1a] w-[clamp(20rem,50vw,40rem)]" />

{/* arbitrary PROPERTY for a CSS property without a default utility */}
<div className="[mask-image:linear-gradient(black,transparent)]" />
<div className="[--my-var:#abc]" />
```

Use sparingly. If you reach for the same arbitrary value more than once, register it as a CSS variable in `@theme inline`.

## CSS variables in arbitrary values

When the property already takes a CSS variable cleanly, use the property prefix:

```tsx
<div className="bg-[color:var(--something)]" />
<div className="text-[length:var(--font-size)]" />
```

The prefix tells Tailwind the type of the value, so it can validate.

## Custom variants

You can define your own variants in CSS:

```css
@custom-variant hocus (&:hover, &:focus-visible);
```

Then `hocus:bg-accent` applies on hover or focus-visible. Useful when you find yourself writing `hover:foo focus-visible:foo` repeatedly.

## What stayed the same

- Class generation, JIT, breakpoint prefixes, state variants (`hover:`, `focus:`, `disabled:`, etc).
- The vast majority of utility names.
- `cn()` from `@/lib/utils` still wraps `clsx` + `tailwind-merge`.

When in doubt: read `globals.css` for the actual tokens this project exposes, and grep `src/components/ui/` for existing class patterns to imitate.
