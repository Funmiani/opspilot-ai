import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client";
import { makeIncidentCapabilities } from "../../src/features/incidents/server/capabilities";
import { prepareIncidentInput, createFeedback, submitIncident } from "../../src/features/incidents/client/create-incident";
import { ApplicationError } from "../../src/server/application/errors";
const context={actor:{userId:randomUUID()},organizationId:randomUUID()};
const member={status:"ACTIVE",role:"MEMBER",user:{deactivatedAt:null},organization:{archivedAt:null}};
function capability(row:unknown){return makeIncidentCapabilities({organizationMember:{findUnique:async()=>row}} as unknown as PrismaClient);}
for(const [role,expected]of [["OWNER",true],["ADMIN",true],["MEMBER",true],["VIEWER",false]]as const)test(`${role} receives only create capability`,async()=>{
 assert.deepEqual(await capability({...member,role})(context),{canCreateIncident:expected});
});
for(const row of [null,{...member,status:"SUSPENDED"},{...member,status:"REVOKED"},{...member,role:"UNKNOWN"},{...member,user:{deactivatedAt:new Date()}},{...member,organization:{archivedAt:new Date()}}])test("capability fails closed for unavailable authority",async()=>{
 await assert.rejects(capability(row)(context),e=>e instanceof ApplicationError&&e.code==="NOT_FOUND");
});
test("missing capability context makes no DB call",async()=>{
 await assert.rejects(makeIncidentCapabilities({}as PrismaClient)({actor:{userId:""},organizationId:""}),e=>e instanceof ApplicationError&&e.code==="UNAUTHENTICATED");
});
test("capability uses trusted compound membership lookup",async()=>{
 let args:unknown;const get=makeIncidentCapabilities({organizationMember:{findUnique:async(input:unknown)=>{args=input;return member;}}}as unknown as PrismaClient);
 await get(context);assert.deepEqual((args as {where:unknown}).where,{organizationId_userId:{organizationId:context.organizationId,userId:context.actor.userId}});
});
for(const [cause,code]of [[new Prisma.PrismaClientInitializationError("private","7.10.0","P1001"),"DATABASE_UNAVAILABLE"],[new Error("private"),"INTERNAL_ERROR"]]as const)test(`capability safe ${code}`,async()=>{
 const get=makeIncidentCapabilities({organizationMember:{findUnique:async()=>{throw cause;}}}as unknown as PrismaClient);
 await assert.rejects(get(context),e=>e instanceof ApplicationError&&e.code===code&&e.cause===cause&&!e.message.includes("private"));
});
test("client schema validation trims explicit payload and normalizes description",()=>{
 assert.deepEqual(prepareIncidentInput({title:"  Outage  ",description:"  details  ",severity:"HIGH"}),{ok:true,payload:{title:"Outage",description:"details",severity:"HIGH"}});
 assert.deepEqual(prepareIncidentInput({title:"Outage",description:"  ",severity:"LOW"}),{ok:true,payload:{title:"Outage",severity:"LOW"}});
 assert.equal(prepareIncidentInput({title:"Outage",severity:"HIGH",organizationId:"client"}).ok,false);
});
test("client field rules use fixed safe feedback and all severities",()=>{
 for(const severity of ["LOW","MEDIUM","HIGH","CRITICAL"])assert.equal(prepareIncidentInput({title:"valid",severity}).ok,true);
 const result=prepareIncidentInput({title:" ",description:"x".repeat(10001),severity:"invalid"});assert.equal(result.ok,false);
 if(!result.ok)assert.deepEqual(Object.keys(result.fields).sort(),["description","severity","title"]);
 assert.equal(prepareIncidentInput({title:"x".repeat(201),severity:"HIGH"}).ok,false);
});
for(const status of [400,401,403,404,503,500])test(`safe UI feedback ${status}`,()=>{
 const result=createFeedback(status);assert.equal(result.ok,false);
 if(!result.ok){assert.ok(result.message);if(status===401)assert.equal(result.href,"/sign-in");if(status===404)assert.equal(result.href,"/workspaces");if(status===403)assert.equal(result.refresh,true);}
});
test("mutation sends allowlisted same-origin JSON once; 201 confirmed without reading response body",async()=>{
 let calls=0;const result=await submitIncident(context.organizationId,{title:"Outage",severity:"HIGH",description:"details",role:"OWNER"}as never,async(url,init)=>{
  calls++;assert.equal(url,`/api/workspaces/${context.organizationId}/incidents`);assert.equal(init?.method,"POST");assert.equal(init?.credentials,"same-origin");assert.deepEqual(init?.headers,{"Content-Type":"application/json"});assert.deepEqual(JSON.parse(init?.body as string),{title:"Outage",description:"details",severity:"HIGH"});return new Response("private response",{status:201});
 });assert.deepEqual(result,{ok:true});assert.equal(calls,1);
});
test("mutation failure never exposes server body or retries",async()=>{
 let calls=0;const result=await submitIncident(context.organizationId,{title:"Outage",severity:"HIGH"},async()=>{calls++;return new Response("private SQL",{status:503});});assert.deepEqual(result,createFeedback(503));assert.equal(calls,1);
});
test("network failure has uncertain-outcome feedback and no automatic retry",async()=>{
 let calls=0;const result=await submitIncident(context.organizationId,{title:"Outage",severity:"HIGH"},async()=>{calls++;throw new Error("secret");});assert.equal(result.ok,false);if(!result.ok){assert.match(result.message,/could not be confirmed/);assert.ok(!result.message.includes("secret"));}assert.equal(calls,1);
});
