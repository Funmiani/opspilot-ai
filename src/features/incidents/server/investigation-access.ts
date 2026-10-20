import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ApplicationError } from "@/server/application/errors";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import { incidentIdSchema } from "../schemas";
import { canReadInvestigation } from "./permissions";

export function investigationParentId(context: TrustedActorContext, incidentId: unknown): string {
  if (!context?.actor?.userId || !context.organizationId) throw new ApplicationError("UNAUTHENTICATED", "Verified actor context is required.");
  const parsed = incidentIdSchema.safeParse(incidentId);
  if (!parsed.success) throw new ApplicationError("NOT_FOUND", "Resource not found.");
  return parsed.data;
}
export async function requireInvestigationAccess(tx: Prisma.TransactionClient, context: TrustedActorContext, incidentId: string) {
  const member = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actor.userId } },
    select: { id: true, role: true, status: true, user: { select: { deactivatedAt: true } }, organization: { select: { archivedAt: true } } },
  });
  if (!member || member.status !== "ACTIVE" || !canReadInvestigation(member.role) || member.user.deactivatedAt !== null || member.organization.archivedAt !== null) {
    throw new ApplicationError("NOT_FOUND", "Resource not found.");
  }
  const incident = await tx.incident.findFirst({ where: { organizationId: context.organizationId, id: incidentId, archivedAt: null }, select: { id: true } });
  if (!incident) throw new ApplicationError("NOT_FOUND", "Resource not found.");
  return member;
}
export function investigationFailure(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  const code = error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const unavailable = !!code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
  throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR", "The investigation operation could not be completed.", undefined, { cause: error });
}
