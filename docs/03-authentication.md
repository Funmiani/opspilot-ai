# Authentication

Authentication answers “who is using the application?” It does not grant a workspace or role. Better Auth verifies Google identity and maintains a local login; OpsPilot separately checks whether its local User is usable.

## Implemented flow

The client initiates Google social sign-in; Better Auth's GET/POST handler lives at `/api/auth/[...all]`, with base path `/api/auth`. Google redirects to `/api/auth/callback/google`; successful sign-in goes to `/app`, failures to `/auth/error`. Sign-out revokes the current database session and returns to `/sign-in`.

The existing Prisma singleton is passed to prismaAdapter with PostgreSQL transaction support. Better Auth uses built-in UUID generation and maps logical `name` to `displayName`. Google name is trimmed with `OpsPilot user` fallback. Existing nullable names remain permitted in storage.

Account identifies the provider subject independently of email. Implicit linking is disabled and `/link-social` is rejected. A same-email identity without a matching Account is not silently attached to the existing User. Email is profile/contact data, not sufficient proof for account linking.

## Sessions and availability

Sessions expire after seven days; updateAge is one day. Cookie cache and account cookie are disabled; OAuth state uses database storage. Session contents provide no organization, membership or role authority. Expired rows can remain in storage and must not be counted as active.

A session-create hook rejects missing/deactivated Users. `requireApplicationIdentity()` verifies the session/expiry and reloads the local User; it returns only `{ userId }`. A valid Better Auth session is not sufficient when the application User is deactivated. This guard does not select a tenant.

## Provider credential policy

Google is used only for sign-in, with online access and no extra Google API scopes requested by the application. Better Auth's normal identity scopes apply. Account create/update hooks clear accessToken, refreshToken, idToken and both expiry fields. OAuth token encryption is enabled as defense in depth. Hooks apply to Better Auth writes; arbitrary direct Prisma writes bypass them.

## Secrets and cookies

Server-only configuration requires BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET plus DATABASE_URL for persistence. Client ID is an identifier; client secret and auth secret are confidential. All stay in the ignored environment; none use NEXT_PUBLIC_. Configuration is lazy and fails closed on actual use.

The secret must be >=32 characters, without whitespace/placeholders, and pass the configured diversity estimate; this is not proof of randomness. URL validation accepts a canonical origin (optional trailing slash), rejects credentials/path/query/hash, and requires HTTPS except HTTP loopback in development.

Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Better Auth manages OAuth state and origin/redirect protection. OpsPilot allowlists sign-in request fields and fixed destinations, uses its configured origin as trusted origin, and disables arbitrary linking. These controls are separate from domain POST protections described in [API design](07-api-design.md).

For Google setup and local environment see [deployment](12-deployment.md). Automated auth tests do not prove real Google consent/callback behavior.
