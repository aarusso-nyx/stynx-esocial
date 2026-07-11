# ADR 0014: Standalone Governance Exception

## Status

Accepted — 2026-07-10.

## Context

eSocial is a public, production-grade service lifted from SGP. It owns its
contracts, XML generation, signing boundary, submission adapters, return
processing, retry/DLQ handling, audit evidence, and the isolated `esocial`
database schema. It has no existing `@stynx-nyx/*` or `@devai-nyx/*`
integration.

The portfolio default is shared STYNX and DEVAI adoption. The owner approved a
documented standalone exception, using senatran D-0001 as the governance
precedent. This decision must preserve the stronger service boundaries already
defined by this repository; it is not permission to weaken security, contracts,
tests, evidence, or operational controls.

## Decision

eSocial remains a standalone repository and does not add STYNX packages or
DEVAI governance substrate as part of portfolio alignment. It retains its own
TypeScript/npm workspace, domain contracts, architecture ADRs, and executable
quality gates. SGP remains an external producer/consumer boundary: identifiers
are opaque payload values, never shared database relationships.

The repository is public but declares `UNLICENSED`, matching TEAT and PEC's
current package posture. Public visibility does not grant permission to reuse
or publish its packages.

Reconsider this exception before any change that introduces a tenant-shared
platform dependency, centralizes identity/authorization/audit into STYNX, or
requests distribution of eSocial packages as a reusable platform library.

## Consequences

- The repository maintains its own equivalent controls rather than inheriting
  STYNX/DEVAI controls.
- CI economy is implemented with native npm/GitHub Actions mechanisms, without
  a DEVAI evidence-chain dependency.
- CodeQL can use native code scanning because the repository is public.
- The owner enables branch protection only after the repaired required checks
  have a green PR baseline.
