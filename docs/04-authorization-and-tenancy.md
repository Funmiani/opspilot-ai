# Authorization and tenancy

Authorization asks “what may this person do right now?” A valid login can remain active while workspace access is suspended. PostgreSQL membership state is the authority on each operation.

## Boundaries

1. `requireApplicationIdentity` verifies session and local User availability.
2. Browser-selected organization UUID is untrusted selection, not permission.
3. `resolveTrustedActorContext` checks UUID, current ACTIVE membership, active User and unarchived Organization in PostgreSQL.
4. Incident/investigation application operations reload relevant current membership/role and availability inside their transactions and scope resource queries by tenant. Workspace discovery/resolution and capability lookups perform their own database checks without explicit transactions.

The only trusted context fields are:

```ts
{ actor: { userId }, organizationId }
```

No role, membershipId, isAdmin, email or session metadata is authority in this context. Its TypeScript shape alone proves nothing: only verified server composition may construct it.

Discovery uses one User query with filtered related memberships; Prisma may issue multiple SQL statements for relation loading. Output is exactly `{ organizationId, name }`. Selection remains explicit even for one workspace. Authentication never provisions access.

| Current membership | Read incidents/investigation | Create incidents/investigation |
|---|---|---|
| ACTIVE OWNER/ADMIN/MEMBER | Allowed | Allowed |
| ACTIVE VIEWER | Allowed | Forbidden |
| SUSPENDED/REVOKED or missing | Concealed denial | Concealed denial |

Unknown roles deny. Deactivated User, archived Organization and archived parent Incident fail access checks. Readable CLOSED incidents are not automatically archived. The resolver does not infer write permission from successful tenant selection.

## Concealment and freshness

Malformed/nonexistent/inaccessible tenant IDs share the generic HTTP 404. Missing/cross-tenant/archived incident parents are also concealed. An accessible VIEWER's valid write request receives 403. Unexpected database errors remain safe 503/500, not fake 404s. Earlier transport/validation failures can return their own errors; this is not constant-time or universal response equivalence.

No workspace authority is persisted in cookies, localStorage, session metadata or shared caches. Capability results are presentation hints only. Normal transactions do not guarantee strict ordering against simultaneous revocation; concurrency hardening remains deferred.

## Real-session 5B acceptance

The same browser login exercised MEMBER reads 200/writes 201; switching only role to VIEWER retained reads 200 and denied writes 403. Suspending membership produced generic 404 for both reads/writes. Restoring ACTIVE/MEMBER restored reads 200 without reauthentication. Rejected writes left no content or activities.

This demonstrates separation of authentication from current authorization and resistance to stale role authority in an otherwise valid session. See [testing](09-testing-strategy.md) and [ADR-003](architecture-decisions/ADR-003-database-authoritative-rbac.md).
