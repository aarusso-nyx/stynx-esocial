# ADR 0011: Forward-Only Migrations

## Status

Accepted

## Context

Release evidence and tenant databases must be reproducible from zero.

## Decision

Landed migration files are immutable. Corrections use new forward migrations
and tests.

## Consequences

Historical defects are fixed additively. Migration lint blocks schema-name
regressions and SGP coupling.
