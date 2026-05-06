# ADR 0007: DLQ Replay Auth Model

## Status

Accepted

## Context

Replay changes regulatory side effects and must be operator-governed.

## Decision

Replay requests are deterministic envelopes derived from DLQ payloads and
authorized through the eSocial operator boundary, not direct database edits.

## Consequences

Replay preserves original evidence, emits new idempotency keys, and records
operator intent before dispatch.
