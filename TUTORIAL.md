# Building create-webapp from scratch

A reproducible walkthrough of how this template was built. Versions pinned to **May 2026**; library APIs drift, but the decisions and gotchas should be useful for a while.

**Final stack**:

- Next.js 16.2 (App Router, Turbopack, React 19)
- better-auth 1.6 (email + password)
- Drizzle ORM
- PGlite for dev / Neon for prod (Postgres everywhere — same dialect)
- shadcn 4 + `@base-ui/react` (not Radix anymore)
- Tailwind v4
- next-themes for FOUC-free theme switching
- React Hook Form 7.75 + Zod 4.4 for forms and validation

**Prerequisites**: Node 22+, npm. No Docker, no local Postgres install required.

---

## 1. Scaffold the Next.js app

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*" --use-npm --turbopack --yes
```

The `.` scaffolds into the current directory. The flags pick the modern defaults: TypeScript, Tailwind v4, App Router, `src/` layout, Turbopack as the bundler. Verify:

```bash
grep -E '"next"|"react"|"tailwindcss"' package.json
# next: 16.x, react: 19.x, tailwindcss: 4.x
```

You'll also notice `create-next-app` writes an `AGENTS.md` and a stub `CLAUDE.md` — Next 16's nudge for AI-assisted coding. Harmless; ignore or fill them in.

---

## 2. Database — PGlite for dev, Neon for prod

### The decision (worth understanding before writing code)

The instinct is "SQLite locally, Postgres in prod" — `file:./dev.db` for zero-friction dev, real Postgres for serverless. **Drizzle makes this painful**: schemas are dialect-specific (`sqliteTable` vs `pgTable`, different column types, different SQL generated). One schema can't target both. You'd maintain two parallel schemas — a constant source of drift.

Three options that don't require dual schemas:

1. **SQLite everywhere** (Turso for prod). Same dialect. But `boolean`, `jsonb`, arrays, real timestamps — all cost you something.
2. **Postgres everywhere with Docker locally**. Standard, but the "I just want `npm run dev` to work on a fresh clone" goal is gone.
3. **Postgres everywhere with PGlite locally**. PGlite is real Postgres compiled to WASM, runs in your Node process, persists to a folder. Same dialect as Neon. No daemon, no install, no account.

We went with #3. The application code is identical in both environments; only `src/lib/db/index.ts` switches drivers based on the `DATABASE_URL` prefix.

### Install

```bash
npm install drizzle-orm @electric-sql/pglite postgres dotenv better-auth
npm install -D drizzle-kit tsx
```

- `@electric-sql/pglite` — WASM Postgres for local
- `postgres` — native postgres-js driver for prod (Neon, etc.)
- `tsx` — to run our migrate script (next chapter)

### Schema (`src/lib/db/schema.ts`)

Single `pgTable` definition, including the better-auth tables (added in step 3) plus our domain table `note`:

```ts
import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// session, account, verification — standard better-auth schema.
// note — your domain table:

