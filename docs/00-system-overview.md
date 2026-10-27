# System overview

OpsPilot helps people record operational incidents and assemble the human investigation around them. The intended product is an AI operations copilot; today's application provides the tenant-aware data foundations and explicit request protections, not an AI assistant.

## Implemented now

- Google sign-in and sign-out with database-backed sessions.
- Explicit workspace discovery and tenant access verification.
- Incident creation, list and detail APIs; a permission-aware workspace list/create UI.
- Investigation notes, hypotheses, reported actions and evidence through authenticated APIs.
- Transactional activity logging and PostgreSQL tenant-aware relationships.

This is a portfolio application under active development, not a claimed production deployment. Milestone 5B is complete; investigation UI (5C) is next and is not implemented.

## Technology

TypeScript runs on Node 24 inside Next.js 16.3.8, with React 19.2.8 and the App Router. PostgreSQL 18 stores data through Prisma 7.10.0 and its pg adapter. Better Auth 1.7.7 handles authentication; Zod 4 validates inputs. Docker Compose runs PostgreSQL only. Node's test runner and tsx execute tests.

## Future direction

Context assembly, structured AI assistance, citations, retrieval-augmented generation (RAG), possible vector retrieval and independently authorized tool calls are planned. No AI provider/model, embeddings, pgvector, RAG or AI execution is implemented. See [roadmap](milestone-history.md), [context design](10-context-engineering.md) and [AI direction](11-ai-architecture.md).
