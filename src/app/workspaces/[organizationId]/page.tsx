import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireApplicationIdentity } from "@/server/auth/session";
import { ApplicationError } from "@/server/application/errors";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";
import { listIncidents } from "@/features/incidents/server";
import { getIncidentCapabilities } from "@/features/incidents/server/capabilities";
import { IncidentList } from "@/features/incidents/components/incident-list";
import { CreateIncidentForm } from "@/features/incidents/components/create-incident-form";

export default async function WorkspacePage({ params }: { params: Promise<{ organizationId: string }> }) {
  let data;
  let failure: "signin" | "notfound" | "unavailable" | undefined;
  try {
    const identity = await requireApplicationIdentity(await headers());
    const context = await resolveTrustedActorContext(identity, (await params).organizationId);
    const incidents = await listIncidents(context, {});
    const capabilities = await getIncidentCapabilities(context);
    data = { organizationId: context.organizationId, incidents, capabilities };
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "UNAUTHENTICATED") failure = "signin";
    else if (error instanceof ApplicationError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")) failure = "notfound";
    else failure = "unavailable";
  }
  // Next.js control-flow exceptions must not be swallowed by the data-loading catch.
  if (failure === "signin") redirect("/sign-in");
  if (failure === "notfound") notFound();
  if (!data) return <main className="mx-auto w-full max-w-5xl px-4 py-8"><h1 className="text-2xl font-semibold">Workspace unavailable</h1><p role="alert" className="mt-4">Incidents could not be loaded. Please try again later.</p><Link href="/workspaces" className="mt-4 inline-block underline">Back to workspaces</Link></main>;
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <Link href="/workspaces" className="underline focus-visible:outline-2 focus-visible:outline-offset-2">Back to workspaces</Link>
    <h1 className="mb-6 mt-4 text-3xl font-semibold">Workspace incidents</h1>
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <IncidentList page={data.incidents} canCreateIncident={data.capabilities.canCreateIncident}/>
      {data.capabilities.canCreateIncident ? <CreateIncidentForm organizationId={data.organizationId}/> : <section aria-labelledby="access-heading"><h2 id="access-heading" className="text-xl font-semibold">Read-only access</h2><p className="mt-2">You can view incidents. Creating incidents is unavailable for your current workspace access.</p></section>}
    </div>
  </main>;
}
