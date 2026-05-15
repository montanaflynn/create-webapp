# Truncation & overflow

Use the right tool. The wrong one fails silently.

## Decision table

| Situation | Use | Why |
|---|---|---|
| Single line, ellipsize at boundary | `truncate` | Shorthand for `overflow-hidden text-ellipsis whitespace-nowrap` |
| Up to N lines, ellipsize after | `line-clamp-N` | Multi-line clamp via `-webkit-line-clamp` |
| Long unbreakable strings (URLs, IDs, hashes) | `break-all` | Lets the browser break anywhere |
| Words break at sensible points | `break-words` | Equivalent to `overflow-wrap: break-word` |
| Hide overflow without truncation indicator | `overflow-hidden` | When a parent should clip without `…` |
| Need to scroll inside a fixed area | `overflow-auto` + `min-h-0` | Inner scroll requires constrained ancestors |

## Single-line truncate

```tsx
<h2 className="truncate">{longTitle}</h2>
```

But `truncate` only works if every flex/grid ancestor allows shrinking. See [min-width-zero.md](./min-width-zero.md) — this is the #1 reason `truncate` "doesn't work".

## Multi-line clamp

```tsx
<p className="line-clamp-2 text-sm text-muted-foreground">
  {longContent}
</p>
```

`line-clamp-N` works for 1–6 out of the box. Beyond that, use `[--line-clamp:8]` arbitrary value or just don't clamp that far — it's usually a UX problem.

## Long unbreakable strings

URLs, tokens, hashes, user-pasted text. With no spaces, the browser can't break them, and they expand the container.

**Incorrect:**

```tsx
<p className="text-sm">{longUrl}</p>  {/* expands the parent */}
```

**Correct (URL — let it break anywhere):**

```tsx
<p className="break-all text-sm">{longUrl}</p>
```

**Correct (mixed text with occasional long words):**

```tsx
<p className="break-words text-sm">{prose}</p>
```

`break-words` only breaks when needed; `break-all` breaks aggressively (right for URLs/IDs).

## Inner scroll regions

A common shape: a fixed-height layout (sidebar + content) where the content scrolls but the chrome stays put.

```tsx
<div className="flex h-screen flex-col">
  <header className="border-b" />
  <main className="min-h-0 flex-1 overflow-auto">
    {/* scrollable content */}
  </main>
</div>
```

Without `min-h-0`, `flex-1` wins against `overflow-auto` — the main element grows to fit content instead of constraining it. Symmetric to the `min-w-0` rule on the horizontal axis.

## Tables

Tables are notoriously bad citizens in narrow containers. Two strategies:

```tsx
{/* Strategy A: scroll horizontally inside a wrapper */}
<div className="overflow-x-auto">
  <table className="w-full">…</table>
</div>

{/* Strategy B: collapse to cards on mobile */}
<table className="hidden md:table">…</table>
<div className="space-y-2 md:hidden">{/* card layout */}</div>
```

Most data tables in this project use Strategy A.

## Images

`<img>` and `next/image` honor their natural width by default and can blow out a parent. Always:

```tsx
<img className="max-w-full" />
{/* or for next/image, sizes + fill */}
<Image src={…} alt={…} fill className="object-cover" />
```

For `next/image`, also see the next-best-practices skill's `image.md`.
