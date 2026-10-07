import { z } from "zod";
import type { PrismaClient } from "../src/generated/prisma/client";

const inputSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
});
export function parseBootstrapArgs(args: string[]) {
  const fields: Record<string, string> = {};
  const keys: Record<string, string> = { "--user-id": "userId", "--name": "name", "--slug": "slug", "--role": "role" };
  for (let i = 0; i < args.length; i += 2) {
    const key = keys[args[i]]; const value = args[i + 1];
    if (!key || key in fields || !value || value.startsWith("--")) throw new Error("Supply each required bootstrap argument exactly once.");
    fields[key] = value;
  }
  const result = inputSchema.safeParse(fields);
  if (!result.success) throw new Error("Invalid bootstrap inputs: UUID, name (1–100 characters), lowercase hyphenated slug (1–100 characters), and explicit role are required.");
  return result.data;
}
export function checkLocalDevelopment(env: Record<string, string | undefined>) {
  if (env.NODE_ENV !== "development") throw new Error("Bootstrap requires NODE_ENV=development.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("A parseable local PostgreSQL target is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !/^\/[^/]+$/.test(url.pathname) || url.hash ||
      [...url.searchParams.keys()].some(key => key !== "schema")) {
    throw new Error("Bootstrap requires a loopback PostgreSQL target with no connection-routing overrides.");
  }
  // Loopback is a host check, not proof against tunnels; restrict conventional
  // production/staging database names as an additional administrative safeguard.
  if (/prod|stag/i.test(decodeURIComponent(url.pathname))) throw new Error("Production/staging database targets are prohibited.");
  return url;
}
export async function bootstrapDevWorkspace(db: PrismaClient, args: string[], env: Record<string, string | undefined>) {
  checkLocalDevelopment(env);
  const input = parseBootstrapArgs(args);
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({where: {id: input.userId}, select: {deactivatedAt: true}});
    if (!user || user.deactivatedAt !== null) throw new Error("An existing active User is required.");
    if (await tx.organization.findUnique({where: {slug: input.slug}, select: {id: true}})) throw new Error("Organization slug already exists; no access was granted.");
    const organization = await tx.organization.create({data: {name: input.name, slug: input.slug}, select: {id: true, name: true}});
    await tx.organizationMember.create({data: {organizationId: organization.id, userId: input.userId, role: input.role, status: "ACTIVE"}});
    return {...organization, role: input.role};
  });
}
