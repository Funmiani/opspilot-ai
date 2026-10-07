import "server-only";
import type { CreateIncidentResponse, IncidentSeverity } from "../contracts";

type CreatedIncident = {
  id: string; title: string; description: string | null; severity: IncidentSeverity;
  createdAt: Date; updatedAt: Date;
};
export function toCreatedIncidentDto(incident: CreatedIncident): CreateIncidentResponse {
  return {
    id: incident.id,
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    status: "OPEN",
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}
