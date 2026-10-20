# API design

The API is the browser-facing transport for server use cases. Next.js 16 App Router handlers run TypeScript on Node.js, enforce HTTP protections, verify identity/context and call Prisma-backed application services. They do not accept browser authority.

## Implemented domain endpoints

Let `B = /api/workspaces/[organizationId]/incidents`. Every endpoint below requires a verified session, active local User, ACTIVE tenant membership and unarchived Organization. Detail/investigation also require a tenant-owned unarchived Incident. Read roles: OWNER/ADMIN/MEMBER/VIEWER; write roles: OWNER/ADMIN/MEMBER.

| Method | Path | Input | Success |
|---|---|---|---|
| POST | B | title, optional description, severity | 201 Incident DTO |
| GET | B | optional limit/cursor query | 200 `{ items: IncidentDto[], nextCursor }` |
| GET | B/[incidentId] | untrusted path IDs | 200 Incident DTO |
| POST | B/[incidentId]/notes | body, kind | 201 note DTO |
| GET | B/[incidentId]/notes | optional limit/cursor | 200 note page |
| POST | B/[incidentId]/evidence | type, title, content, optional sourceUrl | 201 evidence DTO |
| GET | B/[incidentId]/evidence | optional limit/cursor | 200 evidence page |

These cover creation, incident list/detail, and investigation create/list respectively. Field rules and DTO keys: [incidents](05-incidents.md), [investigation](06-investigation-system.md). Pagination accepts decimal string limit 1–100 (default 20) and bounded position cursor; unknown or duplicate keys reject. There is no total count or arbitrary filter parameter.

## POST protections

Exact Origin must equal the configured canonical origin; missing, null, malformed or foreign Origin rejects. `Sec-Fetch-Site: cross-site` rejects. Content-Type must be application/json (normal parameters allowed). Header length checks and actual streamed-byte bounds both apply: incident 65,536 bytes, investigation 196,608 bytes. The next byte over the limit rejects. Valid transport size does not guarantee valid application fields.

Strict Zod objects reject unknown keys, including authority/actor fields. Server-derived context is supplied separately. POST authentication/context resolution occurs before bounded JSON parsing after header checks. No credentialed cross-origin CORS or idempotency/retry mechanism is added.

## GET and failure responses

GET requires neither Origin nor Content-Type, uses no POST body helper, and performs no domain write. All domain handler responses use Cache-Control: no-store.

| Status | Meaning |
|---|---|
| 400 | Malformed JSON/UTF-8 or invalid strict input/query |
| 401 | Missing/invalid/expired authentication |
| 403 | Application-user unavailability despite a valid Better Auth session (missing/deactivated local User), accessible-tenant operation denial such as a VIEWER write, or POST transport/security rejection |
| 404 | Generic concealed inaccessible tenant/parent/resource resolution, including the tested SUSPENDED membership case |
| 413 | Body over byte limit |
| 415 | Unsupported JSON media type |
| 503 | Recognized temporary database availability failure |
| 500 | Unexpected/internal/configuration failure |

Errors use `{ error: { code, message, issues? } }`; public messages are fixed. Incident validation issues are bounded and field-allowlisted; investigation validation is generic. Causes remain server-side and are not serialized. Recognized Prisma availability codes are P1001/P1002/P1008/P1017/P2024; credentials/configuration/unrecognized initialization errors stay internal. Multiple-invalid requests may fail at the earliest checked boundary.

## Authentication transport

GET/POST `/api/auth/[...all]` delegates to Better Auth's official Next.js handler. Notable operations under this catch-all include `/api/auth/sign-in/social`, `/api/auth/get-session`, `/api/auth/sign-out` and `/api/auth/callback/google`. These are not separate custom Route Handler files or an exhaustive inventory of every operation Better Auth may expose. It supports the configured social sign-in, callback (`/api/auth/callback/google`), session and sign-out operations; it is not a domain business endpoint and its provider-managed payloads/errors differ from the domain contract. Only Google sign-in is configured; email/password, implicit linking, organization plugin and self-deletion are disabled. See [authentication](03-authentication.md).

Pages `/sign-in`, `/auth/error`, `/app`, `/workspaces` and `/workspaces/[organizationId]` are rendered UI routes, not additional JSON APIs.
