# REST API (v1)

Programmatic access to the same operations the web UI uses. The MCP server (see `docs/MCP.md`) is a peer adapter on top of the same service layer — both share auth, scopes, and error codes.

Base URL: `http://localhost:3000` in dev, your deploy URL in prod.

---

## Authentication

Every `/api/v1/*` request requires `Authorization: Bearer <key>`. Keys are created from **Settings → API keys** (or via the `seed-test-api-keys.ts` script during e2e setup). The full secret is shown **once** at creation; only the prefix (e.g. `cwa_a1b2c3d4`) appears in lists afterward.

```bash
curl -H "Authorization: Bearer cwa_xxx..." \
  http://localhost:3000/api/v1/notes
```

Missing or malformed header → `401 unauthenticated`. Valid key without the required scope → `403 forbidden`. Revoked key → `401 unauthenticated`.

### Scopes

A key holds one or more of these. Each endpoint declares which it needs.

| Scope          | Grants                                          |
| -------------- | ----------------------------------------------- |
| `notes:read`   | List notes, get a note                          |
| `notes:write`  | Create, update, delete notes                    |
| `tags:read`    | List tags                                       |

---

## Error shape

Every non-2xx response has the same envelope:

```json
{ "error": { "code": "validation_failed", "message": "Title is required.", "details": { "issues": [...] } } }
```

| HTTP | `code`               | When                                                    |
| ---- | -------------------- | ------------------------------------------------------- |
| 400  | `bad_request`        | Malformed JSON body                                     |
| 401  | `unauthenticated`    | Missing / invalid / revoked Bearer token                |
| 403  | `forbidden`          | Authenticated but key lacks the required scope          |
| 404  | `not_found`          | Resource doesn't exist or isn't owned by this user      |
| 422  | `validation_failed`  | Body parsed but failed schema validation                |
| 429  | `rate_limited`       | Per-key bucket exhausted. Includes `Retry-After` header in seconds. |
| 500  | `internal_error`     | Server bug. Logged server-side; please report           |

Validation errors include `details.issues: [{ path: string[], message: string }]` so clients can show field-level errors.

### Rate limits

Each API key has its own token bucket: 60 burst, 10 requests/sec sustained (defaults; override with `CWA_RATE_LIMIT_BURST` / `CWA_RATE_LIMIT_PER_SECOND`). Cookie-session traffic from the dashboard is not counted — only Bearer-authenticated requests. Exhausted buckets return `429 rate_limited` with a `Retry-After` header.

---

## Notes

### `GET /api/v1/notes` — list

**Scopes**: `notes:read`

Query params (all optional):

| Param      | Type                              | Default     |
| ---------- | --------------------------------- | ----------- |
| `tag`      | string                            | none        |
| `sort`     | `"title"` \| `"created"` \| `"updated"` | `"updated"` |
| `dir`      | `"asc"` \| `"desc"`               | `"desc"`    |
| `page`     | integer (1-indexed)               | `1`         |
| `pageSize` | integer (1–100)                   | `10`        |

Response:

```json
{
  "notes": [
    {
      "id": "note_…",
      "title": "Hello",
      "content": "…",
      "tags": ["foo", "bar"],
      "createdAt": "2026-05-03T17:00:00.000Z",
      "updatedAt": "2026-05-03T17:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 10,
  "totalPages": 5
}
```

```bash
curl -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/notes?tag=welcome&sort=created&dir=asc"
```

### `POST /api/v1/notes` — create

**Scopes**: `notes:write`

Body:

```json
{
  "title": "string (1–200 chars)",
  "content": "string (≤10,000 chars)",
  "tags": ["string (1–40 chars)"]
}
```

`201 Created` with the note in the response body. Tags are normalized (trimmed, lowercased, deduplicated). New tag names are upserted into the user's vocabulary.

```bash
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"From curl","content":"hi","tags":["api"]}' \
  "$BASE/api/v1/notes"
```

### `GET /api/v1/notes/:id` — get

**Scopes**: `notes:read`

`200` with the note, or `404` if it doesn't exist or belongs to another user (the API never discloses existence across users).

### `PATCH /api/v1/notes/:id` — update

**Scopes**: `notes:write`

Body shape and validation rules match `POST`. All fields are required in the body — partial updates aren't supported in v1. Tag links are replaced wholesale (atomic inside a single transaction). Returns `200` with the updated note.

### `DELETE /api/v1/notes/:id` — delete

**Scopes**: `notes:write`

`204 No Content` on success. `404` if the note doesn't exist or belongs to another user.

Tag rows are intentionally **not** deleted, even when a note is the last thing referencing a tag — the user's autocomplete vocabulary survives note deletion.

---

## Tags

### `GET /api/v1/tags` — list

**Scopes**: `tags:read`

Returns every tag the user has ever created, with the count of notes currently using each. Includes orphan tags (count `0`) so the user's full vocabulary is represented.

```json
{
  "tags": [
    { "name": "drone", "count": 3 },
    { "name": "interview", "count": 0 }
  ]
}
```

---

## Conventions

- **Auth boundary is per-user, always.** Every service call takes a `userId` and filters every read/write by it. There's no cross-user data leak even if a route handler forgets to check.
- **No partial updates yet.** PATCH replaces all editable fields. If you need true partial updates, the service layer is the right place to relax validation.
- **Idempotency.** Deletes are idempotent at the service layer (re-deleting a missing note returns `404`, not `500`).
- **Pagination caps at 100.** `pageSize` is clamped server-side; values above 100 are silently lowered.
- **Sort columns are explicit.** Anything other than `title` / `created` / `updated` is silently coerced to `updated`.

---

## Examples

```bash
# Set once
export BASE=http://localhost:3000
export KEY=cwa_xxx...

# List
curl -sH "Authorization: Bearer $KEY" "$BASE/api/v1/notes" | jq

# Create
curl -sX POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"World","tags":["greeting"]}' \
  "$BASE/api/v1/notes" | jq -r '.id'

# Update by piping the id
ID=$(curl -s ... | jq -r .id)
curl -sX PATCH -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello (edited)","content":"World","tags":[]}' \
  "$BASE/api/v1/notes/$ID"

# Delete
curl -sX DELETE -H "Authorization: Bearer $KEY" "$BASE/api/v1/notes/$ID" -w '%{http_code}\n'
# → 204
```
