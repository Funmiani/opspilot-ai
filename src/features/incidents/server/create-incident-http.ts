import "server-only";
import type { ApplicationIdentity } from "@/server/auth/session";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import type { CreateIncidentResponse } from "../contracts";
import { httpErrorResponse, type ErrorPhase } from "@/server/http/errors";
import { checkJsonRequest, readBoundedJson } from "@/server/http/request";

type Dependencies = {
  getOrigin: () => string;
  requireIdentity: (headers: Headers) => Promise<ApplicationIdentity>;
  resolveContext: (identity: ApplicationIdentity, organizationId: unknown) => Promise<TrustedActorContext>;
  create: (context: TrustedActorContext, input: unknown) => Promise<CreateIncidentResponse>;
};

// Transport composition only; domain validation and authorization stay in the use case.
export function makeCreateIncidentHttp(deps: Dependencies) {
  return async (request: Request, route: { params: Promise<{ organizationId: string }> }): Promise<Response> => {
    let phase: ErrorPhase = "transport";
    try {
      checkJsonRequest(request, deps.getOrigin());
      phase = "authentication";
      const identity = await deps.requireIdentity(request.headers);
      phase = "tenant";
      const context = await deps.resolveContext(identity, (await route.params).organizationId);
      phase = "transport";
      const input = await readBoundedJson(request);
      phase = "operation";
      const result = await deps.create(context, input);
      return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) { return httpErrorResponse(error, phase); }
  };
}
