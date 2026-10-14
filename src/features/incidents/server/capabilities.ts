import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApplicationError } from "@/server/application/errors";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import { canCreateIncident, canReadIncident } from "./permissions";

// Presentation only: the create use case always independently authorizes writes.
export function makeIncidentCapabilities(db: PrismaClient) {
  return async (context: TrustedActorContext): Promise<Readonly<{ canCreateIncident: boolean }>> => {
    if (!context?.actor?.userId || !context.organizationId) {
      throw new ApplicationError("UNAUTHENTICATED", "Verified actor context is required.");
    }
    try {
      const membership = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actor.userId } },
        select: { status: true, role: true, user: { select: { deactivatedAt: true } }, organization: { select: { archivedAt: true } } },
      });
      if (!membership || membership.status !== "ACTIVE" || !canReadIncident(membership.role) ||
        membership.user.deactivatedAt !== null || membership.organization.archivedAt !== null) {
        throw new ApplicationError("NOT_FOUND", "Resource not found.");
      }
      return { canCreateIncident: canCreateIncident(membership.role) };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      const code = error instanceof Prisma.PrismaClientInitializationError ? error.errorCode :
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const unavailable = !!code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
      throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        "Workspace capabilities could not be checked.", undefined, { cause: error });
    }
  };
}

export async function getIncidentCapabilities(context: TrustedActorContext) {
  const { prisma } = await import("@/server/db/client");
  return makeIncidentCapabilities(prisma)(context);
}
