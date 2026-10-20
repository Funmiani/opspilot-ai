# Incidents

An incident is a tenant-owned operational report. Authorized members can create it; all active supported roles can read it. The current interface lists incidents and supports creation, but has no incident detail screen.

## Create

Strict Zod input accepts only title, optional description and required severity. Title is trimmed/nonempty, max 200; description max 10,000 with trimming and blank -> absent/null. The installed Zod length semantics should not be confused with investigation's explicit UTF-16 checks.

The server derives organization/creator membership, sets OPEN, and allowlists Prisma fields. Clients cannot set status, attribution or timestamps. UUID/creation time and updatedAt follow Prisma/database conventions. One short transaction authorizes, creates Incident and creates INCIDENT_CREATED activity with `{ version: 1, initialStatus: "OPEN", severity }` and trusted USER actor.

## Reads and DTOs

List/detail exclude archived incidents and scope by organization. Public Incident DTO exposes only id/title/description/severity/status/createdAt/updatedAt, dates as ISO strings. No raw membership or Prisma model crosses the boundary.

Severity is LOW/MEDIUM/HIGH/CRITICAL; status values are OPEN/INVESTIGATING/MITIGATED/RESOLVED/CLOSED. Only creation and reads are exposed: no lifecycle transition, assignment or archive API is implied by these fields.

Pagination uses createdAt DESC then id DESC, default 20/max 100, with limit+1 lookahead. A bounded versioned base64url cursor holds an ISO millisecond timestamp and UUID only; it is a position, not authority, encryption or a snapshot. Concurrent inserts may change subsequent views. Duplicate/unknown query parameters are rejected.

## Current UI

`/workspaces/[organizationId]` loads the first 20 through server use cases. The list displays severity/status, description excerpt and UTC times. A capability lookup controls the create form/read-only message, but the POST independently checks current permissions. The client sends only allowlisted fields, shows safe status-based feedback and refreshes after success. It does not automatically retry ambiguous failures.

Incident detail UI, list pagination controls/filtering and lifecycle management remain deferred. Idempotency is not implemented; a response lost after commit can make a manual retry duplicate a write.
