# Milestone history

This timeline distinguishes completed repository capabilities from future intent. Migration names and Git history support the implementation sequence; exact historical discussions are not recoverable from source alone. ADR alternatives are retrospective tradeoffs, not verbatim meeting records.

| Milestone | Status | Scope |
|---|---|---|
| 1 — Database Foundation | Complete | PostgreSQL/Prisma, tenant-aware domain constraints, local Docker setup |
| 2 — Incident Application Layer | Complete | Strict create use case, RBAC checks, atomic activity and tests |
| 3 — Authentication + Trusted Organization Context | Complete | Better Auth schema/config, Google login, workspace guards, explicit local bootstrap |
| 4 — Incident API + Reads + UI | Complete | Authenticated POST/list/detail, cursor pagination, permission-aware workspace UI |
| 5A — Investigation Domain Foundation | Complete | CommentKind, IncidentEvidence, storage CHECKs and constraints |
| 5B — Investigation Application + HTTP API | Complete | Authorized create/list, bounded transport, atomic activity and real-session acceptance |
| 5C — Investigation UI | NEXT, not implemented | Human investigation interaction |
| 5D — Context Assembly | PLANNED | Bounded authorized context |
| 6 — AI Investigation Copilot | PLANNED | Structured assistance and citations |
| 7 — Knowledge Base / RAG | PLANNED | Retrieval direction, details unselected |
| 8 — Analytics | PLANNED | Scope to be reviewed |
| 9 — Production Hardening / Deployment | PLANNED | Production readiness and hosting |
| 10 — Portfolio / Demo / Case Study | PLANNED | Presentation and case study |

The 5B application and HTTP checkpoints are commits `4e482c5` and `b8f6e7a`; merge `2e2dbbb` brought them into main. Same-session 5B acceptance is recorded in [testing strategy](09-testing-strategy.md). This documentation branch starts after that merge and implements none of 5C.
