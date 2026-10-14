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
import { makeIncidentReads } from "../../src/features/incidents/server/read-incidents";
import { makeIncidentReadHttp } from "../../src/features/incidents/server/read-incident-http";
import { ApplicationError } from "../../src/server/application/errors";
config({quiet:true});
const url=process.env.INTEGRATION_DATABASE_URL;
test("incident reads: authenticated tenants, current authority, archived exclusion, keyset pages and cleanup",{skip:!url},async()=>{
 assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 const userId=randomUUID(),organizationId=randomUUID(),otherId=randomUUID();
 const ids=Array.from({length:8},()=>randomUUID());
 const context={actor:{userId},organizationId};const reads=makeIncidentReads(db);const access=makeWorkspaceAccess(db);
 const origin="http://localhost:3000",secret=randomBytes(32).toString("base64");
 const auth=betterAuth(createAuthOptions(db,{secret,origin,googleClientId:"synthetic-client",googleClientSecret:"synthetic-secret"}));
 const authContext=await auth.$context;
 const guard=makeRequireApplicationIdentity({getSession:headers=>auth.api.getSession({headers}),findUser:id=>db.user.findUnique({where:{id},select:{id:true,deactivatedAt:true}})});
 const http=makeIncidentReadHttp({requireIdentity:guard,resolveContext:access.resolveTrustedActorContext,list:reads.listIncidents,get:reads.getIncident});
 try{
  await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});
  await db.organization.createMany({data:[organizationId,otherId].map(id=>({id,name:"Read fixture",slug:id}))});
  const member=await db.organizationMember.create({data:{organizationId,userId,role:"MEMBER"}});
  const otherMember=await db.organizationMember.create({data:{organizationId:otherId,userId,role:"MEMBER"}});
  const tied=new Date("2026-10-01T12:00:00.123Z"),old=new Date("2026-09-01T00:00:00.000Z");
  await db.incident.createMany({data:ids.map((id,index)=>({id,organizationId:index===7?otherId:organizationId,createdByMemberId:index===7?otherMember.id:member.id,title:"Read fixture",severity:"HIGH",status:index===5?"CLOSED":"OPEN",createdAt:index<4?tied:old,archivedAt:index===6?new Date():null}))});
  const session=await authContext.internalAdapter.createSession(userId);assert.ok(session);
  const cookie=`${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${createHmac("sha256",secret).update(session.token).digest("base64")}`)}`;
  const request=(query="")=>new Request(`${origin}/api/workspaces/${organizationId}/incidents${query}`,{headers:{cookie}});
  const route=(incidentId:string=ids[0],org:string=organizationId)=>({params:Promise.resolve({organizationId:org,incidentId})});
  const denied=(e:unknown)=>e instanceof ApplicationError&&e.code==="NOT_FOUND";
  const expected=[...ids.slice(0,4).sort().reverse(),...ids.slice(4,6).sort().reverse()];
  for(const role of ["MEMBER","VIEWER"] as const){
   await db.organizationMember.update({where:{id:member.id},data:{role}});
   const response=await http.list(request(),route());assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
   const body=await response.json();assert.deepEqual(body.items.map((r:{id:string})=>r.id),expected);assert.equal(body.nextCursor,null);
   const detail=await http.get(request(),route());assert.equal(detail.status,200);assert.deepEqual(Object.keys(await detail.json()).sort(),["id","title","description","severity","status","createdAt","updatedAt"].sort());
  }
  const seen:string[]=[];let cursor:string|null=null;let pages=0;
  do{
   const page=await reads.listIncidents(context,{limit:"2",...(cursor?{cursor}:{})});seen.push(...page.items.map(x=>x.id));cursor=page.nextCursor;pages++;assert.ok(pages<=4);
  }while(cursor);
  assert.equal(pages,3);assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,6);
  assert.equal((await reads.getIncident(context,ids[5])).status,"CLOSED");
  const other=await reads.listIncidents({...context,organizationId:otherId},{});assert.deepEqual(other.items.map(x=>x.id),[ids[7]]);
  let publicMissing:unknown;
  for(const incidentId of ["bad",randomUUID(),ids[7],ids[6]]){
   const response=await http.get(request(),route(incidentId));assert.equal(response.status,404);const body=await response.json();publicMissing??=body;assert.deepEqual(body,publicMissing);
  }
  for(const status of ["SUSPENDED","REVOKED"] as const){
   await db.organizationMember.update({where:{id:member.id},data:{status}});
   await assert.rejects(reads.listIncidents(context,{}),denied);await assert.rejects(reads.getIncident(context,ids[0]),denied);
   assert.equal((await http.list(request(),route())).status,404);assert.equal((await http.get(request(),route())).status,404);
  }
  await db.organizationMember.update({where:{id:member.id},data:{status:"ACTIVE"}});
  await db.user.update({where:{id:userId},data:{deactivatedAt:new Date()}});
  await assert.rejects(reads.listIncidents(context,{}),denied);await assert.rejects(reads.getIncident(context,ids[0]),denied);assert.equal((await http.get(request(),route())).status,403);
  await db.user.update({where:{id:userId},data:{deactivatedAt:null}});
  await db.organization.update({where:{id:organizationId},data:{archivedAt:new Date()}});
  await assert.rejects(reads.listIncidents(context,{}),denied);await assert.rejects(reads.getIncident(context,ids[0]),denied);assert.equal((await http.list(request(),route())).status,404);
  // Reads never append domain records.
  assert.equal(await db.activityLog.count({where:{organizationId:{in:[organizationId,otherId]}}}),0);
  assert.equal(await db.incident.count({where:{id:{in:ids}}}),8);
 }finally{
  try{
   await db.$transaction(async tx=>{
    await tx.incident.deleteMany({where:{id:{in:ids},organizationId:{in:[organizationId,otherId]}}});
    await tx.organizationMember.deleteMany({where:{userId,organizationId:{in:[organizationId,otherId]}}});
    await tx.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});
    await tx.user.deleteMany({where:{id:userId}});
   });
   assert.equal(await db.user.count({where:{id:userId}}),0);assert.equal(await db.session.count({where:{userId}}),0);assert.equal(await db.incident.count({where:{id:{in:ids}}}),0);assert.equal(await db.organization.count({where:{id:{in:[organizationId,otherId]}}}),0);
  }finally{await db.$disconnect();}
 }
});
