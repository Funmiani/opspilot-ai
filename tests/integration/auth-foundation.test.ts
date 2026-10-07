import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { config } from "dotenv";
import { betterAuth } from "better-auth";
const signCookieValue = async (token: string, secret: string) => encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`);
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createAuthOptions } from "../../src/server/auth/auth";
import { makeRequireApplicationIdentity } from "../../src/server/auth/session";
import { ApplicationError } from "../../src/server/application/errors";
config({ quiet: true });
const url = process.env.INTEGRATION_DATABASE_URL;
test("auth database persistence, UUIDs, session validity and user availability", { skip: !url }, async () => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url!).hostname));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const secret = randomBytes(32).toString("base64");
  const auth = betterAuth(createAuthOptions(db, { secret, origin: "http://localhost:3000" }));
  const ctx = await auth.$context;
  const ids: string[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const reject = (code: string) => (e: unknown) => e instanceof ApplicationError && e.code === code;
  try {
    const user = await ctx.internalAdapter.createUser({ name: "Auth fixture", email: `${randomUUID()}@example.invalid`, emailVerified: false }, { method: "oauth", oauth: { providerId: "google", profile: {} } });
    ids.push(user.id); assert.match(user.id, uuid);
    // Preserve the legacy nullable displayName and prove session verification tolerates it.
    await db.user.update({ where: { id: user.id }, data: { displayName: null } });
    const account = await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "google", accountId: randomUUID(), accessToken: "test-access", refreshToken: "test-refresh", idToken: "test-id", accessTokenExpiresAt: new Date(), refreshTokenExpiresAt: new Date() });
    assert.ok(account); assert.match(account.id, uuid);
    const checkTokens = async () => {
      const row = await db.account.findUniqueOrThrow({ where: { id: account.id } });
      for (const field of ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"] as const) assert.equal(row[field], null);
    };
    await checkTokens();
    await ctx.internalAdapter.updateAccount(account.id, { accessToken: "new", refreshToken: "new", idToken: "new", accessTokenExpiresAt: new Date(), refreshTokenExpiresAt: new Date() });
    await checkTokens();
    const session = await ctx.internalAdapter.createSession(user.id); assert.ok(session); assert.match(session.id, uuid);
    const headers = new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${await signCookieValue(session.token, secret)}` });
    const guard = makeRequireApplicationIdentity({ getSession: h => auth.api.getSession({ headers: h }), findUser: id => db.user.findUnique({ where: { id }, select: { id: true, deactivatedAt: true } }) });
    assert.deepEqual(await guard(headers), { userId: user.id });
    assert.equal((await auth.api.getSession({ headers }))?.user.name, null);
    await assert.rejects(guard(new Headers()), reject("UNAUTHENTICATED"));
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
    assert.ok(await auth.api.getSession({ headers }));
    await assert.rejects(guard(headers), reject("FORBIDDEN"));
    assert.equal(await ctx.internalAdapter.createSession(user.id), null);
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: null } });
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(guard(headers), reject("UNAUTHENTICATED"));
    const second = await ctx.internalAdapter.createSession(user.id); assert.ok(second);
    const revoked = new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${await signCookieValue(second.token, secret)}` });
    await db.session.delete({ where: { id: second.id } });
    await assert.rejects(guard(revoked), reject("UNAUTHENTICATED"));
    const verification = await ctx.internalAdapter.createVerificationValue({ identifier: `fixture-${user.id}`, value: "synthetic", expiresAt: new Date(Date.now() + 60000) });
    assert.match(verification.id, uuid);
    await db.verification.delete({ where: { id: verification.id } });
  } finally {
    for (const id of ids) await db.verification.deleteMany({ where: { identifier: `fixture-${id}` } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    assert.equal(await db.user.count({ where: { id: { in: ids } } }), 0);
    assert.equal(await db.session.count({ where: { userId: { in: ids } } }), 0);
    assert.equal(await db.account.count({ where: { userId: { in: ids } } }), 0);
    await db.$disconnect();
  }
});
