import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { makeWorkspaceAccess } from "../../src/features/workspaces/server/access";
import { ApplicationError } from "../../src/server/application/errors";
config({ quiet: true });
const url = process.env.INTEGRATION_DATABASE_URL;
test("workspace discovery, tenant verification, revocation and isolated cleanup", { skip: !url }, async () => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url!).hostname));
  const db = new PrismaClient({adapter: new PrismaPg({connectionString: url!})});
  const userId = randomUUID(), otherUserId = randomUUID();
  const organizations = Array.from({length: 6}, () => randomUUID());
  const identity = {userId}; const access = makeWorkspaceAccess(db);
  const denied = (e: unknown) => e instanceof ApplicationError && e.code === "FORBIDDEN" && e.message === "Workspace access is unavailable.";
  try {
    await db.user.createMany({data: [userId, otherUserId].map(id => ({id, email: `${id}@example.invalid`}))});
    assert.deepEqual(await access.listAccessibleWorkspaces(identity), []);
    await db.organization.createMany({data: organizations.map((id, i) => ({id, name: `Workspace ${i}`, slug: id, archivedAt: i === 4 ? new Date() : null}))});
    const first = await db.organizationMember.create({data: {userId, organizationId: organizations[0], role: "VIEWER"}});
    assert.deepEqual(await access.listAccessibleWorkspaces(identity), [{organizationId: organizations[0], name: "Workspace 0"}]);
    assert.deepEqual(await access.resolveTrustedActorContext(identity, organizations[0]), {actor: {userId}, organizationId: organizations[0]});
    await db.organizationMember.createMany({data: [
      {userId, organizationId: organizations[1], status: "ACTIVE"},
      {userId, organizationId: organizations[2], status: "SUSPENDED"},
      {userId, organizationId: organizations[3], status: "REVOKED"},
      {userId, organizationId: organizations[4], status: "ACTIVE"},
      {userId: otherUserId, organizationId: organizations[5], status: "ACTIVE"},
    ]});
    assert.deepEqual(await access.listAccessibleWorkspaces(identity), [0,1].map(i => ({organizationId: organizations[i], name: `Workspace ${i}`})));
    for (const id of ["invalid", randomUUID(), ...organizations.slice(2)]) await assert.rejects(access.resolveTrustedActorContext(identity,id), denied);
    // Same authenticated identity survives; its database authority changes immediately.
    await db.organizationMember.update({where: {id: first.id}, data: {status: "REVOKED"}});
    await assert.rejects(access.resolveTrustedActorContext(identity,organizations[0]), denied);
    assert.deepEqual(await access.listAccessibleWorkspaces(identity), [{organizationId: organizations[1], name: "Workspace 1"}]);
    await db.user.update({where: {id: userId}, data: {deactivatedAt: new Date()}});
    await assert.rejects(access.listAccessibleWorkspaces(identity), denied);
    await assert.rejects(access.resolveTrustedActorContext(identity,organizations[1]), denied);
    await assert.rejects(access.listAccessibleWorkspaces({userId: randomUUID()}), denied);
  } finally {
    try {
      await db.$transaction(async tx => {
        await tx.organizationMember.deleteMany({where: {organizationId: {in: organizations}, userId: {in: [userId,otherUserId]}}});
        await tx.organization.deleteMany({where: {id: {in: organizations}}});
        await tx.user.deleteMany({where: {id: {in: [userId,otherUserId]}}});
      });
      assert.equal(await db.organization.count({where: {id: {in: organizations}}}),0);
      assert.equal(await db.user.count({where: {id: {in: [userId,otherUserId]}}}),0);
      assert.equal(await db.organizationMember.count({where: {userId: {in: [userId,otherUserId]}}}),0);
    } finally {await db.$disconnect();}
  }
});
