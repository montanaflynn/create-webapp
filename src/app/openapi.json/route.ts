import { openApiSpec } from "@/lib/docs/openapi";

export function GET() {
  return Response.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
