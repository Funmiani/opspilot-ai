import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApplicationError } from "@/server/application/errors";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import type { IncidentDto, IncidentListResponse } from "../contracts";
import { incidentIdSchema } from "../schemas";
import { encodeIncidentCursor } from "../pagination";
import { listIncidentsQuerySchema } from "./read-schemas";
import { canReadIncident } from "./permissions";
import { toIncidentDto } from "./incident-dto";

const select = { id: true, title: true, description: true, severity: true, status: true, createdAt: true, updatedAt: true } as const;
const notFound = () => new ApplicationError("NOT_FOUND", "Resource not found.");
function requireContext(context: TrustedActorContext) {
  if (!context?.actor?.userId || !context.organizationId) throw new ApplicationError("UNAUTHENTICATED", "Verified actor context is required.");
}
async function authorize(tx: Prisma.TransactionClient, context: TrustedActorContext) {
  const membership = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: context.organizationId, userId: context.actor.userId } },
    select: { status: true, role: true, user: { select: { deactivatedAt: true } }, organization: { select: { archivedAt: true } } },
  });
  if (!membership || membership.status !== "ACTIVE" || !canReadIncident(membership.role) ||
    membership.user.deactivatedAt !== null || membership.organization.archivedAt !== null) throw notFound();
}
function databaseFailure(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  const code = error instanceof Prisma.PrismaClientInitializationError ? error.errorCode :
    error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const unavailable = !!code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
  throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
    "Incidents could not be read.", undefined, { cause: error });
}

export function makeIncidentReads(db: PrismaClient) {
  return {
    async listIncidents(context: TrustedActorContext, query: unknown): Promise<IncidentListResponse> {
      requireContext(context);
      const parsed = listIncidentsQuerySchema.safeParse(query);
      if (!parsed.success) throw new ApplicationError("VALIDATION_FAILED", "The pagination query is invalid.");
      const { limit, cursor } = parsed.data;
      try {
        // Normal short transaction: rechecks authority, without promising concurrent-revocation serialization.
        return await db.$transaction(async tx => {
          await authorize(tx, context);
          const rows = await tx.incident.findMany({
            where: { organizationId: context.organizationId, archivedAt: null,
              ...(cursor ? { OR: [ { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } } ] } : {}) },
            select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
          });
          const items = rows.slice(0, limit);
          return { items: items.map(toIncidentDto), nextCursor: rows.length > limit ? encodeIncidentCursor(items[items.length - 1]) : null };
        });
      } catch (error) { return databaseFailure(error); }
    },
    async getIncident(context: TrustedActorContext, incidentId: unknown): Promise<IncidentDto> {
      requireContext(context);
      const parsed = incidentIdSchema.safeParse(incidentId);
      if (!parsed.success) throw notFound();
      try {
        return await db.$transaction(async tx => {
          await authorize(tx, context);
          const row = await tx.incident.findFirst({
            where: { organizationId: context.organizationId, id: parsed.data, archivedAt: null }, select,
          });
          if (!row) throw notFound();
          return toIncidentDto(row);
        });
      } catch (error) { return databaseFailure(error); }
    },
  };
}
