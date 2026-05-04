import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/services/errors";
import type { Note } from "@/lib/services/notes";
import type { TagWithCount } from "@/lib/services/tags";

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
): Response {
  const body: ApiError = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return Response.json(body, { status, headers });
}

/**
 * Translate a thrown service-layer error into the canonical API error
 * response. Unknown errors are logged and surfaced as 500.
 */
export function mapError(e: unknown): Response {
  if (e instanceof UnauthenticatedError) {
    const headers: Record<string, string> = {};
    // When `requireApiUser` is called with `{ challenge: true }` (e.g. from
    // /api/mcp) it tags the error with a `challenge` flag so we can emit
    // RFC 9728-style WWW-Authenticate pointing the client at the
    // protected-resource metadata. MCP-spec OAuth discovery starts here.
    if ((e as { challenge?: boolean }).challenge) {
      const base = process.env.BETTER_AUTH_URL ?? "";
      headers["WWW-Authenticate"] =
        `Bearer realm="create-webapp", resource_metadata="${base}/.well-known/oauth-protected-resource"`;
    }
    return jsonError(401, "unauthenticated", e.message, undefined, headers);
  }
  if (e instanceof ForbiddenError) {
    return jsonError(403, "forbidden", e.message);
  }
  if (e instanceof NotFoundError) {
    return jsonError(404, "not_found", e.message);
  }
  if (e instanceof ValidationError) {
    return jsonError(422, "validation_failed", e.message, {
      issues: e.issues,
    });
  }
  if (e instanceof RateLimitedError) {
    return jsonError(429, "rate_limited", e.message, undefined, {
      "Retry-After": String(e.retryAfter),
    });
  }
  console.error("[api] unhandled error:", e);
  return jsonError(500, "internal_error", "Internal server error.");
}

// -- Wire-format serializers ------------------------------------------------
//
// JSON.stringify already turns Dates into ISO strings, but having explicit
// serializers documents the wire contract in code and gives us a stable place
// to evolve it (omit fields, add computed ones, change date format).

export type SerializedNote = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export function serializeNote(n: Note): SerializedNote {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    tags: n.tags,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export type SerializedTag = {
  name: string;
  count: number;
};

export function serializeTag(t: TagWithCount): SerializedTag {
  return { name: t.name, count: t.count };
}
