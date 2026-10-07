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
