# Responsive design

## Mobile-first

Tailwind's responsive prefixes are **min-width** media queries. Base classes apply at all sizes; `sm:`, `md:`, `lg:`, `xl:`, `2xl:` *add* or *override* at progressively wider screens.

| Prefix | Min width | Typical device |
|---|---|---|
| (none) | 0 | All screens |
| `sm:` | 640px | Large phone, small tablet |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Small desktop |
| `xl:` | 1280px | Desktop |
| `2xl:` | 1536px | Large desktop |

So `flex flex-col sm:flex-row` reads as: stacked column on mobile, switch to row at 640px and up. Designing in the other direction (desktop-first, then `max-` prefixes to undo) is more painful and ships heavier markup.

## Common patterns

```tsx
// Stack → row at small breakpoint
<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
  <Avatar />
  <div className="min-w-0 flex-1">…</div>
</div>

// Single column → grid
<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">…</ul>

// Hide on mobile, show ≥md
<aside className="hidden md:block">…</aside>

// Show only on mobile
<button className="md:hidden">Menu</button>

// Padding scales up
<main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">…</main>

// Type scale per breakpoint
<h1 className="text-2xl sm:text-3xl lg:text-4xl">…</h1>
```

## Container constraints

Don't rely on the `container` utility — it's controllable in v4 but most layouts in this codebase use explicit `max-w-*` plus `mx-auto`:

```tsx
<main className="mx-auto w-full max-w-6xl px-4 sm:px-6">…</main>
```

`w-full` is required so the element fills available width up to the max — without it, `mx-auto` has nothing to center.

## Container queries

Tailwind v4 ships container query utilities. Use these when a *component* needs to adapt to its container width, regardless of viewport. Mark the container with `@container`:

```tsx
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3">
    {cards}
  </div>
</div>
```

Container query breakpoints (`@sm`, `@md`, `@lg`, `@xl`) are independent from the viewport prefixes.

When to use:
- A card that's sometimes in a sidebar, sometimes in a wide panel.
- Reusable components across layouts.

When **not** to use: page-level layout. Stick with viewport prefixes.

## Hidden vs `sr-only`

- `hidden` removes from layout and accessibility tree.
- `sr-only` keeps in accessibility tree but hides visually — for screen-reader-only labels.
- For "show on mobile, hide on desktop": `md:hidden` (visually hidden ≥md) is right; don't use `sr-only` for this.

## Avoid horizontal scroll on mobile

Three top causes:

1. A flex/grid item without `min-w-0` (see [min-width-zero.md](./min-width-zero.md)).
2. A long unbreakable string (URL, email, ID) without `break-all` or `break-words`.
3. A fixed width (`w-[1200px]`, a wide table without `overflow-x-auto` wrapper, an unconstrained image).

Test in devtools at the narrowest breakpoint you support (~360px) before declaring a layout done.
