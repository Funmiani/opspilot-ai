import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import { ApplicationError } from "@/server/application/errors";
import type { IncidentEvidenceDto, IncidentEvidencePage, EvidenceAddedDetails } from "../investigation-contracts";
import { addIncidentEvidenceSchema } from "../investigation-schemas";
import { encodeIncidentPositionCursor } from "../pagination";
import { incidentCollectionQuerySchema } from "./read-schemas";
import { investigationParentId, requireInvestigationAccess, investigationFailure } from "./investigation-access";
import { incidentEvidenceSelect, toIncidentEvidenceDto } from "./investigation-dto";
import { canAddIncidentEvidence } from "./permissions";

export function makeIncidentEvidence(db: PrismaClient) {
  return {
    async addIncidentEvidence(context: TrustedActorContext, rawIncidentId: unknown, input: unknown): Promise<IncidentEvidenceDto> {
      const incidentId = investigationParentId(context, rawIncidentId);
      const parsed = addIncidentEvidenceSchema.safeParse(input);
      if (!parsed.success) throw new ApplicationError("VALIDATION_FAILED", "The incident evidence input is invalid.");
      try {
        return await db.$transaction(async tx => {
          const member = await requireInvestigationAccess(tx, context, incidentId);
          if (!canAddIncidentEvidence(member.role)) throw new ApplicationError("FORBIDDEN", "This operation is not permitted.");
          const evidence = await tx.incidentEvidence.create({ data: { organizationId: context.organizationId, incidentId, createdByMemberId: member.id, type: parsed.data.type, title: parsed.data.title, content: parsed.data.content, sourceUrl: parsed.data.sourceUrl ?? null }, select: incidentEvidenceSelect });
          const details: EvidenceAddedDetails = { version: 1, evidenceId: evidence.id, type: evidence.type };
          await tx.activityLog.create({ data: { organizationId: context.organizationId, incidentId, actorMemberId: member.id, actorType: "USER", eventType: "EVIDENCE_ADDED", details } });
          return toIncidentEvidenceDto(evidence);
        });
      } catch (error) { return investigationFailure(error); }
    },
    async listIncidentEvidence(context: TrustedActorContext, rawIncidentId: unknown, query: unknown): Promise<IncidentEvidencePage> {
      const incidentId = investigationParentId(context, rawIncidentId);
      const parsed = incidentCollectionQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApplicationError("VALIDATION_FAILED", "The pagination query is invalid.");
      const { limit, cursor } = parsed.data;
      try {
        return await db.$transaction(async tx => {
          await requireInvestigationAccess(tx, context, incidentId);
          const rows = await tx.incidentEvidence.findMany({ where: { organizationId: context.organizationId, incidentId,
            ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
            select: incidentEvidenceSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
          const items = rows.slice(0, limit);
          return { items: items.map(toIncidentEvidenceDto), nextCursor: rows.length > limit ? encodeIncidentPositionCursor(items[items.length - 1]) : null };
        });
      } catch (error) { return investigationFailure(error); }
    },
  };
}
