# Tables

Tables in narrow viewports are notorious. This codebase has been bitten three times by the same `table-fixed` width-budget bug — write it down.

## `table-fixed` is a budget, not a hint

`table-fixed` (CSS `table-layout: fixed`) makes columns honor declared widths *exactly*. The budget is 100%, and **every column** must allocate enough room for both:

1. The longest realistic **header** content (label + sort arrow + cell padding).
2. The longest realistic **cell** content for that column.

If the budget overflows, the browser doesn't ignore the widths — it shoves the overflow into the *last* column, which then bursts horizontally and produces a scrollbar. Adding `truncate` to the cell does not help if the column was sized smaller than its actual minimum content width.

## Symptoms

- Horizontal scrollbar on a `<table>` even with `table-fixed` and `truncate` on cells.
- A specific column keeps "winning" — its content stays at full width while others shrink.
- Bug reproduces only with certain rows (longest title, certain locale dates).

## The traps

### Trap 1: negative margins inside `<th>` push past the budget

```tsx
{/* Inline-flex header link with -mx-2 to absorb the cell's px-2 padding.
    Looks fine in isolation; breaks the budget because the link reaches
    past the cell box and the column needs the full inline-flex width. */}
<th className="px-2">
  <SortLink className="-mx-2 inline-flex items-center gap-1">
    Updated <ArrowDown />
  </SortLink>
</th>
```

If the column was sized for `"Updated"` text, the actual occupied width includes the un-clipped `-mx-2` link plus icon plus gap. The column overflows into the next one.

**Fix:** drop the negative margin or widen the column by the margin amount. The pattern that works in this codebase: keep cell padding, no negative margin on the link, accept the small visual offset.

### Trap 2: `toLocaleString` width is locale-dependent

```tsx
<time>{date.toLocaleString()}</time>
{/* renders "5/3/2026, 5:42:18 PM" in en-US, "May 2 at 5:42 PM" via custom format */}
```

Every locale renders dates a different width. Sizing a "Date" column for one locale silently bursts in another. If column width is tight, **build the string by hand** with `Intl.DateTimeFormat` and explicit options, or pad in a layout-friendly way.

### Trap 3: ignoring the header

The header label is often shorter than the data, but with sort arrows, the *header* can be the wider element. Always size for `max(header, cell)`.

## How to set widths in this codebase

Don't guess. Audit at the narrowest viewport you support:

1. Render the table with the longest realistic content (longest title, longest tag list, "May 2 at 5:42 PM"-style date).
2. In devtools, inspect each `<th>` — read its actual rendered width.
3. Sum them. If any column is bursting, redistribute. The pattern that's stable here:

```tsx
<colgroup>
  <col className="w-[55%]" />  {/* title — primary content, gets the most */}
  <col className="w-[25%]" />  {/* tags */}
  <col className="w-[20%]" />  {/* date — sized for full localized form */}
</colgroup>
```

These percentages are not magic — they're the result of three rounds of "scrollbar again" debugging. If you change the columns or the date format, **re-audit.**

## Alternative when the budget can't fit

If the table genuinely needs more horizontal room than the viewport, scroll inside a wrapper:

```tsx
<div className="overflow-x-auto">
  <table className="w-full min-w-[640px] table-fixed">…</table>
</div>
```

`min-w-*` on the table forces a minimum, and the wrapper provides horizontal scroll on narrower viewports. The table doesn't break the page layout; users get a scrollable region.

## Per-cell discipline

Every `<td>` in a `table-fixed` table should have `truncate` (or `line-clamp` if multi-line is desired):

```tsx
<td className="truncate">{note.title}</td>
```

Without it, long content overflows the cell visually even though the column width is fixed — you get text bleeding into neighboring columns.
