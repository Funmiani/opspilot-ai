import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeCreateIncidentHttp } from "../../src/features/incidents/server/create-incident-http";
import { ApplicationError } from "../../src/server/application/errors";
import { makeCreateIncident } from "../../src/features/incidents/server/create-incident";
import type { PrismaClient } from "../../src/generated/prisma/client";
const origin = "http://localhost:3000";
const route = { params: Promise.resolve({ organizationId: randomUUID() }) };
const dto = { id: randomUUID(), title: "Incident", description: null, severity: "HIGH" as const, status: "OPEN" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
function setup(overrides: Partial<Parameters<typeof makeCreateIncidentHttp>[0]> = {}) {
  let creates = 0;
  const handler = makeCreateIncidentHttp({ getOrigin: () => origin,
    requireIdentity: async () => ({ userId: randomUUID() }),
    resolveContext: async (identity, organizationId) => ({ actor: identity, organizationId: organizationId as string }),
    create: async () => { creates++; return dto; }, ...overrides });
  return { handler, creates: () => creates };
}
function request(headers: Record<string,string> = {}, body = JSON.stringify({ title: "Incident", severity: "HIGH" })) {
  return new Request(`${origin}/api/workspaces/x/incidents`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body });
}
for (const [name, headers, status] of [
  ["missing origin", { origin: "" }, 403], ["null origin", { origin: "null" }, 403],
  ["foreign origin", { origin: "https://evil.invalid" }, 403], ["malformed origin", { origin: "invalid" }, 403],
  ["cross-site", { "sec-fetch-site": "cross-site" }, 403], ["media type", { "content-type": "text/plain" }, 415],
  ["content length", { "content-length": "65537" }, 413],
] as const) test(name, async () => {
  const s = setup(); const response = await s.handler(request(headers), route);
  assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(s.creates(), 0);
});
test("same-origin JSON with parameters returns exact DTO", async () => {
  const s = setup(); const response = await s.handler(request({"content-type":"application/json; charset=utf-8"}),route);
  assert.equal(response.status,201); assert.deepEqual(await response.json(),dto); assert.equal(s.creates(),1);
});
test("malformed JSON rejected", async () => {
  const s=setup(); assert.equal((await s.handler(request({},"{"),route)).status,400); assert.equal(s.creates(),0);
});
test("streamed body limit works without Content-Length and cancels stream", async () => {
  let cancelled=false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(32769)); }, cancel() { cancelled=true; } });
  const req = new Request(origin,{method:"POST",headers:{origin,"content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);
  const s=setup(); assert.equal((await s.handler(req,route)).status,413); assert.equal(s.creates(),0); assert.equal(cancelled,true);
});
for (const code of ["UNAUTHENTICATED","FORBIDDEN","DATABASE_UNAVAILABLE","INTERNAL_ERROR"] as const) test(`safe error ${code}`,async()=>{
  const s=setup({requireIdentity:async()=>{throw new ApplicationError(code,"private database details",undefined,{cause:new Error("secret")});}});
  const response=await s.handler(request(),route);
  assert.equal(response.status,{UNAUTHENTICATED:401,FORBIDDEN:403,DATABASE_UNAVAILABLE:503,INTERNAL_ERROR:500}[code]);
  assert.ok(!(await response.text()).includes("private")); assert.equal(s.creates(),0);
});
test("unexpected errors are safe",async()=>{
  const s=setup({create:async()=>{throw new Error("private SQL password");}});
  const response=await s.handler(request(),route); assert.equal(response.status,500); assert.ok(!(await response.text()).includes("private"));
});
for (const reason of ["malformed","nonexistent","unauthorized"]) test(`tenant ${reason} has identical generic 404`,async()=>{
  const s=setup({resolveContext:async()=>{throw new ApplicationError("FORBIDDEN",reason);}});
  const response=await s.handler(request(),route); assert.equal(response.status,404);
  assert.deepEqual(await response.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});assert.equal(s.creates(),0);
});
test("operation denial remains 403",async()=>{
  const s=setup({create:async()=>{throw new ApplicationError("FORBIDDEN","VIEWER");}});
  assert.equal((await s.handler(request(),route)).status,403);
});
for (const body of [{title:"",severity:"invalid"},{title:"Incident",severity:"HIGH",privateSubmittedKey:"secret"}]) test("domain validation is reused and sanitized",async()=>{
  const create=makeCreateIncident({} as PrismaClient);
  const s=setup({create}); const response=await s.handler(request({},JSON.stringify(body)),route);
  assert.equal(response.status,400); const publicBody=await response.text();assert.ok(!publicBody.includes("privateSubmittedKey"));assert.ok(!publicBody.includes("secret"));
});
test("validation issues are bounded and messages replaced",async()=>{
  const s=setup({create:async()=>{throw new ApplicationError("VALIDATION_FAILED","secret",Array.from({length:20},()=>({field:"title",message:"secret".repeat(100)})));}});
  const response=await s.handler(request(),route);const body=await response.json();assert.equal(body.error.issues.length,5);assert.equal(body.error.issues[0].message,"Invalid title.");
});
