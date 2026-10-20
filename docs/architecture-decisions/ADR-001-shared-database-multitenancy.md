# ADR-001: Shared database multitenancy

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

People may participate in more than one workspace; domain authorship must stay attached to the correct tenant.

## Decision

Use one PostgreSQL database with Organization ownership, OrganizationMember joins, explicit tenant predicates and composite tenant-aware foreign keys.

## Why

This keeps local development and relational transactions manageable while retaining structural tenant boundaries.

## Alternatives considered

Separate database/schema per tenant; a single organizationId directly on User. These are tradeoffs evaluated retrospectively, not a claim of recorded historical deliberation.

## Consequences

Queries must always include tenant scope. Unique organization/user membership and composite parent/member references preserve consistency. Tenant-specific backup/scaling is more involved than isolated databases.

## Security implications

Foreign keys prevent cross-tenant references but not unauthorized reads. Current server checks remain mandatory. RLS is deferred.
