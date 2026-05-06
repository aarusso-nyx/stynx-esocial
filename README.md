# esocial

[![CI](https://github.com/aarusso-nyx/stynx-esocial/actions/workflows/ci.yml/badge.svg)](https://github.com/aarusso-nyx/stynx-esocial/actions/workflows/ci.yml)
[![contracts](https://img.shields.io/badge/%40esocial%2Fcontracts-1.1.0--rc.0-blue)](packages/contracts/CHANGELOG.md)
[![coverage](https://img.shields.io/badge/coverage-70%25%20gate-blue)](docs/release/0.2.0/coverage/coverage.md)

Standalone eSocial service bus runtime for DTO intake, XML generation, XSD
validation, certificate-bound signing, SOAP submission, return parsing,
retry/DLQ handling, audit/status publication, and operational evidence.

SGP remains the HR/payroll business system of record. This repository owns the
eSocial runtime and exposes only versioned contracts, queues/events, and
operator evidence.

## Boundary

Hard rules:

- The service owns schema `esocial` in an isolated database.
- SGP must not read or write eSocial tables, use FDWs, share DB URLs, or create
  cross-database foreign keys.
- SGP sends typed DTO envelopes and consumes status/audit updates; it does not
  send XML, SOAP envelopes, certificates, private keys, or signed material.
- SGP source ids are opaque payload identifiers, not database relationships.
- External eSocial, ICP-Brasil, certificate, SOAP, SQS, EventBridge, and AWS
  behavior stays sandboxed or deterministic until an owner authorizes real
  service tests.

## Repository Map

| Path | Purpose |
| --- | --- |
| `packages/contracts/` | SGP-facing TypeScript types, JSON Schemas, examples, idempotency helper, and envelope taxonomy. |
| `packages/domain/` | Active XML builders, XSD/security validation, submission/return processors, retry/DLQ/replay, observability, and sandbox transport. |
| `packages/pki-pades/` | Signing boundary used by the deterministic local certificate tests. |
| `services/` | Lambda/service entrypoints for submission, returns, retry polling, and transport publishers. |
| `infra/migrations/` | Forward-only PostgreSQL migrations for schema `esocial`, RLS, idempotency, status history, audit, retry, DLQ, and totalizers. |
| `infra/cdk/` | CDK app and deterministic template review artifacts for qualification, restricted-production, and guarded production synthesis. |
| `docs/` | Architecture, consumer contracts, event inventory, operations, SGP migration, templates, release evidence, and local references. |
| `tests/` | Active contract, golden, handler, XML, return, DB, integration, SOAP, retry, and LocalStack-compatible tests. |

## Current State

Implemented:

- `@esocial/contracts@1.1.0-rc.0` with the 40-class v1 event taxonomy,
  schemas/examples for every class, enforced envelope `version: "v1"`, and
  helper-built idempotency keys. S-50xx entries document the internal
  `retorno` return path rather than SGP source DTOs.
- End-to-end DTO to XML to XSD to sign to SOAP-stub to persist to publish path
  for all active Round 0 and Round 1 promoted families.
- Active builders for S-1000, S-1005, S-1010, S-1020, S-1050, S-1070, S-1200,
  S-1202, S-1207, S-1210, S-1298, S-1299, S-2200, S-2205, S-2206, S-2210,
  S-2220, S-2230, S-2240, S-2298, S-2299, S-2300, S-2306, S-2399, S-2400,
  S-2405, S-2410, S-2416, S-2418, S-2420, S-2501, and S-3000.
- Return parser and live return handler coverage for S-5001, S-5002, S-5011,
  S-5012, and S-5013 totalizers.
- Local PostgreSQL migration/RLS/idempotency/history tests, in-process
  integration tests, LocalStack-compatible queue/event/PostgreSQL harness, CDK
  synth gates, IAM scope checks, coverage threshold, SBOM generation, and
  release evidence under `docs/release/0.2.0/`.
- Lifted builders, lifted return parsers, and `tests/sgp-lifted/` retired.
  The only retained lifted runtime path is the XSD bundle documented in
  `docs/work/round-1/lifted-retention.md`.

Owner-blocked:

- S-1030, S-1040, and S-1060 remain typed source-event `round1Pending` DTOs
  because the current S-1.3 XSD binding is missing or legacy-only. The blocker
  is tracked in `docs/work/round-1/leiaute-blockers.md`.
- `1.1.0` final package publication is blocked until SGP accepts the breaking
  idempotency/version coordination plan and the three table-event decisions are
  closed. The package stays `1.1.0-rc.0`.
- Real eSocial endpoints, real certificates, and restricted-production evidence
  require explicit owner authorization in Round 2.

## Commands

Run from the repository root:

```bash
npm test
npm run lint
npm run build
npm run coverage
npm run test:db
npm run migrate:dev
npm run test:integration
npm run integration:localstack
npm run cdk:synth
npm run templates:check
npm run sbom
```

`npm run cdk:synth` performs real CDK synthesis after regenerating deterministic
template review artifacts. `npm run cdk:synth:production` remains guarded by
`ESOCIAL_PROD_CONFIRM=1`.

## Start Here

1. Read `AGENTS.md`.
2. Read `docs/architecture.md`, `docs/consumers.md`, and `docs/events.md`.
3. Check `docs/work/round-1/leiaute-blockers.md` before claiming all table
   classes are active.
4. Inspect live status with `git status --short --branch`.
5. Run `npm test` before non-trivial changes, then expand to the relevant gate
   set above.

## Consumer Summary

SGP sends normalized request envelopes to `sgp.esocial.submit.request` and
consumes status, audit, protocol, receipt, rejection, retry, DLQ, replay, and
totalizer updates. See `docs/consumers.md` and `docs/sgp-migration.md` for DTO
requirements, topic names, idempotency rules, error semantics, and cutover
steps.
