import "server-only";
import { ApplicationError } from "@/server/application/errors";
import { Prisma } from "@/generated/prisma/client";
import { getAuth } from "./auth";

export type ApplicationIdentity = Readonly<{ userId: string }>;

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string }; session: { expiresAt: Date } } | null>;
  findUser: (id: string) => Promise<{ id: string; deactivatedAt: Date | null } | null>;
};

export function makeRequireApplicationIdentity(deps: Dependencies) {
  return async (headers: Headers): Promise<ApplicationIdentity> => {
    try {
      const verified = await deps.getSession(headers);
      if (!verified || verified.session.expiresAt.getTime() <= Date.now()) {
        throw new ApplicationError("UNAUTHENTICATED", "A valid session is required.");
      }
      const user = await deps.findUser(verified.user.id);
      if (!user || user.deactivatedAt !== null) {
        throw new ApplicationError("FORBIDDEN", "Application access is unavailable.");
      }
      return { userId: user.id };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      const code = error instanceof Prisma.PrismaClientInitializationError ? error.errorCode :
        error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
      const unavailable = !!code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code);
      throw new ApplicationError(unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        "The session could not be verified.", undefined, { cause: error });
    }
  };
}

export const requireApplicationIdentity = makeRequireApplicationIdentity({
  getSession: async (headers) => (await getAuth()).api.getSession({ headers }),
  findUser: async (id) => {
    const { prisma } = await import("@/server/db/client");
    return prisma.user.findUnique({ where: { id }, select: { id: true, deactivatedAt: true } });
  },
});
