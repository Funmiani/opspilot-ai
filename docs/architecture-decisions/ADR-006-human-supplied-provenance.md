# ADR-006: Human-supplied provenance

This record explains the current implementation and its tradeoffs for readers joining after the decision.

## Status

Accepted; documented retrospectively in Documentation Baseline V1.

## Context

Evidence can be mistaken or malicious even when an authenticated person submitted it. A hypothesis is not established fact.

## Decision

Return HUMAN_SUPPLIED for the supported evidence submission path, with no claim of verification; retain explicit note/evidence kinds.

## Why

Future readers and AI context need to distinguish origin from credibility.

## Alternatives considered

Calling all evidence verified; using one label for human and future generated material; prematurely adding a universal provenance framework.

## Consequences

Origin is derived by the current DTO mapper, not a stored database column or tamper-proof origin guarantee. Future ingestion paths need explicit provenance design.

## Security implications

Treat bodies and references as untrusted data. Do not execute ACTION text or allow retrieved instructions to authorize tools. Future AI must preserve uncertainty and source citations.
