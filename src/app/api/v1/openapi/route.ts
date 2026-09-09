import { openApiSpec } from "@/shared/http/openapi";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(openApiSpec);
}
