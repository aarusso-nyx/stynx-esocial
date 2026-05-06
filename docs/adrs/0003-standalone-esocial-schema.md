# ADR 0003: Standalone `esocial` Schema

## Status

Accepted

## Context

The service must be a standalone product boundary and must not become an SGP
database extension.

## Decision

The service owns only PostgreSQL schema `esocial`. Active code must not read or
write SGP schemas, FDWs, shared database URLs, or cross-database foreign keys.

## Consequences

SGP identifiers are opaque payload identifiers. Tenant isolation and RLS are
proved inside the eSocial database.
