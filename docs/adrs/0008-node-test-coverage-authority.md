# ADR 0008: `node --test` Coverage Authority

## Status

Accepted

## Context

The repository mixes TypeScript build checks, Vitest contract checks, and
Node's active runtime test suite.

## Decision

`scripts/coverage-check.mjs` uses `node --test --experimental-test-coverage`
as the runtime coverage authority for active services and domain packages.

## Consequences

Coverage evidence is reproducible locally and in CI. Round 4 records the gap to
the future 95 percent target rather than faking coverage.
