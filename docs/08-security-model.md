# Security model

Every boundary reduces what the next layer is allowed to trust. A UUID from the browser identifies a requested resource; it never proves permission to use it.

| Boundary | Implemented protection | Limit |
|---|---|---|
| Browser -> domain POST API | Exact Origin checks, cross-site Sec-Fetch-Site rejection, JSON media type, streamed size bounds and strict request validation | Not a rate limiter or idempotency mechanism |
| Input -> use case | Strict Zod, explicit DTOs and allowlisted writes | Client validation alone is not security |
| Session -> identity | Better Auth verification plus local User availability | Login grants no workspace |
| URL tenant -> context | Current ACTIVE membership and unarchived tenant lookup | Context is not a durable permission grant |
| Use case -> PostgreSQL | Current RBAC/availability checks and tenant predicates | Normal transaction does not serialize concurrent revocation |
| Relations -> storage | Composite tenant FKs, uniqueness, RESTRICT, content CHECKs | No RLS or role enforcement by these FKs |
| Write -> history | Content/activity transaction, minimal details | No DB-enforced immutable activity ledger |
| OAuth -> Account | Provider token/expiry clearing hooks and encryption enabled | Direct Prisma writes bypass hooks |

Domain GET handlers do not use the POST-specific Origin, media-type or body-size helpers. The authentication catch-all delegates to Better Auth and its own protections; it does not pass through the domain POST helper pipeline.

Server-only imports protect auth/database code from client bundles. Secrets belong in ignored environment or future managed secret injection; no real credentials belong in documentation. Do not log emails, session tokens, provider subjects/tokens, authorization codes/state, raw request bodies or connection URLs. Current public errors do not serialize original causes; safe diagnostic logging/redaction remains a hardening concern, not a claimed monitoring platform.

Generic 404s conceal unavailable tenants/parents; database outages remain 503/500. UI capability hints and cookies/localStorage never grant membership authority. Deactivated users and archived resources are checked on access.

The administrative bootstrap requires development mode, explicit existing User/role, local PostgreSQL URL and unused slug; it never runs at login. Loopback validation cannot detect a production tunnel. Do not forward production/staging to the local bootstrap target. Organization/member creation is transactional; no automatic OWNER grant exists.

## Future boundaries

AI/retrieved text will be untrusted data, not instructions or permission. Prompt-injection handling, tool-specific authorization, output validation, retrieval isolation and citations are planned, not implemented. Rate limits, stronger concurrency ordering, idempotency, production observability, DB privileges/RLS and deployment hardening require separate decisions.
