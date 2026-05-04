# create-webapp

Personal Next.js starter — auth, DB, UI primitives wired and verified. `npm run dev` works on a fresh clone with zero infra (no Docker, no local Postgres, no cloud account).

**Stack** (May 2026):
- Next.js 16.2 (App Router, Turbopack, React 19)
- better-auth 1.6 (email + password)
- Drizzle ORM
- **PGlite** (Postgres-as-WASM, embedded in-process) for local dev
- **postgres-js** + Neon for prod
- shadcn 4 + @base-ui/react (not Radix anymore)
- Tailwind v4
- React Hook Form 7.75 + Zod 4.4 for forms
- next-themes for FOUC-free theme switching

## Quick start

```bash
cp .env.example .env.local            # then fill in BETTER_AUTH_SECRET
npm install
npm run db:migrate                    # creates ./pgdata + applies migrations
npm run db:seed                       # optional: demo user + sample notes
npm run dev
```

Open http://localhost:3000.

If you ran `db:seed`, you'll have two accounts (both password **password@123**):
- **user@example.com** — regular user with a populated dashboard
- **admin@example.com** — same plus the `admin` role, sees the `/admin/*` routes

The seed is idempotent (wipes the demo user's notes and re-inserts; admin role is re-asserted), so re-run any time you want a clean slate.

To generate a fresh auth secret: `openssl rand -base64 32`.

## Why PGlite?

PGlite is real Postgres compiled to WebAssembly, running in your Node process. The `./pgdata` directory it creates is a literal Postgres data directory — `pg_hba.conf`, `base/`, the works. Same SQL dialect as prod, same Drizzle schema, same queries. There's no SQLite/Postgres mismatch to debug.

The application code (`src/lib/data` if added, server actions, pages) is identical across dev and prod. Only `src/lib/db/index.ts` switches drivers based on the `DATABASE_URL` prefix.

## Routes

| Path                            | What it does                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `/`                             | Landing — links to sign-up/sign-in (or dashboard if signed in)                            |
| `/sign-up`, `/sign-in`          | RHF + Zod email/password forms (better-auth client)                                       |
| `/dashboard`                    | Notes list. URL-as-state: `?view=card\|table`, `?sort=…&dir=…`, `?page=N`, `?tag=…`       |
| `/dashboard/notes/new`          | Create form (shared `NoteEditor`)                                                         |
| `/dashboard/notes/[id]`         | Read view — title, body, clickable tag chips, Edit + Delete buttons                       |
| `/dashboard/notes/[id]/edit`    | Edit form (shared `NoteEditor`); save redirects back to the read view                     |
| `/tags`                         | Index of every tag the user has used, with note counts; links into `/dashboard?tag=…`     |
| `/settings`                     | Profile name + password forms                                                             |
| `/api/auth/[...all]`            | better-auth handler                                                                       |
| `/api/v1/notes`                 | REST: `GET` (list with `?tag&sort&dir&page&pageSize`), `POST` (create). Bearer-token auth |
| `/api/v1/notes/[id]`            | REST: `GET`, `PATCH`, `DELETE`. Bearer-token auth                                         |
| `/api/v1/tags`                  | REST: `GET` — every tag the user has used, with note counts. Bearer-token auth            |
| `/api/mcp`                      | Model Context Protocol over Streamable HTTP. Same Bearer auth + scopes as REST            |

`/dashboard/*`, `/tags/*`, and `/settings/*` are protected by `src/proxy.ts` (cookie presence check) and re-checked inside `(app)/layout.tsx` (real session lookup, also gives the layout the user object).

## API

The same operations exposed through the dashboard are available over HTTP at `/api/v1/*` for CLIs, MCP servers, and other automation. See **`docs/API.md`** for the full reference.

```bash
curl -H "Authorization: Bearer $KEY" http://localhost:3000/api/v1/notes
```

Keys are issued per-user and carry one or more scopes (`notes:read`, `notes:write`, `tags:read`). The service layer (`src/lib/services/`) is the single source of truth — server actions, REST handlers, and the MCP server all sit on top of the same functions.

## CLI

`scripts/cli.ts` mirrors the REST API as a one-file `tsx` script. Set `CWA_API_KEY` (and optionally `CWA_BASE_URL`), then:

```bash
export CWA_API_KEY=cwa_...
npm run cli -- notes list
npm run cli -- notes create --title "Hi" --content "There" --tag greeting --json
npm run cli -- tags list
```

Use `--json` on any read verb for clean piping into `jq`. See **`docs/CLI.md`** for the full reference.

## Use it from Claude Code (MCP)

Once the dev server is running, you can let Claude Code read and write your notes for you over MCP. Setup is a one-time, three-step thing:

1. **Make an API key.** Sign in at http://localhost:3000, go to **Settings → API keys**, click **Create**. Name it something like `claude-code`. Leave all three scopes checked (`notes:read`, `notes:write`, `tags:read`). Copy the secret on the reveal banner — you only see it once.

2. **Drop the key into the gitignored slot.** From the repo root:

   ```bash
   cp .claude/settings.local.example.json .claude/settings.local.json
   ```

   Open `.claude/settings.local.json` and replace `cwa_paste_your_key_here` with the secret you just copied.

3. **Restart Claude Code in this repo.** Run `/mcp` — you should see `create-webapp` under **Project MCPs** with status `connected`.

That's it. Try a prompt:

> *List my notes*

Claude calls the `notes_list` tool and renders a formatted table. Other things that just work:

> *Create a note titled "MCP smoke test" with content "this came from Claude" tagged mcp,test*
>
> *What's in my drone log idea note?*  ← Claude calls `notes_list` to find the id, then `notes_get`
>
> *List my notes tagged interview*  ← uses the `tag` filter

For read-only research agents, generate a key with only `notes:read` and `tags:read` checked.

**Behind the scenes:** an MCP server is mounted at `POST /api/mcp` inside the Next app (Streamable HTTP transport, same Bearer auth as REST, no separate process to install). The wiring is in committed `.mcp.json` referencing `${CWA_API_KEY}`; the secret lives only in your gitignored `settings.local.json`. See **`docs/MCP.md`** for the full reference (Claude Desktop config, tool list, scope model, OAuth as a future direction).

## Database

Schema lives at `src/lib/db/schema.ts` (single `pgTable` definition). The unified migration script in `scripts/migrate.ts` picks the right driver:

- `DATABASE_URL` empty / unset / non-`postgres:` → PGlite at `./pgdata`
- `DATABASE_URL` starts with `postgres:` → postgres-js client

```bash
npm run db:generate     # diff schema → SQL migration in /drizzle
npm run db:migrate      # apply migrations (PGlite locally, Postgres in prod)
npm run db:seed         # idempotent demo user + notes (PGlite only — see scripts/seed.ts)
npm run db:studio       # browse data via Drizzle Studio
```

`db:studio` needs a real Postgres URL; for PGlite, inspect rows by adding a script that queries `db` directly.

### Tags as m:m

`note` 1:M `note_tag` M:1 `tag`. Tags are scoped per-user via `tag.user_id`, with a unique index on `(user_id, name)` so the same word can't be a tag twice. The dashboard list and edit page read tags via Drizzle's relational query API (`db.query.note.findMany({ with: { noteTags: { with: { tag: true } } } })`); writes use `.onConflictDoUpdate(...).returning(...)` inside a transaction to upsert tags and their join rows in one round-trip.

Tag rows persist after their last note is deleted — that's intentional, the autocomplete vocabulary should be stable.

## Admin / RBAC

Powered by better-auth's `admin` plugin (`src/lib/auth.ts`). The `user.role` column drives access; `role: "admin"` unlocks `/admin/*`. Default for new users is `"user"`.

**Bootstrap your first admin:**

```bash
npm run admin:promote you@example.com
```

(Or set `ADMIN_USER_IDS=user_id_1,user_id_2` in env — those IDs are always treated as admin even if their `role` column says otherwise.)

**Admin routes:**
- `/admin/users` — list every user with note/session counts. Note content is **never** shown.
- `/admin/users/[id]` — per-user detail with actions:
  - Send password reset email (uses the public flow → email lands in `/dev/inbox`)
  - Resend verification email
  - Promote/demote role (disabled on self to avoid lockout)
  - Ban/unban
  - Delete user (cascades to notes/tags/sessions; disabled on self)

  Deliberately not exposed: a freeform "set password" — see DECISIONS.md.
- `/admin/inbox` — same data as `/dev/inbox`, gated by admin role. This is how you inspect emails on staging where `/dev` 404s.

**Gating layers** (defense in depth):
1. `proxy.ts` — cookie presence, redirects unauthenticated users to `/sign-in`
2. `(admin)/layout.tsx` — real session lookup + role check, **404s for non-admins** (doesn't disclose route existence)
3. Each server action calls `assertAdmin()` before invoking better-auth APIs

The admin link only appears in the header for users whose `role === "admin"`.

## Email

Outgoing mail (password reset, email verification, change-email confirmation) goes through `src/lib/mailer/`. The transport is picked at boot from env, mirroring the `DATABASE_URL` pattern:

| When | Transport | Inspect via |
| ---- | --------- | ----------- |
| Local dev (default) | `db-inbox` — writes to `dev_email` table | http://localhost:3000/dev/inbox |
| Staging | `db-inbox` + `FORCE_TO_OVERRIDE=you@example.com` | `/admin/inbox` (when admin RBAC lands; same data) |
| Prod | `resend` — set `RESEND_API_KEY` and `EMAIL_FROM` | Resend dashboard |

`EMAIL_TRANSPORT_OVERRIDE=db-inbox|resend|console` forces a transport regardless of env vars — useful to test Resend locally or to capture prod-like emails for support.

`FORCE_TO_OVERRIDE` rewrites every `to:` before the transport runs, with the original recipient logged in `meta.originalTo`. Belt-and-suspenders against a misconfigured staging accidentally emailing real users.

The `/dev/inbox` route returns 404 in production builds — the layout guards on `NODE_ENV`. Don't put `/dev` on `proxy.ts` matcher.

## Deploy (Vercel + Neon)

1. Push to GitHub.
2. Import the repo to Vercel.
3. From the Vercel dashboard: Storage → Create → Neon Postgres. This auto-injects `DATABASE_URL` into the project.
4. Set the remaining env vars in Vercel:
   - `BETTER_AUTH_SECRET` → fresh secret
   - `BETTER_AUTH_URL` → your Vercel URL (`https://...vercel.app`)
5. Run migrations against Neon once before first traffic:
   ```bash
   DATABASE_URL="postgres://...neon.tech/..." npm run db:migrate
   ```

The same `scripts/migrate.ts` handles both PGlite and Neon — no extra prod tooling.

## Swap targets when domain changes

The notes CRUD is the pattern to copy. To swap "notes" → "drone logs" (or whatever):

1. **Schema**: rename `note` in `src/lib/db/schema.ts`, add/remove columns, then `npm run db:generate && npm run db:migrate`. Keep `tag` + `note_tag` if you still want a many-to-many faceting concept (or rename them to match the domain).
2. **Zod schema**: rename `src/lib/notes-schema.ts` and update fields. Both the client form and the server actions import this — single source of truth.
3. **Service layer** (`src/lib/services/notes.ts`, `src/lib/services/tags.ts`): rename the domain functions and return types. This is where the `eq(table.userId, userId)` filter lives — the authorization boundary. Server actions, REST routes, CLI, and MCP all call these.
4. **Server actions** (`src/app/(app)/dashboard/actions.ts`): the thin adapter — get session, call service, `revalidatePath` + `redirect`. Keep create → list, update → read view, delete → list.
5. **REST routes** (`src/app/api/v1/`): one route file per resource. Each handler calls `requireApiUser(request, [scopes])`, calls the service, and returns JSON. Errors are mapped centrally in `src/lib/api/response.ts`.
6. **Tag suggestions** (`src/lib/services/tags.ts`): `listTagSuggestions` for autocomplete, `listTagsWithCounts` for the `/tags` page.
7. **Editor** (`src/app/(app)/dashboard/notes/note-editor.tsx`): one shared component for create + edit. Update the field set, pass `cancelHref` per call site, keep `useTransition` for the submit, keep `disabled={pending}` (do **not** add `!isDirty`).
8. **Pages**: `dashboard/page.tsx` for the list (preserves the URL-as-state plumbing for view/sort/page/tag), `notes/new/page.tsx` for create, `notes/[id]/page.tsx` for the read view, `notes/[id]/edit/page.tsx` for the edit form. Wrap the edit page's server action so the editor's `onSubmit` shape stays generic. Note `params: Promise<{ id: string }>` — Next 16.
9. **Top-nav** (`src/components/app-header.tsx`): add or rename entries in the `nav` array.

## Things to know (gotchas hit while building this)

See `TUTORIAL.md` for the full list with explanations. Highlights:

- **Next 16 renamed `middleware.ts` → `proxy.ts`** (function name too). Codemod: `npx @next/codemod@latest middleware-to-proxy .`.
- **Next 16 dynamic `params` is a `Promise`** — `await params` in the page. Forgetting silently breaks.
- **shadcn 4 `Button` has no `asChild`.** Wraps `@base-ui/react/button` directly. Use `<Link className={buttonVariants({...})}>`. base-ui menu/dialog triggers use `render={<SomeOtherEl />}` instead of `asChild`.
- **`useSearchParams()` requires a `<Suspense>` boundary** to prerender. Sign-in demonstrates the pattern.
- **PGlite must be lazy-initialized.** `next build` spawns workers that race to lock `./pgdata`. The `db` export in `src/lib/db/index.ts` is a `Proxy` that defers PGlite instantiation until first query.
- **PGlite locks `./pgdata` per-process.** Don't run `npm run db:migrate` (or `db:seed`) while `npm run dev` is up — stop dev, run, restart.
- **`@electric-sql/pglite` must be in `serverExternalPackages`** in `next.config.ts` (native modules + WASM).
- **Don't union `PgliteDatabase | PostgresJsDatabase` for `DrizzleDb`.** TypeScript can't unify overloaded methods like `.returning(...)` inside `db.transaction(async (tx) => …)`. Pick one concrete type and cast the other driver to it (`src/lib/db/index.ts`).
- **`getSessionCookie` only checks cookie presence** — intentional, no DB hit per request. Real validation happens in pages/handlers via `auth.api.getSession()`.
- **`dotenv/config` only reads `.env`.** Use `config({ path: ".env.local" })` explicitly.
- **`process.env.X ?? "default"` doesn't catch empty strings.** Use `?.trim() || "default"`.
- **`DropdownMenuLabel` requires `DropdownMenuGroup`** in base-ui. Or use a styled `<div>` for non-group labels.
- **`disabled:pointer-events-none` swallows the `not-allowed` cursor.** Customized `Button` to use `disabled:cursor-not-allowed disabled:opacity-50` instead.
- **Don't disable Save on `!isDirty`.** User-hostile (concurrent edits, idempotent action). `disabled={pending}` is enough.
- **Use `useTransition`** for submits that end in a redirect or `revalidatePath` — `form.formState.isSubmitting` flips back too early and produces a "Saving…" → idle flicker.
- **Save UX matches the route shape**: settings forms (no read counterpart) → stay on page + toast + `form.reset(values)`. Edit forms with a separate read view → `redirect()` to the read view. Notes use the latter.
- **shadcn `Card` looks lifted by default** (`bg-card` + `ring`). Stripped to plain border in `src/components/ui/card.tsx` so forms match the bordered note-cards on `/dashboard`.
- **`ComboboxChip` `bg-muted` blends inside the editor's `bg-input/30` field.** Overridden to `bg-foreground/15` (done in `src/components/ui/combobox.tsx`).
- **Stretched-link pattern** for the click-anywhere-on-card-but-chips-still-work behavior on `NoteCard` — title link's `::after` covers the card; chip links sit above with `position: relative`.
- **`onConflictDoUpdate({ set: { x: sql\`EXCLUDED.x\` } }).returning(...)`** for upsert-and-read. Postgres only fires `RETURNING` on rows that were actually inserted *or updated*. The no-op update on conflict makes RETURNING fire for already-existing rows too — used to upsert tags and read their IDs in one round-trip.
- **`count(...)::int`** on Drizzle aggregates. Postgres `count` returns `bigint` → Drizzle surfaces as `string`. Cast inside the `sql` template to keep the JS type as `number`.
- **Form must wrap the whole `<Card>`**, not just `CardContent + CardFooter`. Card is `flex flex-col gap-4` and breaks if its direct children aren't header/content/footer.
- **Tailwind v4 made `<button>` `cursor-default`.** Fixed by `shadcn init --pointer` (writes a base CSS rule; `components.json` persists it for future `shadcn add`).
- **Font CSS variable mismatch.** Geist is `--font-geist-sans`; shadcn's `@theme` block ships with `--font-sans: var(--font-sans)` (self-reference). Without fixing this, `font-sans` falls back to the browser's default serif. Mapped `--font-sans` and `--font-heading` to `var(--font-geist-sans)` in `globals.css`.
- **Zod v4: `z.email()` is top-level**, not `z.string().email()`; errors at `parsed.error.issues` (was `.errors`).
- **`table-fixed` percentages must budget for header width.** A column too narrow for its header text (header + sort arrow + cell padding) forces table overflow → horizontal scroll. Use generous percentages or pixel widths for content-bounded columns.
- **Validate every URL search param at the boundary.** Narrow `viewParam`, `sortParam`, etc. with explicit equality before passing into Drizzle — don't trust untrusted strings.
- **Filter via two-query approach when the relational API can't join.** Fetch matching IDs first, then `inArray(parent.id, ids)` into the relational query. Watch out for `inArray([])` — short-circuit to `sql\`false\`` when empty.
- **Native `title` attribute is free truncation tooltip.** No JS, no tooltip primitive — just `title={fullText}` on truncated headlines.
- **`min-w-0` on flex parents holding overflow children.** Flex items default to `min-width: auto` (intrinsic content); without `min-w-0` the chips push the row wider than its column and `overflow: hidden` never triggers.
- **PGlite + force-killed process can wedge `./pgdata`.** Reset path: `rm -rf pgdata && npm run db:migrate && npm run db:seed`.

## Adding GitHub OAuth (later)

```ts
// src/lib/auth.ts
export const auth = betterAuth({
  // ...existing config...
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

Then on the client: `signIn.social({ provider: "github" })`.
