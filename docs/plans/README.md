# Plans

Self-contained build plans for the remaining API-first phases. Each plan can be loaded into a fresh Claude Code session and executed without prior conversation context.

| Plan | Status | Effort |
| ---- | ------ | ------ |
| [`cli.md`](./cli.md) | not started — optional | ~1 hour |
| [`rate-limit-audit-log.md`](./rate-limit-audit-log.md) | not started — Phase 7 | ~3–5 hours |
| [`oauth.md`](./oauth.md) | not started — Phase 8+ | ~1 day |

## How to use one of these

1. Open a new Claude Code session in this repo. (`/clear` if you want a fresh context.)
2. Tell Claude: *"Read `docs/plans/<plan>.md` and execute it."*
3. Approve the staged commits as they're proposed (per the project's conventional-commit + don't-auto-commit pattern).

## What every plan assumes

The API-first architecture is already in place. The lever:

- **`src/lib/services/{notes,tags,api-keys,errors}.ts`** — domain logic. Every adapter (server actions, REST `/api/v1/*`, MCP `/api/mcp`) is a thin wrapper.
- **`src/lib/api/{auth,response}.ts`** — `requireApiUser(request, scopes)` for Bearer auth + `mapError(e)` for the canonical `{ error: { code, message, details? } }` envelope.
- **Scopes**: `notes:read`, `notes:write`, `tags:read`. Defined as `as const` in `src/lib/services/api-keys.ts` so adding one is a deliberate edit.
- **Tests**: Playwright `tests/e2e/*.spec.ts`. The seeded API keys at `tests/e2e/.api-keys.json` come from `scripts/seed-test-api-keys.ts`, which `globalSetup` runs before the dev server boots.
- **Conventions**: read `AGENTS.md` (Next 16 + base-ui shadcn) and `DECISIONS.md` (rationale for every architectural choice).

If a plan asks you to do something that conflicts with one of those, stop and surface it. The whole point of the API-first layout is that adapters are cheap; if a plan would compromise it, the plan is wrong, not the architecture.
