import { APP_DESCRIPTION, APP_NAME } from "@/lib/branding";

export type SchemaObject = {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: SchemaObject | ReferenceObject;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  additionalProperties?: boolean | SchemaObject | ReferenceObject;
  examples?: unknown[];
};

export type ReferenceObject = {
  $ref: string;
};

type ParameterObject = {
  name: string;
  in: "query" | "path" | "header";
  required?: boolean;
  description?: string;
  schema: SchemaObject | ReferenceObject;
  "x-default"?: string;
};

export type ResponseObject = {
  description: string;
  content?: Record<string, { schema: SchemaObject | ReferenceObject }>;
  headers?: Record<string, { description?: string; schema: SchemaObject }>;
};

type RequestBodyObject = {
  required?: boolean;
  content: Record<string, { schema: SchemaObject | ReferenceObject }>;
};

export type OperationObject = {
  operationId: string;
  tags: string[];
  summary: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject | ReferenceObject>;
  "x-scopes"?: string[];
  "x-curl"?: string;
};

export type OpenApiMethod = "get" | "post" | "patch" | "delete";

export type OpenApiSpec = {
  openapi: "3.1.0";
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, SchemaObject>;
    responses: Record<string, ResponseObject>;
  };
  paths: Record<string, Partial<Record<OpenApiMethod, OperationObject>>>;
};

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
});

const noteInputBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/NoteInput" },
    },
  },
} satisfies RequestBodyObject;

