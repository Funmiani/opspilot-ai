import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { ApplicationError } from "../../src/server/application/errors";
import { makeInvestigationHttp, INVESTIGATION_POST_MAX_BYTES } from "../../src/features/incidents/server/investigation-http";
import { makeInvestigationNotes } from "../../src/features/incidents/server/investigation-notes";
import { makeIncidentEvidence } from "../../src/features/incidents/server/incident-evidence";
import { makeCreateIncidentHttp } from "../../src/features/incidents/server/create-incident-http";
import { readBoundedJson, MAX_JSON_BYTES } from "../../src/server/http/request";
const origin="http://localhost:3000",context={actor:{userId:randomUUID()},organizationId:randomUUID()};
const route={params:Promise.resolve({organizationId:context.organizationId,incidentId:randomUUID()})};
const note={id:randomUUID(),body:"Context",kind:"NOTE" as const,createdAt:new Date().toISOString()};
const input={body:"Context",kind:"NOTE"};
function post(body=JSON.stringify(input),headers:Record<string,string>={}){return new Request(origin,{method:"POST",headers:{origin,"content-type":"application/json",...headers},body});}
function setup(overrides:Partial<Parameters<typeof makeInvestigationHttp>[0]>={}){let calls=0;const http=makeInvestigationHttp({getOrigin:()=>origin,requireIdentity:async()=>context.actor,resolveContext:async()=>context,add:async()=>{calls++;return note;},list:async()=>({items:[note],nextCursor:null}),...overrides});return {http,calls:()=>calls};}
for(const [name,headers,status]of [["missing",{origin:""},403],["null",{origin:"null"},403],["malformed",{origin:"bad"},403],["foreign",{origin:"https://evil.invalid"},403],["cross-site",{"sec-fetch-site":"cross-site"},403],["media",{"content-type":"text/plain"},415],["oversized header",{"content-length":String(INVESTIGATION_POST_MAX_BYTES+1)},413]]as const)test(`transport ${name}`,async()=>{const s=setup();const res=await s.http.POST(post(undefined,headers),route);assert.equal(res.status,status);assert.equal(res.headers.get("cache-control"),"no-store");assert.equal(s.calls(),0);});
test("normal JSON and parameterized media type accepted",async()=>{const s=setup();const res=await s.http.POST(post(undefined,{"content-type":"application/json; charset=utf-8"}),route);assert.equal(res.status,201);assert.deepEqual(await res.json(),note);assert.equal(s.calls(),1);});
test("malformed JSON safe 400",async()=>{const s=setup();const res=await s.http.POST(post("{"),route);assert.equal(res.status,400);assert.equal(s.calls(),0);});
for(const code of ["UNAUTHENTICATED","DATABASE_UNAVAILABLE","INTERNAL_ERROR"]as const)test(`safe ${code}`,async()=>{const s=setup({requireIdentity:async()=>{throw new ApplicationError(code,"private SQLSTATE constraint secret");}});for(const res of [await s.http.GET(new Request(origin),route),await s.http.POST(post(),route)]){assert.equal(res.status,{UNAUTHENTICATED:401,DATABASE_UNAVAILABLE:503,INTERNAL_ERROR:500}[code]);assert.equal(res.headers.get("cache-control"),"no-store");assert.ok(!(await res.text()).includes("private"));}});
test("tenant and parent denial share generic 404",async()=>{for(const override of [{resolveContext:async()=>{throw new ApplicationError("FORBIDDEN","tenant");}},{add:async()=>{throw new ApplicationError("NOT_FOUND","cross tenant");}}]){const res=await setup(override).http.POST(post(),route);assert.equal(res.status,404);assert.deepEqual(await res.json(),{error:{code:"NOT_FOUND",message:"Resource not found."}});}});
test("operation denial is safe 403",async()=>assert.equal((await setup({add:async()=>{throw new ApplicationError("FORBIDDEN","member details");}}).http.POST(post(),route)).status,403));
test("unexpected errors hidden",async()=>{const res=await setup({add:async()=>{throw new Error("private SQL");}}).http.POST(post(),route);assert.equal(res.status,500);assert.ok(!(await res.text()).includes("private"));});
test("GET needs neither Origin nor Content-Type and returns page/no-store",async()=>{const res=await setup().http.GET(new Request(origin),route);assert.equal(res.status,200);assert.equal(res.headers.get("cache-control"),"no-store");assert.deepEqual(await res.json(),{items:[note],nextCursor:null});});
for(const query of ["?limit=1&limit=2","?cursor=a&cursor=b","?unknown=secret","?limit=","?limit=0","?limit=101","?limit=1.5","?cursor=bad","?cursor="+'a'.repeat(257),"?__proto__=x"])test(`GET query ${query.slice(0,40)}`,async()=>{const list=makeInvestigationNotes({}as PrismaClient).listInvestigationNotes;const res=await setup({list}).http.GET(new Request(origin+query),route);assert.equal(res.status,400);assert.ok(!(await res.text()).includes("secret"));});
for(const field of ["organizationId","authorMemberId","createdByMemberId","membershipId","actorType","origin","details"])test(`strict authority ${field} rejected without leakage`,async()=>{for(const [add,body]of [[makeInvestigationNotes({}as PrismaClient).addInvestigationNote,{...input,[field]:"secret"}],[makeIncidentEvidence({}as PrismaClient).addIncidentEvidence,{type:"OBSERVATION",title:"secret title",content:"secret content",sourceUrl:"https://secret.invalid",[field]:"secret"}]]as const){const res=await setup({add}).http.POST(post(JSON.stringify(body)),route);assert.equal(res.status,400);assert.ok(!(await res.text()).includes("secret"));}});
for(const length of [undefined,"1"])test(`actual streamed bytes enforced with length ${length}`,async()=>{let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}});const req=new Request(origin,{method:"POST",headers:{origin,"content-type":"application/json",...(length?{"content-length":length}:{})},body:stream,duplex:"half"}as RequestInit);const s=setup();assert.equal((await s.http.POST(req,route)).status,413);assert.equal(s.calls(),0);assert.equal(cancelled,true);});
test("default JSON and existing Incident transport remain 64 KiB",async()=>{assert.equal(MAX_JSON_BYTES,65536);assert.equal(INVESTIGATION_POST_MAX_BYTES,196608);await assert.rejects(readBoundedJson(post(' '.repeat(65537))));const handler=makeCreateIncidentHttp({getOrigin:()=>origin,requireIdentity:async()=>context.actor,resolveContext:async()=>context,create:async()=>{throw Error("Must not reach create");}});assert.equal((await handler(post(' '.repeat(65537)),route)).status,413);});

