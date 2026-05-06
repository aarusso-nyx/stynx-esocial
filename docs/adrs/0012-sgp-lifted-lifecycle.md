# ADR 0012: `sgp-lifted` Lifecycle

## Status

Accepted

## Context

The lifted tree was useful migration evidence but unsafe as active product
runtime.

## Decision

Lifted code is promoted family by family into active package boundaries, then
removed or excluded from the build.

## Consequences

Active code has no `sgp-lifted` imports. Remaining references are historical
docs or legal/reference evidence only.
