# OpsPilot AI

OpsPilot is an operations and incident intelligence platform being built toward an AI investigation copilot. It currently provides authenticated, tenant-scoped incident management and human investigation APIs. **AI functionality is not implemented yet.**

## Current status

Milestones 1–5B are complete: PostgreSQL foundation, Google authentication, workspace access, incident create/read APIs and workspace UI, and investigation note/evidence APIs with atomic activity logging. Investigation UI (5C) is next; context assembly, AI and RAG remain planned. No production deployment is claimed.

## Stack and architecture

Node 24 · TypeScript · Next.js 16 App Router · React 19 · PostgreSQL 18 · Prisma 7.10.0 · Better Auth 1.7.7 · Zod.

Next.js is the full-stack framework; there is no separate backend service. Browser requests pass through thin Route Handlers, HTTP protections, verified identity, trusted tenant resolution and authorized application services into Prisma/PostgreSQL. Server Components can call the same services directly. PostgreSQL remains authoritative for membership and roles.

## Local setup

Use Node from `.nvmrc` without changing your NVM default. Install Docker Desktop/Compose and start its engine.

```sh
nvm use
npm ci
cp .env.example .env # only if .env does not already exist
```

Edit `.env` privately with local database settings and Google/Better Auth configuration. Preserve existing credentials. Never commit or print secrets. Follow [local environment setup](docs/12-deployment.md) for password handling, Google callback setup, volumes, migration review and explicit workspace provisioning.

```sh
docker compose up -d --wait postgres
npm run db:generate
npm run db:status
# For a new local database, apply the committed migrations deliberately:
npm run db:deploy
npm run dev
```

Visit `/sign-in`, then `/app` and `/workspaces`. Login does not create an Organization or membership: a user without access sees “No workspace access.” The local administrative bootstrap requires explicit User UUID/name/slug/role, development mode and a loopback PostgreSQL target; it is not production onboarding and never runs automatically.

Generated Prisma code is ignored; regenerate after schema changes and restart long-running development runtimes when needed. Builds generate the client but do not apply migrations.

## Verification commands

```sh
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
git diff --check
```

PostgreSQL integration tests require explicit local opt-in; see [testing strategy](docs/09-testing-strategy.md). They create and clean isolated fixtures. Do not point them at production. `npm audit` reports dependency findings; remediation is a separate reviewed task, not an automatic audit-fix step.

## Documentation index

| Document | Read it for |
|---|---|
| [System overview](docs/00-system-overview.md) | Product purpose, maturity and current capabilities |
| [Architecture](docs/01-architecture.md) | Layers, request flow and server/client responsibilities |
| [Database model](docs/02-database-model.md) | Entities, tenant relationships and database guarantees |
| [Authentication](docs/03-authentication.md) | Google, sessions, local identity and token policy |
| [Authorization and tenancy](docs/04-authorization-and-tenancy.md) | Current RBAC, trusted context and concealed access |
| [Incidents](docs/05-incidents.md) | Creation, reads, pagination and current UI |
| [Investigation system](docs/06-investigation-system.md) | Notes, evidence, attribution and provenance |
| [API design](docs/07-api-design.md) | Endpoints, input/output and HTTP protections/errors |
| [Security model](docs/08-security-model.md) | Trust boundaries and remaining hardening |
| [Testing strategy](docs/09-testing-strategy.md) | Unit, PostgreSQL and real browser evidence |
| [Context engineering](docs/10-context-engineering.md) | Planned 5D bounded context architecture |
| [AI architecture](docs/11-ai-architecture.md) | Planned copilot/retrieval/tool direction |
| [Deployment](docs/12-deployment.md) | Current local setup versus future production |
| [Milestone history](docs/milestone-history.md) | Completed work and future roadmap |
| [Glossary](docs/glossary.md) | Plain-language definitions |

Architecture decision records:

- [ADR-001: shared database multitenancy](docs/architecture-decisions/ADR-001-shared-database-multitenancy.md)
- [ADR-002: Better Auth](docs/architecture-decisions/ADR-002-better-auth.md)
- [ADR-003: database-authoritative RBAC](docs/architecture-decisions/ADR-003-database-authoritative-rbac.md)
- [ADR-004: trusted actor context](docs/architecture-decisions/ADR-004-trusted-actor-context.md)
- [ADR-005: investigation data model](docs/architecture-decisions/ADR-005-investigation-data-model.md)
- [ADR-006: human-supplied provenance](docs/architecture-decisions/ADR-006-human-supplied-provenance.md)

## Roadmap

Next: investigation UI (5C), then context assembly (5D). Later milestones cover the AI copilot, knowledge base/RAG, analytics, production hardening/deployment, and portfolio/demo work. These are plans, not implemented features; details remain subject to review.
