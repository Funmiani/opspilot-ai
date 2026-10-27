# Database model

A User is a person; an Organization is a workspace; OrganizationMember records the person's access to that workspace. Incidents and investigation material belong to a workspace, including their authorship.

The authoritative definitions are [schema](../prisma/schema.prisma) and [SQL migrations](../prisma/migrations). There are ten domain/auth tables, plus Prisma's migration history.

| Model | Responsibility and relationships |
|---|---|
| User | Global UUID identity; unique email, nullable displayName/image, emailVerified, timestamps and deactivatedAt. Has memberships, sessions and accounts. |
| Organization | UUID tenant, unique slug, name, timestamps and archivedAt; owns domain records. |
| OrganizationMember | Joins User and Organization; role/status, joinedAt/updatedAt; unique organization/user pair. |
| Incident | Tenant-owned report; creator required, assignee optional, title/description, severity/status and lifecycle timestamps. |
| Comment | Tenant/incident-owned body and kind; required author membership; createdAt/updatedAt. |
| IncidentEvidence | Tenant/incident-owned type/title/content/optional sourceUrl, required creator membership and createdAt. No stored origin column. |
| ActivityLog | Tenant history; actor/event types, optional incident/member references, JSONB details and createdAt. |
| Session | Unique secret token, User UUID FK, expiry/timestamps, optional IP/user agent. |
| Account | Provider identity `(providerId, accountId)` unique, User UUID FK; nullable token/expiry/scope/password fields. No issuer column. Password auth is disabled. |
| Verification | Identifier/value and expiry/timestamps for auth verification/state storage; identifier and expiry indexes, no User FK. |

User–Organization is many-to-many through OrganizationMember. Organization–Incident, Incident–Comment/Evidence, and User–Session/Account are one-to-many. Domain authors reference membership rather than only User to preserve tenant attribution.

## Defaults and public contracts

The Prisma schema and migrations define User.emailVerified = false, OrganizationMember.role = MEMBER, OrganizationMember.status = ACTIVE, Incident.status = OPEN, Incident.severity = MEDIUM and Comment.kind = NOTE. These storage defaults do not relax public contracts: Incident creation requires explicit severity, investigation note creation requires explicit kind, and the development bootstrap requires explicit role.

## PostgreSQL invariants

All primary keys and ID foreign keys use UUID columns. Prisma generates UUID defaults; these are not SQL UUID defaults in the migrations. Dates use TIMESTAMPTZ(3); creation defaults use database time, while `@updatedAt` is Prisma-managed.

Unique `(organizationId, id)` keys on membership and incident support composite references. For example `(organizationId, authorMemberId)` must match one membership in that same tenant. Incident creator/assignee, Comment parent/author, Evidence parent/creator and Activity parent/actor all use tenant-aware composite foreign keys. These prevent cross-tenant references, not unauthorized reads.

Domain foreign keys use ON DELETE RESTRICT / ON UPDATE RESTRICT. Preserve history by deactivating users, revoking membership and archiving resources. Session/Account User FKs alone use DELETE CASCADE and UPDATE RESTRICT. User deletion can still be blocked by memberships; auth self-deletion is disabled. Logout deletes a session, not the identity/account linkage.

Indexes lead with organizationId for timeline, parent lists, creator/actor and assignment access. Membership has `(userId, status)` for discovery; incident also has status/time and assignee/status indexes. Session has userId/expiry indexes; Account userId; Verification identifier/expiry. Unique email, slug, token and provider/account indexes enforce their respective identities.

Migration SQL additionally CHECKs Comment body 1–10,000 characters, Evidence title 1–200/content 1–20,000, nonblank ASCII whitespace checks, and sourceUrl <=2,048 when nonnull. PostgreSQL character length differs from application UTF-16 bounds. Prisma schema alone does not express these CHECKs.

## Enums and application invariants

- OrganizationRole: OWNER, ADMIN, MEMBER, VIEWER.
- MembershipStatus: ACTIVE, SUSPENDED, REVOKED.
- IncidentSeverity: LOW, MEDIUM, HIGH, CRITICAL.
- IncidentStatus: OPEN, INVESTIGATING, MITIGATED, RESOLVED, CLOSED.
- CommentKind: NOTE, HYPOTHESIS, ACTION.
- IncidentEvidenceType: LOG_EXCERPT, ERROR_MESSAGE, DEPLOYMENT_REFERENCE, MONITORING_ALERT, OBSERVATION, REFERENCE.
- ActivityActorType: USER, SYSTEM. ActivityEventType: INCIDENT_CREATED, STATUS_CHANGED, ASSIGNEE_CHANGED, COMMENT_ADDED, MEMBER_ROLE_CHANGED, EVIDENCE_ADDED.

PostgreSQL currently has no CHECK constraint coupling ActivityLog.actorType to actorMemberId. The database does not universally guarantee that USER has a member or SYSTEM lacks one. Current supported human write paths explicitly construct a USER actor with server-derived membership information.

An enum value does not imply a corresponding endpoint exists. RBAC, active membership, availability, safe URLs, allowed transitions and actor semantics require application checks. Activity append-only policy and investigation create/list-only APIs are not database write privileges. No PostgreSQL row-level security (RLS) is configured.
