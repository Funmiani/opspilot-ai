import { test } from "node:test";
import assert from "node:assert/strict";
import { createIncidentSchema } from "../../src/features/incidents/schemas";
import { canCreateIncident } from "../../src/features/incidents/server/permissions";
import { toCreatedIncidentDto } from "../../src/features/incidents/server/incident-dto";

const valid = { title: "  Database outage  ", severity: "HIGH" };
test("strict validation normalizes input and rejects privileged or invalid fields", () => {
  assert.equal(createIncidentSchema.parse(valid).title, "Database outage");
  assert.equal(createIncidentSchema.parse({ ...valid, description: "   " }).description, undefined);
  for (const field of ["organizationId", "createdByMemberId", "status", "createdAt", "updatedAt", "actorMemberId"]) {
    assert.equal(createIncidentSchema.safeParse({ ...valid, [field]: "untrusted" }).success, false);
  }
  for (const input of [null, [], {}, { ...valid, title: " " }, { ...valid, title: "x".repeat(201) },
    { ...valid, severity: "INVALID" }, { ...valid, description: null }, { ...valid, description: "x".repeat(10001) }]) {
    assert.equal(createIncidentSchema.safeParse(input).success, false);
  }
  assert.equal(createIncidentSchema.safeParse({title:"x".repeat(200),severity:"LOW",description:"x".repeat(10000)}).success,true);
});
test("creation permissions default to deny", () => {
  for (const role of ["OWNER", "ADMIN", "MEMBER"]) assert.equal(canCreateIncident(role), true);
  for (const role of ["VIEWER", "UNKNOWN", ""]) assert.equal(canCreateIncident(role), false);
});
test("response mapping emits only public fields and ISO dates", () => {
  const date = new Date("2026-10-07T00:00:00.000Z");
  const result = toCreatedIncidentDto({id:"id",title:"title",description:null,severity:"HIGH",createdAt:date,updatedAt:date});
  assert.deepEqual(result,{id:"id",title:"title",description:null,severity:"HIGH",status:"OPEN",createdAt:date.toISOString(),updatedAt:date.toISOString()});
});


test("all severity values are accepted and nonblank descriptions are trimmed", () => {
  for (const severity of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
    assert.equal(createIncidentSchema.parse({ ...valid, severity }).severity, severity);
  }
  assert.equal(createIncidentSchema.parse({ ...valid, description: "  Useful details  " }).description, "Useful details");
});
test("missing severity and incorrect primitive input types are rejected", () => {
  for (const input of ["text", 42, true, undefined, { title: "Title" },
    { ...valid, title: 42 }, { ...valid, title: true },
    { ...valid, description: 42 }, { ...valid, description: false },
    { ...valid, severity: 42 }, { ...valid, severity: false }]) {
    assert.equal(createIncidentSchema.safeParse(input).success, false);
  }
});
