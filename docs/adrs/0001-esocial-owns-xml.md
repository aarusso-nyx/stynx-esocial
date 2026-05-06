# ADR 0001: eSocial Owns XML Build

## Status

Accepted

## Context

Round 0 resolved the ambiguity between SGP sending pre-signed XML and this
service owning the regulatory runtime.

## Decision

SGP sends typed DTOs. This service builds XML, validates XSD, signs, submits
through SOAP, parses returns, and publishes status/audit events.

## Consequences

SGP never sends XML, SOAP envelopes, certificate material, or signatures.
Contract changes must update DTOs, schemas, examples, and SGP migration notes.
