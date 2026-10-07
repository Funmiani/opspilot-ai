# OpsPilot AI

Operations and incident intelligence platform built with Next.js 16, TypeScript,
PostgreSQL, and Prisma 7.10.0. This milestone provides only the database foundation;
there is no authentication, AI, background processing, or PostgreSQL RLS.

## Runtime and installation

Use the repository's Node 24 runtime without changing your NVM default:

```sh
nvm use
npm ci
npm run db:generate
npm run dev
```

The generated client is ignored by Git. Generate it after installing dependencies
and after changing the schema. `npm run build` generates it before building Next.js.

## Local PostgreSQL setup

Install Docker Desktop (or another Docker engine with Compose), start it, then:

```sh
cp .env.example .env # only if .env does not already exist
```

Set a random local password in both `POSTGRES_PASSWORD` and `DATABASE_URL`.
The initial setup has already populated the local ignored `.env`; preserve it.

```sh
docker compose up -d --wait
docker compose ps
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user;"'
```

Compose runs only PostgreSQL 18 (`postgres:18-bookworm`). It binds to loopback
port 5432 and persists data in the named `opspilot-dev_postgres_data` volume at
`/var/lib/postgresql`, the PostgreSQL 18 image's volume location. The major version
is pinned; fresh pulls can receive patch updates. `pg_isready` tests readiness;
the `psql` command also verifies password-authenticated TCP access.

The bootstrap role is a local-development superuser and can create Prisma's
short-lived shadow databases automatically. No persistent shadow database or
`SHADOW_DATABASE_URL` is needed for this setup. Do not use this role in production.

Use `docker compose stop` or `docker compose down` to stop the database while
keeping its data. `docker compose down --volumes` destroys the local database;
do not run it unless deliberately resetting development data. Changing credentials
in `.env` does not change credentials already initialized in the volume. If host
port 5432 is occupied, change `POSTGRES_PORT` and the port in `DATABASE_URL` together.
Never share the output of `docker compose config` or environment inspection: it
can expose the interpolated password.

Edit the root `.env` privately with your actual local username, password, and database.
URL-encode special characters in credentials. Next.js loads the file at runtime;
Prisma CLI loads it through `dotenv`. Keep database settings in `.env`, rather than
only `.env.local`, so both use the same settings. Already-exported environment
variables take precedence for Prisma CLI; avoid conflicting URLs across env files.

Real `.env*` files are ignored. Only `.env.example`, containing placeholders, is
committed. Never prefix the URL with `NEXT_PUBLIC_`, log it, or send it to a browser.
Production and CI should inject secrets through their environment settings. Use
verified TLS with hosted databases and a restricted runtime role. Where a pooler
requires a separate migration connection, configure the CLI URL separately from
the runtime URL before deployment.

## Schema and tenant boundaries

- `User` is a global identity with a unique email; normalize email before writing.
  Authentication identity integration is deferred.
- `Organization` is a tenant with a unique slug.
- `OrganizationMember` connects users and organizations, with one record per pair,
  a tenant-specific role, and active/suspended/revoked status.
- `Incident` belongs to one organization, has a required creator membership and an
  optional assignee membership, status, severity, and lifecycle timestamps.
- `Comment` belongs to one incident and organization, with a required author membership.
- `ActivityLog` belongs to one organization, optionally references an incident and
  actor membership, and stores an event type and optional JSON details.

All IDs use PostgreSQL UUID columns. Dates use timestamps with time zone. Tenant
relationships use composite foreign keys to prevent cross-organization references.
Tenant-first indexes support lists, assignment queries, discussion, and history.
Foreign-key delete and update actions are explicitly `Restrict`: deactivate users,
revoke memberships, and archive organizations/incidents instead of deleting history.

Constraints ensure structural consistency, not access control. Future server code
must verify sessions, active membership, and permissions on every operation, scope
queries by organization, validate workflow transitions, and construct allowlisted
writes. An enum does not enforce legal status transitions or preserve the last owner.
User activity must have an actor membership; system activity must not. This actor
rule and append-only activity behavior are application policies at this milestone,
not database CHECK constraints or write privileges. JSON details must exclude secrets.
Write mutations and their activity events in the same transaction when implemented.

