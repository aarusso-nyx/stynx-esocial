# ADR 0002: TypeScript-Only Lambdas

## Status

Accepted

## Context

The lifted SGP implementation contained application patterns that were heavier
than the standalone MQ-handler runtime needs.

## Decision

Active Lambda handlers are plain TypeScript packages with explicit domain and
contract imports. No Nest runtime is used in active code paths.

## Consequences

Handlers stay small and testable. Cross-cutting behavior belongs in
`packages/domain` or service-local adapters rather than framework modules.
