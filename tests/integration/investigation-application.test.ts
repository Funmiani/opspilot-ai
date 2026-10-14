import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { makeInvestigationNotes } from "../../src/features/incidents/server/investigation-notes";
import { makeIncidentEvidence } from "../../src/features/incidents/server/incident-evidence";
import { ApplicationError } from "../../src/server/application/errors";
config({quiet:true});const url=process.env.INTEGRATION_DATABASE_URL;
test("investigation application transactions, current authority, pagination and isolated cleanup",{skip:!url},async()=>{
 assert.ok(["localhost","127.0.0.1"].includes(new URL(url!).hostname));const db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 const userId=randomUUID(),organizationId=randomUUID(),otherId=randomUUID(),incidentId=randomUUID(),otherIncidentId=randomUUID(),emptyIncidentId=randomUUID();
 const context={actor:{userId},organizationId};const notes=makeInvestigationNotes(db),evidence=makeIncidentEvidence(db);
 const input={body:"  <script>human data</script>  ",kind:"NOTE"},eInput={type:"OBSERVATION",title:" Context ",content:"  supplied data  ",sourceUrl:" https://EXAMPLE.invalid:443/a%2fb "};
 const reject=(code:string)=>(e:unknown)=>e instanceof ApplicationError&&e.code===code;
 let networkCalls=0;const originalFetch=globalThis.fetch;
 try{
  await db.user.create({data:{id:userId,email:`${userId}@example.invalid`}});
  await db.organization.createMany({data:[organizationId,otherId].map(id=>({id,name:"Application fixture",slug:id}))});
  const member=await db.organizationMember.create({data:{organizationId,userId,role:"MEMBER"}}),otherMember=await db.organizationMember.create({data:{organizationId:otherId,userId}});
  await db.incident.createMany({data:[{id:incidentId,organizationId,createdByMemberId:member.id,title:"Investigation fixture"},{id:emptyIncidentId,organizationId,createdByMemberId:member.id,title:"Empty fixture"},{id:otherIncidentId,organizationId:otherId,createdByMemberId:otherMember.id,title:"Other fixture"}]});
  globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected network call");};
  const note=await notes.addInvestigationNote(context,incidentId,input),ev=await evidence.addIncidentEvidence(context,incidentId,eInput);
  assert.equal(networkCalls,0);globalThis.fetch=originalFetch;
  assert.deepEqual(Object.keys(note).sort(),["id","body","kind","createdAt"].sort());assert.equal(note.body,"<script>human data</script>");
  assert.deepEqual(Object.keys(ev).sort(),["id","type","title","content","sourceUrl","createdAt","origin"].sort());assert.equal(ev.origin,"HUMAN_SUPPLIED");assert.equal(ev.sourceUrl,"https://EXAMPLE.invalid:443/a%2fb");
  assert.equal((await db.comment.findUniqueOrThrow({where:{id:note.id}})).authorMemberId,member.id);assert.equal((await db.incidentEvidence.findUniqueOrThrow({where:{id:ev.id}})).createdByMemberId,member.id);
  const logs=await db.activityLog.findMany({where:{organizationId,incidentId}});assert.equal(logs.length,2);
  assert.deepEqual(logs.find(l=>l.eventType==="COMMENT_ADDED")!.details,{version:1,commentId:note.id,kind:"NOTE"});assert.deepEqual(logs.find(l=>l.eventType==="EVIDENCE_ADDED")!.details,{version:1,evidenceId:ev.id,type:"OBSERVATION"});assert.ok(logs.every(l=>l.actorMemberId===member.id&&l.actorType==="USER"));
  const count=async()=>[await db.comment.count({where:{organizationId}}),await db.incidentEvidence.count({where:{organizationId}}),await db.activityLog.count({where:{organizationId}})];
  const baseline=await count();
  await db.organizationMember.update({where:{id:member.id},data:{role:"VIEWER"}});
  assert.equal((await notes.listInvestigationNotes(context,incidentId,{})).items.length,1);assert.equal((await evidence.listIncidentEvidence(context,incidentId,{})).items.length,1);
  await assert.rejects(notes.addInvestigationNote(context,incidentId,input),reject("FORBIDDEN"));await assert.rejects(evidence.addIncidentEvidence(context,incidentId,eInput),reject("FORBIDDEN"));
  for(const id of ["bad",randomUUID(),otherIncidentId])for(const act of [()=>notes.addInvestigationNote(context,id,input),()=>evidence.addIncidentEvidence(context,id,eInput),()=>notes.listInvestigationNotes(context,id,{}),()=>evidence.listIncidentEvidence(context,id,{})])await assert.rejects(act(),reject("NOT_FOUND"));
  assert.deepEqual(await notes.listInvestigationNotes(context,emptyIncidentId,{}),{items:[],nextCursor:null});
  await db.incident.update({where:{id:incidentId},data:{archivedAt:new Date()}});
  for(const act of [()=>notes.addInvestigationNote(context,incidentId,input),()=>evidence.addIncidentEvidence(context,incidentId,eInput),()=>notes.listInvestigationNotes(context,incidentId,{}),()=>evidence.listIncidentEvidence(context,incidentId,{})])await assert.rejects(act(),reject("NOT_FOUND"));
  await db.incident.update({where:{id:incidentId},data:{archivedAt:null}});
  for(const status of ["SUSPENDED","REVOKED"]as const){await db.organizationMember.update({where:{id:member.id},data:{status}});for(const act of [()=>notes.listInvestigationNotes(context,emptyIncidentId,{}),()=>evidence.listIncidentEvidence(context,emptyIncidentId,{}),()=>notes.addInvestigationNote(context,incidentId,input),()=>evidence.addIncidentEvidence(context,incidentId,eInput)])await assert.rejects(act(),reject("NOT_FOUND"));}
  await db.organizationMember.update({where:{id:member.id},data:{status:"ACTIVE",role:"MEMBER"}});
  for(const target of ["user","org"]){if(target==="user")await db.user.update({where:{id:userId},data:{deactivatedAt:new Date()}});else await db.organization.update({where:{id:organizationId},data:{archivedAt:new Date()}});
   for(const act of [()=>notes.listInvestigationNotes(context,incidentId,{}),()=>evidence.listIncidentEvidence(context,incidentId,{}),()=>notes.addInvestigationNote(context,incidentId,input),()=>evidence.addIncidentEvidence(context,incidentId,eInput)])await assert.rejects(act(),reject("NOT_FOUND"));
   if(target==="user")await db.user.update({where:{id:userId},data:{deactivatedAt:null}});else await db.organization.update({where:{id:organizationId},data:{archivedAt:null}});
  }
  assert.deepEqual(await count(),baseline);
  const failing=db.$extends({query:{activityLog:{async create(){throw new Error("Injected failure");}}}})as unknown as PrismaClient;
  await assert.rejects(makeInvestigationNotes(failing).addInvestigationNote(context,incidentId,input),reject("INTERNAL_ERROR"));await assert.rejects(makeIncidentEvidence(failing).addIncidentEvidence(context,incidentId,eInput),reject("INTERNAL_ERROR"));assert.deepEqual(await count(),baseline);
  const blank=await evidence.addIncidentEvidence(context,incidentId,{...eInput,sourceUrl:" "});assert.equal(blank.sourceUrl,null);
  const tied=new Date("2026-10-01T12:00:00.123Z");const nIds=Array.from({length:5},()=>randomUUID()),eIds=Array.from({length:5},()=>randomUUID());
  await db.comment.createMany({data:nIds.map(id=>({id,organizationId,incidentId:emptyIncidentId,authorMemberId:member.id,body:"Paged",kind:"HYPOTHESIS",createdAt:tied}))});
  await db.incidentEvidence.createMany({data:eIds.map(id=>({id,organizationId,incidentId:emptyIncidentId,createdByMemberId:member.id,title:"Paged",content:"Data",type:"REFERENCE",createdAt:tied}))});
  await notes.addInvestigationNote({...context,organizationId:otherId},otherIncidentId,input);await evidence.addIncidentEvidence({...context,organizationId:otherId},otherIncidentId,eInput);
  for(const [list,expected]of [[notes.listInvestigationNotes,nIds],[evidence.listIncidentEvidence,eIds]]as const){const seen:string[]=[];let cursor:string|null=null;let pages=0;do{const page: {items:readonly {id:string}[];nextCursor:string|null}=await list(context,emptyIncidentId,{limit:"2",...(cursor?{cursor}:{})});seen.push(...page.items.map(x=>x.id));cursor=page.nextCursor;pages++;assert.ok(pages<5);}while(cursor);assert.equal(pages,3);assert.deepEqual(seen,[...expected].sort().reverse());assert.equal(new Set(seen).size,5);}
  assert.equal((await notes.listInvestigationNotes(context,incidentId,{})).items.length,1);assert.equal((await evidence.listIncidentEvidence(context,incidentId,{})).items.length,2);
 }finally{
  globalThis.fetch=originalFetch;
  try{await db.$transaction(async tx=>{await tx.activityLog.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.comment.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.incidentEvidence.deleteMany({where:{organizationId:{in:[organizationId,otherId]}}});await tx.incident.deleteMany({where:{id:{in:[incidentId,otherIncidentId,emptyIncidentId]}}});await tx.organizationMember.deleteMany({where:{userId,organizationId:{in:[organizationId,otherId]}}});await tx.organization.deleteMany({where:{id:{in:[organizationId,otherId]}}});await tx.user.deleteMany({where:{id:userId}});});
  for(const count of [await db.comment.count({where:{organizationId:{in:[organizationId,otherId]}}}),await db.incidentEvidence.count({where:{organizationId:{in:[organizationId,otherId]}}}),await db.activityLog.count({where:{organizationId:{in:[organizationId,otherId]}}})])assert.equal(count,0);
  assert.equal(await db.user.count({where:{id:userId}}),0);assert.equal(await db.organization.count({where:{id:{in:[organizationId,otherId]}}}),0);
  }finally{await db.$disconnect();}
 }
});
