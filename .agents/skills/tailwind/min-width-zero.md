# The `min-w-0` trap

The single most common cause of broken layouts in this codebase. Learn it once.

## What's actually happening

CSS spec: **flex AND grid items default to `min-width: auto`**, which resolves to the *intrinsic minimum width* of their content. For text, that's the longest unbreakable word; for images, the natural width; for elements with `white-space: nowrap` or `truncate`, the entire string.

So when a flex/grid item contains a long title, it refuses to shrink below the title's full width. The container expands. The parent expands. You get a horizontal scrollbar — or you watch `truncate` do nothing.

The fix is one class: `min-w-0` on the flex/grid item.

**The grid case is just as common as flex.** A common false read is "this is a single-column grid (or unstyled `<ul>`), there's no shrinking needed, the rule doesn't apply" — and then the page scrolls horizontally on mobile. Single-column is still a grid; each item is still a grid item; the same rule applies. If your component renders a list of cards in a grid, each card needs `min-w-0`.

## Symptoms

- Page has a horizontal scrollbar on mobile.
- `truncate` doesn't truncate.
- A flex child blows out the parent.
- A grid track is wider than expected.
- A long unbroken URL/email/ID expands its container.

## Patterns

### Flex row with a truncating child

**Incorrect:**

```tsx
<div className="flex items-center gap-4">
  <Avatar />
  <div className="flex-1">
    <h2 className="truncate">{longTitle}</h2>  {/* won't truncate */}
  </div>
  <time>{date}</time>
</div>
```

**Correct:**

```tsx
<div className="flex items-center gap-4">
  <Avatar />
  <div className="min-w-0 flex-1">           {/* ← min-w-0 */}
    <h2 className="truncate">{longTitle}</h2>
  </div>
  <time className="whitespace-nowrap">{date}</time>
</div>
```

### Single-column grid that must shrink on mobile

**Incorrect:**

```tsx
<ul className="grid gap-3 sm:grid-cols-2">
  <li className="rounded-lg border p-4">
    <h2 className="truncate">{longTitle}</h2>  {/* page scrolls horizontally on mobile */}
  </li>
</ul>
```

**Correct:**

```tsx
<ul className="grid gap-3 sm:grid-cols-2">
  <li className="min-w-0 rounded-lg border p-4">  {/* ← min-w-0 */}
    <h2 className="truncate">{longTitle}</h2>
  </li>
</ul>
```

A single-column grid is still a grid. Each `<li>` is a grid item. Same rule.

### Nested flex — every level may need it

**Incorrect:**

```tsx
<div className="flex">
  <div className="flex-1">
    <div className="flex items-center gap-2">
      <Icon />
      <span className="truncate">{long}</span>  {/* still doesn't truncate */}
    </div>
  </div>
</div>
```

**Correct:**

```tsx
<div className="flex">
  <div className="min-w-0 flex-1">
    <div className="flex min-w-0 items-center gap-2">
      <Icon />
      <span className="truncate">{long}</span>
    </div>
  </div>
</div>
```

Rule of thumb: **every flex/grid ancestor between the truncating element and the constrained root needs `min-w-0`**.

### When you also need `min-h-0`

The same rule applies on the cross axis for vertically constrained scroll regions. A `flex-1` child in a vertical flex that should scroll instead of pushing the container needs `min-h-0` plus `overflow-auto`.

```tsx
<div className="flex h-screen flex-col">
  <header />
  <main className="min-h-0 flex-1 overflow-auto">…</main>  {/* ← min-h-0 */}
</div>
```

## Mental shortcut when debugging

If you see horizontal overflow or broken truncation, ask: **"is this element a flex or grid item?"** If yes, try `min-w-0` first. It's almost always the answer.

## Why not just always set it on every flex/grid container?

Because there are legitimate cases where you want a flex item to push past the container (e.g. a tag chip row that the user is meant to scroll horizontally). Adding `min-w-0` everywhere would defeat those. Set it only where you want shrinking — which is most of the time, but not all the time.
