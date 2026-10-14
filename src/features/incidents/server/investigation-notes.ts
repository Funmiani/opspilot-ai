import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import { ApplicationError } from "@/server/application/errors";
import type { InvestigationNoteDto, InvestigationNotePage, NoteAddedDetails } from "../investigation-contracts";
import { addInvestigationNoteSchema } from "../investigation-schemas";
import { encodeIncidentPositionCursor } from "../pagination";
import { incidentCollectionQuerySchema } from "./read-schemas";
import { investigationParentId, requireInvestigationAccess, investigationFailure } from "./investigation-access";
import { investigationNoteSelect, toInvestigationNoteDto } from "./investigation-dto";
import { canAddInvestigationNote } from "./permissions";

export function makeInvestigationNotes(db: PrismaClient) {
  return {
    async addInvestigationNote(context: TrustedActorContext, rawIncidentId: unknown, input: unknown): Promise<InvestigationNoteDto> {
      const incidentId = investigationParentId(context, rawIncidentId);
      const parsed = addInvestigationNoteSchema.safeParse(input);
      if (!parsed.success) throw new ApplicationError("VALIDATION_FAILED", "The investigation note input is invalid.");
      try {
        return await db.$transaction(async tx => {
          const member = await requireInvestigationAccess(tx, context, incidentId);
          if (!canAddInvestigationNote(member.role)) throw new ApplicationError("FORBIDDEN", "This operation is not permitted.");
          const note = await tx.comment.create({ data: { organizationId: context.organizationId, incidentId, authorMemberId: member.id, body: parsed.data.body, kind: parsed.data.kind }, select: investigationNoteSelect });
          const details: NoteAddedDetails = { version: 1, commentId: note.id, kind: note.kind };
          await tx.activityLog.create({ data: { organizationId: context.organizationId, incidentId, actorMemberId: member.id, actorType: "USER", eventType: "COMMENT_ADDED", details } });
          return toInvestigationNoteDto(note);
        });
      } catch (error) { return investigationFailure(error); }
    },
    async listInvestigationNotes(context: TrustedActorContext, rawIncidentId: unknown, query: unknown): Promise<InvestigationNotePage> {
      const incidentId = investigationParentId(context, rawIncidentId);
      const parsed = incidentCollectionQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApplicationError("VALIDATION_FAILED", "The pagination query is invalid.");
      const { limit, cursor } = parsed.data;
      try {
        return await db.$transaction(async tx => {
          await requireInvestigationAccess(tx, context, incidentId);
          const rows = await tx.comment.findMany({ where: { organizationId: context.organizationId, incidentId,
            ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
            select: investigationNoteSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
          const items = rows.slice(0, limit);
          return { items: items.map(toInvestigationNoteDto), nextCursor: rows.length > limit ? encodeIncidentPositionCursor(items[items.length - 1]) : null };
        });
      } catch (error) { return investigationFailure(error); }
    },
  };
}
