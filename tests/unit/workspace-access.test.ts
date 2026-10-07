import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client";
import { makeWorkspaceAccess } from "../../src/features/workspaces/server/access";
import { ApplicationError } from "../../src/server/application/errors";
const identity = { userId: randomUUID() };
for (const value of [null, undefined, "bad", 42, {}, ""]) test(`untrusted tenant identifier rejected: ${JSON.stringify(value)}`, async () => {
  let calls = 0;
  const access = makeWorkspaceAccess({ organizationMember: { findUnique: async () => { calls++; } } } as unknown as PrismaClient);
  await assert.rejects(access.resolveTrustedActorContext(identity, value), e => e instanceof ApplicationError && e.code === "FORBIDDEN" && e.message === "Workspace access is unavailable.");
  assert.equal(calls, 0);
});
for (const cause of [new Error("sensitive detail"), new Prisma.PrismaClientInitializationError("sensitive detail", "7.10.0", "P1001")]) {
  test(`workspace database failures fail closed: ${cause.name}`, async () => {
    const db = { user: { findUnique: async () => { throw cause; } }, organizationMember: { findUnique: async () => { throw cause; } } } as unknown as PrismaClient;
    const access = makeWorkspaceAccess(db);
    for (const action of [() => access.listAccessibleWorkspaces(identity), () => access.resolveTrustedActorContext(identity, randomUUID())]) {
      await assert.rejects(action(), e => e instanceof ApplicationError && e.code === (cause instanceof Prisma.PrismaClientInitializationError ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR") && e.cause === cause && !e.message.includes("sensitive"));
    }
  });
}
test("discovery rechecks user in one call and returns only contract fields", async () => {
  let calls = 0; const id = randomUUID();
  const access = makeWorkspaceAccess({ user: { findUnique: async () => { calls++; return { deactivatedAt: null, memberships: [{ organization: { id, name: "Workspace" } }] }; } } } as unknown as PrismaClient);
  assert.deepEqual(await access.listAccessibleWorkspaces(identity), [{ organizationId: id, name: "Workspace" }]); assert.equal(calls, 1);
});
test("missing verified identity rejected before database access", async () => {
  const access = makeWorkspaceAccess({} as PrismaClient);
  for (const action of [() => access.listAccessibleWorkspaces({userId: ""}), () => access.resolveTrustedActorContext({userId: ""}, randomUUID())]) await assert.rejects(action(), e => e instanceof ApplicationError && e.code === "UNAUTHENTICATED");
});
