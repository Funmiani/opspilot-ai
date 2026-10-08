import { readAuthEnv } from "@/server/auth/env";
import { requireApplicationIdentity } from "@/server/auth/session";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";
import { createIncident } from "@/features/incidents/server";
import { makeCreateIncidentHttp } from "@/features/incidents/server/create-incident-http";

export const runtime = "nodejs";
export const POST = makeCreateIncidentHttp({
  getOrigin: () => readAuthEnv().origin,
  requireIdentity: requireApplicationIdentity,
  resolveContext: resolveTrustedActorContext,
  create: createIncident,
});
