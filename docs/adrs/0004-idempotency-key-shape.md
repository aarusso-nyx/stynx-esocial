# ADR 0004: Idempotency-Key Shape

## Status

Accepted

## Context

Duplicate SGP emissions must not create duplicate regulatory submissions.

## Decision

Idempotency keys are versioned `esocial:v1:<family>:...` values derived from
tenant, environment, event class, source identifiers, competence, payload hash,
and rectification/exclusion markers.

## Consequences

Ingress rejects mismatched keys. Database uniqueness enforces one regulatory
submission per deterministic input.
