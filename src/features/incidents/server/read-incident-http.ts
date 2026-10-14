import "server-only";
import type { ApplicationIdentity } from "@/server/auth/session";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import type { IncidentDto, IncidentListResponse } from "../contracts";
import { ApplicationError } from "@/server/application/errors";
import { httpErrorResponse, type ErrorPhase } from "@/server/http/errors";

type Dependencies = {
  requireIdentity: (headers: Headers) => Promise<ApplicationIdentity>;
  resolveContext: (identity: ApplicationIdentity, organizationId: unknown) => Promise<TrustedActorContext>;
  list: (context: TrustedActorContext, query: unknown) => Promise<IncidentListResponse>;
  get: (context: TrustedActorContext, incidentId: unknown) => Promise<IncidentDto>;
};
function queryInput(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(query, key)) throw new ApplicationError("VALIDATION_FAILED", "The query is invalid.");
    query[key] = value; // Unknown names reach the strict application schema, never disappear.
  }
  return query;
}
export function makeIncidentReadHttp(deps: Dependencies) {
  async function handle(request: Request, params: Promise<{ organizationId: string; incidentId?: string }>, detail: boolean) {
    let phase: ErrorPhase = "authentication";
    try {
      const identity = await deps.requireIdentity(request.headers);
      phase = "tenant";
      const route = await params;
      const context = await deps.resolveContext(identity, route.organizationId);
      phase = "operation";
      const result = detail ? await deps.get(context, route.incidentId) : await deps.list(context, queryInput(request.url));
      return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) { return httpErrorResponse(error, phase); }
  }
  return {
    list: (request: Request, route: { params: Promise<{ organizationId: string }> }) => handle(request, route.params, false),
    get: (request: Request, route: { params: Promise<{ organizationId: string; incidentId: string }> }) => handle(request, route.params, true),
  };
}
