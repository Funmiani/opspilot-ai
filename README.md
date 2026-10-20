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

### Authenticated Create Incident API (Milestone 4A)

`POST /api/workspaces/[organizationId]/incidents` accepts only `title`, optional
`description`, and `severity` (LOW, MEDIUM, HIGH, CRITICAL). Unknown fields are
rejected by the existing strict application schema. Success returns the existing
Incident DTO with HTTP 201; creation does not currently return a Location header.

Browser requests require an Origin exactly matching the validated BETTER_AUTH_URL
origin and Content-Type application/json (normal parameters are accepted).
Missing/null/foreign origins and cross-site Fetch Metadata are rejected with 403.
No credentialed cross-origin CORS is enabled. JSON bodies are limited to 64 KiB,
including streamed requests: malformed JSON returns 400, oversized bodies 413,
and unsupported media types 415. All responses use Cache-Control: no-store.

The endpoint verifies the database-backed session and active local User, resolves
the untrusted URL tenant, then calls the existing create use case. Tenant denials
share a generic 404; an accessible workspace's create-permission denial is 403.
Unauthenticated requests return 401, validation 400, recognized database
unavailability 503, and unexpected failures a safe 500. Public validation issues
allowlist title/description/severity, use fixed messages, and return at most five
issues; internal errors and original causes are never serialized or logged.

The use case rechecks current membership, role, and availability inside its short
transaction. Incident and INCIDENT_CREATED ActivityLog commit together, with
server-derived attribution. Milestone 4A introduced POST incident creation;
Milestone 4B adds GET tenant-scoped incident list and detail endpoints, documented
below. The permission-aware workspace Incident UI supports authorized creation;
Incident detail UI remains unimplemented.
Idempotency is deferred: if a commit succeeds but its response is lost, a deliberate
retry can create a duplicate incident. Exactly-once behavior is not guaranteed.

### Tenant-scoped Incident Reads (Milestone 4B)

`GET /api/workspaces/[organizationId]/incidents` returns
`{ items: IncidentDto[], nextCursor: string | null }`. Optional `limit` is a
decimal integer string from 1–100 (default 20); optional `cursor` is a bounded,
versioned base64url position containing only a millisecond ISO timestamp and
Incident UUID. Duplicate/unknown query parameters and invalid values return safe
400 responses. Ordering is createdAt DESC, id DESC; the query fetches limit + 1
and emits a cursor from the last returned item only when another page exists.
There is no total count. Cursors carry no tenant authority and are not encrypted.

`GET /api/workspaces/[organizationId]/incidents/[incidentId]` returns an IncidentDto.
Both APIs return only id, title, description, severity, actual status, and ISO
createdAt/updatedAt strings. ACTIVE OWNER, ADMIN, MEMBER, and VIEWER may read;
unknown roles deny. Current User availability, membership, role, and Organization
availability are rechecked inside a short transaction before the tenant-scoped
query. Normal transactions do not serialize every concurrent authorization change.

Archived Incidents are excluded; unarchived CLOSED Incidents remain readable.
Malformed/missing/cross-tenant/archived Incident IDs share a generic 404. Inaccessible
tenants and read-access denials are concealed; unexpected database failures remain
safe 503/500 responses. All handler responses use Cache-Control: no-store.
GET needs neither Origin nor Content-Type and runs no POST body/CSRF helper.
No cross-origin credentialed CORS is enabled; POST security remains unchanged.
Authenticated tenant-scoped reads and the permission-aware workspace Incident UI
are implemented, including creation by authorized users. Incident detail UI,
filtering, and archive/restore capability remain unimplemented.

### Minimal Incident Workspace UI (Milestone 4C)

`/workspaces/[organizationId]` now renders the first 20 incidents directly through
server-side identity verification, tenant resolution, and the authorized read use
case. A separate server-only capability lookup reloads current membership and
availability and returns only canCreateIncident. This is a presentation hint;
the create API independently enforces current database authorization.

The list shows title, severity, status, a description excerpt, and UTC timestamps.
Empty workspaces display "No incidents yet." When further rows exist, the page
reports "Showing the latest 20 incidents." Pagination controls remain deferred.
ACTIVE OWNER/ADMIN/MEMBER see an inline create form; VIEWER sees read-only copy.

The small client form reuses the client-safe strict create schema for UX and sends
only title, optional description, and severity through the existing same-origin
POST. Confirmed 201 resets the form, announces success, and calls router.refresh()
to reload server identity, tenant access, incidents, and capabilities. Failures
preserve input and display fixed safe messages. Session/workspace failures offer
fixed navigation; 403 refreshes permission presentation. A synchronous guard and
disabled controls prevent accidental concurrent submits, without API idempotency.
Network failures have an uncertain outcome: check the list before retrying.

No route loading file, UI libraries, detail UI, or new dependencies are added.
Mounted form behavior, focus, refresh wiring, and visual/keyboard accessibility
require real browser acceptance; Node tests verify extracted logic and database
capabilities, not mounted React behavior. Already-rendered content is not revoked
in realtime; subsequent reads/writes enforce current database authority.

### Investigation domain foundation (Milestone 5A)

Comment is the human investigation-note mechanism. CommentKind defaults to NOTE;
HYPOTHESIS means an unconfirmed possible explanation, and ACTION means reported
human work, not an executable instruction or proof an external action occurred.
IncidentEvidence stores human-supplied material for consideration, not verified
truth: LOG_EXCERPT, ERROR_MESSAGE, DEPLOYMENT_REFERENCE, MONITORING_ALERT,
OBSERVATION, or REFERENCE. No evidence origin column or arbitrary metadata exists.
Future AI output must not use the human-evidence path while pretending to be
human evidence. ActivityLog records an OpsPilot operation, not objective truth.

