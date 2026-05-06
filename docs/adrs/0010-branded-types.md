# ADR 0010: Branded Contract Identifiers

## Status

Accepted

## Context

Tenant ids, event classes, receipts, protocols, CPF/CNPJ, and idempotency keys
are all strings at runtime but carry different meaning.

## Decision

Contracts expose branded constructor functions that validate identifiers before
they cross SDK or service boundaries.

## Consequences

Callers get compile-time separation plus runtime validation. Raw strings remain
accepted at the queue boundary and are branded after validation.
