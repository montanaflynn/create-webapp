# Authentication & Authorization

Everything you need to read before touching auth in this repo. Cross-references the code by file path so you can `cmd-click` from your editor.

- **Library**: [better-auth](https://better-auth.com) 1.6 with the `admin` and `passkey` plugins
- **Storage**: Drizzle ORM → PGlite (local) / postgres-js (prod)
- **Sign-in mechanism**: email + password OR passkey (WebAuthn), session cookies (no JWT)
- **Authorization model**: role on user table (`"user" | "admin"`), defense-in-depth across proxy → layout → server action

---

## TL;DR mental model

```
            unauthenticated                 authenticated user            admin
            ─────────────────                ──────────────────            ─────
landing /  ✓                               ✓                              ✓
auth/*     ✓ (sign-in / sign-up /          ✓ (still accessible — UX        ✓
            reset-password / etc)            quirk; could be redirected)
app/*      ✗ (proxy → /sign-in)            ✓                              ✓
admin/*    ✗ (proxy → /sign-in)            ✗ (layout 404s on miss)        ✓
```

A non-admin landing on `/admin/*` gets a **404, not a 403** — we don't disclose that the route exists.

---

## Schema (`src/lib/db/schema.ts`)

Six auth-related tables. `user`, `session`, `account`, `verification`, and `passkey` are owned by better-auth's drizzle adapter. The admin plugin extends `user` with four columns and `session` with one. `pending_email_change` is ours.

```
user
├─ id, email (unique), emailVerified, name, image
├─ createdAt, updatedAt
└─ admin plugin: role, banned, banReason, banExpires

session
├─ id, token (unique), userId → user.id (cascade)
├─ expiresAt, ipAddress, userAgent
├─ createdAt, updatedAt
└─ admin plugin: impersonatedBy

account
├─ id, accountId, providerId, userId → user.id (cascade)
├─ password (hashed; only set for email/password provider)
├─ accessToken, refreshToken, idToken (OAuth — unused, kept for future)
└─ createdAt, updatedAt

verification (better-auth-internal token store)
├─ id, identifier, value, expiresAt
└─ createdAt, updatedAt
   used for: forgot-password, verify-email, change-email tokens

passkey (owned by @better-auth/passkey)
├─ id, name, userId → user.id (cascade)
├─ publicKey, credentialID (both indexed)
├─ counter, deviceType, backedUp, transports, aaguid
└─ createdAt

pending_email_change (ours — see "Email change" flow below)
├─ id, userId (unique → user.id, cascade)
├─ newEmail, token (unique), expiresAt
└─ createdAt
```

Cascading `onDelete` from `user.id` means deleting a user via `auth.api.removeUser` cleans up everything in one shot — sessions, account creds, notes/tags, pending email changes, registered passkeys. Verifications still expire on their own.

---

## Configuration (`src/lib/auth.ts`)

```ts
betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, autoSignIn: true, sendResetPassword },
  emailVerification: { sendVerificationEmail },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"], adminUserIds }),
    passkey({ rpID, rpName: "create-webapp", origin }),
  ],
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation,  // sends to *current* email (see flow below)
    },
  },
})
```

Three things worth understanding here:

1. **`autoSignIn: true`** on sign-up — user is signed in immediately, no email-verification gate. We do **not** set `requireEmailVerification` because the template is a starter, not a compliance shop. Verification is optional and can be triggered by the admin UI. Flip if you need it.

2. **All three email hooks fire-and-forget via `void sendMail(...)`**. Better-auth's docs explicitly call out that awaiting these leaks token-generation timing. The mailer's success/failure is logged but not surfaced to the caller — see "Edge cases" → silent mailer failure.

3. **`sendChangeEmailConfirmation` (not `sendChangeEmailVerification`)** — these are different hooks:
   - `sendChangeEmailConfirmation` → email goes to **current** address asking to approve the change. This is what we want.
   - `sendChangeEmailVerification` → email goes to the **new** address as a verification step. We never want this for this template.

   Getting the wrong name fails silently — better-auth treats the change-email request as a normal "verify the new address" and swaps on click.

4. **`rpID` and `origin` are derived from `BETTER_AUTH_URL`** at boot via the `rpFromUrl` helper. WebAuthn requires `rpID = bare hostname` (no scheme/port) and `origin = full origin URL` — getting either wrong fails the assertion with no useful error. Setting `BETTER_AUTH_URL` correctly per environment is therefore load-bearing for passkeys, not just for the change-email link.

---

## Authorization layers

Three checks, applied in order. If any layer fails, the deeper ones never run.

### 1. `src/proxy.ts` — cookie presence

Runs in the edge before any rendering. Checks for the better-auth session cookie (no DB hit). On miss, redirects to `/sign-in?redirect=<original>`.

```ts
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tags/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
```

`getSessionCookie` is intentionally **cookie-presence only** — fast, no validation. A forged or stale cookie still gets past proxy. That's fine because layer 2 catches it.

### 2. Layout-level session check

- **`src/app/(app)/layout.tsx`** — calls `auth.api.getSession({ headers })`. Real DB lookup. On miss, `redirect("/sign-in")`. Passes the user object down to `<AppHeader>`.
- **`src/app/(admin)/layout.tsx`** — same lookup, then asserts `session.user.role === "admin"`. On miss, **`notFound()` (404)** — does not disclose route existence.

Layouts re-render per request because they call `headers()`/`cookies()` (auto-dynamic). No risk of stale auth state from cache.

### 3. Server action `assertAdmin`

`src/app/(admin)/admin/users/[id]/actions.ts` defines:

```ts
async function assertAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string | null })?.role;
  if (!session || role !== "admin") throw new Error("forbidden");
  return session;
}
```

Called as the **first line of every admin server action**. Defense in depth: even if a non-admin somehow POSTs to an admin server action endpoint (bypassing the route's UI gate), the action refuses.

### User-content authorization (notes, tags)

Separate from admin gating — every read/write of user-owned data filters by user id:

```ts
.where(and(eq(note.id, id), eq(note.userId, session.user.id)))
```

This is **not** in a middleware. It's the discipline of every server action and query. Admins do **not** bypass this — admin UI never reads user content tables (only counts and metadata). See `DECISIONS.md` for the privacy rationale.

---

## Routes — auth surface

| Path | Auth | Purpose |
|---|---|---|
| `/api/auth/[...all]` | public | Better-auth handler (sign-in/up, reset, verify, change-email API, passkey register/authenticate) |
| `/sign-in` | public | RHF + Zod form, banned-reason lookup on error, passkey button + conditional-UI autofill |
| `/sign-up` | public | RHF + Zod form, calls `signUp.email` |
| `/reset-password` | public | Token form (consumes `?token=` from email) |
| `/settings` | gated | Profile (name + email), password change, passkey management |
| `/settings/email/confirm` | gated | Re-typed-email confirmation page (see below) |
| `/admin/users` | admin | List users with counts only — never note content |
| `/admin/users/[id]` | admin | Per-user detail + actions |
| `/admin/inbox` | admin | Captured outgoing email (mirror of `/dev/inbox`, prod-safe) |
| `/dev/inbox` | dev-only | Same as `/admin/inbox`, layout 404s in production builds |

---

## Flows

### Sign up

```
client signUp.email({email, password, name})
        │
        ▼
POST /api/auth/sign-up/email
        │
        ├─ insert user row (emailVerified=false, role=null → "user")
        ├─ insert account row (providerId="credential", password=hash)
        ├─ create session row + Set-Cookie    ← autoSignIn: true
        └─ return { user, session }
```

We do **not** auto-send a verification email on sign-up. To require verification before sign-in, set `emailAndPassword.requireEmailVerification: true` and `emailVerification.sendOnSignIn: true`.

### Sign in

```
client signIn.email({email, password})
        │
        ▼
POST /api/auth/sign-in/email
        │
        ├─ lookup user by email
        │     not found ────► error.code = "INVALID_CREDENTIALS"
        ├─ verify password against account.password
        │     mismatch ────► error.code = "INVALID_CREDENTIALS"
        ├─ banned check (admin plugin)
        │     banned & not expired ────► error.code = "BANNED", message=bannedUserMessage
        ├─ requireEmailVerification (off in this template)
        ├─ create session + Set-Cookie
        └─ return success

client (sign-in/page.tsx)
  └─ on error.code === "BANNED" → call getBanInfo(email) server action
       → toast "Your account is suspended: <reason> (until <expiry>)"
```

The banned-reason lookup is `src/app/(auth)/sign-in/get-ban-info.ts` — a server action that reads `user.banReason` and `user.banExpires` for a given email. Privacy parity with better-auth's default disclosure (the banned message itself already reveals the account exists and is banned).

### Sign in with passkey

Two surfaces, one underlying flow.

```
A. Conditional UI (autofill)
─────────────────────────────
[/sign-in mounts]
    │
    ├─ feature-detect PublicKeyCredential.isConditionalMediationAvailable()
    │     unsupported ────► no-op, fall back to button
    └─ supported ────► signIn.passkey({ autoFill: true })
                        │
                        └─ navigator.credentials.get({ mediation: "conditional" })
                           browser surfaces the system passkey picker as a
                           suggestion when the user focuses the email field
                           (autocomplete="email webauthn"). Selection completes
                           the assertion and onSuccess redirects.

B. Explicit button
──────────────────
[user clicks "Sign in with passkey"]
    │
    ▼
signIn.passkey()  (no autoFill)
    │
    ├─ POST /api/auth/passkey/generate-authenticate-options
    │     ◀── returns challenge, allowCredentials = []
    ├─ navigator.credentials.get(...) — modal passkey prompt
    │     user-cancel ────► undefined return, button re-enables, no toast
    └─ POST /api/auth/passkey/verify-authentication
          ├─ signature verifies ────► create session + Set-Cookie ────► onSuccess → /dashboard
          └─ verification fails ────► error toast
```

`allowCredentials = []` (discoverable credentials only) means the user does not pre-type an email — the picker shows whatever passkeys the device has registered against this RP. Autofill (A) and the button (B) hit the same server endpoints; the only difference is the WebAuthn `mediation` hint.

### Forgot password

```
[user types email on /sign-in or /forgot-password]   (no /forgot-password yet — admin can also trigger)
        │
        ▼
authClient.requestPasswordReset({email, redirectTo: "/reset-password"})
        │
        ▼
better-auth: insert into verification (identifier="reset-password-<token>", value=userId)
        │
        ▼
sendResetPassword hook fires → resetPasswordTemplate → mailer.send
        │
        │  user opens email
        ▼
GET /api/auth/reset-password?token=...&callbackURL=/reset-password
        │
        ├─ token invalid/expired ────► redirect /reset-password?error=INVALID_TOKEN
        └─ valid ────► redirect /reset-password?token=VALID_TOKEN
        │
        ▼
[user fills new password on /reset-password]
        │
        ▼
authClient.resetPassword({token, newPassword})
        │
        ▼
POST /api/auth/reset-password
        │
        ├─ token consumed (single-use)
        ├─ account.password = hash(newPassword)
        ├─ onPasswordReset hook (we don't define one)
        └─ return success
        │
        ▼
toast + router.push("/sign-in")
```

### Email verification

Identical shape to forgot-password but one-way:

```
authClient.sendVerificationEmail({email, callbackURL: "/dashboard"})
   ▼
sendVerificationEmail hook fires → mailer
   ▼
[user clicks link]
GET /api/auth/verify-email?token=...&callbackURL=/dashboard
   ├─ valid ──► user.emailVerified = true, redirect to callbackURL
   └─ invalid ──► error
```

Triggered manually (admin "Resend verify email" or programmatic). Not auto-fired on sign-up.

### Email change (custom flow)

This is the one that diverges from better-auth's default. We layer a **typed-confirmation step** on top of better-auth's token to prevent one-click hijack via a leaked email link.

```
[user on /settings] submits new email
        │
        ▼
authClient.changeEmail({newEmail, callbackURL: "/settings"})
        │
        ▼
POST /api/auth/change-email
        │
        ├─ newEmail same as current ────► error
        ├─ newEmail already used ────► error
        ├─ insert verification row (better-auth's, with token)
        └─ call sendChangeEmailConfirmation hook with {user, newEmail, token, url}
                │
                ├─ UPSERT pending_email_change (userId UNIQUE → re-submit replaces)
                ├─ Build custom URL: /settings/email/confirm?token=<token>
                │   (we ignore better-auth's `url` param and use `token`
                │   directly — points at our confirm page, not better-auth's
                │   auto-apply endpoint)
                └─ mailer.send → email goes to *current* user.email
        │
        ▼
[user reloads /settings]
        ├─ page queries pending_email_change for current user
        └─ if active row exists → render amber banner with new email,
           expiry timestamp, and Cancel button. Email field disabled.
```

From the banner the user has two options:

**A. Click the link in the captured email**

```
GET /settings/email/confirm?token=<token>
        │
        ├─ no session ────► proxy → /sign-in?redirect=...
        ├─ token not found ────► "no longer valid" page
        ├─ token expired ────► "expired" page (also deletes the stale row)
        ├─ token's userId ≠ session.user.id ────► "different account" page
        └─ valid + own session
                │
                ▼
        [confirm form: type the new email to enable Confirm]
                │
                ▼
        confirmEmailChangeAction(token, typedEmail)
                ├─ same checks as above
                ├─ typed email !== row.newEmail (case-insensitive) ────► throw
                └─ in one DB transaction:
                     ├─ UPDATE user SET email=newEmail, emailVerified=true, updatedAt=now
                     └─ DELETE pending_email_change WHERE userId=...
                │
                ▼
        redirect /settings?email-changed=1 → SettingsToasts → "Email changed"
```

**B. Click "Cancel change" on `/settings`**

```
cancelEmailChangeAction()
        ├─ DELETE pending_email_change WHERE userId = session.user.id
        └─ redirect /settings?email-cancelled=1 → toast "Email change cancelled"
```

Better-auth's verification row stays until expiry, but the link is dead because our confirm page can't find a matching `pending_email_change` row.

### Manage passkeys (`/settings`)

The `<PasskeysForm>` card on `/settings` is the only surface for register / list / delete. SSR fetches the current user's passkey rows (id, name, createdAt) directly from the `passkey` table — we own the schema, so we don't go through `auth.api`.

```
[user clicks "Add passkey"]
    │
    └─ authClient.passkey.addPasskey({ name, authenticatorAttachment: "platform" })
          │
          ├─ POST /api/auth/passkey/generate-register-options
          │     uses session — registration requires an existing session by default
          ├─ navigator.credentials.create(...) — system prompt (Touch ID / Windows Hello / etc.)
          │     user-cancel ────► error.message contains "cancel"/"aborted" → swallow silently
          └─ POST /api/auth/passkey/verify-registration
                ├─ stores passkey row (publicKey, credentialID, counter, deviceType, ...)
                └─ returns success → router.refresh() re-renders the list

[user clicks trash on a row]
    │
    └─ authClient.passkey.deletePasskey({ id })
          ├─ POST /api/auth/passkey/delete-passkey
          ├─ DELETE FROM passkey WHERE id = ? AND userId = session.user.id
          └─ router.refresh()
```

Default name is derived from `navigator.userAgent` (Mac / iOS device / etc.) — accepted as-is by most users; rename UI is not built. We default `authenticatorAttachment: "platform"` so the most common case (the device in your hand) produces the cleanest prompt; cross-platform authenticators (security keys) still work as a fallback in the system picker.

### Ban / unban

```
[admin on /admin/users/[id]] submits Ban form
   ├─ reason (required, default "Banned by admin")
   └─ expires (optional datetime-local — empty = permanent)
        │
        ▼
banUserAction(formData)
        ├─ assertAdmin
        ├─ parse expires → banExpiresIn (seconds from now)
        │   - empty → undefined (permanent)
        │   - past date → throw "Expiry must be in the future"
        │   - else → ms diff / 1000
        └─ auth.api.banUser({userId, banReason, banExpiresIn, headers})
                ├─ user.banned=true, banReason, banExpires
                └─ revoke existing sessions (per better-auth docs)

unbanUserAction → auth.api.unbanUser({userId}) → clears banned/banReason/banExpires
```

Banned users hitting sign-in get `error.code = "BANNED"`. The `bannedUserMessage` config option is **not** set on the plugin — instead, our sign-in page intercepts the error code, calls `getBanInfo`, and renders the actual reason + expiry. Better UX than a static message.

### Delete user

```
[admin on /admin/users/[id]] confirms in AlertDialog
        │
        ▼
deleteUserAction(formData)
        ├─ assertAdmin
        ├─ refuse if userId === session.user.id (cannot self-delete)
        └─ auth.api.removeUser({userId})
                └─ DELETE user → cascades to sessions, accounts, notes,
                   tags, pending_email_change
        │
        ▼
redirect /admin/users
```

---

## Email transport

Outgoing mail is the source of truth for password reset, email verification, and change-email confirmation. The transport is selected at boot from env, mirroring the `DATABASE_URL` pattern.

```
src/lib/mailer/
├─ index.ts          Mailer interface + picker + FORCE_TO_OVERRIDE + redacted log
├─ db-inbox.ts       Writes to dev_email table (default)
├─ resend.ts         Calls Resend SDK (active when RESEND_API_KEY is set)
├─ console.ts        stdout fallback
└─ templates.ts      reset / verify / change-email plain-string templates
```

Inspect captured emails at:
- **`/dev/inbox`** locally (the layout 404s in production builds)
- **`/admin/inbox`** on staging (admin-gated; same data, different gate)

The mailer **always logs** `[mailer:<transport>] → <to> · <kind> · <subject>` but **never** the URL or token — those are credentials. Redaction is enforced at the boundary so callers don't have to remember.

---

## Edge cases handled (and not)

### Handled
- **Stale cookie / non-existent user behind cookie**: layer 2 (layout session check) catches it, redirects to sign-in.
- **Banned user with active session**: better-auth's `banUser` revokes sessions per its docs. Banned check at sign-in catches subsequent attempts.
- **Multiple in-flight email changes**: `pending_email_change.userId` is unique → re-submitting replaces the prior row. Only the most recent token is valid.
- **Wrong-account confirm link**: `/settings/email/confirm` checks `session.user.id === row.userId`.
- **Past expiry datetime in Ban form**: server-side validation throws.
- **Deleting yourself**: refused both client-side (button hidden) and server-side (`if (userId === session.user.id) throw`).
- **Demoting yourself from admin**: button disabled (would lock you out of `/admin/*`).

### Not handled (and why)
- **Silent mailer failure**: `void sendMail(...)` per timing-attack guidance. If Resend is down, user gets the success toast but no email arrives. Mitigation candidates: a Sentry-style error sink, or a `last_email_error` field surfaced in the admin UI. Not done.
- **`verification` table GC**: better-auth doesn't sweep expired rows. They accumulate slowly. A cron `DELETE FROM verification WHERE expires_at < now()` is the prod fix; we don't ship one.
- **No notification to user when admin acts on their account** (role change, ban). Audit log is also unimplemented — see DECISIONS.md for the rationale (deferred, not ruled out).
- **No re-auth (freshAge) gate** on destructive admin actions. A stolen-cookie attacker who got into `/admin/*` could ban or delete. The cost of `assertAdmin` + audit log + email notification is supposed to deter this; we have the first only.
- **Race: target email gets taken between change submit and confirm**. The DB unique constraint on `user.email` will throw at confirm time. We surface the error via toast but don't render a friendly explanation page.

---

## Bootstrap & ops

```bash
npm run db:seed              # creates user@example.com + admin@example.com (both password@123)
npm run admin:promote <email>   # flips an existing user to role=admin
```

Or via env: `ADMIN_USER_IDS=user_abc,user_def` always treats those IDs as admin regardless of their column value. Useful when you can't shell in to promote (Vercel deploys).

The seeded `admin@example.com` is re-asserted on every reseed (`UPDATE user SET role='admin'`).

---

## What's deliberately not implemented

| | Reason |
|---|---|
| **OAuth / social providers** | better-auth supports it via `socialProviders` — see README. Not wired. |
| **TOTP 2FA** | better-auth's `twoFactor` plugin. Not wired. |
| **Impersonation** | Admin plugin supports it; column `session.impersonatedBy` exists. We don't expose the action because it requires audit log + banner discipline that we haven't shipped. |
| **Audit log** | Designed in DECISIONS.md but not built. The mailer console log is the current paper trail. |
| **`setUserPassword` admin action** | Removed. A freeform "type a password for this user" lets a malicious admin sign in as the target — see DECISIONS.md "No Set password directly action". |
| **Notify user on admin actions** | Detective control, low effort, not done. |
| **Re-auth gate on destructive actions** | Mid-friction defense, not done. |

---

## File map

```
src/lib/
├─ auth.ts                       better-auth config + all email hooks
├─ auth-client.ts                createAuthClient + adminClient
└─ db/schema.ts                  user, session, account, verification, passkey, pending_email_change

src/proxy.ts                     cookie-presence gate (layer 1)

src/app/
├─ (auth)/
│   ├─ layout.tsx                slim header for auth pages
│   ├─ sign-in/page.tsx          sign-in form + banned reason lookup
│   ├─ sign-in/get-ban-info.ts   server action: returns ban reason
│   ├─ sign-up/page.tsx
│   └─ reset-password/page.tsx   consumes ?token= from reset email
├─ (app)/
│   ├─ layout.tsx                session check (layer 2 for /dashboard,/tags,/settings)
│   └─ settings/
│       ├─ page.tsx              loads pending_email_change + passkey rows for current user
│       ├─ profile-form.tsx      name + email; pending banner; cancel
│       ├─ password-form.tsx     current + new password
│       ├─ passkeys-form.tsx     list / add / delete user passkeys (client)
│       ├─ settings-toasts.tsx   ?email-changed / ?email-cancelled handler
│       └─ email/confirm/
│           ├─ page.tsx          looks up pending row by token
│           ├─ confirm-form.tsx  re-typed email form (client)
│           └─ actions.ts        confirmEmailChangeAction + cancelEmailChangeAction
├─ (admin)/
│   ├─ layout.tsx                role gate (layer 2 for /admin)
│   ├─ admin-nav.tsx             Users / Emails sub-tabs
│   └─ admin/
│       ├─ users/page.tsx        list (counts only — never user content)
│       ├─ users/[id]/page.tsx   detail + action grid
│       ├─ users/[id]/actions.ts banUser / unbanUser / setRole / removeUser etc.
│       ├─ users/[id]/action-form.tsx  client wrapper: toast + transition
│       ├─ users/[id]/delete-user-button.tsx  AlertDialog
│       └─ inbox/                captured email mirror (admin-gated)
└─ dev/inbox/                    captured email viewer (dev-only; layout 404s in prod)

scripts/
├─ promote.ts                    npm run admin:promote <email>
└─ seed.ts                       creates user@/admin@example.com
```

---

## When you change auth code

- **Schema change** (new column, new table): `npm run db:generate && npm run db:migrate`. The dev server holds the PGlite lock, so stop it first.
- **New email-triggered flow**: add a template in `src/lib/mailer/templates.ts`, call `sendMail` from your hook, void it.
- **New admin action**: server action calls `assertAdmin()` first, then `auth.api.*`. UI uses `<ActionForm action={...} success="...">` for free toasts + transition.
- **Adding a public route under `/dashboard`, `/tags`, `/settings`, or `/admin`**: it'll be caught by `proxy.ts`. Move it elsewhere (root or `(auth)`) if it really should be public.
