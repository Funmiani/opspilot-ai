import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ApplicationError } from "@/server/application/errors";
import type { TrustedActorContext } from "@/server/application/trusted-context";
import type { ApplicationIdentity } from "@/server/auth/session";
import type { WorkspaceSummary } from "../contracts";
import { z } from "zod";

const organizationIdSchema = z.uuid();
const deny = () => new ApplicationError("FORBIDDEN", "Workspace access is unavailable.");
function databaseFailure(error: unknown): never {
  if (error instanceof ApplicationError) throw error;
  const code = error instanceof Prisma.PrismaClientInitializationError ? error.errorCode :
    error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const unavailable = !!code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
  throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
    "Workspace access could not be checked.", undefined, { cause: error });
}
function requireIdentity(identity: ApplicationIdentity) {
  if (!identity?.userId) throw new ApplicationError("UNAUTHENTICATED", "A verified application identity is required.");
}

export function makeWorkspaceAccess(db: PrismaClient) {
  return {
    async listAccessibleWorkspaces(identity: ApplicationIdentity): Promise<WorkspaceSummary[]> {
      requireIdentity(identity);
      try {
        // One parent query rechecks availability and loads only accessible memberships.
        // Prisma may issue multiple SQL statements for relation loading; no cached authority.
        const user = await db.user.findUnique({
          where: { id: identity.userId },
          select: { deactivatedAt: true, memberships: {
            where: { status: "ACTIVE", organization: { archivedAt: null } },
            select: { organization: { select: { id: true, name: true } } },
            orderBy: [{ organization: { name: "asc" } }, { organizationId: "asc" }],
          } },
        });
        if (!user || user.deactivatedAt !== null) throw deny();
        return user.memberships.map(({ organization }) => ({ organizationId: organization.id, name: organization.name }));
      } catch (error) { return databaseFailure(error); }
    },
    async resolveTrustedActorContext(identity: ApplicationIdentity, requestedOrganizationId: unknown): Promise<TrustedActorContext> {
      requireIdentity(identity);
      const parsed = organizationIdSchema.safeParse(requestedOrganizationId);
      if (!parsed.success) throw deny();
      try {
        const membership = await db.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: parsed.data, userId: identity.userId } },
          select: { userId: true, organizationId: true, status: true,
            user: { select: { deactivatedAt: true } }, organization: { select: { archivedAt: true } } },
        });
        if (!membership || membership.status !== "ACTIVE" || membership.user.deactivatedAt !== null || membership.organization.archivedAt !== null) throw deny();
        return { actor: { userId: membership.userId }, organizationId: membership.organizationId };
      } catch (error) { return databaseFailure(error); }
    },
  };
}

// Production composition uses only the existing server-side singleton.
export async function listAccessibleWorkspaces(identity: ApplicationIdentity) {
  const { prisma } = await import("@/server/db/client");
  return makeWorkspaceAccess(prisma).listAccessibleWorkspaces(identity);
}
export async function resolveTrustedActorContext(identity: ApplicationIdentity, requestedOrganizationId: unknown) {
  const { prisma } = await import("@/server/db/client");
  return makeWorkspaceAccess(prisma).resolveTrustedActorContext(identity, requestedOrganizationId);
}
