import "server-only";
import type { CommentKind, IncidentEvidenceType, InvestigationNoteDto, IncidentEvidenceDto } from "../investigation-contracts";

export const investigationNoteSelect = { id: true, body: true, kind: true, createdAt: true } as const;
export const incidentEvidenceSelect = { id: true, type: true, title: true, content: true, sourceUrl: true, createdAt: true } as const;
export function toInvestigationNoteDto(row: { id: string; body: string; kind: CommentKind; createdAt: Date }): InvestigationNoteDto {
  return { id: row.id, body: row.body, kind: row.kind, createdAt: row.createdAt.toISOString() };
}
export function toIncidentEvidenceDto(row: { id: string; type: IncidentEvidenceType; title: string; content: string; sourceUrl: string | null; createdAt: Date }): IncidentEvidenceDto {
  // Supported V1 application path is human submission; this is not a truth claim or DB origin column.
  return { id: row.id, type: row.type, title: row.title, content: row.content, sourceUrl: row.sourceUrl, createdAt: row.createdAt.toISOString(), origin: "HUMAN_SUPPLIED" };
}
