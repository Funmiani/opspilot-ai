import { requireApplicationIdentity } from "@/server/auth/session";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";
import { listIncidents, getIncident } from "@/features/incidents/server";
import { makeIncidentReadHttp } from "@/features/incidents/server/read-incident-http";

export const runtime = "nodejs";
export const GET = makeIncidentReadHttp({
  requireIdentity: requireApplicationIdentity,
  resolveContext: resolveTrustedActorContext,
  list: listIncidents,
  get: getIncident,
}).get;
