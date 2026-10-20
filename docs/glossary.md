# Glossary

These terms describe different responsibilities; treating them as interchangeable can hide security mistakes.

| Term | Meaning in OpsPilot |
|---|---|
| Authentication | Verifying a login identity |
| Authorization | Deciding whether the current identity may perform an operation now |
| Tenant / workspace | An Organization's isolated operational data/access scope |
| Membership | User–Organization relationship with current role/status |
| RBAC | Role-based access control, checked against PostgreSQL |
| TrustedActorContext | Minimal verified actor userId and selected organizationId; not a role snapshot |
| DTO | Data transfer object: explicitly selected public fields |
| ORM / Prisma | Object-relational mapper/client used to query PostgreSQL |
| Foreign key | Database rule requiring a referenced row to exist |
| Composite foreign key | Relationship using multiple columns, including tenant identity |
| Transaction | Database operations committed together or rolled back together |
| OAuth | Provider authorization protocol used here for Google sign-in |
| Session | Revocable/expiring authenticated login, distinct from User/Account |
| CSRF | Cross-site request forgery; protected against with origin/state controls |
| IDOR | Insecure direct object reference: using a supplied ID without checking access |
| Keyset pagination | Continuing after a timestamp/ID position rather than a row offset |
| Provenance | Where material came from, not whether it is true |
| HUMAN_SUPPLIED | Application-derived label for the current human evidence submission path |
| Hypothesis | An unconfirmed explanation |
| RAG | Retrieval-augmented generation: bringing selected external knowledge into AI context |
| Embedding / pgvector | Numerical text representation / PostgreSQL vector extension; not implemented |
| LLM | Large language model; none is integrated yet |
| Prompt injection | Untrusted content attempting to override AI instructions or tool policy |
| ADR | Architecture decision record: context, choice and consequences |
| RLS | PostgreSQL row-level security; not implemented |
