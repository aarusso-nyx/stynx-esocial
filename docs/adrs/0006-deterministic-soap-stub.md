# ADR 0006: Deterministic SOAP Stub In CI

## Status

Accepted

## Context

CI cannot depend on live `gov.br` endpoints or real certificates.

## Decision

CI uses committed WSDL/golden fixtures and deterministic SOAP responses. Real
endpoint routing remains per-stage and owner-authorized.

## Consequences

Non-production endpoint guards reject `gov.br`. Restricted-production evidence
is tracked as blocked until owner authorization lands.
