# Decisions

A record of the significant choices made while building this template, with the alternatives that were rejected and the reasoning. Written for future devs (and agents) so the *why* survives.

## Stack

**Next.js 16 + better-auth + Drizzle + shadcn (base-nova) + Tailwind v4.** Picked for: well-trodden by LLMs, single-language full-stack, deploys to Vercel, one schema can drive both client and server.

Rejected: Astro, Go+htmx, Python — all viable for a take-home, none with the same LLM-pairing speed.

## Database: Postgres everywhere, no Docker, zero local infra

We use **PGlite** (Postgres-as-WASM, in-process) for local dev and **Neon** for production. One dialect, one Drizzle schema, no provider switching in app code.

- Rejected sqlite/postgres split: caused dual schemas / dual clients with Drizzle.
- Rejected Turso: didn't want libsql-specific concepts in the stack.
- Rejected Postgres-in-Docker: hard requirement was `npm run dev` works on a fresh clone with no other services.
- Rejected Prisma: chose Drizzle for first-class SQL ergonomics; Drizzle's "one schema across dialects" claim doesn't hold up in practice.

PGlite persists to `./pgdata`. Restarts don't drop data. Migrate/seed run against the same in-process DB; the dev server must be stopped during migrate to avoid stale schema cache.

## Tags: many-to-many, not text[]

Tags live in their own table with a `noteTag` join. Initially used `text[]` on `note`; switched once we needed: tag autocomplete sourced from existing tags, a global tags page, and tag-filtered note views. The relational model also lets Drizzle's relational queries do the heavy lifting.

## Forms: React Hook Form + Zod + `<Field>`

Canonical shadcn pattern. `Controller` per input, `zodResolver`, shared schema in `src/lib/notes-schema.ts` between client and server actions. No `.default()` on Zod schemas — RHF `defaultValues` handles initial state and avoids a type mismatch with Zod v4.

## UX defaults that came from real friction

- **Save buttons do not disable on `!isDirty`.** A user might intentionally re-submit if a concurrent edit changed the row.
- **Disabled buttons use `cursor-not-allowed`**, not `pointer-events-none` — the cursor needs to communicate the state.
- **No flicker between "Saving…" and the redirect.** `useTransition` keeps `pending` true through the async action *and* the navigation that follows.
- **Edit stays on the page** with a toast on success (Stripe/Linear pattern). Create still redirects to the list.
- **Read view by default**, not editor. Click a note → read; explicit "Edit" button → form.

## Layout

- Public landing (`/`) is full-width, single header.
- Authenticated app (`(app)`) shares a layout with the same global `AppHeader`. No separate sidebar — tried `dashboard-01`, removed it because mobile sizing was awkward and the toggle UX never felt right.
- Auth pages (`(auth)`) get a slim header from the route-group layout.

## Pagination

Use the shadcn `pagination` primitive. We edited the installed file (`src/components/ui/pagination.tsx`) so `PaginationLink` uses Next's `<Link>` and supports a `disabled` prop. Don't reinvent it at the call site.

## shadcn = base-ui, not Radix

`src/components/ui/*` is the `base-nova` shadcn style, built on `@base-ui/react`. The slot pattern is **`render={<element/>}`**, not `asChild`. Several primitives also expose flags like `nativeButton={false}` with no Radix analogue. See `AGENTS.md` for the rule.

When extending or refactoring a primitive, prefer editing the file in `src/components/ui/` over wrapping it externally — that's the whole point of shadcn-installed code.

## Accessibility

