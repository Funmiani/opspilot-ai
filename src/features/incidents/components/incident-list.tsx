import "server-only";
import type { IncidentListResponse } from "../contracts";

const formatDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
export function IncidentList({ page, canCreateIncident }: { page: IncidentListResponse; canCreateIncident: boolean }) {
  return <section aria-labelledby="incidents-heading">
    <h2 id="incidents-heading" className="mb-4 text-xl font-semibold">Incidents</h2>
    {page.items.length === 0 ? <div className="rounded-lg border border-gray-400/40 p-5">
      <p className="font-medium">No incidents yet.</p>
      <p className="mt-2">{canCreateIncident ? "Use the create form to report the first incident." : "You have read-only access. An authorized workspace member can create an incident."}</p>
    </div> : <ul className="space-y-4">{page.items.map(incident => <li key={incident.id} className="min-w-0 rounded-lg border border-gray-400/40 p-5">
      <h3 className="break-words text-lg font-semibold">{incident.title}</h3>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>Severity: {incident.severity}</span><span>Status: {incident.status}</span></p>
      {incident.description && <p className="mt-3 whitespace-pre-wrap break-words">{incident.description.length > 300 ? `${incident.description.slice(0, 300)}…` : incident.description}</p>}
      <p className="mt-3 text-sm">Created <time dateTime={incident.createdAt}>{formatDate(incident.createdAt)} UTC</time></p>
      {incident.updatedAt !== incident.createdAt && <p className="mt-1 text-sm">Updated <time dateTime={incident.updatedAt}>{formatDate(incident.updatedAt)} UTC</time></p>}
    </li>)}</ul>}
    {page.nextCursor && <p className="mt-4 text-sm">Showing the latest 20 incidents.</p>}
  </section>;
}
