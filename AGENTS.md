<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# shadcn here is base-ui, not Radix

`src/components/ui/*` is the `base-nova` shadcn style, built on `@base-ui/react` (not `@radix-ui/react-*`). The slot pattern is **`render={<element/>}`**, not `asChild`. Example:

```tsx
// ✅ correct
<Badge variant="secondary" render={<Link href="/x" />}>Tag</Badge>

// ❌ wrong — TS2322, asChild prop does not exist
<Badge variant="secondary" asChild><Link href="/x">Tag</Link></Badge>
```

Before adding any new ui component, read its source in `src/components/ui/<name>.tsx` to confirm the prop surface — several base-ui primitives expose flags like `nativeButton={false}` that have no Radix equivalent.