- ESLint is wired with `eslint-plugin-jsx-a11y/recommended` for our app code; shadcn primitives are excluded from that scope (they're vendored upstream).
- Runtime axe-core scan via `src/components/axe-reporter.tsx` runs in dev only, on every route change, and logs grouped violations to the browser console. Production builds skip it entirely.
- Avoided `@axe-core/react` because it monkey-patches `React.createElement`, which fails under React 19's frozen ESM module namespace.

Specific fixes that came from running axe:
- `ToggleGroup` got `role="toolbar"` so base-ui's `aria-orientation` is valid.
- `ComboboxChipRemove` got an `aria-label`.
- Auth pages, "new note", and "edit note" got a visually-hidden `<h1>` so each page has a level-one heading.
- `<main>` was lifted to the auth route-group layout (was duplicated on each page).
- The auth header's outer `<div>` became `<header>` so its content sits in a banner landmark.
- Destructive `Button` variant switched from translucent (`bg-destructive/10 text-destructive`, ~4.2:1) to solid (`bg-destructive text-white`). Better contrast and more appropriate for confirmation actions.
- `AvatarFallback` overrides `text-foreground` at the call site; default `text-muted-foreground` on `bg-muted` is borderline AA in this palette.

## Admin / RBAC: better-auth `admin` plugin

Adopted the plugin's defaults (`role: "user" | "admin"`, plus `banned`/`banReason`/`banExpires`) rather than rolling our own permission system. The plugin handles the boring part (server endpoints with admin checks, ban-at-sign-in enforcement) so our code is just the UI and a thin assertion wrapper.

**Privacy-preserving by construction**: the admin user list/detail queries select scalar columns + counts only — never note content, tag names, or session IPs. We didn't add an "admin can read user notes" view; even with intent it's the kind of route that gets misused.

**No impersonation in v1**, despite the plugin supporting it. The `session.impersonatedBy` column exists (added with the migration), but neither the `impersonateUser` endpoint surfaces nor a "you are viewing as X" banner is wired up. Reasoning: impersonation is powerful and risky — without an audit log, banner, and discipline around when it's acceptable, it's a privacy hole that looks helpful. Easy to add later.

**No audit log table yet**. The mailer logs `[mailer:transport] → to · kind · subject` so reset/verify/change-email actions leave a paper trail in the dev server console; richer audit (who-deleted-whom, who-promoted-whom) is a follow-up.

**Bootstrap path**: `npm run admin:promote <email>` flips the `role` column directly. The `ADMIN_USER_IDS` env var also forces a list of IDs to admin regardless of column state — useful for staging/prod where you can't shell in to promote.

**No "Set password directly" action.** Better-auth's plugin exposes `setUserPassword`, but a one-click freeform password field lets a malicious admin choose a value, sign in as the target, and read all their notes silently. Removed it. The only password-change paths admins can trigger from the UI are *send-reset-email* and *send-verification-email* — both go through the user's own inbox, so the admin never holds a credential the user will use. The narrow "user lost email access entirely" recovery path requires shell access (a different audit boundary).

**Three-layer gate**: `proxy.ts` cookie check → `(admin)/layout.tsx` real session lookup with role assert (404s on miss, doesn't disclose route existence) → every server action calls `assertAdmin()` before invoking `auth.api.*`. Drizzle `eq(table.userId, userId)` is still the authorization boundary on user-content tables (admins don't bypass it, since they don't query those tables anyway).

## Email: DB-inbox transport, not Mailpit

Outgoing mail uses a `Mailer` interface with three implementations: `db-inbox` (writes rows to `dev_email`, browsable at `/dev/inbox`), `resend` (prod), and `console` (fallback). Transport is chosen at boot from env, same shape as the DB-driver split.

Rejected **Mailpit** locally despite being a nicer email-client view: it'd be a second inspection mechanism, since it can't run on Vercel for staging. The DB-inbox is one mechanism dev→staging, and on staging it surfaces through the same admin route as the audit log (when admin RBAC lands).

Rejected **Resend test mode for staging** because it routes through their dashboard rather than something owned by the app — fine for prod observability, awkward for "show me what an email reset would look like for this user" during a demo or interview.

Two cross-cutting safeties that came from real footguns:
- `FORCE_TO_OVERRIDE` rewrites every `to:` so a misconfigured staging can't email end-users.
- The mailer wrapper logs `[mailer:<transport>] → <to> · <kind> · <subject>` but never the URL/token — the token is the credential, redaction happens at the mailer boundary so callers don't have to remember.

Better-auth's email hooks are called as `void mailer.send(...)` per their timing-attack guidance (awaiting the send leaks token-generation timing).

## Documentation expectations

- `TUTORIAL.md` walks through how the template was built from scratch.
- `README.md` documents the run-this-to-use-it surface.
- `AGENTS.md` carries conventions that future Claude sessions need (loaded automatically into every session via `CLAUDE.md` → `@AGENTS.md`).
- This file (`DECISIONS.md`) carries the *why* behind choices that aren't obvious from the code.

Keep all four in sync. If you change a decision recorded here, update the entry — don't leave a stale rationale next to changed code.

## Dev workflow

- `npm run dev` starts Next on `:3000` against PGlite. The `dev-server` skill (`.claude/skills/dev-server/SKILL.md`) launches it in the background and arms a route/error monitor in the chat.
- Migrations: stop dev, run `npm run db:migrate`, restart dev.
- Seed: `npm run db:seed` creates `user@example.com / password@123` plus sample notes (some with long titles, varied tag counts) so list/table layouts have realistic content immediately.
