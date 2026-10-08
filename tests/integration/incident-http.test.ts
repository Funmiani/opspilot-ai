import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { config } from "dotenv";
import { betterAuth } from "better-auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createAuthOptions } from "../../src/server/auth/auth";
import { makeRequireApplicationIdentity } from "../../src/server/auth/session";
import { makeWorkspaceAccess } from "../../src/features/workspaces/server/access";
import { makeCreateIncident } from "../../src/features/incidents/server/create-incident";
import { makeCreateIncidentHttp } from "../../src/features/incidents/server/create-incident-http";
config({quiet:true});
const url=process.env.INTEGRATION_DATABASE_URL;
test("authenticated incident HTTP composition, denials, rollback and isolated cleanup",{skip:!url},async()=>{
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
  const userId=randomUUID(), organizationId=randomUUID(), otherId=randomUUID();
  const origin="http://localhost:3000",secret=randomBytes(32).toString("base64");
  const auth=betterAuth(createAuthOptions(db,{secret,origin,googleClientId:"synthetic-client",googleClientSecret:"synthetic-secret"}));
  const ctx=await auth.$context;
  const guard=makeRequireApplicationIdentity({getSession:headers=>auth.api.getSession({headers}),findUser:id=>db.user.findUnique({where:{id},select:{id:true,deactivatedAt:true}})});
  const access=makeWorkspaceAccess(db);
  const compose=(client:PrismaClient)=>makeCreateIncidentHttp({getOrigin:()=>origin,requireIdentity:guard,resolveContext:access.resolveTrustedActorContext,create:makeCreateIncident(client)});
  const handler=compose(db);
  try {
    await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});
    await db.organization.createMany({data:[organizationId,otherId].map(id=>({id,name:"HTTP fixture",slug:id}))});
    const member=await db.organizationMember.create({data:{userId,organizationId,role:"MEMBER"}});
    const session=await ctx.internalAdapter.createSession(userId);assert.ok(session);
    const signed=encodeURIComponent(`${session.token}.${createHmac("sha256",secret).update(session.token).digest("base64")}`);
    const send=(id: string=organizationId,body:unknown={title:"HTTP incident",severity:"HIGH"}, endpoint=handler)=>endpoint(new Request(`${origin}/api/workspaces/${id}/incidents`,{method:"POST",headers:{origin,"content-type":"application/json",cookie:`${ctx.authCookies.sessionToken.name}=${signed}`},body:JSON.stringify(body)}),{params:Promise.resolve({organizationId:id})});
    const response=await send();assert.equal(response.status,201);
    const dto=await response.json();
    assert.deepEqual(Object.keys(dto).sort(),["id","title","description","severity","status","createdAt","updatedAt"].sort());
    const incident=await db.incident.findUniqueOrThrow({where:{id:dto.id}});
    assert.equal(incident.organizationId,organizationId);assert.equal(incident.createdByMemberId,member.id);
    const logs=await db.activityLog.findMany({where:{organizationId,incidentId:dto.id}});
    assert.equal(logs.length,1);assert.equal(logs[0].actorMemberId,member.id);assert.equal(logs[0].eventType,"INCIDENT_CREATED");assert.equal(logs[0].actorType,"USER");
    assert.deepEqual(logs[0].details,{version:1,initialStatus:"OPEN",severity:"HIGH"});
    const unchanged=async()=>{
      assert.equal(await db.incident.count({where:{organizationId:{in:[organizationId,otherId]}}}),1);
      assert.equal(await db.activityLog.count({where:{organizationId:{in:[organizationId,otherId]}}}),1);
    };
    await db.organizationMember.update({where:{id:member.id},data:{role:"VIEWER"}});
    assert.equal((await send()).status,403);await unchanged();
    await db.organizationMember.update({where:{id:member.id},data:{role:"MEMBER"}});
    for(const status of ["SUSPENDED","REVOKED"] as const){
      await db.organizationMember.update({where:{id:member.id},data:{status}});
      assert.equal((await send()).status,404);await unchanged();
    }
    await db.organizationMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
    await db.user.update({where:{id:userId},data:{deactivatedAt:new Date()}});
    assert.equal((await send()).status,403);await unchanged();
    await db.user.update({where:{id:userId},data:{deactivatedAt:null}});
    await db.organization.update({where:{id:organizationId},data:{archivedAt:new Date()}});
    assert.equal((await send()).status,404);await unchanged();
    await db.organization.update({where:{id:organizationId},data:{archivedAt:null}});
    for(const id of ["malformed",randomUUID(),otherId]){
      const denied=await send(id);assert.equal(denied.status,404);assert.deepEqual(await denied.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});await unchanged();
    }
    for(const field of ["organizationId","createdById","actorId","membershipId","role","status","createdAt","updatedAt","actorMemberId"]){
      assert.equal((await send(organizationId,{title:"Injection",severity:"HIGH",[field]:"untrusted"})).status,400);await unchanged();
    }
    const failing=db.$extends({query:{activityLog:{async create(){throw new Error("Injected private failure");}}}});
    const failed=await send(organizationId,undefined,compose(failing as unknown as PrismaClient));
    assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes("private"));await unchanged();
  } finally {
    try {
      await db.$transaction(async tx=>{
        await tx.activityLog.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});
        await tx.incident.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});
        await tx.organizationMember.deleteMany({where:{organizationId:{in:[organizationId,otherId]},userId}});
        await tx.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});
        await tx.user.deleteMany({where:{id:userId}});
      });
      assert.equal(await db.user.count({where:{id:userId}}),0);
      assert.equal(await db.organization.count({where:{id:{in:[organizationId,otherId]}}}),0);
      assert.equal(await db.session.count({where:{userId}}),0);
      assert.equal(await db.incident.count({where:{organizationId:{in:[organizationId,otherId]}}}),0);
      assert.equal(await db.activityLog.count({where:{organizationId:{in:[organizationId,otherId]}}}),0);
    }finally{await db.$disconnect();}
  }
});
