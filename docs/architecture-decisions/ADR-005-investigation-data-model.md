# ADR-005: Investigation data model

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

Incident discussion includes commentary and unconfirmed explanations, while collected material needs its own type/title/content/reference fields.

## Decision

Extend Comment with NOTE/HYPOTHESIS/ACTION; store typed material in IncidentEvidence with explicit tenant/parent/member relations. Add content and minimal activity together.

## Why

Preserves useful distinctions and stable source IDs without prematurely introducing AI records or a generic document abstraction.

## Alternatives considered

One undifferentiated text table; an extensible arbitrary JSON document; immediate AI/context entities.

## Consequences

Current API supports create/list only. Separate DTOs and validation limits are maintained. SQL CHECKs supplement Prisma schema and must be preserved in migrations.

## Security implications

Server-derived authorship, composite tenant FKs, strict fields and transactional activity. Source URLs are validated references and never fetched. No database privilege-level append-only enforcement is claimed.
