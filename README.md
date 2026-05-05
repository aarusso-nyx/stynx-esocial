# esocial

[![CI](https://github.com/aarusso-nyx/stynx-esocial/actions/workflows/ci.yml/badge.svg)](https://github.com/aarusso-nyx/stynx-esocial/actions/workflows/ci.yml)
[![contracts](https://img.shields.io/badge/%40esocial%2Fcontracts-1.0.0-blue)](packages/contracts/CHANGELOG.md)
[![coverage](https://img.shields.io/badge/coverage-local%20gate-yellow)](docs/release/0.1.0/ci/coverage.md)

Standalone eSocial product for event intake, XML generation, schema validation,
certificate-bound signing, SOAP submission, return parsing, retry/DLQ handling,
and operational evidence.

This repository was lifted out of SGP. SGP remains the HR/payroll business
system of record; this repository owns the eSocial runtime.

## Boundary

Hard rules:

- The eSocial service owns its own database schema, `esocial`, in an isolated
  runtime account.
- SGP must not read or write the eSocial database directly.
- SGP keeps only its local legal/operator projection in `public.esocial_events`.
- SGP triggers eSocial from backend domain actions; it must not expose
  browser-facing `/api/v1/esocial/*` routes.
- Cross-boundary traffic is SQS, EventBridge, or SGP-backend-only HTTPS.
- External eSocial, ICP-Brasil, certificate, and SOAP behavior must use sandbox
  adapters or deterministic fixtures until an owner explicitly authorizes real
  service tests.

## Repository Map

| Path | Purpose |
| --- | --- |
| `packages/contracts/` | Queue, audit, and status-update contracts consumed by SGP and worker services. |
| `packages/domain/` | Lifted eSocial domain implementation, XML builders, parsers, validators, and submission processor. |
| `packages/pki-pades/` | Signing boundary placeholder for ICP-Brasil/PAdES/PKCS#7 work. |
| `services/` | Lambda/service entrypoints by event family and operation surface. |
| `infra/migrations/` | Canonical PostgreSQL schema, RLS, triggers, and audit SQL for the isolated eSocial database. |
| `infra/cdk/` | Deterministic CloudFormation template surface and stage metadata. |
| `docs/` | Architecture, consumer contracts, event inventory, references, worker bootstrap, and XML examples. |
| `tests/contract/` | Current executable repo contract checks. |
| `tests/sgp-lifted/` | Copied SGP test corpus for mining and staged migration; not all files are active yet. |

## Start Here

For a new Codex session:

1. Read `AGENTS.md`.
2. Read `docs/codex-bootstrap.md`.
3. Read `docs/architecture.md`, `docs/consumers.md`, and `docs/events.md`.
4. Inspect live status with `git status --short --branch`.
5. Run the current fast gates:

```bash
npm test
npm run lint
npm run build
npm run test:db
```

The current gates include TypeScript compilation, executable contract/unit
tests, and focused PostgreSQL behavior tests. They are still not full
production-readiness evidence by themselves.

## Current Implementation State

Implemented:

- Isolated schema baseline under `infra/migrations/` using schema `esocial`.
- Versioned `@esocial/contracts@1.0.0` request, response, spool, audit, retry,
  DLQ, and replay envelopes, including 40 event classes.
- Round 0 DTO-to-XML-to-sign-to-SOAP-stub-to-status pipeline for S-1000,
  S-1010, S-1200, S-1299, and S-2200.
- XSD and XML-security gates with DTD/entity/stylesheet hardening before signing
  or SOAP submission.
- Deterministic SOAP transport and return path for S-5001, S-5002, S-5011,
  S-5012, and S-5013 totalizers.
- Retry budget classification, DLQ persistence, operator replay request
  creation, circuit breaker state, and fault-injection tests.
- Structured logs, CloudWatch EMF metric payloads, OpenTelemetry span helpers,
  redaction policy, alarm definitions, and dashboard metadata.
- Service entrypoint skeletons for submission, tables, worker events, payroll,
  closure, exclusion, returns, certificate operations, and HTTP gateway, with
  active submission/return handling wired into the pipeline.
- Local PostgreSQL migration/RLS tests, in-process integration tests, and a
  LocalStack-compatible queue/event/PostgreSQL harness.
- Deterministic CloudFormation template generation for qualification and
  restricted-production, plus production dry-run guarded by explicit operator
  confirmation.
- CI, release workflow, SBOM generation, release checklist, SGP migration notes,
  operations runbooks, and a Round 0 evidence bundle under `docs/release/0.1.0/`.

Not complete:

- Promotion of the remaining 30+ event-family builders. Round 1 owns that
  mechanical promotion along the same pipeline.
- Real AWS CDK synthesis. Round 0 keeps the honest deterministic template
  generator; `cdk:synth` is intentionally absent until it synthesizes CDK.
- Real eSocial qualification/restricted-production connectivity and real
  certificate custody. Round 2 requires explicit owner authorization.
- GitHub branch protection and npm publication are configured out-of-band; this
  repo now provides the workflow and release definitions but does not tag or
  publish without authorization.
- Aggregate coverage remains below the Round 0 target. The Wave C local run
  ended at 69.88 percent line coverage in the combined node coverage report and
  is recorded in `docs/release/0.1.0/ci/coverage.md`.

## Commands

```bash
npm test
npm run lint
npm run build
npm run coverage
npm run templates:generate
npm run templates:check
npm run test:db
npm run migrate:dev
npm run integration:localstack
npm run test:integration
```

`npm run templates:generate` regenerates
`infra/cdk/cdk.out/esocial-*.template.json`. `npm run templates:check` verifies
those committed review artifacts are reproducible. The old `cdk:synth` command
was removed because this repository currently uses an honest deterministic
CloudFormation generator, not AWS CDK synthesis.

## Consumer Contract Summary

SGP and other producers send normalized request envelopes to eSocial. eSocial
responds with status, audit, protocol, receipt, error, and totalizer updates. See
`docs/consumers.md` for the consumer-facing contract, topic names, required
fields, idempotency rules, and failure semantics.

## Event Inventory and Examples

`docs/events.md` lists the lifted S-1000, S-12xx, S-22xx, S-23xx, S-24xx,
S-2501, S-3000, and S-50xx families with source file paths and XML examples.
Golden XML and WSDL files live under `docs/templates/`.

## Production Target

Production-grade means:

- Contract-complete public inputs and outputs.
- Tenant isolation and RLS proven against a real local PostgreSQL database.
- Deterministic XML/signing/submission/return tests.
- Sandbox eSocial submission evidence retained in docs.
- Operational runbooks for replay, retry, DLQ, certificate rotation, and
  incident investigation.
- SGP integration limited to backend-triggered envelopes and status projection
  into `public.esocial_events`.
