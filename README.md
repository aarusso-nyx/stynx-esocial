# esocial

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
- Event kind and queue envelope contracts under `packages/contracts/`.
- Submission processor skeleton that returns protocol/receipt data and emits
  SGP status updates.
- Service entrypoint skeletons for submission, tables, worker events, payroll,
  closure, exclusion, returns, certificate operations, and HTTP gateway.
- Copied XML builder/parser implementation and golden examples from SGP.
- Documentation and reference corpus under `docs/`.

Not complete:

- Real service wiring from queues/API gateway into the lifted domain modules.
- Full contract tests for every event family and status transition.
- Real local database migration execution and RLS tests.
- Certificate custody, signing, and rotation implementation.
- SOAP client sandbox/homologation flow with deterministic fault handling.
- Return/totalizer ingestion into durable status records.
- DLQ/retry runbooks, observability, metrics, traces, and deployment evidence.
- Consumer SDK/client package and versioned contract publication.

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
