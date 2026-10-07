import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { makeCreateIncident } from "../../src/features/incidents/server/create-incident";
import { ApplicationError } from "../../src/server/application/errors";

config({ quiet: true });
// Explicit opt-in: never automatically run integration writes against DATABASE_URL.
const url = process.env.INTEGRATION_DATABASE_URL;
test("Create Incident authorization, tenant isolation, atomicity, and cleanup", { skip: !url }, async () => {
  const connection = new URL(url!);
  assert.ok(["localhost","127.0.0.1"].includes(connection.hostname), "Use a local development/test database only");
  const db = new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
  const organizationId = randomUUID(); const otherId = randomUUID(); const userId = randomUUID();
  const create = makeCreateIncident(db);
  const context = {actor:{userId},organizationId};
  const input = {title:"  Integration incident  ",severity:"HIGH"};
  const rejected = (code:string) => (error:unknown) => error instanceof ApplicationError && error.code===code;
  try {
    await db.organization.createMany({data:[{id:organizationId,name:"Temporary integration A",slug:organizationId},{id:otherId,name:"Temporary integration B",slug:otherId}]});
    await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});
    const member = await db.organizationMember.create({data:{organizationId,userId}});
    await assert.rejects(create(null,input),rejected("UNAUTHENTICATED"));
    await assert.rejects(create(context,{...input,organizationId:otherId}),rejected("VALIDATION_FAILED"));
    await assert.rejects(create({...context,organizationId:otherId},input),rejected("FORBIDDEN"));
    await assert.rejects(create({...context,organizationId:randomUUID()},input),rejected("FORBIDDEN"));
    for (const status of ["SUSPENDED","REVOKED"] as const) {
      await db.organizationMember.update({where:{id:member.id},data:{status}});
      await assert.rejects(create(context,input),rejected("FORBIDDEN"));
    }
    await db.organizationMember.update({where:{id:member.id},data:{status:"ACTIVE",role:"VIEWER"}});
    await assert.rejects(create(context,input),rejected("FORBIDDEN"));
    await db.organizationMember.update({where:{id:member.id},data:{role:"MEMBER"}});
    await db.user.update({where:{id:userId},data:{deactivatedAt:new Date()}});
    await assert.rejects(create(context,input),rejected("FORBIDDEN"));
    await db.user.update({where:{id:userId},data:{deactivatedAt:null}});
    await db.organization.update({where:{id:organizationId},data:{archivedAt:new Date()}});
    await assert.rejects(create(context,input),rejected("FORBIDDEN"));
    await db.organization.update({where:{id:organizationId},data:{archivedAt:null}});
    assert.equal(await db.incident.count({where:{organizationId}}),0);
    assert.equal(await db.activityLog.count({where:{organizationId}}),0);
    for (const role of ["MEMBER","ADMIN","OWNER"] as const) {
      await db.organizationMember.update({where:{id:member.id},data:{role}});
      const result = await create(context,input);
      assert.equal(result.title,"Integration incident"); assert.equal(result.status,"OPEN");
      assert.equal("organizationId" in result,false); assert.equal(typeof result.createdAt,"string");
      const incident = await db.incident.findUniqueOrThrow({where:{id:result.id}});
      assert.equal(incident.organizationId,organizationId); assert.equal(incident.createdByMemberId,member.id);
      const logs = await db.activityLog.findMany({where:{organizationId,incidentId:result.id}});
      assert.equal(logs.length,1); assert.equal(logs[0].actorMemberId,member.id);
      assert.equal(logs[0].actorType,"USER"); assert.equal(logs[0].eventType,"INCIDENT_CREATED");
      assert.deepEqual(logs[0].details,{version:1,initialStatus:"OPEN",severity:"HIGH"});
    }
    assert.equal(await db.incident.count({where:{organizationId:otherId}}),0);
    // A test-owned Prisma extension fails the second write, with the real transaction
    // and database intact. No test behavior is added to production code.
    const failing = db.$extends({query:{activityLog:{async create(){throw new Error("Injected activity failure");}}}});
    const before = await db.incident.count({where:{organizationId}});
    await assert.rejects(makeCreateIncident(failing as unknown as PrismaClient)(context,input),rejected("INTERNAL_ERROR"));
    assert.equal(await db.incident.count({where:{organizationId}}),before);
    assert.equal(await db.activityLog.count({where:{organizationId}}),3);
    for (const [description, expected] of [["  Persisted details  ", "Persisted details"], ["   ", null]] as const) {
      await db.organizationMember.update({where:{id:member.id},data:{role:"VIEWER"}});
      const incidentCount = await db.incident.count({where:{organizationId}});
      const activityCount = await db.activityLog.count({where:{organizationId}});
      await assert.rejects(create(context,{...input,description}),rejected("FORBIDDEN"));
      assert.equal(await db.incident.count({where:{organizationId}}),incidentCount);
      assert.equal(await db.activityLog.count({where:{organizationId}}),activityCount);
      await db.organizationMember.update({where:{id:member.id},data:{role:"MEMBER"}});
      const result = await create(context,{...input,description});
      assert.equal(result.description,expected);
      const stored = await db.incident.findUniqueOrThrow({where:{id:result.id}});
      assert.equal(stored.description,expected);
      assert.equal(await db.incident.count({where:{organizationId}}),incidentCount+1);
      assert.equal(await db.activityLog.count({where:{organizationId}}),activityCount+1);
    }
  } finally {
    try {
      await db.$transaction(async(tx)=>{
        await tx.activityLog.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});
        await tx.incident.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});
        await tx.organizationMember.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});
        await tx.user.deleteMany({where:{id:userId}});
        await tx.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});
      });
      assert.equal(await db.organization.count({where:{id:{in:[organizationId,otherId]}}}),0);
      assert.equal(await db.user.count({where:{id:userId}}),0);
    } finally { await db.$disconnect(); }
  }
});
