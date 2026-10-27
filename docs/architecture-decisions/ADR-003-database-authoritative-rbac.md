# ADR-003: Database-authoritative RBAC

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

A valid session can outlive a membership suspension or role change. Cached role authority could let a former writer continue writing.

## Decision

Use current PostgreSQL membership, role, status and User/Organization availability as authority. Incident/investigation application operations reload relevant authority inside their short transactions. Workspace discovery/resolution and capability lookups perform their own database checks without explicit transactions.

## Why

Authorization should change without waiting for session expiry or requiring reauthentication.

## Alternatives considered

Role/isAdmin session claims, browser state and long-lived cached permission snapshots.

## Consequences

Additional database reads buy current sequential-request decisions. Normal transactions do not guarantee serialization against simultaneous revocation. Stronger ordering remains future hardening.

## Security implications

No role authority in session metadata or trusted context. Same-session MEMBER -> VIEWER -> SUSPENDED -> restored acceptance demonstrates current-state enforcement, not exhaustive concurrent race protection.
