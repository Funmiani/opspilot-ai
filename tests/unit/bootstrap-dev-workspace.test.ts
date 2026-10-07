import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkLocalDevelopment, parseBootstrapArgs } from "../../scripts/bootstrap-dev-workspace-logic";
const args = ["--user-id", randomUUID(), "--name", "  Test  ", "--slug", "test-workspace", "--role", "MEMBER"];
for (const [name, env] of Object.entries({ production: {NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/dev"}, test: {NODE_ENV:"test",DATABASE_URL:"postgresql://localhost/dev"}, missing: {}, remote: {NODE_ENV:"development",DATABASE_URL:"postgresql://remote.invalid/dev"}, malformed: {NODE_ENV:"development",DATABASE_URL:"invalid"}, routingOverride: {NODE_ENV:"development",DATABASE_URL:"postgresql://localhost/dev?host=remote.invalid"}, staging: {NODE_ENV:"development",DATABASE_URL:"postgresql://localhost/staging"} })) test(`bootstrap rejects ${name}`, () => assert.throws(() => checkLocalDevelopment(env)));
for (const host of ["localhost", "127.0.0.1", "[::1]"]) test(`bootstrap accepts loopback ${host}`, () => assert.ok(checkLocalDevelopment({NODE_ENV:"development",DATABASE_URL:`postgresql://${host}/dev?schema=public`})));
for (const [name, input] of Object.entries({ missing: [], missingRole: args.slice(0,6), badUUID: ["--user-id","bad",...args.slice(2)], badRole: [...args.slice(0,7),"SUPERUSER"], badSlug: [...args.slice(0,5),"Bad Slug",...args.slice(6)], blankName: [...args.slice(0,3),"   ",...args.slice(4)], duplicate: [...args,"--role","OWNER"] })) test(`bootstrap inputs reject ${name}`, () => assert.throws(() => parseBootstrapArgs(input)));
test("bootstrap inputs preserve explicit role and slug, trim name", () => assert.deepEqual(parseBootstrapArgs(args), {userId:args[1],name:"Test",slug:"test-workspace",role:"MEMBER"}));
