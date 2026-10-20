import "server-only";
import type { ApplicationIdentity } from "@/server/auth/session";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import { ApplicationError } from "@/server/application/errors";
import { httpErrorResponse, type ErrorPhase } from "@/server/http/errors";
import { checkJsonRequest, readBoundedJson } from "@/server/http/request";
import type { InvestigationNoteDto, InvestigationNotePage, IncidentEvidenceDto, IncidentEvidencePage } from "../investigation-contracts";

export const INVESTIGATION_POST_MAX_BYTES = 192 * 1024;
type Route = { params: Promise<{ organizationId: string; incidentId: string }> };
type Dependencies = {
  getOrigin: () => string;
  requireIdentity: (headers: Headers) => Promise<ApplicationIdentity>;
  resolveContext: (identity: ApplicationIdentity, organizationId: unknown) => Promise<TrustedActorContext>;
  add: (context: TrustedActorContext, incidentId: unknown, input: unknown) => Promise<InvestigationNoteDto | IncidentEvidenceDto>;
  list: (context: TrustedActorContext, incidentId: unknown, query: unknown) => Promise<InvestigationNotePage | IncidentEvidencePage>;
};
function queryInput(url: string): Record<string, string> {
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(url).searchParams) {
    if (Object.hasOwn(query, key)) throw new ApplicationError("VALIDATION_FAILED", "The query is invalid.");
    query[key] = value; // Unknown fields must reach the strict application schema.
  }
  return query;
}

// Transport only: current membership, parent access, authorship and writes belong to the use cases.
export function makeInvestigationHttp(deps: Dependencies) {
  async function handle(request: Request, route: Route, write: boolean): Promise<Response> {
    let phase: ErrorPhase = "transport";
    try {
      if (write) checkJsonRequest(request, deps.getOrigin(), INVESTIGATION_POST_MAX_BYTES);
      phase = "authentication";
      const identity = await deps.requireIdentity(request.headers);
      phase = "tenant";
      const params = await route.params;
      const context = await deps.resolveContext(identity, params.organizationId);
      phase = "transport";
      const input = write ? await readBoundedJson(request, INVESTIGATION_POST_MAX_BYTES) : queryInput(request.url);
      phase = "operation";
      const result = write ? await deps.add(context, params.incidentId, input) : await deps.list(context, params.incidentId, input);
      return Response.json(result, { status: write ? 201 : 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) { return httpErrorResponse(error, phase); }
  }
  return {
    GET: (request: Request, route: Route) => handle(request, route, false),
    POST: (request: Request, route: Route) => handle(request, route, true),
  };
}
