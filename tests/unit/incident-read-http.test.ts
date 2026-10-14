import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { makeIncidentReadHttp } from "../../src/features/incidents/server/read-incident-http";
import { makeIncidentReads } from "../../src/features/incidents/server/read-incidents";
import { ApplicationError } from "../../src/server/application/errors";
const id=randomUUID();const context={actor:{userId:randomUUID()},organizationId:randomUUID()};
const dto={id,title:"HTTP read",description:null,severity:"LOW" as const,status:"CLOSED" as const,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
function setup(overrides:Partial<Parameters<typeof makeIncidentReadHttp>[0]>={}){
 return makeIncidentReadHttp({requireIdentity:async()=>context.actor,resolveContext:async()=>context,list:async()=>({items:[dto],nextCursor:null}),get:async()=>dto,...overrides});
}
function route(incidentId: string=id){return {params:Promise.resolve({organizationId:context.organizationId,incidentId})};}
function request(query=""){return new Request(`http://localhost:3000/api/workspaces/${context.organizationId}/incidents${query}`);}
test("GET list/detail need neither Origin nor Content-Type, safe DTO and no-store",async()=>{
 const h=setup();for(const [response,expected]of [[await h.list(request(),route()),{items:[dto],nextCursor:null}],[await h.get(request(),route()),dto]] as const){assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");assert.deepEqual(await response.json(),expected);}
});
for(const code of ["UNAUTHENTICATED","DATABASE_UNAVAILABLE","INTERNAL_ERROR"] as const)test(`safe GET ${code}`,async()=>{
 const h=setup({requireIdentity:async()=>{throw new ApplicationError(code,"secret");}});for(const response of [await h.list(request(),route()),await h.get(request(),route())]){assert.equal(response.status,{UNAUTHENTICATED:401,DATABASE_UNAVAILABLE:503,INTERNAL_ERROR:500}[code]);assert.equal(response.headers.get("cache-control"),"no-store");assert.ok(!(await response.text()).includes("secret"));}
});
for(const reason of ["malformed organization","inaccessible tenant"])test(reason,async()=>{
 const h=setup({resolveContext:async()=>{throw new ApplicationError("FORBIDDEN",reason);}});const response=await h.get(request(),route());assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});
});
for(const reason of ["nonexistent","cross-tenant","archived"])test(`detail ${reason} concealed`,async()=>{
 const h=setup({get:async()=>{throw new ApplicationError("NOT_FOUND",reason);}});const response=await h.get(request(),route());assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});
});
test("malformed incident UUID uses application validator",async()=>{
 const reads=makeIncidentReads({} as PrismaClient);const response=await setup({get:reads.getIncident}).get(request(),route("bad"));assert.equal(response.status,404);
});
for(const query of ["?limit=1&limit=2","?other=secret","?limit=0","?limit=101","?limit=","?limit=1.5","?cursor=bad","?cursor=x&cursor=y","?__proto__=x"])test(`strict query ${query}`,async()=>{
 const reads=makeIncidentReads({} as PrismaClient);const response=await setup({list:reads.listIncidents}).list(request(query),route());assert.equal(response.status,400);assert.equal(response.headers.get("cache-control"),"no-store");assert.ok(!(await response.text()).includes("secret"));
});
test("unexpected read error hidden",async()=>{
 const response=await setup({get:async()=>{throw new Error("private SQL");}}).get(request(),route());assert.equal(response.status,500);assert.ok(!(await response.text()).includes("private"));
});
