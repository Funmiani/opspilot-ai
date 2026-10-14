import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { makeIncidentCapabilities } from "../../src/features/incidents/server/capabilities";
import { ApplicationError } from "../../src/server/application/errors";
config({quiet:true});const url=process.env.INTEGRATION_DATABASE_URL;
test("incident capabilities follow current DB authority and clean only fixture records",{skip:!url},async()=>{
 assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});const userId=randomUUID(),organizationId=randomUUID();const context={actor:{userId},organizationId};const get=makeIncidentCapabilities(db);
 const denied=(e:unknown)=>e instanceof ApplicationError&&e.code==="NOT_FOUND";
 try{
  await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});await db.organization.create({data:{id:organizationId,name:"Capability fixture",slug:organizationId}});
  const member=await db.organizationMember.create({data:{userId,organizationId,role:"MEMBER"}});
  assert.deepEqual(await get(context),{canCreateIncident:true});
  await db.organizationMember.update({where:{id:member.id},data:{role:"VIEWER"}});assert.deepEqual(await get(context),{canCreateIncident:false});
  for(const status of ["SUSPENDED","REVOKED"]as const){await db.organizationMember.update({where:{id:member.id},data:{status}});await assert.rejects(get(context),denied);}
  await db.organizationMember.update({where:{id:member.id},data:{status:"ACTIVE",role:"MEMBER"}});assert.deepEqual(await get(context),{canCreateIncident:true});
  await db.user.update({where:{id:userId},data:{deactivatedAt:new Date()}});await assert.rejects(get(context),denied);await db.user.update({where:{id:userId},data:{deactivatedAt:null}});
  await db.organization.update({where:{id:organizationId},data:{archivedAt:new Date()}});await assert.rejects(get(context),denied);
  await assert.rejects(get({...context,organizationId:randomUUID()}),denied);
  assert.equal(await db.incident.count({where:{organizationId}}),0);assert.equal(await db.activityLog.count({where:{organizationId}}),0);
 }finally{
  try{await db.$transaction(async tx=>{await tx.organizationMember.deleteMany({where:{userId,organizationId}});await tx.organization.deleteMany({where:{id:organizationId}});await tx.user.deleteMany({where:{id:userId}});});assert.equal(await db.user.count({where:{id:userId}}),0);assert.equal(await db.organization.count({where:{id:organizationId}}),0);}finally{await db.$disconnect();}
 }
});