export const openApiSpec: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: `${APP_NAME} REST API`,
    version: "1.0.0",
    description: APP_DESCRIPTION,
  },
  servers: [
    { url: "http://localhost:3000", description: "Local development" },
    { url: "https://your-app.example.com", description: "Production" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "cwa_ API key",
        description: "API key created from Settings -> API keys.",
      },
    },
    schemas: {
      Note: {
        type: "object",
        required: ["id", "title", "content", "tags", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", examples: ["note_abc123"] },
          title: { type: "string", minLength: 1, maxLength: 200 },
          content: { type: "string", maxLength: 10000 },
          tags: {
            type: "array",
            items: { type: "string" },
            examples: [["launch", "work"]],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      NoteInput: {
        type: "object",
        required: ["title", "content", "tags"],
        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Trimmed before validation and storage.",
          },
          content: { type: "string", maxLength: 10000 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 40 },
            description: "Tags are trimmed, lowercased, and deduplicated.",
          },
        },
      },
      NotesListResponse: {
        type: "object",
        required: ["notes", "total", "page", "pageSize", "totalPages"],
        properties: {
          notes: { type: "array", items: { $ref: "#/components/schemas/Note" } },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          totalPages: { type: "integer", minimum: 1 },
        },
      },
      Tag: {
        type: "object",
        required: ["name", "count"],
        properties: {
          name: { type: "string" },
          count: { type: "integer", minimum: 0 },
        },
      },
      TagsListResponse: {
        type: "object",
        required: ["tags"],
        properties: {
          tags: { type: "array", items: { $ref: "#/components/schemas/Tag" } },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "bad_request",
                  "unauthenticated",
                  "forbidden",
                  "not_found",
                  "validation_failed",
                  "rate_limited",
                  "internal_error",
                ],
              },
              message: { type: "string" },
              details: {
                description:
                  "Optional structured details. Validation errors include an issues array.",
              },
            },
          },
        },
      },
      ValidationErrorDetails: {
        type: "object",
        required: ["issues"],
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              required: ["path", "message"],
              properties: {
                path: { type: "array", items: { type: "string" } },
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: errorResponse("Request body must be valid JSON."),
      Unauthenticated: errorResponse("Missing, malformed, invalid, or revoked Bearer token."),
      Forbidden: errorResponse("Authenticated principal lacks the required scope."),
      NotFound: errorResponse("The note does not exist or is not owned by this user."),
      ValidationFailed: errorResponse("Request body failed schema validation."),
      RateLimited: {
        ...errorResponse("Per-key rate limit exceeded."),
        headers: {
          "Retry-After": {
            description: "Seconds until the next request should be attempted.",
            schema: { type: "integer", minimum: 1 },
          },
        },
      },
      InternalError: errorResponse("Unexpected server error."),
    },
  },
  paths: {
    "/api/v1/notes": {
      get: {
        operationId: "listNotes",
        tags: ["Notes"],
        summary: "List notes",
        description:
          "Returns notes owned by the authenticated user, with optional tag filtering, sorting, and pagination.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["notes:read"],
        parameters: [
          { name: "tag", in: "query", schema: { type: "string" } },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", enum: ["title", "created", "updated"] },
            description: "Defaults to updated. Unknown values are coerced to updated.",
            "x-default": "updated",
          },
          {
            name: "dir",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"] },
            description: "Defaults to desc. Only asc opts into ascending order.",
            "x-default": "desc",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1 },
            description: "Defaults to 1.",
            "x-default": "1",
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 },
            description: "Defaults to 10 and is capped at 100.",
            "x-default": "10",
          },
        ],
        responses: {
          "200": {
            description: "Paginated notes list.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotesListResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -H "Authorization: Bearer $CWA_API_KEY" \\
  "$BASE/api/v1/notes?tag=launch&sort=updated&dir=desc"`,
      },
      post: {
        operationId: "createNote",
        tags: ["Notes"],
        summary: "Create a note",
        description:
          "Creates a note for the authenticated user. Tags are normalized and upserted into the user's tag vocabulary.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["notes:write"],
        requestBody: noteInputBody,
        responses: {
          "201": {
            description: "Created note.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Note" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "422": { $ref: "#/components/responses/ValidationFailed" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -X POST -H "Authorization: Bearer $CWA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Launch notes","content":"Ship the API docs","tags":["launch","api"]}' \\
  "$BASE/api/v1/notes"`,
      },
    },
    "/api/v1/notes/{id}": {
      get: {
        operationId: "getNote",
        tags: ["Notes"],
        summary: "Get a note",
        description: "Returns one note owned by the authenticated user.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["notes:read"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "The requested note.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Note" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -H "Authorization: Bearer $CWA_API_KEY" \\
  "$BASE/api/v1/notes/$NOTE_ID"`,
      },
      patch: {
        operationId: "updateNote",
        tags: ["Notes"],
        summary: "Update a note",
        description:
          "Replaces editable note fields. Partial updates are not supported in v1; title, content, and tags are required.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["notes:write"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: noteInputBody,
        responses: {
          "200": {
            description: "Updated note.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Note" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/ValidationFailed" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -X PATCH -H "Authorization: Bearer $CWA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Updated","content":"New body","tags":["api"]}' \\
  "$BASE/api/v1/notes/$NOTE_ID"`,
      },
      delete: {
        operationId: "deleteNote",
        tags: ["Notes"],
        summary: "Delete a note",
        description:
          "Deletes a note owned by the authenticated user. Tag vocabulary is preserved.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["notes:write"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "Deleted. No response body." },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -X DELETE -H "Authorization: Bearer $CWA_API_KEY" \\
  "$BASE/api/v1/notes/$NOTE_ID"`,
      },
    },
    "/api/v1/tags": {
      get: {
        operationId: "listTags",
        tags: ["Tags"],
        summary: "List tags",
        description:
          "Returns the authenticated user's tag vocabulary with note counts, including tags currently used by zero notes.",
        security: [{ bearerAuth: [] }],
        "x-scopes": ["tags:read"],
        responses: {
          "200": {
            description: "Tags list.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TagsListResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
        "x-curl": `curl -H "Authorization: Bearer $CWA_API_KEY" \\
  "$BASE/api/v1/tags"`,
      },
    },
  },
};

const methodOrder: OpenApiMethod[] = ["get", "post", "patch", "delete"];

export type ApiOperation = {
  method: OpenApiMethod;
  path: string;
  operation: OperationObject;
};

export function getApiOperations(): ApiOperation[] {
  return Object.entries(openApiSpec.paths).flatMap(([path, pathItem]) =>
    methodOrder.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [{ method, path, operation }] : [];
    }),
  );
}

export function getApiOperationsByTag() {
  return getApiOperations().reduce<Record<string, ApiOperation[]>>(
    (groups, item) => {
      const tag = item.operation.tags[0] ?? "API";
      groups[tag] = [...(groups[tag] ?? []), item];
      return groups;
    },
    {},
  );
}

export function resolveRef<T extends SchemaObject | ResponseObject>(
  ref: ReferenceObject,
): T | null {
  const parts = ref.$ref.replace(/^#\//, "").split("/");
  let current: unknown = openApiSpec as unknown;

  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return (current as T) ?? null;
}

export function isRef(value: unknown): value is ReferenceObject {
  return Boolean(
    value &&
      typeof value === "object" &&
      "$ref" in value &&
      typeof (value as ReferenceObject).$ref === "string",
  );
}

export function schemaName(schema: SchemaObject | ReferenceObject): string {
  if (isRef(schema)) return schema.$ref.split("/").at(-1) ?? schema.$ref;
  if (schema.type === "array") return `array<${schema.items ? schemaName(schema.items) : "unknown"}>`;
  if (schema.enum) return schema.enum.map((value) => `"${value}"`).join(" | ");
  return schema.format ? `${schema.type ?? "value"}:${schema.format}` : (schema.type ?? "value");
}

export function getResponseSchema(response: ResponseObject) {
  return response.content?.["application/json"]?.schema ?? null;
}

export function generateOpenApiMarkdown() {
  const lines = [
    "# REST API",
    "",
    "The REST API exposes notes and tags at `/api/v1/*`. This reference is generated from `/openapi.json`.",
    "",
    "## Authentication",
    "",
    "Every endpoint requires `Authorization: Bearer <cwa_api_key>`.",
    "",
  ];

  for (const [tag, operations] of Object.entries(getApiOperationsByTag())) {
    lines.push(`## ${tag}`, "");

    for (const { method, path, operation } of operations) {
      lines.push(`### ${method.toUpperCase()} ${path}`, "");
      lines.push(operation.summary, "");
      if (operation.description) lines.push(operation.description, "");
      lines.push(`Scopes: ${(operation["x-scopes"] ?? []).map((s) => `\`${s}\``).join(", ") || "none"}`, "");

      if (operation.parameters?.length) {
        lines.push("Parameters:", "");
        for (const parameter of operation.parameters) {
          const defaultText = parameter["x-default"]
            ? `, default ${parameter["x-default"]}`
            : "";
          lines.push(
            `- \`${parameter.name}\` (${parameter.in}, ${parameter.required ? "required" : "optional"}, ${schemaName(parameter.schema)}${defaultText})${parameter.description ? ` - ${parameter.description}` : ""}`,
          );
        }
        lines.push("");
      }

      if (operation.requestBody) {
        const schema = operation.requestBody.content["application/json"]?.schema;
        lines.push(`Request body: \`${schema ? schemaName(schema) : "application/json"}\``, "");
      }

      lines.push("Responses:", "");
      for (const [status, rawResponse] of Object.entries(operation.responses)) {
        const response = isRef(rawResponse) ? resolveRef<ResponseObject>(rawResponse) : rawResponse;
        lines.push(`- \`${status}\` - ${response?.description ?? "Response"}`);
      }
      lines.push("");

      if (operation["x-curl"]) {
        lines.push("```bash", operation["x-curl"], "```", "");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
