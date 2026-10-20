# Context engineering — planned Milestone 5D

Context engineering means selecting useful, bounded information for an AI question. It is not copying an entire database into a prompt. No context assembler exists yet.

## Proposed direction, not implemented behavior

A future server-side assembler should authorize the tenant and incident before collecting any data, then choose incident metadata, ordered notes and selected evidence under explicit per-source and total limits. Deterministic timestamp/ID ordering and stable record references should support citations and repeatable inspection.

Selection should consider relevance and provenance without upgrading human hypotheses or observations into facts. Retain distinctions between human-supplied text and generated suggestions. Retrieved text remains untrusted data even when it comes from PostgreSQL; embedded instructions cannot override system policy or grant tool permission.

Use a model-aware token budget, truncation policy and explicit missing/omitted-information indicators. Do not imply the model saw complete history if bounded selection excluded records. Citation support should point to authorized source IDs and never expose another tenant's material.

Exact context DTOs, relevance rules, token accounting and tests require review in 5D. No retrieval engine, vector index or prompt execution is implemented by this document.
