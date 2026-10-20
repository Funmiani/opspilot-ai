export const commentKinds = ["NOTE", "HYPOTHESIS", "ACTION"] as const;
export type CommentKind = (typeof commentKinds)[number];
export const incidentEvidenceTypes = ["LOG_EXCERPT", "ERROR_MESSAGE", "DEPLOYMENT_REFERENCE", "MONITORING_ALERT", "OBSERVATION", "REFERENCE"] as const;
export type IncidentEvidenceType = (typeof incidentEvidenceTypes)[number];
export type AddInvestigationNoteInput = { body: string; kind: CommentKind };
export type AddIncidentEvidenceInput = { type: IncidentEvidenceType; title: string; content: string; sourceUrl?: string };
export type InvestigationNoteDto = Readonly<{ id: string; body: string; kind: CommentKind; createdAt: string }>;
export type IncidentEvidenceDto = Readonly<{
  id: string; type: IncidentEvidenceType; title: string; content: string;
  sourceUrl: string | null; createdAt: string; origin: "HUMAN_SUPPLIED";
}>;
export type InvestigationNotePage = Readonly<{ items: InvestigationNoteDto[]; nextCursor: string | null }>;
export type IncidentEvidencePage = Readonly<{ items: IncidentEvidenceDto[]; nextCursor: string | null }>;
export type NoteAddedDetails = { version: 1; commentId: string; kind: CommentKind };
export type EvidenceAddedDetails = { version: 1; evidenceId: string; type: IncidentEvidenceType };
