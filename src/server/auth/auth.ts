import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@/generated/prisma/client";
import { readAuthEnv } from "./env";

// Used for composition and local integration tests; never accepts browser input.
export function createAuthOptions(db: PrismaClient, env: ReturnType<typeof readAuthEnv>) {
  const clearCredentials = async () => ({ data: {
    accessToken: null, refreshToken: null, idToken: null,
    accessTokenExpiresAt: null, refreshTokenExpiresAt: null,
  } });
  return {
    appName: "OpsPilot",
    secret: env.secret,
    baseURL: env.origin,
    basePath: "/api/auth",
    trustedOrigins: [env.origin],
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: { fields: { name: "displayName" }, deleteUser: { enabled: false } },
    advanced: { database: { generateId: "uuid" }, useSecureCookies: env.origin.startsWith("https://") },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { accountLinking: { disableImplicitLinking: true }, storeAccountCookie: false,
      storeStateStrategy: "database", encryptOAuthTokens: true },
    databaseHooks: {
      account: { create: { before: clearCredentials }, update: { before: clearCredentials } },
      session: { create: { before: async (session) => {
        const user = await db.user.findUnique({ where: { id: session.userId }, select: { deactivatedAt: true } });
        return !!user && user.deactivatedAt === null;
      } } },
    },
  } satisfies BetterAuthOptions;
}

// Lazy initialization avoids requiring auth secrets during unrelated static builds.
// Every actual auth use validates configuration and fails closed.
let instance: ReturnType<typeof betterAuth<ReturnType<typeof createAuthOptions>>> | undefined;
export async function getAuth() {
  const env = readAuthEnv();
  const { prisma } = await import("@/server/db/client");
  return instance ??= betterAuth(createAuthOptions(prisma, env));
}
