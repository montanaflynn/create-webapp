import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  assertScopes,
  type Scope,
  type VerifiedKey,
} from "@/lib/services/api-keys";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/services/errors";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
  type NoteSort,
  type SortDir,
} from "@/lib/services/notes";
import { listTagsWithCounts } from "@/lib/services/tags";
import { noteInputSchema } from "@/lib/notes-schema";
import { serializeNote, serializeTag } from "@/lib/api/response";

const NAME = "create-webapp";
const VERSION = "1.0.0";

/**
 * Build a per-request MCP server bound to a verified API key. Tools call the
 * service layer directly — REST and MCP are peer adapters on top of the same
 * primitives, neither stacked on the other.
 */
export function buildMcpServer(auth: VerifiedKey): McpServer {
  const server = new McpServer(
    { name: NAME, version: VERSION },
    {
      instructions:
        "Tools manipulate the authenticated user's notes and tags. Every tool requires a scoped API key: notes:read for reads, notes:write for writes, tags:read for tags.",
    },
  );

  server.registerTool(
    "notes_list",
    {
      description:
        "List the authenticated user's notes. Supports filtering by tag, sorting, and pagination.",
      inputSchema: {
        tag: z.string().optional().describe("Filter by exact tag name."),
        sort: z
          .enum(["title", "created", "updated"])
          .optional()
          .describe("Sort key. Default: updated."),
        dir: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction. Default: desc."),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) =>
      run(auth, ["notes:read"], async () => {
        const result = await listNotes(auth.userId, {
          tag: args.tag ?? null,
          sort: args.sort as NoteSort | undefined,
          dir: args.dir as SortDir | undefined,
          page: args.page,
          pageSize: args.pageSize,
        });
        return {
          notes: result.notes.map(serializeNote),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        };
      }),
  );

  server.registerTool(
    "notes_get",
    {
      description: "Fetch a single note by id.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ id }) =>
      run(auth, ["notes:read"], async () =>
        serializeNote(await getNote(auth.userId, id)),
      ),
  );

  server.registerTool(
    "notes_create",
    {
      description: "Create a new note. Returns the created note.",
      inputSchema: noteInputSchema.shape,
    },
    async (args) =>
      run(auth, ["notes:write"], async () =>
        serializeNote(
          await createNote(
            { userId: auth.userId, apiKeyId: auth.apiKeyId },
            args,
          ),
        ),
      ),
  );

  server.registerTool(
    "notes_update",
    {
      description:
        "Replace a note's fields. All fields required (no partial updates in v1).",
      inputSchema: { id: z.string(), ...noteInputSchema.shape },
      annotations: { idempotentHint: true },
    },
    async ({ id, ...rest }) =>
      run(auth, ["notes:write"], async () =>
        serializeNote(
          await updateNote(
            { userId: auth.userId, apiKeyId: auth.apiKeyId },
            id,
            rest,
          ),
        ),
      ),
  );

  server.registerTool(
    "notes_delete",
    {
      description:
        "Delete a note. Tag rows are preserved (autocomplete vocabulary survives note deletion).",
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) =>
      run(auth, ["notes:write"], async () => {
        await deleteNote(
          { userId: auth.userId, apiKeyId: auth.apiKeyId },
          id,
        );
        return { id, deleted: true };
      }),
  );

  server.registerTool(
    "tags_list",
    {
      description:
        "List every tag the user has used, with the count of notes referencing each. Includes orphan tags (count 0).",
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () =>
      run(auth, ["tags:read"], async () => ({
        tags: (await listTagsWithCounts(auth.userId)).map(serializeTag),
      })),
  );

  return server;
}

// ---------------------------------------------------------------------------

/**
 * Wrap a tool body with: scope assertion, error → tool-result translation.
 * Returns the canonical `CallToolResult` shape with both text and structured
 * content (clients that don't support structuredContent fall back to text).
 */
async function run<T>(
  auth: VerifiedKey,
  scopes: Scope[],
  body: () => Promise<T>,
) {
  try {
    assertScopes(auth, scopes);
    const result = await body();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  } catch (e) {
    return errorResult(e);
  }
}

function errorResult(e: unknown) {
  let code = "internal_error";
  let message = "Internal error.";
  if (e instanceof UnauthenticatedError) {
    code = "unauthenticated";
    message = e.message;
  } else if (e instanceof ForbiddenError) {
    code = "forbidden";
    message = e.message;
  } else if (e instanceof NotFoundError) {
    code = "not_found";
    message = e.message;
  } else if (e instanceof ValidationError) {
    code = "validation_failed";
    message = e.message;
  } else {
    console.error("[mcp] unhandled error:", e);
  }
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: { code, message } }) },
    ],
    isError: true,
  };
}
