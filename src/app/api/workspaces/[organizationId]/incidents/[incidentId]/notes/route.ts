import { readAuthEnv } from "@/server/auth/env";
import { requireApplicationIdentity } from "@/server/auth/session";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";
import { addInvestigationNote, listInvestigationNotes } from "@/features/incidents/server";
import { makeInvestigationHttp } from "@/features/incidents/server/investigation-http";

export const runtime = "nodejs";
export const { GET, POST } = makeInvestigationHttp({
  getOrigin: () => readAuthEnv().origin,
  requireIdentity: requireApplicationIdentity,
  resolveContext: resolveTrustedActorContext,
  add: addInvestigationNote,
  list: listInvestigationNotes,
});
