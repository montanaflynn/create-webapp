# CLI (`cwa`)

A single-file `tsx` CLI that mirrors the REST API. Adapter on top of `/api/v1/*` — no special permissions, no separate auth path.

## Setup

```bash
export CWA_API_KEY=cwa_...                  # required: full key secret from Settings → API keys
export CWA_BASE_URL=http://localhost:3000   # optional, default http://localhost:3000
```

Two ways to invoke:

```bash
# In-repo (recommended for development)
npm run cli -- notes list

# Globally (after npm link from the repo root)
cwa notes list
```

The double-dash after `npm run cli` separates npm's args from the CLI's. Without it, npm eats the flags.

## Commands

```text
notes list   [--tag <tag>] [--sort title|created|updated] [--dir asc|desc]
             [--page N] [--page-size N] [--json]
notes get    <id> [--json]
notes create --title <t> --content <c> [--tag <tag>...] [--json]
notes update <id> --title <t> --content <c> [--tag <tag>...] [--json]
notes delete <id>
tags  list   [--json]
```

`--tag` is repeatable on `create` and `update`: `--tag a --tag b` sends `["a", "b"]`.

`update` is a full PATCH — both `--title` and `--content` are required, and tags are replaced wholesale (matching the REST contract; partial updates aren't supported in v1).

## Output

Read verbs render a small table to stdout by default, or raw JSON when `--json` is passed. Single-resource verbs (`get`, `create`, `update`) always emit pretty JSON.

```bash
# Pipe-friendly
cwa notes list --json | jq '.notes[] | {id, title}'

# Capture an id, then act on it
ID=$(cwa notes create --title "x" --content "y" --json | jq -r '.id')
cwa notes update "$ID" --title "x (edited)" --content "y" --tag edited
cwa notes delete "$ID"
```

## Exit codes

| Code | Meaning                                           |
| ---- | ------------------------------------------------- |
| `0`  | Success                                           |
| `1`  | API call failed (4xx/5xx). Error message on stderr. |
| `2`  | Usage error (missing env var, missing positional, unknown command). |

## Auth

Every request includes `Authorization: Bearer $CWA_API_KEY`. If the env var is missing, the CLI fails fast with exit `2` and never makes a request. Same scope model as the REST API:

- `notes list`, `notes get` → `notes:read`
- `notes create`, `notes update`, `notes delete` → `notes:write`
- `tags list` → `tags:read`

A key without the required scope returns a 403 → CLI prints the error message and exits `1`.

## See also

- **`docs/API.md`** — REST reference. The CLI is a thin wrapper.
- **`docs/MCP.md`** — Claude Code MCP integration on the same `/api/v1/*` lever.
- **`scripts/cli.ts`** — the source. ~280 lines, no framework dependencies, only `node:util` `parseArgs`.
