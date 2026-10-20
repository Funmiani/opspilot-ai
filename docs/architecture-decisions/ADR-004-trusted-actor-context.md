# ADR-004: Small trusted actor context

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

Use cases require authenticated identity and selected tenant without importing HTTP or depending on a particular auth provider.

## Decision

Pass exactly { actor: { userId }, organizationId } from verified server identity plus tenant resolution; reload authorization separately.

## Why

A small contract makes authority origins visible and avoids stale permission snapshots.

## Alternatives considered

Passing raw headers/session/Prisma User; including membershipId, role or isAdmin; trusting client body actor IDs.

## Consequences

HTTP and Server Components can call the same use cases. The type itself cannot authenticate or authorize a caller; server composition is essential.

## Security implications

URL organization ID remains untrusted until resolved. Never construct context from arbitrary browser input or treat possession of its shape as security proof.
