export const incidentSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IncidentSeverity = (typeof incidentSeverities)[number];
export type CreateIncidentInput = { title: string; description?: string; severity: IncidentSeverity };
export type CreateIncidentResponse = {
  id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: "OPEN";
  createdAt: string;
  updatedAt: string;
};
export type IncidentCreatedDetails = { version: 1; initialStatus: "OPEN"; severity: IncidentSeverity };
