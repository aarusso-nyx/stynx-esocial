# ADR 0009: Contract Versioning Policy

## Status

Accepted

## Context

SGP and future consumers need a stable package and schema surface.

## Decision

`@esocial/contracts` versions DTOs, envelopes, JSON Schemas, OpenAPI, AsyncAPI,
examples, and idempotency helpers together.

## Consequences

Breaking contract changes require migration notes, generated surface updates,
and release evidence in the same change.