The database module is `src/server/db/client.ts`, protected by `server-only`. It
reuses a client during development reloads. Its connection pool has a maximum of
five connections per process with finite connect and idle timeouts; tune capacity
against deployment concurrency and database limits. It requires `DATABASE_URL` when
imported and is not imported by the starter page.

## Commands and first migration

```sh
npm run db:format
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run build
```

Validation and generation do not connect to PostgreSQL and can run without a URL.
Database commands require a real configured database. After confirming the development URL and container health:

```sh
npm run db:status
npm run db:migrate -- --name init --create-only
```

Review the resulting migration SQL before applying it to development with
`npm run db:migrate`. Verify same-tenant writes succeed, duplicate memberships fail,
and cross-tenant references fail against the actual database before deployment.
Migrations belong in version control; generated client files do not. Prisma creates
its migration history table when migrations are applied.

Use `npm run db:deploy` in a controlled deployment step to apply committed migrations
in production. Do not use `migrate dev` or schema-push commands there. Migrations do
not run automatically during installation, application startup, or builds.

`npm run db:studio` opens the database browser. It is a local administration tool,
not an authenticated application endpoint.

## Create Incident application layer

`src/features/incidents/server/index.ts` exports the server-only `createIncident`
use case. Its input is unknown and validated with strict Zod rules: trimmed title
(1–200 characters), optional description (maximum 10,000; blank becomes absent),
and required severity. Unknown properties are rejected. Response DTOs are independent
of Prisma and expose ISO date strings.

There is no HTTP route or authentication provider. A future verified server-side
adapter must supply `TrustedActorContext`; never construct it from unverified headers
or request body IDs. The type is not authentication. The use case looks up the
organization/user membership on the server and requires ACTIVE status, an available
organization/user, and OWNER, ADMIN, or MEMBER role. VIEWER is denied. Missing
membership and unknown tenant both return FORBIDDEN to avoid tenant enumeration.

Authorization, incident creation, and its server-authored INCIDENT_CREATED event
run inside one short normal Prisma transaction. Concurrent membership revocation
can overlap an authorized write; stronger isolation/revocation ordering is future
hardening. No serializable retries are implemented. Unexpected database errors are
wrapped with safe messages and their original cause retained internally; a future
transport must explicitly serialize safe code/message/issues fields only. Planned
HTTP mappings: validation 422, missing context 401, forbidden 403, not found 404,
database unavailable 503, internal 500; malformed JSON 400 and creation 201.

```sh
npm test
npm run test:integration
```

Integration tests skip unless `INTEGRATION_DATABASE_URL` is explicitly set to a local
PostgreSQL URL with the applied schema. They use unique temporary fixtures, remove
only those fixtures in finally, and never reset the database. To deliberately run
against the local development database without displaying its URL:

```sh
node --env-file=.env --input-type=module -e 'import { spawnSync } from "node:child_process"; const r=spawnSync("npm",["run","test:integration"],{stdio:"inherit",env:{...process.env,INTEGRATION_DATABASE_URL:process.env.DATABASE_URL}}); process.exit(r.status ?? 1);'
```

Tests use Node's built-in runner through tsx. The react-server condition enables
server-only modules in this server test environment. Rollback is tested by a
test-owned Prisma extension that fails the activity write, without adding a
production test hook or replacing Prisma transaction execution.

### Server authentication foundation (Milestone 3B)

Better Auth reuses the existing Prisma singleton. No auth HTTP routes, Google
provider, or sign-in UI are exposed yet. Before using auth, configure
`BETTER_AUTH_SECRET` with a randomly generated secret (at least 32 characters;
for example, generate one locally with `openssl rand -base64 32`) and
`BETTER_AUTH_URL` with the canonical origin in your ignored local environment.
Never commit the secret. HTTPS is required except HTTP loopback in development.
Set `NODE_ENV=development` for local standalone authentication scripts.

