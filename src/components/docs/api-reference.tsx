import {
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyCurlButton } from "@/components/docs/copy-curl-button";
import { ChevronDownIcon } from "lucide-react";
import {
  getApiOperationsByTag,
  getResponseSchema,
  isRef,
  resolveRef,
  schemaName,
  type ReferenceObject,
  type OperationObject,
  type OpenApiMethod,
  type ResponseObject,
  type SchemaObject,
} from "@/lib/docs/openapi";
import { cn } from "@/lib/utils";

const methodClassName: Record<OpenApiMethod, string> = {
  get: "border-border",
  post: "border-border",
  patch: "border-border",
  delete: "border-border",
};

type DisplaySchema = SchemaObject | ReferenceObject;

function schemaAnchor(name: string) {
  return `schema-${name}`;
}

function schemaProperties(schema: DisplaySchema) {
  const resolved = isRef(schema) ? resolveRef<SchemaObject>(schema) : schema;
  return resolved?.properties ? Object.entries(resolved.properties) : [];
}

function SchemaFields({ schema }: { schema: DisplaySchema }) {
  const resolved = isRef(schema) ? resolveRef<SchemaObject>(schema) : schema;
  const fields = schemaProperties(schema);
  const required = new Set(resolved?.required ?? []);

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border bg-muted p-3 font-mono text-sm">
        {schemaName(schema)}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[34rem] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[36%]" />
          <col className="w-[36%]" />
        </colgroup>
        <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-foreground">
          <tr>
            <th className="px-3 py-2 text-left align-middle">Field</th>
            <th className="px-3 py-2 text-left align-middle">Type</th>
            <th className="px-3 py-2 text-left align-middle">Notes</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([name, field]) => (
            <tr key={name} className="border-t">
              <td className="px-3 py-2 align-top font-mono">
                {name}
                {required.has(name) ? (
                  <span className="ml-1 text-muted-foreground">*</span>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top font-mono text-muted-foreground">
                {schemaName(field)}
              </td>
              <td className="px-3 py-2 align-top text-muted-foreground">
                {isRef(field)
                  ? ""
                  : [
                      field.description,
                      field.minLength !== undefined
                        ? `min ${field.minLength}`
                        : "",
                      field.maxLength !== undefined
                        ? `max ${field.maxLength}`
                        : "",
                      field.maxItems !== undefined
                        ? `max ${field.maxItems} items`
                        : "",
                      field.minimum !== undefined ? `min ${field.minimum}` : "",
                      field.maximum !== undefined ? `max ${field.maximum}` : "",
                    ]
                      .filter(Boolean)
                      .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParameterList({ operation }: { operation: OperationObject }) {
  if (!operation.parameters?.length) {
    return <p className="text-sm text-muted-foreground">No parameters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[14%]" />
          <col className="w-[44%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-foreground">
          <tr>
            <th className="px-3 py-2 text-left align-middle">Name</th>
            <th className="px-3 py-2 text-left align-middle">In</th>
            <th className="px-3 py-2 text-left align-middle">Type</th>
            <th className="px-3 py-2 text-left align-middle">Default</th>
          </tr>
        </thead>
        <tbody>
          {operation.parameters.map((parameter) => (
            <tr key={`${parameter.in}-${parameter.name}`} className="border-t">
              <td className="px-3 py-2 align-top font-mono">
                {parameter.name}
                {parameter.required ? (
                  <span className="ml-1 text-muted-foreground">*</span>
                ) : null}
              </td>
              <td className="px-3 py-2 align-top text-muted-foreground">
                {parameter.in}
              </td>
              <td className="px-3 py-2 align-top font-mono text-muted-foreground whitespace-normal">
                {schemaName(parameter.schema)}
              </td>
              <td className="px-3 py-2 align-top font-mono text-muted-foreground">
                {parameter["x-default"] ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaLink({ schema }: { schema: DisplaySchema }) {
  const name = schemaName(schema);
  return (
    <a href={`#${schemaAnchor(name)}`} className="underline underline-offset-4">
      {name}
    </a>
  );
}

function RequestBody({ operation }: { operation: OperationObject }) {
  const schema = operation.requestBody?.content["application/json"]?.schema;
  if (!schema) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="text-sm font-medium">Request body</div>
      <div className="text-sm text-muted-foreground">
        <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
          <SchemaLink schema={schema} />
        </code>
      </div>
      <SchemaFields schema={schema} />
    </section>
  );
}

function Responses({ operation }: { operation: OperationObject }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="text-sm font-medium">Responses</div>
      <div className="flex flex-col gap-3">
        {Object.entries(operation.responses).map(([status, rawResponse]) => {
          const response = isRef(rawResponse)
            ? resolveRef<ResponseObject>(rawResponse)
            : rawResponse;
          const schema = response ? getResponseSchema(response) : null;

          return (
            <div key={status} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.startsWith("2") ? "default" : "outline"}>
                  {status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {response?.description ?? "Response"}
                </span>
              </div>
              {schema ? (
                <div className="mt-3">
                  <div className="mb-2 text-sm text-muted-foreground">
                    Schema: <SchemaLink schema={schema} />
                  </div>
                  <SchemaFields schema={schema} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EndpointCard({
  method,
  path,
  operation,
  defaultOpen = false,
}: {
  method: OpenApiMethod;
  path: string;
  operation: OperationObject;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={operation.operationId}
      open={defaultOpen}
      className="group scroll-mt-24 rounded-xl border py-4 text-sm text-card-foreground open:pb-0"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("font-mono uppercase", methodClassName[method])}
              >
                {method.toUpperCase()}
              </Badge>
              <code className="rounded-sm bg-muted px-1.5 py-1 font-mono text-sm">
                {path}
              </code>
            </div>
            <CardTitle>{operation.summary}</CardTitle>
            <CardDescription>{operation.description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {(operation["x-scopes"] ?? []).map((scope) => (
              <Badge key={scope} variant="secondary">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
        <ChevronDownIcon
          aria-hidden
          className="mt-1 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-6 px-4 pt-6 pb-4">
        <section className="flex flex-col gap-3">
          <div className="text-sm font-medium">Parameters</div>
          <ParameterList operation={operation} />
        </section>
        <RequestBody operation={operation} />
        <Responses operation={operation} />
        {operation["x-curl"] ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">curl</div>
              <CopyCurlButton value={operation["x-curl"]} />
            </div>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm leading-relaxed">
              <code>{operation["x-curl"]}</code>
            </pre>
          </section>
        ) : null}
      </div>
    </details>
  );
}

const sharedSchemaLinks = [
  { name: "Note" },
  { name: "NoteInput" },
  { name: "NotesListResponse" },
  { name: "Tag" },
  { name: "TagsListResponse" },
  { name: "ErrorResponse" },
];

function SharedSchemas() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold tracking-tight">Shared schemas</h2>
      <p className="leading-7 text-muted-foreground">
        Request and response schemas are expanded inline on the endpoints that
        use them. Jump to the first route that shows each shared shape.
      </p>
      <div className="flex flex-wrap gap-2">
        {sharedSchemaLinks.map((schema) => (
          <a
            key={schema.name}
            id={schemaAnchor(schema.name)}
            href={`#${schemaAnchor(schema.name)}`}
            className="rounded-md border px-2.5 py-1 font-mono text-sm transition-colors hover:bg-muted"
          >
            {schema.name}
          </a>
        ))}
      </div>
    </section>
  );
}

export function ApiReference() {
  const groups = getApiOperationsByTag();
  const firstOperationId = Object.values(groups)[0]?.[0]?.operation.operationId;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Authentication</h2>
        <p className="leading-7 text-muted-foreground">
          Every REST endpoint requires an API key sent as{" "}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
            Authorization: Bearer &lt;key&gt;
          </code>
          .
        </p>
        <p className="leading-7 text-muted-foreground">
          Create keys from Settings -&gt; API keys.
        </p>
        <p className="text-sm text-muted-foreground">
          Raw OpenAPI:{" "}
          <a href="/openapi.json" className="font-medium underline underline-offset-4">
            /openapi.json
          </a>
        </p>
      </section>

      <SharedSchemas />

      {Object.entries(groups).map(([tag, operations]) => (
        <section key={tag} className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">{tag}</h2>
          {operations.map(({ method, path, operation }) => (
            <EndpointCard
              key={operation.operationId}
              method={method}
              path={path}
              operation={operation}
              defaultOpen={operation.operationId === firstOperationId}
            />
          ))}
        </section>
      ))}

    </div>
  );
}
