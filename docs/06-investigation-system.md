# Investigation system

Investigation records let people separate what they think from material they have collected. Stored material is not automatically true, safe, or independently verified.

## Notes and evidence

Comment kinds are NOTE (human commentary), HYPOTHESIS (explicitly unconfirmed explanation) and ACTION (a report of human work, not an executable command or proof it occurred).

Evidence types are LOG_EXCERPT, ERROR_MESSAGE, DEPLOYMENT_REFERENCE, MONITORING_ALERT, OBSERVATION and REFERENCE. Each has a title/content and optional source URL. Evidence DTO origin is `HUMAN_SUPPLIED`, derived by the application for the supported human submission path. It is neither a stored provenance column nor a truth claim.

## Inputs and output

Strict note input: `{ body, kind }`; strict evidence input: `{ type, title, content, sourceUrl? }`. Trimmed note body is 1–10,000 UTF-16 code units, title 1–200, content 1–20,000. Explicit JavaScript length checks supplement the installed Zod code-point bounds. PostgreSQL CHECK constraints provide separate storage bounds.

Optional sourceUrl is trimmed; blank becomes NULL. Nonblank URLs must be <=2,048 UTF-16 units, HTTP/HTTPS, without credentials or control characters. The trimmed representation is retained; no fetching, DNS resolution, preview or integration occurs. These are references, not an SSRF-capable fetch feature.

Note DTO: id/body/kind/createdAt. Evidence DTO: id/type/title/content/sourceUrl/createdAt/origin. Dates are ISO strings. Neither exposes internal author/member/profile fields.

## Authorization, persistence and history

ACTIVE OWNER/ADMIN/MEMBER may add; VIEWER may read only. Each transaction checks current membership and availability and a tenant-scoped unarchived parent, even for an empty collection. Authors come from the looked-up membership, never the body.

One transaction creates content plus its USER activity. COMMENT_ADDED details are exactly `{ version: 1, commentId, kind }`; EVIDENCE_ADDED details are exactly `{ version: 1, evidenceId, type }`. Activity JSON excludes body/title/content/sourceUrl. Failure of activity persistence rolls back the content write.

GET/POST notes and evidence routes are documented in [API design](07-api-design.md). Lists use default 20/max 100 timestamp/UUID keyset pagination. No edit/delete APIs, investigation UI, context assembly, AI execution or URL previews exist. Create/list-only API policy does not prevent privileged direct database updates.
