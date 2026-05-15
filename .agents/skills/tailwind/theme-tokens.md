# Theme tokens & dark mode

## The semantic tokens

Defined in `src/app/globals.css` via `@theme inline` mapped to CSS variables in `:root` and `.dark`. Use these:

| Token | Use for |
|---|---|
| `bg-background` / `text-foreground` | Page background and primary text |
| `bg-card` / `text-card-foreground` | Card surfaces |
| `bg-popover` / `text-popover-foreground` | Popover/dropdown surfaces |
| `bg-primary` / `text-primary-foreground` | Primary action color |
| `bg-secondary` / `text-secondary-foreground` | Secondary surfaces |
| `bg-muted` / `text-muted-foreground` | Subtle backgrounds and secondary text |
| `bg-accent` / `text-accent-foreground` | Hover states, accents |
| `bg-destructive` / `text-destructive` / `text-destructive-foreground` | Errors, dangerous actions |
| `border` / `border-border` | Default border color |
| `ring` / `ring-ring` | Focus rings |
| `bg-sidebar*`, `bg-chart-1..5` | Sidebar tokens, chart palette |

The `*-foreground` pairs are pre-balanced for contrast against their background — use them together. `text-foreground` on `bg-background`, `text-primary-foreground` on `bg-primary`, etc.

## Why semantic tokens (and not raw colors)

`globals.css` defines two themes — `:root` (light) and `.dark`. Each maps the same logical role (`--background`, `--primary`, etc.) to a specific color. So `bg-background` resolves to the right thing in either mode automatically — **no `dark:` prefix needed**.

Hand-writing `bg-white dark:bg-gray-950` will diverge from the theme on any palette change and won't pick up custom theme overrides.

## When you need a color that isn't in the token set

Don't reach for `bg-emerald-500`. Two options:

1. **Use a Badge variant** if it's status-shaped (success/warning/info-style indicators).
2. **Add a token.** Edit `globals.css`:

```css
:root {
  --success: oklch(0.6 0.15 145);
  --success-foreground: oklch(0.98 0 0);
}

.dark {
  --success: oklch(0.7 0.15 145);
  --success-foreground: oklch(0.15 0 0);
}

@theme inline {
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
}
```

After this, `bg-success text-success-foreground` works as a utility.

## Token contrast depends on context

A subtle gotcha: a token's *visual* contrast depends on what it's nested inside. `bg-muted` lifts above `bg-background` (page chrome), but **inside a `Card` it can be darker than the card surface in dark mode** — so chips end up looking sunken, not raised.

This bit us on the tag chip group: `ComboboxChips` wrapper at `bg-input/30`, `ComboboxChip` at `bg-muted` — chip darker than wrapper. Looked fine on a bare page, broken inside a `Card`.

When nesting tinted surfaces (chip in input in card), prefer **opacity-based foreground tints** over fixed `bg-muted`:

```tsx
{/* Adapts: lifts in both light and dark regardless of the surface beneath */}
<Chip className="bg-foreground/15 text-foreground">…</Chip>
```

`bg-foreground/N` reads "N% of foreground over whatever is behind me" — so it composites correctly on `bg-background`, `bg-card`, `bg-muted`, or any other surface. `bg-muted` is a fixed color and only looks right at one nesting depth.

Rule of thumb: **`bg-muted` for top-level surfaces; `bg-foreground/N` for raised elements that nest into a parent surface.**

## When `dark:` IS appropriate

Almost never in this codebase. The legitimate cases:

- A specific CSS effect that only makes sense in one mode (e.g. a glow filter intended only for dark backgrounds).
- A third-party SVG or asset where you genuinely need different per-mode swaps.

For colors and typography, the answer is always tokens.

## Opacity modifiers

Use the `/N` syntax instead of `bg-opacity-*`:

```tsx
<div className="bg-foreground/5 hover:bg-foreground/10" />
<div className="text-muted-foreground/70" />
```

Reads better, composes with hover/focus, and matches v4 conventions.

## Focus rings

Use the project's `ring` and `ring-ring` tokens for keyboard-visible focus:

```tsx
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
```

`focus-visible` (not plain `focus`) so the ring shows for keyboard users but not on mouse click. Most shadcn primitives in `src/components/ui/` already handle this; only add manual rings on bespoke interactive elements.

## Sanity check

Before adding any color class, ask:
1. Does a semantic token cover this? → use it.
2. Does a Badge variant or component variant cover this? → use it.
3. Is this a one-off effect, not a color? → arbitrary value is fine.
4. Otherwise: **add a token** to `globals.css` rather than scattering raw colors.
