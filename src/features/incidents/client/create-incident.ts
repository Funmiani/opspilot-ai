import { createIncidentSchema } from "../schemas";
import type { CreateIncidentInput } from "../contracts";

export type FieldErrors = Partial<Record<"title" | "description" | "severity", string>>;
export type CreateOutcome =
  | { ok: true }
  | { ok: false; message: string; href?: "/sign-in" | "/workspaces"; refresh?: true };

export function prepareIncidentInput(raw: unknown):
  | { ok: true; payload: CreateIncidentInput }
  | { ok: false; fields: FieldErrors } {
  const parsed = createIncidentSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "title") fields.title = "Enter a title between 1 and 200 characters.";
      if (field === "description") fields.description = "Description must be at most 10,000 characters.";
      if (field === "severity") fields.severity = "Choose a valid severity.";
    }
    return { ok: false, fields };
  }
  return { ok: true, payload: {
    title: parsed.data.title,
    ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
    severity: parsed.data.severity,
  } };
}

export function createFeedback(status: number): CreateOutcome {
  switch (status) {
    case 201: return { ok: true };
    case 400: return { ok: false, message: "The incident input was rejected. Check the fields and try again." };
    case 401: return { ok: false, message: "Your session is unavailable. Sign in to continue.", href: "/sign-in" };
    case 403: return { ok: false, message: "You no longer have permission to create incidents in this workspace.", refresh: true };
    case 404: return { ok: false, message: "Workspace access is unavailable.", href: "/workspaces" };
    case 503: return { ok: false, message: "The service is temporarily unavailable. Please try again later." };
    default: return { ok: false, message: "The incident could not be created. Please check the list before retrying." };
  }
}

export async function submitIncident(organizationId: string, payload: CreateIncidentInput, send: typeof fetch = fetch): Promise<CreateOutcome> {
  try {
    const response = await send(`/api/workspaces/${encodeURIComponent(organizationId)}/incidents`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ title: payload.title, ...(payload.description === undefined ? {} : { description: payload.description }), severity: payload.severity }),
    });
    // Status is sufficient. Never display raw response bodies or server messages.
    return createFeedback(response.status);
  } catch {
    return { ok: false, message: "The outcome could not be confirmed. Check the incident list before retrying." };
  }
}