export const note = pgTable("note", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

Tags live on a separate table joined via `note_tag`. An earlier draft used `tags text[]` directly on `note`, but it falls over the moment you add a "list all distinct tags" query (autocomplete) and the seam keeps reappearing — counts, rename, browse-by-tag, etc. The m:m shape reads cleanly with Drizzle's relational query API and writes cleanly with the `onConflictDoUpdate(...).returning(...)` upsert pattern. The full schema:

```ts
export const tag = pgTable("tag", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("tag_user_name_uniq").on(t.userId, t.name)]);

export const noteTag = pgTable("note_tag", {
  noteId: text("note_id").notNull().references(() => note.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.noteId, t.tagId] })]);

export const noteRelations = relations(note, ({ many }) => ({ noteTags: many(noteTag) }));
export const tagRelations = relations(tag, ({ many }) => ({ noteTags: many(noteTag) }));
export const noteTagRelations = relations(noteTag, ({ one }) => ({
  note: one(note, { fields: [noteTag.noteId], references: [note.id] }),
  tag: one(tag, { fields: [noteTag.tagId], references: [tag.id] }),
}));
```

The unique index on `(user_id, name)` is what makes `onConflictDoUpdate({ target: [tag.userId, tag.name], ... })` work. The relations are what `db.query.note.findMany({ with: { noteTags: { with: { tag: true } } } })` walks at read time.

Full file in `src/lib/db/schema.ts`.

### DB client (`src/lib/db/index.ts`) — driver switch + lazy proxy

```ts
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL?.trim() || "./pgdata";
const isRemote = url.startsWith("postgres:") || url.startsWith("postgresql:");

declare global {
  // eslint-disable-next-line no-var
  var __pglite__: PGlite | undefined;
}

type DrizzleDb =
  | ReturnType<typeof drizzlePostgres<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

let _db: DrizzleDb | undefined;

function getDb(): DrizzleDb {
  if (_db) return _db;
  if (isRemote) {
    const client = postgres(url, { max: 1, prepare: false });
    _db = drizzlePostgres(client, { schema });
  } else {
    const client =
      globalThis.__pglite__ ?? (globalThis.__pglite__ = new PGlite(url));
    _db = drizzlePglite({ client, schema });
  }
  return _db;
}

// Lazy proxy: defers driver instantiation until first query.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
```

Two non-obvious bits to call out:

**`globalThis.__pglite__` singleton.** Next.js dev hot-reloads modules, which would re-instantiate PGlite and try to re-acquire the file lock on `./pgdata`. Stashing on `globalThis` reuses one client across reloads.

**The `Proxy`.** During `next build`, multiple worker processes generate static pages in parallel. If the db module instantiates PGlite at module-load time, every worker that imports the module races to lock `./pgdata`, and you get *"PGlite failed to initialize properly"* errors during the prerender pass. The Proxy defers instantiation until the first actual query. Workers that don't query the DB (most of them, during prerender) never touch PGlite.

`?.trim() || "./pgdata"` instead of `?? "./pgdata"`: `??` only catches `undefined`, not the empty string you get from `DATABASE_URL=` in `.env.local`.

### Drizzle config (`drizzle.config.ts`)

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL ?? "postgres://placeholder@localhost/db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
```

`dotenv/config` only reads `.env`. Next uses `.env.local`, so we load it explicitly. The `placeholder` URL is fine because `drizzle-kit generate` only needs to *diff the schema* — no connection required. `migrate` and `studio` need a real URL, but we use our own migrate script for the apply step (next).

### Unified migrate script (`scripts/migrate.ts`)

```ts
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL?.trim() || "./pgdata";
const isRemote = url.startsWith("postgres:") || url.startsWith("postgresql:");

async function main() {
  if (isRemote) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await client.end();
    console.log("✓ migrations applied (postgres)");
  } else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(url);
    const db = drizzle({ client });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await client.close();
    console.log(`✓ migrations applied (pglite at ${url})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Dynamic imports keep both drivers from loading when only one is needed. Same script applies migrations to PGlite locally and Neon in CI/prod.

### Next config (`next.config.ts`)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
```

PGlite ships native modules + WASM. `serverExternalPackages` tells Next not to bundle it — it's loaded via `require()` at runtime instead.

### `.gitignore` and `.env.example`

```
# .gitignore additions
/pgdata
```

```
# .env.example
# Leave empty locally — defaults to embedded PGlite at ./pgdata.
DATABASE_URL=

BETTER_AUTH_SECRET=replace-me-run-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3000
```

For `.env.local`, generate a real secret: `openssl rand -base64 32`.

### npm scripts

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx scripts/migrate.ts",
"db:studio": "drizzle-kit studio"
```

### Verify

```bash
npm run db:generate    # writes ./drizzle/0000_*.sql with the Postgres SQL
npm run db:migrate     # creates ./pgdata/ and applies migrations
ls pgdata/             # base/, global/, pg_hba.conf — real Postgres data dir
```

### One typing tweak

Both drivers' `drizzle()` functions return slightly different concrete types — `PgliteDatabase<typeof schema>` and `PostgresJsDatabase<typeof schema>` — that share the same `PgDatabase` interface. If you union them in `DrizzleDb`, TypeScript can't unify overloaded methods like `.returning(...)` inside `db.transaction(async (tx) => ...)` and you get *"Expected 0 arguments, but got 1"* errors.

The fix: pick one concrete type for `DrizzleDb` (we use the PGlite variant) and cast the postgres-js path back to it. Both runtimes implement the same query interface, so the cast is structurally safe — and the editor finally sees a single set of method signatures.

```ts
type DrizzleDb = ReturnType<typeof drizzlePglite<typeof schema>>;
// ...
_db = drizzlePostgres(client, { schema }) as unknown as DrizzleDb;
```

### Seed script (`scripts/seed.ts`)

Optional but worth wiring up so a fresh clone has something to look at:

```ts
const SEED_EMAIL = "user@example.com";
const SEED_PASSWORD = "password@123";

const existing = await db.query.user.findFirst({ where: eq(user.email, SEED_EMAIL) });
const userId = existing?.id ?? (await auth.api.signUpEmail({
  body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: "Demo User" },
})).user.id;

// Idempotent: wipe the seed user's notes and re-insert. Tag rows persist.
await db.delete(note).where(eq(note.userId, userId));
for (const n of SEED_NOTES) { /* insert note + upsert tags + link */ }
```

Two things worth pinning:

1. **Use `auth.api.signUpEmail` instead of inserting `user` rows directly.** better-auth handles password hashing, session columns, and the `account` row that links the user's email/password credential. Reaching past it would skip the hash and break login.
2. **Idempotent by wiping notes, not the user.** Deleting the user every time would also blow away their `account` row + any session cookies the dev still has, requiring a re-login on every reseed.

Wired up via `"db:seed": "tsx scripts/seed.ts"` in `package.json`.

---

## 3. Authentication — better-auth

### `src/lib/auth.ts` — server config

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});

export type Session = typeof auth.$Infer.Session;
```

`provider: "pg"` matches our Postgres dialect. The `schema` map is explicit (passing the actual table objects) so better-auth can run typed queries against our tables.

### `src/lib/auth-client.ts` — client hooks

```ts
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```

### Route handler (`src/app/api/auth/[...all]/route.ts`)

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

This single catch-all serves `/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/sign-out`, `/api/auth/get-session`, and so on.

### Route protection — `src/proxy.ts`

> **Next 16 file convention change**: `middleware.ts` was renamed to `proxy.ts`, and the function name went from `middleware` to `proxy`. Codemod available: `npx @next/codemod@latest middleware-to-proxy .`

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/settings/:path*"] };
```

`getSessionCookie` only checks for cookie *presence*, not validity. That's intentional: the proxy shouldn't hit the DB on every request. Real session validation happens in pages and route handlers via `auth.api.getSession()`.

### Generate + apply the auth tables

```bash
npm run db:generate    # picks up the schema additions
npm run db:migrate     # creates user, session, account, verification
```

---

## 4. UI primitives — shadcn 4 + Tailwind v4

### Init

```bash
npx shadcn@latest init --pointer --defaults --force
```

Three flags worth knowing:

- `--defaults`: uses preset `base-nova` + template `next` — the modern `@base-ui/react`-based variant
- `--pointer`: writes a CSS rule to `globals.css` so `<button>` and `[role="button"]` get `cursor: pointer`. **Do not skip this.** Tailwind v4 made the default `cursor-default`, and shadcn 4 inherits that — without `--pointer`, every button feels unclickable. Persist this in `components.json` once and any future `shadcn add` honors it.
- `--force`: overwrite existing config (needed if you run init a second time)

### Two breaking changes from shadcn 3 worth pinning

1. **Primitives are `@base-ui/react`, not Radix**. Same component shapes, mostly compatible, but a few things differ.
2. **`Button` has no `asChild` prop** — it just wraps `@base-ui/react/button` directly. To get button styling on a `<Link>`:

   ```tsx
   import { buttonVariants } from "@/components/ui/button";

   <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
     Get started
   </Link>
   ```

### Add components

```bash
npx shadcn@latest add card input label sonner dropdown-menu \
  field textarea combobox alert-dialog
```

`field` is shadcn's RHF-friendly wrapper (Field, FieldLabel, FieldError, FieldDescription) — used by every form in this template. `combobox` powers the tag input. `alert-dialog` is the delete-confirmation primitive.

### Mount providers in the root layout

`src/app/layout.tsx`:

```tsx
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// ...inside <body>:
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  {children}
  <Toaster richColors />
</ThemeProvider>
```

`ThemeProvider` (next-themes) handles FOUC-free dark mode (covered in section 9). `Toaster` is sonner — the toast surface used for form-success and error messages.

### Tweaks we keep against the generated primitives

Three small overrides to the files shadcn writes, each with a reason:

1. **`Button` disabled cursor** (`src/components/ui/button.tsx`). Stock shadcn ships `disabled:pointer-events-none` on the button, which means a hovered disabled button shows the default cursor — not the "this is unavailable" `not-allowed`. Swap to `disabled:cursor-not-allowed disabled:opacity-50`.
2. **`Card` chrome stripped** (`src/components/ui/card.tsx`). Stock Card has `bg-card ... ring-1 ring-foreground/10` and a `bg-muted/50 border-t` footer — designed for content panels that lift off the page. We use Cards for forms and want them to look like the bordered list-cards on `/dashboard`, so drop `bg-card` + the ring (replace with `border`) and drop the footer's `bg-muted/50` (keep `border-t` for the action divider).
3. **`ComboboxChip` background** (`src/components/ui/combobox.tsx`). Default chip bg is `bg-muted`; inside an input field (`bg-input/30`) the chip blends in. Switch to `bg-foreground/15` for visible contrast.

Persisting these in source means future `shadcn add` runs won't undo them — but if you ever overwrite, the prompt will ask before clobbering customized files.

---

## 5. Forms — React Hook Form + Zod + shadcn `Field`

Every form in the template uses the same pattern. Pinning it once here means sign-in, sign-up, profile edit, password change, and the notes editor are all variations on a single recipe.

### Install

```bash
npm install react-hook-form @hookform/resolvers zod
```

### The shape

```tsx
"use client";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { email: "", password: "" },
});

