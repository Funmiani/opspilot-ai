# ADR-002: Better Auth

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

OpsPilot needs real Google identity and revocable sessions integrated with its existing User and Prisma models.

## Decision

Use Better Auth 1.7.7 with the existing PostgreSQL Prisma client, mapped displayName, UUID IDs and database sessions; no organization plugin or password auth.

## Why

Keeps identity/session persistence in the application database while allowing the domain to own tenant access.

## Alternatives considered

Auth.js, Clerk and custom authentication were considered in the design process. Provider-specific tradeoffs should be revisited if requirements change; source alone does not recover every historical comparison.

## Consequences

Auth configuration and provider lifecycle remain application responsibilities. Google credentials and an HTTPS canonical origin are required outside local development.

## Security implications

Disable implicit linking and account-link route, clear provider credentials on Account writes, encrypt OAuth tokens defensively, and recheck local User availability.
