import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { bootstrapDevWorkspace } from "../../scripts/bootstrap-dev-workspace-logic";
config({quiet:true});const url=process.env.INTEGRATION_DATABASE_URL;
test("bootstrap explicit provisioning, denials, rollback and isolated cleanup",{skip:!url},async()=>{
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 const userId=randomUUID(), slug=`fixture-${randomUUID()}`, failureSlug=`fixture-${randomUUID()}`;
 const env={NODE_ENV:"development",DATABASE_URL:url};
 const args=(id=userId,s=slug)=>["--user-id",id,"--name","Fixture development workspace","--slug",s,"--role","MEMBER"];
 const unrelated=async()=>({accounts:await db.account.count({where:{userId}}),sessions:await db.session.count({where:{userId}}),incidents:await db.incident.count({where:{organization:{slug:{in:[slug,failureSlug]}}}}),comments:await db.comment.count({where:{organization:{slug:{in:[slug,failureSlug]}}}}),activities:await db.activityLog.count({where:{organization:{slug:{in:[slug,failureSlug]}}}})});
 const before=await unrelated();
 try{
  await assert.rejects(bootstrapDevWorkspace(db,args(randomUUID()),env));
  await db.user.create({data:{id:userId,email:`${userId}@example.invalid`,deactivatedAt:new Date()}});
  await assert.rejects(bootstrapDevWorkspace(db,args(),env));
  await db.user.update({where:{id:userId},data:{deactivatedAt:null}});
  const failing=db.$extends({query:{organizationMember:{async create(){throw new Error("Injected membership failure");}}}});
  await assert.rejects(bootstrapDevWorkspace(failing as unknown as PrismaClient,args(userId,failureSlug),env));
  assert.equal(await db.organization.count({where:{slug:failureSlug}}),0);
  const result=await bootstrapDevWorkspace(db,args(),env);
  assert.equal(result.role,"MEMBER");
  const member=await db.organizationMember.findUniqueOrThrow({where:{organizationId_userId:{organizationId:result.id,userId}}});
  assert.equal(member.role,"MEMBER");assert.equal(member.status,"ACTIVE");
  await assert.rejects(bootstrapDevWorkspace(db,args(),env));
  assert.equal(await db.organizationMember.count({where:{organizationId:result.id}}),1);
  assert.deepEqual(await unrelated(),before);
 }finally{
  await db.$transaction(async tx=>{
   await tx.organizationMember.deleteMany({where:{userId,organization:{slug:{in:[slug,failureSlug]}}}});
   await tx.organization.deleteMany({where:{slug:{in:[slug,failureSlug]}}});
   await tx.user.deleteMany({where:{id:userId}});
  });
  assert.equal(await db.organization.count({where:{slug:{in:[slug,failureSlug]}}}),0);
  assert.equal(await db.user.count({where:{id:userId}}),0);
  await db.$disconnect();
 }
});
