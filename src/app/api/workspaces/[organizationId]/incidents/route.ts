import { readAuthEnv } from "@/server/auth/env";
import { requireApplicationIdentity } from "@/server/auth/session";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";
import { makeIncidentReadHttp } from "@/features/incidents/server/read-incident-http";
import { createIncident, listIncidents, getIncident } from "@/features/incidents/server";
import { makeCreateIncidentHttp } from "@/features/incidents/server/create-incident-http";

export const runtime = "nodejs";
export const POST = makeCreateIncidentHttp({
  getOrigin: () => readAuthEnv().origin,
  requireIdentity: requireApplicationIdentity,
  resolveContext: resolveTrustedActorContext,
  create: createIncident,
});

export const GET = makeIncidentReadHttp({
  requireIdentity: requireApplicationIdentity,
  resolveContext: resolveTrustedActorContext,
  list: listIncidents,
  get: getIncident,
}).list;
