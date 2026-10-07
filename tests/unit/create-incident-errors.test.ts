import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client";
import { makeCreateIncident } from "../../src/features/incidents/server/create-incident";
import type { TrustedActorContext } from "../../src/server/application/trusted-context";
import { ApplicationError } from "../../src/server/application/errors";

const context = { actor: { userId: "actor" }, organizationId: "organization" };
const input = { title: "Incident", severity: "HIGH" };

for (const [name, missing] of [
  ["null context", null],
  ["absent actor userId", { actor: {}, organizationId: "organization" } as TrustedActorContext],
  ["absent organizationId", { actor: { userId: "actor" } } as TrustedActorContext],
  ["missing actor userId", { actor: { userId: "" }, organizationId: "organization" }],
  ["missing organizationId", { actor: { userId: "actor" }, organizationId: "" }],
] as const) {
  test(`${name} is unauthenticated and starts no transaction`, async () => {
    let calls = 0;
    const db = { $transaction: async () => { calls++; throw new Error("Must not be called"); } };
    await assert.rejects(makeCreateIncident(db as unknown as PrismaClient)(missing, input),
      (error: unknown) => error instanceof ApplicationError && error.code === "UNAUTHENTICATED");
    assert.equal(calls, 0);
  });
}

const temporaryCodes = ["P1001", "P1002", "P1008", "P1017", "P2024"];
const initializationCodes = [...temporaryCodes, "P1000", "P1012", "P1013", "P9999", undefined];
for (const code of initializationCodes) {
  test(`initialization ${code ?? "without code"} has safe classification and retained cause`, async () => {
    const original = new Prisma.PrismaClientInitializationError("Private diagnostic", "7.10.0", code);
    const db = { $transaction: async () => { throw original; } };
    const expected = code && temporaryCodes.includes(code) ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR";
    await assert.rejects(makeCreateIncident(db as unknown as PrismaClient)(context, input), (error: unknown) => {
      assert.ok(error instanceof ApplicationError);
      assert.equal(error.code, expected);
      assert.equal(error.cause, original);
      assert.equal(error.message, expected === "DATABASE_UNAVAILABLE"
        ? "The database is temporarily unavailable." : "The incident could not be created.");
      assert.equal(error.message.includes("Private diagnostic"), false);
      return true;
    });
  });
}
for (const code of [...temporaryCodes, "P2003", "P1000", "P1013"]) {
  test(`known request ${code} retains cause with safe classification`, async () => {
    const original = new Prisma.PrismaClientKnownRequestError("Private database detail", { code, clientVersion: "7.10.0" });
    const db = { $transaction: async () => { throw original; } };
    await assert.rejects(makeCreateIncident(db as unknown as PrismaClient)(context, input), (error: unknown) => {
      assert.ok(error instanceof ApplicationError);
      assert.equal(error.code, temporaryCodes.includes(code) ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR");
      assert.equal(error.cause, original);
      assert.equal(error.message.includes("Private database detail"), false);
      return true;
    });
  });
}
test("unexpected failure is internal regardless of message and retains cause", async () => {
  const original = new Error("P1001 private diagnostic");
  const db = { $transaction: async () => { throw original; } };
  await assert.rejects(makeCreateIncident(db as unknown as PrismaClient)(context, input), (error: unknown) => {
    assert.ok(error instanceof ApplicationError);
    assert.equal(error.code, "INTERNAL_ERROR"); assert.equal(error.cause, original);
    assert.equal(error.message, "The incident could not be created.");
    return true;
  });
});