Evidence has UUID identifiers, same-tenant Incident and author-membership foreign
keys, RESTRICT deletion/update behavior, and a server timestamp. No updatedAt is
needed for the planned append-only V1 APIs; the database does not enforce
append-only writes. COMMENT_ADDED is retained; EVIDENCE_ADDED is available for
future application use. No investigation APIs, UI, or context assembly exist yet.

The reviewed migration uses TEXT with named CHECK constraints for Comment
body (1–10,000 characters), evidence title (1–200), content (1–20,000), and optional
sourceUrl (at most 2,048). Nonblank checks cover ordinary ASCII whitespace.
PostgreSQL character counts differ from JavaScript UTF-16 lengths; future strict
Zod validation must trim input and enforce the approved application bounds.
URL HTTP/HTTPS and credential validation remain future application responsibilities.
CHECK constraints are custom migration SQL and are not represented by Prisma;
retain and review them in future schema changes. The migration is applied to the
local development database; existing development records remain intact. Rollback-only
PostgreSQL tests cover tenant constraints, enums, storage boundaries, defaults, and
RESTRICT actions. PostgreSQL reports tested RESTRICT failures as SQLSTATE 23001;
invalid child foreign keys use 23503, invalid enums 22P02, and CHECK failures 23514.
A Unicode diagnostic confirms one emoji has PostgreSQL length 1 and JavaScript
length 2; these storage and future application bounds are not semantically identical.

### Investigation application foundation (Milestone 5B-1)

Server-only addInvestigationNote/listInvestigationNotes and
addIncidentEvidence/listIncidentEvidence now expose create/read application
operations. Investigation HTTP routes are documented in 5B-2 below; forms and
context assembly remain deferred.
ACTIVE OWNER/ADMIN/MEMBER can add content; VIEWER can read. Every operation
rechecks current membership, User and Organization availability, and the
same-tenant unarchived parent Incident. Missing/inaccessible parents are concealed
before an accessible VIEWER receives operation FORBIDDEN. Context carries no role.

Write transactions derive contributor membership from trusted actor/tenant context,
insert only allowlisted fields, and atomically record COMMENT_ADDED or EVIDENCE_ADDED.
Details contain only version, new content ID, and kind/type. Activity failure rolls
back content. No external calls occur; normal transactions do not eliminate every
concurrent-revocation race. V1 create/read-only is application policy, not a SQL
UPDATE/DELETE prohibition.

Strict input schemas require explicit kind/type and reject unknown authority fields.
Trimmed note body is 1–10,000 UTF-16 units, evidence title 1–200, and content 1–20,000.
Installed Zod 4.6.5 string bounds count code points; explicit JavaScript length checks
therefore enforce these UTF-16 limits. PostgreSQL storage CHECK semantics also
remain distinct. Investigation text is untrusted data, not HTML or AI instructions.
Optional sourceUrl is trimmed, blank becomes NULL, and nonblank values are bounded
at 2,048 UTF-16 units, HTTP/HTTPS only, without credentials or control characters.
The trimmed submitted representation is preserved. URLs are never fetched or resolved.

Note DTOs expose only id/body/kind/createdAt. Evidence DTOs expose only
id/type/title/content/sourceUrl/createdAt and application-derived HUMAN_SUPPLIED.
This origin denotes the supported human-submission path, not verified truth or a
DB provenance guarantee. No author profile or internal membership fields are returned.
Both lists require authorized parent access even when empty, scope by tenant AND
Incident, and reuse compatible timestamp/UUID keyset primitives (default 20, max 100,
limit + 1, createdAt DESC/id DESC). Existing Incident pagination exports are retained.
Duplicate investigation pagination parameters are rejected by the HTTP transport.

The approved investigation-specific 192 KiB POST limit is reserved for 5B-2;
5B-1 does not change the existing 64 KiB Incident HTTP limit or any route behavior.
No investigation UI, AI output persistence, integrations, or URL previews exist.

### Investigation HTTP API (Milestone 5B-2)

GET/POST `/api/workspaces/[organizationId]/incidents/[incidentId]/notes` and
GET/POST `/api/workspaces/[organizationId]/incidents/[incidentId]/evidence` now
compose verified application identity, trusted tenant resolution, and the existing
investigation use cases. POST returns 201 with the approved DTO; GET returns 200
with `{ items, nextCursor }`. URL identifiers remain untrusted until server-side
checks; routes perform no business authorization, attribution, or Prisma writes.

POST requires exact trusted Origin, rejects cross-site Sec-Fetch-Site, and accepts
application/json with normal parameters. Investigation POST explicitly opts into
INVESTIGATION_POST_MAX_BYTES (192 KiB); streamed bytes are bounded regardless of
Content-Length. Existing Incident creation retains the default 64 KiB limit.
GET needs neither Origin nor Content-Type. Duplicate/unknown pagination parameters,
invalid limits, and invalid cursors are rejected; default 20/max 100 remain unchanged.

All handler responses use Cache-Control: no-store. Validation/malformed JSON return
safe 400; unauthenticated 401; concealed tenant/parent denial 404; accessible VIEWER
write denial 403; oversized body 413; unsupported media type 415; recognized database
unavailability 503; unexpected failure 500. Investigation validation uses fixed
generic responses without submitted content or Zod internals. No credentialed
cross-origin CORS, automatic retries, or idempotency guarantee is introduced.
Source URLs are never fetched, resolved, previewed, or logged by these handlers.
No investigation UI or context assembly is implemented.
