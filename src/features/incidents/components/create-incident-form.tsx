"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { incidentSeverities, type IncidentSeverity } from "../contracts";
import { prepareIncidentInput, submitIncident, type FieldErrors, type CreateOutcome } from "../client/create-incident";

export function CreateIncidentForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const severityRef = useRef<HTMLSelectElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("MEDIUM");
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const controlClass = "mt-1 w-full rounded-md border border-gray-500 bg-transparent px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const input = prepareIncidentInput({ title, description, severity });
    setOutcome(null);
    if (!input.ok) {
      setFields(input.fields);
      if (input.fields.title) titleRef.current?.focus();
      else if (input.fields.description) descriptionRef.current?.focus();
      else severityRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true); setFields({});
    try {
      const result = await submitIncident(organizationId, input.payload);
      setOutcome(result);
      if (result.ok) { setTitle(""); setDescription(""); setSeverity("MEDIUM"); }
      if (result.ok || result.refresh) router.refresh();
    } finally { inFlight.current = false; setPending(false); }
  }
  return <section aria-labelledby="create-heading" className="rounded-lg border border-gray-400/40 p-5">
    <h2 id="create-heading" className="text-xl font-semibold">Create incident</h2>
    <form noValidate onSubmit={submit} className="mt-4">
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <legend className="sr-only">Incident information</legend>
        <div><label htmlFor="incident-title" className="font-medium">Title (required)</label>
          <input ref={titleRef} id="incident-title" name="title" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} aria-invalid={!!fields.title} aria-describedby={fields.title ? "title-error" : undefined} className={controlClass}/>
          {fields.title && <p id="title-error" role="alert" className="mt-1">{fields.title}</p>}</div>
        <div><label htmlFor="incident-description" className="font-medium">Description (optional)</label>
          <textarea ref={descriptionRef} id="incident-description" name="description" rows={4} maxLength={10_000} value={description} onChange={event => setDescription(event.target.value)} aria-invalid={!!fields.description} aria-describedby={fields.description ? "description-error" : undefined} className={controlClass}/>
          {fields.description && <p id="description-error" role="alert" className="mt-1">{fields.description}</p>}</div>
        <div><label htmlFor="incident-severity" className="font-medium">Severity (required)</label>
          <select ref={severityRef} id="incident-severity" name="severity" required value={severity} onChange={event => setSeverity(event.target.value as IncidentSeverity)} aria-invalid={!!fields.severity} aria-describedby={fields.severity ? "severity-error" : undefined} className={controlClass}>
            {incidentSeverities.map(value => <option key={value} value={value}>{value}</option>)}</select>
          {fields.severity && <p id="severity-error" role="alert" className="mt-1">{fields.severity}</p>}</div>
        <button type="submit" disabled={pending} className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-wait">{pending ? "Creating incident…" : "Create incident"}</button>
      </fieldset>
      {outcome && !outcome.ok && <div role="alert" className="mt-4"><p>{outcome.message}</p>{outcome.href && <Link href={outcome.href} className="mt-2 inline-block underline">{outcome.href === "/sign-in" ? "Sign in" : "Back to workspaces"}</Link>}</div>}
      <p aria-live="polite" className="mt-4">{outcome?.ok ? "Incident created successfully." : ""}</p>
    </form>
  </section>;
}
