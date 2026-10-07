import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApplicationError } from "@/server/application/errors";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import type { CreateIncidentResponse, IncidentCreatedDetails } from "../contracts";
import { createIncidentSchema } from "../schemas";
import { canCreateIncident } from "./permissions";
import { toCreatedIncidentDto } from "./incident-dto";

// Compose this factory with the server-only database client. It provides no identity
// resolver: callers must obtain context from a verified server-side adapter.
export function makeCreateIncident(db: PrismaClient) {
  return async function createIncident(
    context: TrustedActorContext | null,
    rawInput: unknown,
  ): Promise<CreateIncidentResponse> {
    if (!context?.actor?.userId || !context.organizationId) {
      throw new ApplicationError("UNAUTHENTICATED", "Verified actor context is required.");
    }
    const parsed = createIncidentSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ApplicationError("VALIDATION_FAILED", "The incident input is invalid.",
        parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })));
    }
    const input = parsed.data;
    try {
      return await db.$transaction(async (tx) => {
        const membership = await tx.organizationMember.findUnique({
          where: { organizationId_userId: {
            organizationId: context.organizationId, userId: context.actor.userId,
          } },
          select: { id: true, organizationId: true, status: true, role: true,
            user: { select: { deactivatedAt: true } },
            organization: { select: { archivedAt: true } },
          },
        });
        // A missing membership also covers an unknown organization without revealing
        // tenant existence. Required relations ensure the organization/user exist.
        if (!membership || membership.status !== "ACTIVE" ||
          membership.user.deactivatedAt !== null || membership.organization.archivedAt !== null ||
          !canCreateIncident(membership.role)) {
          throw new ApplicationError("FORBIDDEN", "You cannot create an incident in this organization.");
        }
        const incident = await tx.incident.create({
          data: {
            organizationId: membership.organizationId,
            createdByMemberId: membership.id,
            title: input.title,
            description: input.description ?? null,
            severity: input.severity,
            status: "OPEN",
          },
          select: { id: true, title: true, description: true, severity: true, createdAt: true, updatedAt: true },
        });
        const details: IncidentCreatedDetails = {
          version: 1, initialStatus: "OPEN", severity: incident.severity,
        };
        await tx.activityLog.create({ data: {
          organizationId: membership.organizationId,
          incidentId: incident.id,
          actorMemberId: membership.id,
          actorType: "USER",
          eventType: "INCIDENT_CREATED",
          details,
        } });
        return toCreatedIncidentDto(incident);
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      const code = error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      // Classify only recognized availability failures, never message text.
      // Authentication/configuration errors and unknown codes remain internal.
      const unavailable = code !== undefined &&
        ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
      throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        unavailable ? "The database is temporarily unavailable." : "The incident could not be created.",
        undefined, { cause: error });
    }
  };
}
