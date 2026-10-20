import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { config } from "dotenv";
import { betterAuth } from "better-auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createAuthOptions } from "../../src/server/auth/auth";
import { makeRequireApplicationIdentity } from "../../src/server/auth/session";
import { makeWorkspaceAccess } from "../../src/features/workspaces/server/access";
import { makeInvestigationNotes } from "../../src/features/incidents/server/investigation-notes";
import { makeIncidentEvidence } from "../../src/features/incidents/server/incident-evidence";
import { makeInvestigationHttp } from "../../src/features/incidents/server/investigation-http";
config({quiet:true});const url=process.env.INTEGRATION_DATABASE_URL;
test("authenticated investigation HTTP composition, large escaped evidence, safe denials and cleanup",{skip:!url},async()=>{
 assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 const userId=randomUUID(),organizationId=randomUUID(),incidentId=randomUUID(),otherId=randomUUID(),otherIncidentId=randomUUID();
 const origin="http://localhost:3000",secret=randomBytes(32).toString("base64");
 const auth=betterAuth(createAuthOptions(db,{secret,origin,googleClientId:"synthetic-client",googleClientSecret:"synthetic-secret"}));const authContext=await auth.$context;
 const guard=makeRequireApplicationIdentity({getSession:headers=>auth.api.getSession({headers}),findUser:id=>db.user.findUnique({where:{id},select:{id:true,deactivatedAt:true}})});
 const access=makeWorkspaceAccess(db),notes=makeInvestigationNotes(db),evidence=makeIncidentEvidence(db);
 const base={getOrigin:()=>origin,requireIdentity:guard,resolveContext:access.resolveTrustedActorContext};
 const n=makeInvestigationHttp({...base,add:notes.addInvestigationNote,list:notes.listInvestigationNotes}),e=makeInvestigationHttp({...base,add:evidence.addIncidentEvidence,list:evidence.listIncidentEvidence});
 try{
  await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});await db.organization.createMany({data:[organizationId,otherId].map(id=>({id,name:"HTTP fixture",slug:id}))});
  const member=await db.organizationMember.create({data:{userId,organizationId}}),other=await db.organizationMember.create({data:{userId,organizationId:otherId}});
  await db.incident.createMany({data:[{id:incidentId,organizationId,createdByMemberId:member.id,title:"HTTP fixture"},{id:otherIncidentId,organizationId:otherId,createdByMemberId:other.id,title:"Other fixture"}]});
  const session=await authContext.internalAdapter.createSession(userId);assert.ok(session);const cookie=`${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${createHmac("sha256",secret).update(session.token).digest("base64")}`)}`;
  const route=(id:string=incidentId,org:string=organizationId)=>({params:Promise.resolve({organizationId:org,incidentId:id})});
  const post=(body:string)=>new Request(origin,{method:"POST",headers:{origin,"content-type":"application/json",cookie},body});const get=()=>new Request(origin,{headers:{cookie}});
  const noteBody=JSON.stringify({body:"HTTP note",kind:"NOTE"});const evBody=JSON.stringify({type:"OBSERVATION",title:"HTTP evidence",content:"Context"});
  assert.equal((await n.POST(post(noteBody),route())).status,201);assert.equal((await e.POST(post(evBody),route())).status,201);
  const large='{"type":"LOG_EXCERPT","title":"Escaped evidence","content":"'+'\\u0061'.repeat(20000)+'"}';assert.ok(Buffer.byteLength(large)>65536&&Buffer.byteLength(large)<=196608);
  const big=await e.POST(post(large),route());assert.equal(big.status,201);assert.equal((await big.json()).content,'a'.repeat(20000));
  for(const http of [n,e]){const res=await http.GET(get(),route());assert.equal(res.status,200);assert.equal(res.headers.get("cache-control"),"no-store");}
  await db.organizationMember.update({where:{id:member.id},data:{role:"VIEWER"}});
  assert.equal((await n.GET(get(),route())).status,200);assert.equal((await e.GET(get(),route())).status,200);
  assert.equal((await n.POST(post(noteBody),route())).status,403);assert.equal((await e.POST(post(evBody),route())).status,403);
  for(const id of ["bad",randomUUID(),otherIncidentId])for(const [http,body]of [[n,noteBody],[e,evBody]]as const){const res=await http.POST(post(body),route(id));assert.equal(res.status,404);assert.deepEqual(await res.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});assert.equal((await http.GET(get(),route(id))).status,404);}
  await db.incident.update({where:{id:incidentId},data:{archivedAt:new Date()}});assert.equal((await n.POST(post(noteBody),route())).status,404);assert.equal((await e.POST(post(evBody),route())).status,404);
  assert.equal((await n.GET(get(),route())).status,404);assert.equal((await e.GET(get(),route())).status,404);
  const denied=await n.GET(get(),route(incidentId,randomUUID()));assert.equal(denied.status,404);
  assert.equal((await n.GET(new Request(origin),route())).status,401);
  assert.equal(await db.comment.count({where:{organizationId}}),1);assert.equal(await db.incidentEvidence.count({where:{organizationId}}),2);assert.equal(await db.activityLog.count({where:{organizationId}}),3);
 }finally{
  try{await db.$transaction(async tx=>{await tx.activityLog.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.comment.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.incidentEvidence.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.incident.deleteMany({where:{id:{in:[incidentId,otherIncidentId]}}});await tx.organizationMember.deleteMany({where:{userId,organizationId:{in:[organizationId,otherId]}}});await tx.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});await tx.user.deleteMany({where:{id:userId}});});
  assert.equal(await db.user.count({where:{id:userId}}),0);assert.equal(await db.organization.count({where:{id:{in:[organizationId,otherId]}}}),0);assert.equal(await db.session.count({where:{userId}}),0);
  }finally{await db.$disconnect();}
 }
});