Configuration is initialized lazily, so unrelated static builds do not need auth
secrets; any actual auth use fails closed if configuration is missing or invalid.
Sessions expire after seven days and renew at most daily, without cookie caching.
Account create/update hooks clear provider credentials before persistence;
encryption is also enabled. Direct Prisma writes do not execute Better Auth hooks.
The application session guard returns only `userId` and rechecks deactivation.
It does not select an organization or authorize tenant operations.

Auth integration tests use the existing explicit `INTEGRATION_DATABASE_URL`
local-database opt-in and synthetic test secrets. They verify persistence and
session behavior, not Google OAuth. Fixtures are deleted after each test.

### Google sign-in (Milestone 3C)

Create a Google OAuth **Web application** client with the redirect URI
`http://localhost:3000/api/auth/callback/google`. Configure the consent screen,
identity scopes only, and test users as required in Google Auth platform.
Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` directly in your ignored `.env`;
never paste them into chat or logs. Restart Next.js after configuration changes.
Use `BETTER_AUTH_URL=http://localhost:3000` and browse using localhost consistently.
Production requires your HTTPS origin and its matching Google callback URI.

Run `nvm use` and `npm run dev`, then visit `/sign-in`. Continue with Google,
complete account selection/consent, and confirm `/app` shows the authenticated
state. The callback passes through `/api/auth/callback/google`. Check User,
Account, and Session records locally without displaying token values; provider
credential columns must be null. Inspect the HttpOnly/SameSite=Lax cookie
(Secure under HTTPS, not local HTTP). Sign out and confirm the previous session
cannot access `/app`. Same-email accounts are never silently linked; deactivated
users are denied. No organization membership is created or loaded by this flow.

Automated tests use synthetic configuration and test persistence/transport, not
real Google authentication. Real browser acceptance remains a manual step.

### Workspace access (Milestone 3D-A)

After sign-in, use the `/app` link to `/workspaces`. A user without memberships
sees **No workspace access**; authentication never creates membership. One or
more accessible workspaces remain explicit links, without automatic selection.

Discovery uses one Prisma User lookup with filtered related memberships: it
rechecks current user availability and returns only organization ID/name for
ACTIVE memberships in unarchived organizations. Prisma may use multiple SQL
statements for relation loading. The selected workspace resolver uses the
organization/user compound key and checks membership, user, and organization
availability before constructing only actor userId and organizationId.
Malformed IDs and inaccessible tenants have the same denial; database failures
remain internal/availability errors. Nothing is stored in shared caches, sessions,
or cookies as workspace authority. Future commands must still recheck RBAC inside
their transactions. An explicit development-only workspace bootstrap is available
as documented below; it never runs automatically during authentication.

### Explicit local workspace bootstrap (Milestone 3D-B)

This administrative command never runs during login. After zero-access testing,
intentionally provision an existing active local User:

```sh
NODE_ENV=development npm run dev:bootstrap-workspace -- \
  --user-id <USER_UUID> \
  --name "OpsPilot Development" \
  --slug opspilot-development \
  --role MEMBER
```

Use the repository's Node 24 runtime. All four arguments are required. Names are
trimmed and limited to 100 characters. Slugs are 1–100 lowercase letters/digits
separated by single hyphens; they are rejected rather than normalized. These are
bootstrap input limits: the existing database uses unbounded text and unique slug.
Roles are explicit OWNER, ADMIN, MEMBER, or VIEWER; there is no default role
or automatic OWNER grant. The command requires an explicit User ID, organization
name, organization slug, and role. It never infers a User from email, the first
User, or the current session.

The script reads the same DATABASE_URL as Prisma configuration. It requires
NODE_ENV=development, a PostgreSQL loopback host, a database path, and no query
parameters except schema. Conventional production/staging database names are
rejected. Never use this command against production, staging, or remote databases.
Loopback cannot detect a tunnel to a remote database: use only the
repository's local Docker database, never a forwarded production connection.
User checks, unused-slug checks, Organization and ACTIVE membership creation run
in one transaction. Duplicate slugs stop execution; no reuse/upsert occurs.
Existing identity/auth records are not changed. Failed membership writes roll back
the new Organization. This is not production onboarding.
