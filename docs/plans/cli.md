# Plan: CLI (`scripts/cli.ts`)

**Status**: not started
**Effort**: ~1 hour, ~150 LOC of TypeScript
**Phase**: 5 (skipped originally; optional add-on)

## Goal

A single-file `tsx`-runnable CLI that mirrors the REST API. Lets a user (or a CI job, or a script) read and write their notes from the terminal without writing curl every time.

End-user shape:

```bash
export CWA_API_KEY=cwa_...
export CWA_BASE_URL=http://localhost:3000   # optional, defaults to localhost:3000

cwa notes list
cwa notes list --tag interview
cwa notes get <id>
cwa notes create --title "Hello" --content "World" --tag greeting --tag demo
cwa notes update <id> --title "Hello (edited)" --content "World" --tag greeting
cwa notes delete <id>
cwa tags list
```

## Why now / why this shape

REST `/api/v1/*` is in place. CLI is a pure adapter on top — it doesn't touch services, it doesn't add scopes, it doesn't change the data model. ~150 LOC of `fetch` calls and arg parsing.

Native `node:util` `parseArgs` is enough — no Commander, yargs, or oclif. Single file, no compile step, runnable via `tsx`.

## Context the executing Claude needs

- **REST API reference**: `docs/API.md`. The full request/response shape for every endpoint.
- **Error envelope**: `{ error: { code, message, details? } }`. Stable codes: `unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `bad_request`, `internal_error`. CLI should print `error.message` to stderr and exit non-zero on any non-2xx.
- **Auth**: every request needs `Authorization: Bearer ${CWA_API_KEY}`. If the env var is missing, fail fast with a clear message (don't issue a 401-bound request).
- **Test infra**: there's a seeded `tests/e2e/.api-keys.json` with three keys (`test-full`, `test-readonly`, `test-no-scope`) refreshed every test run by `scripts/seed-test-api-keys.ts`. The Playwright suite already uses them — see `tests/e2e/notes-rest-api.spec.ts` for the pattern.

## Plan

### Step 1 — Scaffold

Create `scripts/cli.ts`. Top of file:

```ts
#!/usr/bin/env -S tsx
import { parseArgs } from "node:util";
```

(Shebang lets `chmod +x` make it directly runnable, but we'll also expose it via `package.json` `bin`.)

### Step 2 — Args + dispatch

Use `parseArgs` from `node:util` for top-level subcommand routing. Subcommands: `notes`, `tags`. Each dispatches to a sub-handler.

For `notes <verb>`, the verbs are `list`, `get`, `create`, `update`, `delete`.

Pattern that scales: one function per verb, a small `dispatch` table mapping `${resource}.${verb}` → handler.

### Step 3 — Fetch wrapper

```ts
async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const key = process.env.CWA_API_KEY;
  if (!key) {
    console.error("error: CWA_API_KEY is not set.");
    process.exit(2);
  }
  const base = (process.env.CWA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    console.error(`error: ${msg}`);
    process.exit(1);
  }
  return json;
}
```

### Step 4 — Output formatting

For `notes list` and `tags list`, render a small table to stdout. No table library — just compute column widths and pad. For single-note operations, pretty-print JSON (`JSON.stringify(obj, null, 2)`).

For `--json` flag (add this from day one), always emit raw JSON regardless of the verb. Lets piping work cleanly: `cwa notes list --json | jq '.notes[].id'`.

### Step 5 — `package.json` wiring

Add to `package.json`:

```jsonc
{
  "bin": {
    "cwa": "scripts/cli.ts"
  },
  "scripts": {
    "cli": "tsx scripts/cli.ts"
  }
}
```

The `bin` entry lets `npm link` install `cwa` globally for development. The `cli` script is the in-repo invocation: `npm run cli -- notes list`.

### Step 6 — Test

Add `tests/e2e/cli.spec.ts`. Spawn the CLI as a child process (`node:child_process` `spawn`), pipe stdout/stderr, exercise:

1. `notes list --json` with the full key — exit 0, JSON parses, has `.notes` array.
2. `notes list` with no env var — exits non-zero, stderr contains "CWA_API_KEY".
3. `notes create --title X --content Y --tag a --json` → capture id, then `notes delete <id>`. Both exit 0.
4. `notes get <bogus-id>` → exits non-zero, stderr contains "not found".

Spawn pattern (use `process.execPath` and tsx loader, or just call `tsx scripts/cli.ts` via shell):

```ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const KEYS = JSON.parse(await readFile(path.join(__dirname, ".api-keys.json"), "utf8"));

function run(args: string[], env: Record<string, string> = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const p = spawn("npx", ["tsx", "scripts/cli.ts", ...args], {
      env: { ...process.env, CWA_BASE_URL: "http://localhost:3001", ...env },
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => stdout += d);
    p.stderr.on("data", (d) => stderr += d);
    p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}
```

Note: e2e dev server runs on `:3001`, not `:3000`. See `playwright.config.ts`.

### Step 7 — Docs

Create `docs/CLI.md` with:
- Install: `npm link` from the repo, or just `npm run cli --`.
- Env vars: `CWA_API_KEY` (required), `CWA_BASE_URL` (optional, default `http://localhost:3000`).
- Command reference (one line per verb).
- A copy-paste section showing piping into `jq`.

Add a `## CLI` section to `README.md` between the existing API section and the MCP section, following the same pattern (3 steps to set up, example commands, link to the full reference).

Add a TUTORIAL.md chapter — chapter 15, after MCP. Walk through the build the same way other chapters do, ending with the test pattern.

Update DECISIONS.md: `## CLI: single-file tsx, no Commander`. Brief — one paragraph naming the choice and the alternative (a real CLI framework) that was rejected because the surface is small enough that arg-parsing isn't the bottleneck.

## Files to create / modify

```
scripts/cli.ts                          (new)
tests/e2e/cli.spec.ts                   (new)
docs/CLI.md                             (new)
README.md                               (edit — add ## CLI section)
TUTORIAL.md                             (edit — chapter 15)
DECISIONS.md                            (edit — CLI rationale)
package.json                            (edit — bin + cli script)
```

## Acceptance criteria

- `npx tsc --noEmit` clean.
- `npx eslint src scripts tests` clean (the existing project eslint config covers scripts/).
- `npx playwright test cli` passes.
- `npx playwright test` (full suite) — all 25 specs pass (21 existing + 4 new CLI).
- Manual smoke: `CWA_API_KEY=$(cat tests/e2e/.api-keys.json | jq -r '."test-full"') CWA_BASE_URL=http://localhost:3001 npm run cli -- notes list` returns a table.

## Gotchas / prior art

- **`parseArgs` strict mode** is your friend. Use `{ strict: true }` so unknown flags fail loudly instead of silently ignored.
- **`Date` round-trips cleanly via JSON** (REST returns ISO strings, no parsing needed). Don't reach for date-fns.
- **The 400 path on malformed JSON** isn't tested in REST e2e (Playwright has a quirk — see `tests/e2e/notes-rest-api.spec.ts` for the dropped test). The CLI never sends malformed JSON anyway, so don't worry about it.
- **Keep the file under 250 LOC**. If you're approaching that, you've over-engineered. Re-read what's actually being asked — most things are one-liners (`api("GET", "/api/v1/notes")` etc.).

## Suggested commit shape

One commit:

```
feat(cli): single-file tsx CLI mirroring the REST API
```