return (
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <Controller
      name="email"
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>Email</FieldLabel>
          <Input {...field} id={field.name} type="email" aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
    {/* ...other fields... */}
    <Button type="submit" disabled={form.formState.isSubmitting}>
      {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
    </Button>
  </form>
);
```

### Why this pattern

- **Zod is the single source of truth** for both client validation and server-action validation (`safeParse` on the server, see section 6). One schema, one set of error messages.
- **`Controller` + `Field`** wires up `aria-invalid`, label `htmlFor`, the error region, and the focus ring — without you having to remember any of it on each form.
- **`form.formState.isSubmitting`** drives the button's pending state during the network round-trip. For server actions that *redirect*, we use a slightly different pending mechanism (see section 6).

### Zod v4 gotchas worth knowing

- `z.email("...")` is **top-level**, not `z.string().email("...")`. The latter still parses but is deprecated.
- `parsed.error.issues` (was `.errors` in v3). The fix is one rename, but easy to miss.
- `.default(...)` on a field can produce a type mismatch with RHF's `useForm<z.infer<typeof schema>>` because the input/output types diverge. Workaround: omit defaults from the schema and put them in `useForm({ defaultValues: ... })` instead.

### Where to see this in code

| File | Shape |
| ---- | ----- |
| `src/app/(auth)/sign-in/page.tsx` | email + password |
| `src/app/(auth)/sign-up/page.tsx` | name + email + password |
| `src/app/(app)/settings/profile-form.tsx` | name (with stay-on-page success) |
| `src/app/(app)/settings/password-form.tsx` | current + new + confirm |
| `src/app/(app)/dashboard/notes/note-editor.tsx` | title + body + tags |

### The two pending patterns

There are two ways forms in this template signal "saving":

1. **Plain `form.formState.isSubmitting`** — when the submit handler is a fetch that resolves and returns. Used by the auth pages and settings forms.
2. **`useTransition` wrapping the submit** — when the server action either redirects or revalidates a server component. `isSubmitting` flips back to `false` the moment the action returns, which produces a flicker between "Saving…" and the original label as the navigation completes. `useTransition` keeps `pending` true through both the action *and* any subsequent navigation. Used by the note editor (section 6).

Both work. Pick (2) when the submit ends in a redirect or `revalidatePath` for a route that the user is currently viewing.

### Suspense boundary required for `useSearchParams()`

The sign-in page reads `?redirect=/dashboard` from the URL. `useSearchParams()` requires a `<Suspense>` boundary so the page can prerender with a fallback. Without it, `next build` fails.

```tsx
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
```

### Where these pages live: route groups

```
src/app/
  (auth)/
    layout.tsx         # centered card, no header
    sign-in/page.tsx
    sign-up/page.tsx
```

`(auth)` is a route group — the parens make it not appear in the URL, so the routes are still `/sign-in` and `/sign-up`. The layout in this folder applies only to these pages.

### `(auth)/layout.tsx`

```tsx
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-14 items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">create-webapp</Link>
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}
```

Minimal chrome — brand link, theme toggle, centered card slot.

---

## 6. Notes — list, read, create, edit, delete

This is the pattern to copy when swapping in a real domain. It's deliberately full-featured: title, body, tags with autocomplete, dedicated read view, separate edit form, server-side sort + pagination + tag filter, card/table view toggle, and a confirmation dialog for delete.

### File layout

```
src/app/(app)/dashboard/
  page.tsx              # list (cards or table) + sort + pagination + tag filter
  actions.ts            # createNote / updateNote / deleteNote
  note-card.tsx         # one card in the grid view
  note-table.tsx        # the table view + sortable column headers
  tags-cell.tsx         # client component: chips that fit-or-+N overflow
  pagination.tsx        # Previous / Page N of M / Next
  view-toggle.tsx       # client component: card/table icon group
  pagination.tsx        # the Previous/Next + "Page N of M"
  notes/
    new/page.tsx        # create form (uses NoteEditor)
    [id]/page.tsx       # read view (title, body, tags, Edit + Delete buttons)
    [id]/edit/page.tsx  # edit form (uses NoteEditor)
    note-editor.tsx     # shared form, parameterized for create vs edit
    delete-button.tsx   # trash button + AlertDialog confirmation
```

`NoteEditor` is the deliberate piece of structure: one component, two routes. Rendering the same form on `/dashboard/notes/new` and `/dashboard/notes/[id]/edit` keeps the field set identical and avoids the usual "create form drifts from edit form" decay.

**Read vs edit are separate routes** because clicking a note in a list almost always means "I want to look at this", not "I want to start typing". Splitting them lets the read view be calm (no form chrome, body rendered as plain text, tag chips clickable) and gives the edit form a clear "Cancel → back to read" target. Save in the edit form `redirect()`s back to the read view, which matches GitHub/Notion-style "view → edit → save → view" flow.

### Shared input schema (`src/lib/notes-schema.ts`)

```ts
import * as z from "zod";

export const noteInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title must be at most 200 characters."),
  content: z.string().max(10000, "Body must be at most 10,000 characters."),
  tags: z.array(z.string().trim().min(1).max(40)).max(20, "At most 20 tags."),
});

export type NoteInput = z.infer<typeof noteInputSchema>;
```

Same schema is imported by the client form (`zodResolver`) and the server actions (`safeParse`). One source of truth.

### Server actions (`src/app/(app)/dashboard/actions.ts`)

Each write that touches both `note` and `note_tag` runs in a transaction. The upsert pattern uses `.onConflictDoUpdate(...).returning()` so we insert-or-fetch tag IDs in a single round-trip:

```ts
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { note, noteTag, tag } from "@/lib/db/schema";
import { noteInputSchema, type NoteInput } from "@/lib/notes-schema";

// requireUserId, normalize() — same as before

