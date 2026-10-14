import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client";
import { makeIncidentReads } from "../../src/features/incidents/server/read-incidents";
import { canReadIncident } from "../../src/features/incidents/server/permissions";
import { toIncidentDto } from "../../src/features/incidents/server/incident-dto";
import { incidentStatuses } from "../../src/features/incidents/contracts";
import { encodeIncidentCursor, incidentCursorSchema } from "../../src/features/incidents/pagination";
import { listIncidentsQuerySchema } from "../../src/features/incidents/server/read-schemas";
import { ApplicationError } from "../../src/server/application/errors";
const context = { actor: { userId: randomUUID() }, organizationId: randomUUID() };
const row = { id: randomUUID(), title: "Read fixture", description: null, severity: "HIGH" as const, status: "OPEN" as const, createdAt: new Date("2026-10-01T12:00:00.123Z"), updatedAt: new Date("2026-10-01T12:00:00.123Z") };
const membership = { status: "ACTIVE", role: "MEMBER", user: { deactivatedAt: null }, organization: { archivedAt: null } };
function setup(member: unknown = membership, rows = [row]) {
  const calls: Array<{kind:string;args:unknown}> = [];
  const tx = {
    organizationMember: { findUnique: async (args:unknown) => { calls.push({kind:"member",args});return member; } },
    incident: { findMany: async (args:unknown) => {calls.push({kind:"list",args});return rows;}, findFirst: async (args:unknown) => {calls.push({kind:"detail",args});return rows[0]??null;} },
  };
  const db = { $transaction: async (fn:(t:unknown)=>unknown) => fn(tx) } as unknown as PrismaClient;
  return { reads: makeIncidentReads(db), calls };
}
const rejected=(code:string)=>(e:unknown)=>e instanceof ApplicationError&&e.code===code;
for(const role of ["OWNER","ADMIN","MEMBER","VIEWER"])test(`${role} explicitly allowed to read`,async()=>{
  assert.equal(canReadIncident(role),true);const s=setup({...membership,role});assert.equal((await s.reads.listIncidents(context,{})).items.length,1);assert.equal((await s.reads.getIncident(context,row.id)).id,row.id);
});
test("unknown read role fails closed",()=>{for(const role of ["unknown","", "owner"])assert.equal(canReadIncident(role),false);});
for(const [name,member] of [
  ["missing membership",null], ["suspended",{...membership,status:"SUSPENDED"}], ["revoked",{...membership,status:"REVOKED"}],
  ["unknown role",{...membership,role:"unknown"}], ["deactivated",{...membership,user:{deactivatedAt:new Date()}}], ["archived organization",{...membership,organization:{archivedAt:new Date()}}],
] as const)test(`${name} denied before incident query`,async()=>{
  const s=setup(member);await assert.rejects(s.reads.listIncidents(context,{}),rejected("NOT_FOUND"));await assert.rejects(s.reads.getIncident(context,row.id),rejected("NOT_FOUND"));assert.ok(s.calls.every(c=>c.kind==="member"));
});
test("missing context rejected before transaction",async()=>{
  const reads=makeIncidentReads({} as PrismaClient);for(const action of [()=>reads.listIncidents(null as unknown as typeof context,{}),()=>reads.getIncident({actor:{userId:""},organizationId:context.organizationId},row.id)])await assert.rejects(action(),rejected("UNAUTHENTICATED"));
});
test("all statuses mapped with exact public fields and ISO dates",()=>{
  for(const status of incidentStatuses){const dto=toIncidentDto({...row,status});assert.equal(dto.status,status);assert.deepEqual(Object.keys(dto).sort(),["id","title","description","severity","status","createdAt","updatedAt"].sort());assert.equal(dto.createdAt,row.createdAt.toISOString());}
});
test("tenant/archived predicates, select, ordering and bounded take",async()=>{
  const s=setup();await s.reads.listIncidents(context,{});await s.reads.getIncident(context,row.id);
  const list=s.calls.find(c=>c.kind==="list")!.args as Prisma.IncidentFindManyArgs;
  assert.deepEqual(list.where,{organizationId:context.organizationId,archivedAt:null});assert.equal(list.take,21);assert.deepEqual(list.orderBy,[{createdAt:"desc"},{id:"desc"}]);
  const detail=s.calls.find(c=>c.kind==="detail")!.args as Prisma.IncidentFindFirstArgs;
  assert.deepEqual(detail.where,{organizationId:context.organizationId,id:row.id,archivedAt:null});
  assert.deepEqual(Object.keys(detail.select!).sort(),["id","title","description","severity","status","createdAt","updatedAt"].sort());
});
for(const limit of ["0","-1","1.5","","101","1000","NaN"," 20","20 ",20,null])test(`invalid limit ${JSON.stringify(limit)}`,()=>assert.equal(listIncidentsQuerySchema.safeParse({limit}).success,false));
test("limits default and boundary accepted, unknown query rejected",()=>{
  assert.equal(listIncidentsQuerySchema.parse({}).limit,20);for(const limit of ["1","20","100"])assert.equal(listIncidentsQuerySchema.parse({limit}).limit,Number(limit));assert.equal(listIncidentsQuerySchema.safeParse({other:"x"}).success,false);
});
test("cursor roundtrip and strict rejection",()=>{
  assert.deepEqual(incidentCursorSchema.parse(encodeIncidentCursor(row)),{createdAt:row.createdAt,id:row.id});
  const payload={version:1,createdAt:row.createdAt.toISOString(),id:row.id};
  const bad=["", "!", "a".repeat(257), Buffer.from("not JSON").toString("base64url"), ...[{...payload,version:2},{...payload,id:"bad"},{...payload,organizationId:context.organizationId},{...payload,createdAt:"invalid"},{...payload,createdAt:"2026-10-01T12:00:00.1234Z"}].map(x=>Buffer.from(JSON.stringify(x)).toString("base64url"))];
  for(const cursor of bad)assert.equal(incidentCursorSchema.safeParse(cursor).success,false);
});
test("keyset boundary uses last returned row and fetches one extra",async()=>{
  const second={...row,id:randomUUID()};const s=setup(membership,[row,second]);const result=await s.reads.listIncidents(context,{limit:"1",cursor:encodeIncidentCursor(second)});
  assert.equal(result.items.length,1);assert.equal(result.nextCursor,encodeIncidentCursor(row));
  const args=s.calls.find(c=>c.kind==="list")!.args as Prisma.IncidentFindManyArgs;
  assert.equal(args.take,2);assert.deepEqual(args.where?.OR,[{createdAt:{lt:second.createdAt}},{createdAt:second.createdAt,id:{lt:second.id}}]);
  assert.deepEqual(await setup(membership,[]).reads.listIncidents(context,{}),{items:[],nextCursor:null});
});
test("malformed and absent incidents return NOT_FOUND",async()=>{
  await assert.rejects(makeIncidentReads({} as PrismaClient).getIncident(context,"bad"),rejected("NOT_FOUND"));await assert.rejects(setup(membership,[]).reads.getIncident(context,randomUUID()),rejected("NOT_FOUND"));
});
for(const [cause,code]of [[new Prisma.PrismaClientInitializationError("private","7.10.0","P1001"),"DATABASE_UNAVAILABLE"],[new Prisma.PrismaClientInitializationError("private","7.10.0","P1000"),"INTERNAL_ERROR"],[new Error("private"),"INTERNAL_ERROR"]] as const)test(`read database classification ${code}/${cause.name}`,async()=>{
  const db={$transaction:async()=>{throw cause;}} as unknown as PrismaClient;const reads=makeIncidentReads(db);
  for(const action of [()=>reads.listIncidents(context,{}),()=>reads.getIncident(context,row.id)])await assert.rejects(action(),e=>e instanceof ApplicationError&&e.code===code&&e.cause===cause&&!e.message.includes("private"));
});
