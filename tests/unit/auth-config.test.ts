import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readAuthEnv } from "../../src/server/auth/env";
import { createAuthOptions } from "../../src/server/auth/auth";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { makeRequireApplicationIdentity } from "../../src/server/auth/session";
import { ApplicationError } from "../../src/server/application/errors";
const secret = randomBytes(32).toString("base64");
const env = { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "http://localhost:3000", NODE_ENV: "development", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret" };
for (const [name, override] of Object.entries({
  missingGoogleId: { GOOGLE_CLIENT_ID: undefined }, missingGoogleSecret: { GOOGLE_CLIENT_SECRET: undefined }, placeholderGoogle: { GOOGLE_CLIENT_SECRET: "REPLACE_ME" },
  missingSecret: { BETTER_AUTH_SECRET: undefined }, weakSecret: { BETTER_AUTH_SECRET: "a".repeat(40) },
  normalizedPath: { BETTER_AUTH_URL: "https://example.com/path/.." }, credentials: { BETTER_AUTH_URL: "https://user:pass@example.com" },
  malformedURL: { BETTER_AUTH_URL: "invalid" }, path: { BETTER_AUTH_URL: "https://example.com/path" },
  query: { BETTER_AUTH_URL: "https://example.com/?q=1" }, hash: { BETTER_AUTH_URL: "https://example.com/#x" },
  productionHTTP: { NODE_ENV: "production" }, externalHTTP: { BETTER_AUTH_URL: "http://example.com" },
})) test(`auth environment rejects ${name}`, () => assert.throws(() => readAuthEnv({ ...env, ...override })));
test("development localhost HTTP and production HTTPS accepted", () => {
  assert.equal(readAuthEnv(env).origin, env.BETTER_AUTH_URL);
  assert.equal(readAuthEnv({ ...env, NODE_ENV: "production", BETTER_AUTH_URL: "https://example.com" }).origin, "https://example.com");
});
test("auth configuration uses reviewed database and session policies", async () => {
  const o = createAuthOptions({} as PrismaClient, readAuthEnv(env));
  assert.equal(o.user.fields.name, "displayName"); assert.equal(o.advanced.database.generateId, "uuid");
  assert.equal(o.account.accountLinking.disableImplicitLinking, true); assert.equal(o.emailAndPassword.enabled, false);
  assert.deepEqual(o.session, { expiresIn: 604800, updateAge: 86400, cookieCache: { enabled: false } });
  assert.equal(o.account.storeAccountCookie, false); assert.equal(o.account.encryptOAuthTokens, true);
  assert.equal(o.account.storeStateStrategy, "database"); assert.equal(o.socialProviders.google.accessType, "online");
  assert.equal(o.socialProviders.google.includeGrantedScopes, false);
  assert.equal(o.socialProviders.google.prompt, "select_account");
  for (const hook of [o.databaseHooks.account.create.before, o.databaseHooks.account.update.before]) {
    assert.deepEqual((await hook()).data, { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null });
  }
});
for (const scenario of ["missing", "expired", "deactivated", "missingUser", "active"] as const) {
  test(`application identity: ${scenario}`, async () => {
    const guard = makeRequireApplicationIdentity({
      getSession: async () => scenario === "missing" ? null : { user: { id: "verified-user" }, session: { expiresAt: new Date(Date.now() + (scenario === "expired" ? -1000 : 60000)) } },
      findUser: async () => scenario === "missingUser" ? null : { id: "verified-user", deactivatedAt: scenario === "deactivated" ? new Date() : null },
    });
    if (scenario === "active") assert.deepEqual(await guard(new Headers()), { userId: "verified-user" });
    else await assert.rejects(guard(new Headers()), (e: unknown) => e instanceof ApplicationError && e.code === (["missing", "expired"].includes(scenario) ? "UNAUTHENTICATED" : "FORBIDDEN"));
  });
}

test("session creation fails closed for missing local users", async () => {
  const db = { user: { findUnique: async () => null } } as unknown as PrismaClient;
  const options = createAuthOptions(db, readAuthEnv(env));
  assert.equal(await options.databaseHooks.session.create.before({ userId: "missing" } as Parameters<typeof options.databaseHooks.session.create.before>[0]), false);
});
test("unexpected session verification errors remain safe and retain cause", async () => {
  const cause = new Error("sensitive database detail");
  const guard = makeRequireApplicationIdentity({ getSession: async () => { throw cause; }, findUser: async () => null });
  await assert.rejects(guard(new Headers()), (e: unknown) => e instanceof ApplicationError && e.code === "INTERNAL_ERROR" && e.cause === cause && !e.message.includes("sensitive"));
});

test("Google name normalization and fixed redirect policy", async () => {
  const { normalizeGoogleName, enforceGoogleSignIn } = await import("../../src/server/auth/google-policy");
  assert.equal(normalizeGoogleName("  Ada  "), "Ada");
  for (const name of [undefined, null, "   ", 42]) assert.equal(normalizeGoogleName(name), "OpsPilot user");
  const body = { provider: "google" };
  enforceGoogleSignIn(body);
  assert.deepEqual(body, { provider: "google", callbackURL: "/app", newUserCallbackURL: "/app", errorCallbackURL: "/auth/error" });
  for (const override of [{ provider: "github" }, { callbackURL: "https://evil.invalid" }, { newUserCallbackURL: "/other" }, { errorCallbackURL: "/other" }, { scopes: ["drive"] }, { additionalParams: { access_type: "offline" } }, { idToken: { token: "x" } }, { disableRedirect: true }]) {
    assert.throws(() => enforceGoogleSignIn({ provider: "google", ...override }));
  }
});
test("official Next handler forwards GET and POST requests", async () => {
  const { toNextJsHandler } = await import("better-auth/next-js");
  const methods: string[] = [];
  const handlers = toNextJsHandler(async request => { methods.push(request.method); return new Response("ok"); });
  assert.equal((await handlers.GET(new Request("http://localhost:3000/api/auth/get-session"))).status, 200);
  assert.equal((await handlers.POST(new Request("http://localhost:3000/api/auth/sign-out", { method: "POST" }))).status, 200);
  assert.deepEqual(methods, ["GET", "POST"]);
});