export async function createNote(input: NoteInput) {
  const userId = await requireUserId();
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { title, content, tags } = normalize(parsed.data);
  const noteId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(note).values({ id: noteId, userId, title, content });
    if (tags.length === 0) return;

    // Upsert tags; the no-op `set` makes RETURNING fire for already-existing
    // rows too, so we get IDs back for both new and pre-existing tag names.
    const upserted = await tx
      .insert(tag)
      .values(tags.map((name) => ({ id: crypto.randomUUID(), userId, name })))
      .onConflictDoUpdate({
        target: [tag.userId, tag.name],
        set: { name: sql`EXCLUDED.name` },
      })
      .returning({ id: tag.id });

    await tx.insert(noteTag).values(upserted.map(({ id }) => ({ noteId, tagId: id })));
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateNote(id: string, input: NoteInput) {
  const userId = await requireUserId();
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { title, content, tags } = normalize(parsed.data);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(note)
      .set({ title, content, updatedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning({ id: note.id });

    if (updated.length === 0) return;  // not found / not owned

    // Replace links wholesale — simpler than diffing, atomic inside the tx.
    await tx.delete(noteTag).where(eq(noteTag.noteId, id));

    if (tags.length === 0) return;
    const upserted = await tx
      .insert(tag)
      .values(tags.map((name) => ({ id: crypto.randomUUID(), userId, name })))
      .onConflictDoUpdate({
        target: [tag.userId, tag.name],
        set: { name: sql`EXCLUDED.name` },
      })
      .returning({ id: tag.id });

    await tx.insert(noteTag).values(upserted.map(({ id: tagId }) => ({ noteId: id, tagId })));
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/notes/${id}`);
  redirect(`/dashboard/notes/${id}`);
}

export async function deleteNote(id: string) {
  const userId = await requireUserId();
  // note_tag rows cascade via FK; tag rows persist so the user's autocomplete
  // vocabulary survives note deletion.
  await db.delete(note).where(and(eq(note.id, id), eq(note.userId, userId)));
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
```

Worth calling out:

**`eq(note.userId, userId)` in every write.** Security boundary — without it, any signed-in user could update or delete any note by ID. Passing `userId` through the action is not enough; it has to be in the SQL `WHERE`.

**Each write ends with a redirect.** `createNote` → `/dashboard` (back to the list with the new row on top). `updateNote` → `/dashboard/notes/${id}` (the read view, where you can confirm the change and click Edit again if you want to keep going). `deleteNote` → `/dashboard`. The earlier draft of this template used Stripe/Linear-style "stay on the edit page after save" for `updateNote`, which is the right call when there's no read view counterpart (e.g. settings forms in section 10) — but with a dedicated read view at `/dashboard/notes/${id}`, "save and view" reads more naturally.

**`normalize()` on tags.** Lowercase, trim, dedupe, drop empties. Done server-side because we trust user input only at the boundary.

**`onConflictDoUpdate({ set: { name: sql`EXCLUDED.name` } }).returning(...)`.** Postgres only fires `RETURNING` for rows that were actually inserted *or updated*. `onConflictDoNothing` skips conflicting rows entirely, so RETURNING wouldn't include them. The trick is to do a no-op update on conflict (set the name to itself via `EXCLUDED.name`) — that counts as an update, so RETURNING fires, and we get IDs back for both newly-inserted and already-existing tags in one query.

**Wholesale relink on update.** We could diff the before/after tag lists and add/remove only the deltas, but for small N (max 20 tags per the schema) a `DELETE WHERE note_id = ?` followed by re-insert is simpler and equally fast inside a single transaction.

### List page (`src/app/(app)/dashboard/page.tsx`) — URL-as-state for list controls

The list page reads everything it needs to render from the URL: which view to use, how to sort, what page to show, and whether to filter by tag. Each control is a pure server-rendered link that pushes a new URL — no client-side list state, no useEffect, fully cache-friendly, shareable URLs.

```tsx
const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string; sort?: string; dir?: string; page?: string; tag?: string;
  }>;
}) {
  const { view: viewParam, sort: sortParam, dir: dirParam, page: pageParam, tag: tagParam } =
    await searchParams;
  const view: NotesView = viewParam === "table" ? "table" : "card";
  const sort: SortColumn = sortParam === "title" || sortParam === "created" ? sortParam : "updated";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  const tagFilter = tagParam?.trim() || null;

  const sortColumn = sort === "title" ? note.title
                   : sort === "created" ? note.createdAt
                   : note.updatedAt;

  // Filter by tag: fetch the matching note IDs first, then `inArray` them
  // into the main query so sort + pagination still happen in SQL.
  let filteredIds: string[] | null = null;
  if (tagFilter) {
    const matches = await db
      .select({ noteId: noteTag.noteId })
      .from(noteTag)
      .innerJoin(tag, eq(tag.id, noteTag.tagId))
      .where(and(eq(tag.userId, session.user.id), eq(tag.name, tagFilter)));
    filteredIds = matches.map((r) => r.noteId);
  }

  const total = filteredIds
    ? filteredIds.length
    : (await db.select({ total: sql<number>`count(*)::int` }).from(note)
        .where(eq(note.userId, session.user.id)))[0].total;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const page = Math.min(requestedPage, totalPages);  // clamp to range

  const whereClause = filteredIds
    ? filteredIds.length === 0
      ? sql`false`  // tag exists but has zero notes — short-circuit
      : and(eq(note.userId, session.user.id), inArray(note.id, filteredIds))
    : eq(note.userId, session.user.id);

  const rows = await db.query.note.findMany({
    where: whereClause,
    orderBy: dir === "asc" ? asc(sortColumn) : desc(sortColumn),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    with: { noteTags: { with: { tag: true } } },
  });
}
```

Things worth pinning:

**Validate every search param.** Untrusted strings from the URL — narrow them to a known set with explicit fallbacks. `sortParam === "title" || sortParam === "created" ? sortParam : "updated"` is the canonical shape; do not pass `sortParam` directly into Drizzle.

**Filter via two-query approach, not a JOIN in the relational API.** Drizzle's `db.query.note.findMany` doesn't let you put a join condition in `where`. Fetching matching IDs first (one cheap indexed SELECT on `note_tag`) and then `inArray(note.id, ids)` keeps the second query a normal relational fetch with `with: { noteTags: { with: { tag: true } } }` for the chip-rendering data. Edge case: zero matches → `inArray([])` is undefined behavior in SQL, so we short-circuit to `sql\`false\``.

**Count, then clamp.** Totaling first lets us redirect-or-clamp `?page=99` on a 2-page set to a real page rather than rendering an empty body. With table-fixed pagination it's tempting to skip the count and just `return null` on out-of-range, but the count is one cheap `SELECT count(*)` and gives us "Page N of M" for free.

**`count(*)::int`.** Postgres returns `bigint` for `count()`, which Drizzle types as `string`. Casting to `int` inside the `sql` template keeps the JS type as `number`.

**`db.query.note.findMany`** (the relational query API) generates a single SQL query that pulls each note plus its joined `noteTags` and the `tag` row each link points at, using JSON aggregation under the hood. We then flatten `noteTags[].tag.name` into a `string[]` so `NoteCard` and `NoteTable` see the same shape and don't know about the join table.

### View toggle (`view-toggle.tsx`)

shadcn `ToggleGroup` (base-ui under the hood). The trick is that base-ui treats `value` and `onValueChange` as **arrays of strings** even when the group behaves single-select, so the controlled value is `[view]` and the change handler picks the entry that *isn't* the current value:

```tsx
function handleChange(next: string[]) {
  // empty = user clicked the active button to deselect; ignore so one stays on.
  const picked = next.find((v) => v !== value) ?? next[0];
  if (picked !== "card" && picked !== "table") return;
  // ...push new URL with router.replace(...)
}
```

The toggle preserves all other search params (`new URLSearchParams(searchParams)`) so flipping cards/table doesn't kick the user off page 3 or wipe their tag filter.

### Sortable column headers — server-rendered links

Each `<th>` in the table renders a `<Link>` (the `SortLink` helper) whose `href` is the same page with new sort params. No client state at all — clicking the header is just navigating.

```tsx
function SortLink({ column, label, defaultDir, sort, dir, tagFilter }: { ... }) {
  const active = sort === column;
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  // Build URL: keep the user in table view, preserve any tag filter, only set
  // sort/dir when the next state differs from the page defaults.
  const params = new URLSearchParams();
  params.set("view", "table");
  if (tagFilter) params.set("tag", tagFilter);
  if (!(column === "updated" && nextDir === "desc")) {
    params.set("sort", column);
    params.set("dir", nextDir);
  }
  // `page` is intentionally omitted — sort change resets to page 1.
  return <Link href={`/dashboard?${params}`} scroll={false}>...</Link>;
}
```

Two small UX choices: **clicking a column for the first time uses its default direction** (asc for Title, desc for dates — matching what users expect). **The default state (sort=updated + dir=desc) drops both params from the URL** so the canonical URL stays clean.

### Pagination (`pagination.tsx`)

Same pattern again — Previous / "Page N of M" / Next where each side is a `<Link>` to the same page with `?page=N±1`. Hidden when there's only one page. The component takes a `preserve` map (other params it should carry forward) and is kept stupid: it doesn't know what `view` or `sort` mean.

### Tag filter

Tag chips on `NoteCard` and inside the `TagsCell` link to `/dashboard?tag=foo`. When the page sees `?tag=`, it filters as shown above and renders a "Filtered by [tag] ×" pill at the top of the list. The × is just a `<Link>` to a URL with `tag` removed.

This collapses what used to be a separate `/tags/[name]` route into a single dashboard view that also handles sort, paging, and view toggle simultaneously. `/tags` (without `[name]`) still exists as an index of every tag with its note count — its links now point at `/dashboard?tag=…` instead of a dedicated page.

### Cards vs table — overflow tags with a `+N` badge (`tags-cell.tsx`)

Both views share `TagsCell` for rendering chips. It's a small client component that lays the chips out in a single `flex flex-nowrap` line, measures with a `ResizeObserver`, hides the chips that don't fit with `display: none`, and shows a `+N` badge for the count of hidden ones — reserving room for the badge in its own width calculation so it never gets clipped itself.

```tsx
useLayoutEffect(() => {
  const update = () => {
    // measure each chip's offsetWidth, find how many fit before
    // (containerWidth - badgeWidth), hide the rest with display:none, set hidden count
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(containerRef.current);
  return () => ro.disconnect();
}, [tags]);
```

Hydration consistency: initial state is `hidden = 0`, so the server-rendered HTML and the client's first render match (badge `display: none`). The effect runs after hydration and hides chips + reveals the badge if anything overflows. JS-off users see chips clipped via `overflow: hidden` without the `+N` indicator — graceful degradation.

The same component is used in `NoteCard`'s tag row and in the table's Tags column. In the card, it's wrapped in `<div className="min-w-0 flex-1">` — that `min-w-0` is what lets the flex parent shrink below the chips' intrinsic width; without it, the chips would push the card wider than its grid cell and the `overflow-hidden` would never kick in.

### Tag suggestions (`src/lib/notes-queries.ts`)

```ts
export async function getTagSuggestions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tag.name })
    .from(tag)
    .where(eq(tag.userId, userId))
    .orderBy(tag.name);
  return rows.map((r) => r.name);
}
```

Now that tags are first-class rows, the suggestion query is a plain `SELECT … ORDER BY name`. No `unnest`, no `DISTINCT`, no array shenanigans. This is the cleanest signal that the m:m refactor was the right call: the previous version was a `selectDistinct({ tag: sql\`unnest(${note.tags})\` })` because tags were embedded in an array column.

Loaded on `/dashboard/notes/new` and `/dashboard/notes/[id]/edit` and passed to the editor as `tagSuggestions`.

### The shared editor (`src/app/(app)/dashboard/notes/note-editor.tsx`)

```tsx
type NoteEditorProps = {
  cardTitle: string;
  cardDescription?: string;
  submitLabel: string;
  initialValues?: NoteInput;
  tagSuggestions?: string[];
  onSubmit: (values: NoteInput) => Promise<{ error?: string } | undefined>;
  /** Where Cancel goes. Defaults to /dashboard; pass the read view URL on edit. */
  cancelHref?: string;
};

export function NoteEditor({
  cardTitle, cardDescription, submitLabel, initialValues, tagSuggestions = [],
  onSubmit, cancelHref = "/dashboard",
}: NoteEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<NoteInput>({
    resolver: zodResolver(noteInputSchema),
    defaultValues: initialValues ?? { title: "", content: "", tags: [] },
  });

  function handleSubmit(values: NoteInput) {
    // The action throws via redirect() on success — we only see `result`
    // when validation fails. useTransition keeps `pending` true through both
    // the action and the subsequent navigation.
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <Card>
        <CardHeader>{/* title + description */}</CardHeader>
        <CardContent className="space-y-4">
          {/* Controller-wrapped Field for title, content, tags */}
        </CardContent>
        <CardFooter className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)} disabled={pending}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
```

A few decisions worth pinning:

**`<form>` wraps the whole `<Card>`, not just `CardContent + CardFooter`.** Card is `flex flex-col gap-4` and relies on header / content / footer being its *direct* children. Wrapping just `CardContent + CardFooter` collapses to `[Header, form]` from Card's perspective, the gap disappears, and the Save button sticks to the input above it. Wrap the whole Card.

**`useTransition` instead of `form.formState.isSubmitting`.** Both create and edit end with `redirect()` in the server action. With `isSubmitting`, the button briefly flips back to its idle label between "Saving…" and the navigation completing. `useTransition` keeps `pending` true through both phases.

**`disabled={pending}` only — never `disabled={!form.formState.isDirty}`.** It's tempting to disable Save when the form hasn't changed, but it's user-hostile: someone else might have edited the row, the user might want to forcibly bump `updatedAt`, or RHF's dirty tracking might disagree with their mental model. Let them click Save whenever they want; the action is idempotent.

**`cancelHref` prop.** Create-mode Cancel goes to the dashboard list (the user is on a fresh form, "abandon" means go back). Edit-mode Cancel goes to the read view of the same note (the user is editing a thing, "abandon" means go back to viewing it). Defaulting to `/dashboard` keeps create-mode's call site clean.

### Create page (`src/app/(app)/dashboard/notes/new/page.tsx`)

```tsx
const tagSuggestions = await getTagSuggestions(session.user.id);
return (
  <NoteEditor
    cardTitle="New note"
    cardDescription="Add a title, body, and any tags."
    submitLabel="Create"
    tagSuggestions={tagSuggestions}
    onSubmit={createNote}
  />
);
```

### Read view (`src/app/(app)/dashboard/notes/[id]/page.tsx`)

When you click a note in the list, you land here — a calm read view, not a form.

```tsx
const { id } = await params;
const n = await db.query.note.findFirst({
  where: and(eq(note.id, id), eq(note.userId, session.user.id)),
  with: { noteTags: { with: { tag: true } } },
});
if (!n) notFound();

const tags = n.noteTags.map((nt) => nt.tag.name).sort();
const wasEdited = n.updatedAt.getTime() !== n.createdAt.getTime();

return (
  <article className="space-y-6">
    <Link href="/dashboard">← All notes</Link>
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1>{n.title}</h1>
        <p className="text-xs text-muted-foreground">
          {wasEdited ? "Updated" : "Created"} {formatDateTime(n.updatedAt)}
          {wasEdited && ` · Created ${formatDateTime(n.createdAt)}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/dashboard/notes/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
          Edit
        </Link>
        <DeleteNoteButton id={id} />
      </div>
    </div>
    {n.content && <div className="whitespace-pre-wrap leading-relaxed">{n.content}</div>}
    {tags.length > 0 && (
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {tags.map((tag) => (
          <Link key={tag} href={`/dashboard?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
        ))}
      </div>
    )}
  </article>
);
```

`whitespace-pre-wrap` preserves the user's line breaks without needing a markdown library. `wasEdited` shapes the timestamp line — for never-edited notes we just say "Created …"; for edited ones we lead with the more recent "Updated …" and reveal the original creation time after the dot.

### Edit page (`src/app/(app)/dashboard/notes/[id]/edit/page.tsx`)

```tsx
const { id } = await params;
const [n, tagSuggestions] = await Promise.all([
  db.query.note.findFirst({
    where: and(eq(note.id, id), eq(note.userId, session.user.id)),
    with: { noteTags: { with: { tag: true } } },
  }),
  getTagSuggestions(session.user.id),
]);
if (!n) notFound();

const tags = n.noteTags.map((nt) => nt.tag.name).sort();

async function saveThisNote(input: NoteInput) {
  "use server";
  return updateNote(id, input);
}

return (
  <NoteEditor
    cardTitle="Edit note"
    cardDescription={`Last updated ${new Date(n.updatedAt).toLocaleString()}`}
    submitLabel="Save changes"
    initialValues={{ title: n.title, content: n.content, tags }}
    tagSuggestions={tagSuggestions}
    onSubmit={saveThisNote}
    cancelHref={`/dashboard/notes/${id}`}
  />
);
```

The inline `"use server"` function closes over `id` so the editor stays generic. `Promise.all` for the row + suggestions because they're independent.

Note `params` is a `Promise<{ id: string }>` — Next 16 made dynamic params async. Awaiting it is cheap; forgetting to await silently breaks the page.

### Delete with confirmation (`src/app/(app)/dashboard/notes/delete-button.tsx`)

```tsx
<AlertDialog>
  <AlertDialogTrigger className={cn(buttonVariants({ variant: "destructive" }))}>
    <Trash2 className="mr-2" /> Delete
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this note?</AlertDialogTitle>
      <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        disabled={pending}
        onClick={() => startTransition(async () => { await deleteNote(id); })}
      >
        {pending ? "Deleting…" : "Delete"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`AlertDialogTrigger` styled directly via `className={cn(buttonVariants(...))}` — same pattern as `<Link className={buttonVariants(...)}>`. base-ui's trigger renders a `<button>` already, no need to wrap it in `<Button>`.

`useTransition` again: `deleteNote` redirects, so `pending` stays `true` through the navigation — no flicker between "Deleting…" and the unmount.

---

## 7. Tags input — Combobox with autocomplete + "create new"

The tag input gives you autocomplete from suggestions *and* the ability to add a brand-new tag inline. shadcn's `Combobox` (which wraps `@base-ui/react/combobox`) supports both via a single trick: the typed-but-not-yet-existing value is itself rendered as a list item.

### `src/components/tags-input.tsx`

```tsx
"use client";

import * as React from "react";
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput,
  ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList,
  ComboboxValue, useComboboxAnchor,
} from "@/components/ui/combobox";

export function TagsInput({ value, onChange, suggestions = [], id, ...rest }: TagsInputProps) {
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = React.useState("");

  // Items shown in the dropdown:
  //   - any existing suggestion the user hasn't already added
  //   - the currently-typed value, if it's non-empty and not already a suggestion
  // The typed value being in `items` is what lets the user "create" a new tag —
  // it's just selected like any other option.
  const items = React.useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    const base = suggestions.filter((s) => !value.includes(s));
    if (!trimmed) return base;
    if (base.includes(trimmed)) return base;
    if (value.includes(trimmed)) return base;
    return [trimmed, ...base];
  }, [suggestions, inputValue, value]);

  function handleValueChange(next: string[]) {
    const normalized = Array.from(
      new Set(next.map((t) => t.trim().toLowerCase()).filter(Boolean)),
    );
    onChange(normalized);
    setInputValue("");
  }

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      value={value}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <ComboboxChips ref={anchor} aria-invalid={rest["aria-invalid"]}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((v) => (<ComboboxChip key={v}>{v}</ComboboxChip>))}
              <ComboboxChipsInput id={id} placeholder={value.length === 0 ? "Add tags…" : ""} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {suggestions.includes(item) ? item : (
                <>Create <span className="font-medium text-foreground">&ldquo;{item}&rdquo;</span></>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

### Why this shape

- **Multiple-select Combobox + chips**: the user can keep typing to filter, and selected tags appear as chips inline with the input. Existing tags are filtered out of the dropdown so they can't be added twice.
- **The typed value injected as item #0**: the dropdown list is `[<typed value>, ...existing suggestions not yet added]`. When the user hits Enter or clicks the "Create …" item, base-ui calls `onValueChange` with the new value. Without this trick, you'd need a separate "create new" button or an `onKeyDown` handler.
- **`handleValueChange` re-normalizes**: lowercase, trim, dedupe. Defensive — the server action does the same — but it keeps the in-form state consistent.
- **Conditional list rendering**: if the item exists in `suggestions` it shows the bare tag; otherwise it shows `Create "<value>"`. Same component, different styling per item.

### One styling adjustment

The default `ComboboxChip` from shadcn uses `bg-muted`. Inside a `<Card>`, the card body's `bg-input/30` makes that chip blend into the field background. The fix is in `src/components/ui/combobox.tsx` — change `bg-muted` to `bg-foreground/15` on `ComboboxChip` so chips have visible contrast against the field but still feel quiet.

---

## 8. Layout shells — top nav + route groups

### Route group structure

```
src/app/
  layout.tsx            # root: html/body, ThemeProvider, Toaster
  page.tsx              # landing (own header, no app chrome)
  (auth)/
    layout.tsx          # minimal: brand + theme toggle, centered card
    sign-in/page.tsx
    sign-up/page.tsx
  (app)/
    layout.tsx          # AppHeader + max-w-6xl main
    dashboard/page.tsx
    dashboard/notes/new/page.tsx
    dashboard/notes/[id]/page.tsx
    tags/page.tsx
    tags/[name]/page.tsx
    settings/page.tsx
```

`(app)` and `(auth)` are route groups (parens-folder = no URL prefix). They share their own layouts but the URL paths stay flat: `/sign-in`, `/dashboard`, `/tags`, `/settings`.

### Why a top nav, not a sidebar

shadcn's `Sidebar` block is great when you have ≥ 5–10 nav items and want a persistent rail. With three (Notes, Tags, Settings) it's overbuilt — and the off-canvas mobile sheet `collapsible` adds complexity for little gain. A sticky top header with inline nav is simpler markup, naturally responsive (icons-only at mobile widths, label + icon at `sm+`), and reclaims the screen real estate the sidebar would have eaten on every page.

### `(app)/layout.tsx`

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader user={session.user} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
```

Belt-and-suspenders auth: `proxy.ts` already redirects unauth requests (matcher: `/dashboard/:path*`, `/tags/:path*`, `/settings/:path*`), but the layout re-checks and gets the `user` object for the header. `max-w-6xl` matches the header's container so they line up.

### `AppHeader` — brand, inline nav, user dropdown

`src/components/app-header.tsx` is a client component (`usePathname` for active state, `useTheme` inside the dropdown). Skeleton:

```tsx
"use client";

const nav = [
  { title: "Notes", href: "/dashboard", icon: NotebookIcon },
  { title: "Tags", href: "/tags", icon: TagIcon },
  { title: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight whitespace-nowrap">
          create-webapp
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{item.title}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <UserDropdown user={user} />
        </div>
      </div>
    </header>
  );
}
```

Three things worth pinning:

**Mobile-friendly nav.** Each `<Link>` renders the icon always and the label only at `sm+` (`hidden sm:inline`). On a phone you get three icons + the user avatar; on desktop you get three text links. No off-canvas sheet, no hamburger.

**Active state via `pathname.startsWith(`${item.href}/`)`.** Without the trailing `/`, `/settings` would match for `/settings-something-else`. The slash makes the prefix match safe. Pure equality (`pathname === item.href`) handles the exact-match case so nav items still light up when you're on the index of a section.

**`aria-current="page"`** on the active link. Tiny accessibility detail: screen readers announce "current page" instead of "link". Free win.

### `UserDropdown` — theme switcher + sign out

`DropdownMenu` from shadcn (base-ui under the hood). Two base-ui gotchas show up here:

**Gotcha 1: Triggers use `render` (not `asChild`).** base-ui adopted a `render` prop instead of Radix's `asChild`. We don't use `render` here because we style the trigger directly with `buttonVariants`, but it's the same escape hatch you'd reach for elsewhere (e.g. wrapping a custom anchor as a trigger).

**Gotcha 2: `DropdownMenuLabel` must be inside `DropdownMenuGroup`.** base-ui's `Menu.GroupLabel` reads from `MenuGroupRootContext` provided only by `Menu.Group`. Wrap it that way for actual group labels (like "Theme"); use a styled `<div>` for things that aren't group labels (like the user-info header).

```tsx
<DropdownMenuContent align="end" className="min-w-56">
  {/* user info — not a "group label", just styled */}
  <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
    <span className="text-sm font-medium leading-none">{user.name}</span>
    <span className="text-xs text-muted-foreground truncate">{user.email}</span>
  </div>
  <DropdownMenuSeparator />
  <DropdownMenuGroup>
    <DropdownMenuLabel>Theme</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light"><Sun className="mr-2" /> Light</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark"><Moon className="mr-2" /> Dark</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system"><Monitor className="mr-2" /> System</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenuGroup>
  <DropdownMenuSeparator />
  <DropdownMenuItem variant="destructive" onClick={async () => {
    const { signOut } = await import("@/lib/auth-client");
    await signOut(); router.push("/"); router.refresh();
  }}>
    <LogOutIcon className="mr-2" /> Sign out
  </DropdownMenuItem>
</DropdownMenuContent>
```

`signOut` is dynamically imported inside the click handler so the auth-client doesn't get pulled into the initial bundle for users who never open the menu.

### Landing page — own header, no app chrome

`src/app/page.tsx` lives outside the route groups. It renders its own header (brand + theme toggle + sign-in/up buttons) and a centered hero. Full-width, no chrome from the app shell — that's the point of route groups.

### Tags page — `/tags` and `/tags/[name]`

A direct payoff of the m:m schema (section 6). Two routes:

**`/tags`** — list of all the user's tags, with note counts:

```tsx
const rows = await db
  .select({
    name: tag.name,
    count: sql<number>`count(${noteTag.noteId})::int`,
  })
  .from(tag)
  .leftJoin(noteTag, eq(noteTag.tagId, tag.id))
  .where(eq(tag.userId, session.user.id))
  .groupBy(tag.id, tag.name)
  .orderBy(tag.name);
```

`leftJoin` so tags with zero notes still appear (we keep tag rows around after their last note is deleted). `count(...)::int` because Postgres `count` returns `bigint` by default, which Drizzle surfaces as a string — casting to `int` keeps the JS type as `number`.

There's no `/tags/[name]` route — clicking a tag chip from anywhere navigates to `/dashboard?tag=foo`, which the dashboard handles via the filter logic in section 6 alongside its sort + view + pagination state. One source of truth for "list of notes" instead of two routes that would inevitably drift.

### Clickable tag chips — the stretched-link pattern

`NoteCard` needs to navigate to the note when you click anywhere on the card *and* navigate to the filtered dashboard when you click a tag chip. Nested `<a>` elements aren't valid HTML, so the trick is:

```tsx
<li className="relative rounded-lg border p-4 hover:bg-muted/50">
  <Link
    href={`/dashboard/notes/${note.id}`}
    className="block after:absolute after:inset-0 after:content-['']"
  >
    <h2>{note.title}</h2>
    {note.content && <p>{note.content}</p>}
  </Link>
  <div className="mt-3 flex justify-between gap-4">
    <div className="min-w-0 flex-1"><TagsCell tags={note.tags} /></div>
    <time>...</time>
  </div>
</li>
```

The title link's `::after` pseudo-element absolute-fills the parent `<li>`, making the entire card clickable to the note (the read view). The chip links inside `TagsCell` are siblings with `position: relative`, which puts them above the `::after` in the stacking order so their clicks land on the chip, not the note. The `<time>` (no `relative`) stays under the `::after`, so clicking the date still opens the note.

This is the Bootstrap "stretched-link" pattern, and Tailwind's `after:absolute after:inset-0` makes it a one-liner.

---

## 9. Theme switching — without the FOUC

### Why next-themes, not a hand-rolled hook

A naive theme toggle:

1. Server renders HTML in light mode (default)
2. Browser paints in light
3. JS loads, reads `localStorage`, sees `"dark"`
4. JS sets `class="dark"` on `<html>`
5. → user sees the flash from light → dark

`next-themes` injects an inline `<script>` in `<head>` that runs synchronously *before* paint, reads localStorage, and sets the class on `<html>`. No flash. Already installed by `shadcn init`.

### Provider (`src/components/theme-provider.tsx`)

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

### Root layout (`src/app/layout.tsx`)

```tsx
<html lang="en" suppressHydrationWarning className="...">
  <body className="min-h-full flex flex-col bg-background text-foreground">
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster richColors />
    </ThemeProvider>
  </body>
</html>
```

`suppressHydrationWarning` is required because next-themes mutates the `<html>` element pre-hydration. `disableTransitionOnChange` prevents weird color animations during theme flips.

### `ThemeToggle` and the hydration trap

```tsx
"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] dark:hidden" />
      <Moon className="hidden h-[1.2rem] w-[1.2rem] dark:block" />
    </Button>
  );
}
```

**The trap to avoid**: don't compute the `aria-label` from `theme` (`Switch to ${theme === "dark" ? "light" : "dark"} theme`). On the server, `useTheme()` returns `undefined`, so the rendered label is one thing; on the client after hydration, it's another → React hydration mismatch error. Either use a static label (we did) or gate the dynamic content behind a `mounted` state flag set in `useEffect`.

The icons use Tailwind variants (`dark:hidden` / `dark:block`) so they switch via CSS without re-rendering — no hydration issue.

---

## 10. Profile management

### Settings page (`src/app/(app)/settings/page.tsx`)

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account.</p>
      </div>
      <div className="space-y-6">
        <ProfileForm initialName={session.user.name} email={session.user.email} />
        <PasswordForm />
      </div>
    </>
  );
}
```

Both forms reuse the RHF + Zod + Field pattern from section 5. Two server-action calls drive them:

### Name change (`profile-form.tsx`)

```ts
const { error } = await authClient.updateUser({ name: values.name.trim() });
if (error) { toast.error(error.message ?? "Failed to update profile"); return; }
toast.success("Profile updated");
form.reset({ name: values.name.trim() });   // collapse RHF "dirty" state
router.refresh();                            // re-render the layout (sidebar uses session.user.name)
```

`form.reset(values)` after success is the same trick used in the note editor: stay on the page, mark the form clean, surface success via toast.

### Password change (`password-form.tsx`)

```ts
const { error } = await authClient.changePassword({
  currentPassword,
  newPassword,
  revokeOtherSessions: true,  // sign out other devices/browsers
});
```

The form schema uses Zod's `.refine()` to enforce `newPassword === confirmPassword` and a minimum length. After success, reset the form back to empty so the fields don't keep the password values around.

### Why no email change

better-auth's `changeEmail` requires email verification (sends a link to the new address). That requires email-sending infrastructure (Resend, SES, etc.) which is outside the template's scope. If you need it:

```ts
// in src/lib/auth.ts
user: {
  changeEmail: {
    enabled: true,
    sendChangeEmailVerification: async ({ user, newEmail, url }) => {
      // send an email with `url` to `newEmail`
    },
  },
},
```

Then on the client: `authClient.changeEmail({ newEmail, callbackURL })`.

---

## 11. Verify everything works

```bash
npm run db:migrate    # idempotent
npm run db:seed       # demo user + 5 notes (idempotent — re-run to reset)
npm run dev
```

If you ran the seed, sign in with **user@example.com** / **password@123** to land on a populated dashboard.

Walk the flow:

1. `/` — landing with brand nav, sign-in/sign-up buttons (or sign in as **user@example.com** / **password@123** if you ran the seed)
2. `/sign-up` — create an account → auto-redirects to `/dashboard`
3. Dashboard with seeded notes → click **New note** → fill title, body, and a couple of tags → **Create** → land back on `/dashboard` with the new row at the top
4. Type a partial tag in the editor — see the Combobox dropdown autocomplete from your prior tags + offer "Create …" for a new one
5. Click a card → land on the **read view** at `/dashboard/notes/[id]` (title, body, clickable tag chips, timestamps, Edit + Delete)
6. Click **Edit** → form view at `/dashboard/notes/[id]/edit`. Save → back to read view. Cancel → back to read view. Delete → AlertDialog → confirm → back to dashboard.
7. Toggle the dashboard view to **Table** (icon group at the top right). Click column headers to sort by Title or Updated; URL updates with `?sort=` and `?dir=`. Watch tag chips clip to a `+N` badge when there's not enough room.
8. Click a tag chip on a card or in the table — dashboard filters via `?tag=foo`. The filter pill shows under the header; click the × to clear.
9. With the seeded 12 notes, paginate with the Previous / Next buttons at the bottom (page size = 10).
10. Top-nav → **Tags** — index of every tag you've used with note counts; clicking one drops you back on `/dashboard?tag=…`
11. Top-nav user avatar → switch theme (light / dark / system); resize the browser narrow → nav collapses to icons-only at < `sm`
12. Top-nav → **Settings** — change your name (header updates after refresh), change your password
13. Sign out → back to landing
14. `/sign-in` — sign in with the new password → notes still there (PGlite persistence)
15. `/dashboard` while signed out → redirects to `/sign-in?redirect=%2Fdashboard`

Then build:

```bash
npm run build
```

Should pass with no `PGlite failed to initialize properly` errors. If you see them, your db module isn't lazy-initialized — see step 2's `Proxy` pattern.

---

## Gotchas summary (the things that bit us)

1. **Next 16: `middleware.ts` → `proxy.ts`.** File rename, function rename, codemod available.
2. **Next 16: dynamic route `params` is now a `Promise`.** `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; }`. Forgetting to await silently breaks.
3. **shadcn 4 `Button` has no `asChild`.** Use `<Link className={buttonVariants({...})}>` for link-buttons. Same goes for `AlertDialogTrigger`, `DropdownMenuTrigger`, etc — base-ui exposes `render={<SomeOtherEl />}` as the equivalent escape hatch.
4. **`useSearchParams()` requires `<Suspense>`** to prerender. Sign-in demonstrates the wrapping pattern.
5. **PGlite must be lazy-initialized.** Build workers race to lock `./pgdata` if the db module instantiates eagerly. Use a `Proxy`.
6. **PGlite locks `./pgdata` per-process.** Running `npm run db:migrate` while `npm run dev` is up either fails or leaves the dev server with a stale schema cache. Stop dev → migrate → restart.
7. **PGlite + driver-union breaks `tx` method overloads.** If `DrizzleDb` is the union of `PgliteDatabase | PostgresJsDatabase`, TypeScript can't unify `.returning(...)` and similar overloads inside `db.transaction(async (tx) => …)` — you get *"Expected 0 arguments, but got 1"*. Pick one concrete type for `DrizzleDb` and cast the other driver's return value to it.
8. **`@electric-sql/pglite` in `serverExternalPackages`.** Native modules + WASM shouldn't be bundled.
9. **`getSessionCookie` only checks cookie presence** — intentional, no DB hit per request.
10. **`dotenv/config` only reads `.env`.** Use `config({ path: ".env.local" })` explicitly.
11. **`process.env.X ?? "default"` doesn't catch empty strings.** Use `?.trim() || "default"`.
12. **next-themes hydration mismatches.** Don't render dynamic theme-derived content (aria-labels, conditional icons) on first paint without a `mounted` gate. Static text + CSS-driven icon switching is the safe pattern.
13. **`DropdownMenuLabel` requires `DropdownMenuGroup`.** base-ui's `Menu.GroupLabel` reads from a context only `Menu.Group` provides. Wrap it; or use a styled `<div>` for things that aren't group labels.
14. **Tailwind v4 made `<button>` `cursor-default`.** Use `shadcn init --pointer` to add a base CSS rule. Persists in `components.json` so future `shadcn add` honors it.
15. **`disabled:pointer-events-none` swallows the cursor.** The default shadcn `Button` ships that on the disabled state, which means hover gets no `cursor: not-allowed`. Switch to `disabled:cursor-not-allowed disabled:opacity-50` so disabled buttons feel disabled.
16. **Don't disable Save on `!isDirty`.** Tempting, user-hostile: someone else may have edited the row, RHF's dirty tracking can disagree with the user, and the action is idempotent anyway. `disabled={pending}` is enough.
17. **Use `useTransition` when the submit ends in a redirect or revalidation.** `form.formState.isSubmitting` flips back to `false` the moment the action returns, producing a flicker between "Saving…" and the original label as the navigation completes. `useTransition` keeps `pending` true through both phases.
18. **Pick the right "save UX" for the route shape.** Settings forms (no read counterpart, you ARE the page) → save stays on page with `revalidatePath` + `form.reset(values)` + toast. Edit forms with a separate read view → save `redirect()`s to the read view. Don't blanket-apply either pattern; match it to whether the user has somewhere natural to land.
19. **shadcn `Card` looks "lifted" by default** (`bg-card` + `ring-1 ring-foreground/10` + `bg-muted/50` footer). Strip those if you want it to match a plain bordered list-card look — replace `ring-1 ring-foreground/10` with `border` on `Card`, and drop `bg-muted/50` from `CardFooter` (keep `border-t` for the action divider).
20. **`onConflictDoUpdate({ set: { x: sql\`EXCLUDED.x\` } }).returning(…)` for upsert-and-read.** Postgres `RETURNING` only fires on rows that were actually inserted *or* updated. `onConflictDoNothing` skips conflicts entirely → no return for already-existing rows. Doing a no-op update on conflict counts as an update, which makes RETURNING fire for both new and pre-existing rows. Canonical Drizzle m:m sync pattern.
21. **`ComboboxChip` `bg-muted` blends inside the editor's input background.** Override `ComboboxChip` to `bg-foreground/15` (or any contrasting token) so chips stay legible against `bg-input/30`.
22. **Stretched-link pattern for "card click + chip click".** Nested anchors aren't valid HTML, so make the title link's `::after` cover the card (`after:absolute after:inset-0 after:content-['']`) and give chip links `position: relative` to stack above. Source order + Tailwind do all the work.
23. **`count(...)::int` cast on aggregates.** Postgres returns `count(*)` as `bigint`, which Drizzle types as `string`. Cast to `int` (or `numeric`) inside the `sql` template so the JS type stays `number`.
24. **Font CSS variable mismatch.** `create-next-app` exposes Geist as `--font-geist-sans` via `next/font/google`. Shadcn's generated `globals.css` `@theme` block expects it under `--font-sans` and ships with `--font-sans: var(--font-sans)` (self-reference, undefined). Result: `font-sans` falls back to the browser's default serif. Fix: edit `globals.css` to `--font-sans: var(--font-geist-sans)` and `--font-heading: var(--font-geist-sans)`.
25. **Form must wrap the whole Card, not just `CardContent + CardFooter`.** Card is `flex flex-col gap-4` and relies on `CardHeader`/`CardContent`/`CardFooter` being its direct children. If you put `<form>` around just Content+Footer, Card sees `[Header, form]` as its two children — the gap between Content and Footer disappears, and the Save button gets glued to the input above it. Correct pattern: `<form><Card><CardHeader/><CardContent/><CardFooter/></Card></form>`.
26. **Zod v4: `z.email()` is top-level**, not `z.string().email()`; errors live at `parsed.error.issues` (was `.errors`).
27. **`table-fixed` percentages must budget for header width.** `<th>` content (header text + sort arrow + cell padding) is laid out as if the column were as wide as declared, but a percentage too small for the header forces table overflow → horizontal scroll. Either use generous percentages (≥ 15% for date columns), use pixel widths (`w-32`) for content-bounded columns, or both. Don't aim for tight 100%-summed percentages without measuring against worst-case header content.
28. **Validate every URL search param at the boundary.** Take the raw `viewParam`, narrow with explicit equality (`viewParam === "table" ? "table" : "card"`), and pass the typed value down. Same for `sort`, `dir`, `page`, `tag`. The page is a public surface — assume any string can come in.
29. **Filter via two-query approach when the relational API can't join.** Drizzle's `db.query.note.findMany` doesn't put join conditions in `where`. Fetch the filtered IDs first (one cheap select on the join table) and `inArray(parent.id, ids)` them into the relational query. Watch out for `inArray([])` — short-circuit to `sql\`false\`` when the ID list is empty.
30. **`count(*)::int` in `sql` aggregates.** Postgres returns `count` as `bigint`; Drizzle types it as `string`. Cast inside the template so the JS type stays `number` and arithmetic doesn't silently coerce.
31. **Native `title` attribute is free truncation tooltip.** When you `truncate` a heading, just add `title={fullText}` — browsers render it on hover with no JS, no tooltip primitive, no positioning math. Worth doing on table cells and card headlines that can clip.
32. **Stretched-link + `position: relative` on chip children.** When a card-as-link wraps content with chip-as-link siblings, you get nested `<a>` tags (invalid HTML). Use the `::after` pseudo-element pattern (`after:absolute after:inset-0`) on the title link to make the parent clickable, and `position: relative` on the chip links so they stack above the after. Source order takes care of the z-index.
33. **`min-w-0` on flex parents that hold `TagsCell`-style overflow children.** Flex items default to `min-width: auto` which is the children's intrinsic content width. Without `min-w-0` on the parent, the cell can't shrink below the chips' total width and the `overflow: hidden` measurement never triggers — the chips push the row wider than the column.
34. **PGlite + force-killed process leaves the data dir wedged.** `kill -9` mid-write can corrupt the WAL state, and the next `db:migrate`/`db:seed` aborts with a generic WASM `Aborted()` error. The recovery path is `rm -rf pgdata && npm run db:migrate && npm run db:seed`. Real Postgres has the same hazard; PGlite just makes it more visible because each process restart is a fresh DB connection.

---

## What's intentionally NOT in this template

- Email sending (verification, password reset, magic links)
- OAuth providers (GitHub, Google) — easy to add via `socialProviders` in `auth.ts`
- A repository/data-access layer (server actions call drizzle directly). Add `src/lib/data/` if your project gets big enough that you want app code free of drizzle imports.
- Tests, observability, rate limiting, sessions-list management — all reasonable next steps once you have a real domain.