test("investigation POST rejects an actually absent Origin header", async () => {
  const request = post();
  request.headers.delete("origin");
  assert.equal(request.headers.has("origin"), false);
  const s = setup();
  const response = await s.http.POST(request, route);
  assert.equal(response.status, 403);
  assert.equal(s.calls(), 0);
});

test("streamed size guard accepts 196608 bytes and rejects 196609", async () => {
  function boundaryRequest(bytes: number) {
    // Valid JSON with padding: isolate transport bytes from application field limits.
    const body = new TextEncoder().encode("{}" + " ".repeat(bytes - 2));
    assert.equal(body.byteLength, bytes);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === body.length) { controller.close(); return; }
        const end = Math.min(offset + 16384, body.length);
        controller.enqueue(body.slice(offset, end));
        offset = end;
      },
    });
    return new Request(origin, { method: "POST", body: stream, duplex: "half" } as RequestInit);
  }
  assert.deepEqual(await readBoundedJson(boundaryRequest(196608), INVESTIGATION_POST_MAX_BYTES), {});
  await assert.rejects(readBoundedJson(boundaryRequest(196609), INVESTIGATION_POST_MAX_BYTES),
    error => error instanceof Error && "status" in error && error.status === 413);
  // Limits are trusted server constants; NaN/Infinity hardening remains deferred.
});
