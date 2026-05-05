# Gap Closure Plan

Objective: turn the current eSocial lift-out skeleton into a production-grade
standalone MQ handler while preserving the hard boundary that SGP is the
HR/payroll system of record and eSocial owns regulatory transmission.

## Operating Principles

- Do not keep compatibility shims for wrong pre-production names or contracts.
  Fix the public contract directly and update docs/tests in the same change.
- Treat `tests/sgp-lifted/` and `packages/domain/src/sgp-lifted/` as evidence
  mines until each slice is made compileable and boundary-clean.
- No direct SQL to SGP schemas from runtime eSocial code. SGP source references
  remain opaque identifiers in payloads and status updates.
- Each phase must upgrade at least one gate from structural evidence to
  executable behavior.
- No real certificates, real endpoints, production payloads, or production
  personal data without explicit owner authorization.

## Phase 0 - Stabilize The Baseline

Scope:

- Keep the current dirty tree intact and isolate future changes by worker scope.
- Add an explicit assessment pointer from future planning docs to
  `docs/work/inv.md`, `docs/work/diag.md`, and this plan if needed.
- Decide whether generated `infra/cdk/cdk.out/*.json` should remain committed
  artifacts or move behind a reproducible generation rule.

Exit criteria:

- `git status --short --branch` reviewed before each implementation wave.
- Existing structural gates still pass.
- No unrelated dirty files reverted.

## Phase 1 - Make The Repository Compileable

Primary write scope:

- `package.json`
- package `package.json` files
- root `tsconfig*.json`
- test runner config
- `scripts/check.mjs`

Tasks:

- Add a lockfile and explicit dependency set for the intended runtime:
  TypeScript, Nest or chosen service framework, `pg`, XML/XSD tooling, SOAP
  client, signing libraries, AWS SDK, and test tooling.
- Add workspace TypeScript config with package references or a simpler build
  layout.
- Split active production code from lifted evidence. Either move compile-ready
  code out of `sgp-lifted/` or exclude evidence-only files explicitly.
- Replace `npm run build` with real TypeScript compilation.
- Replace `npm run lint` with real lint plus the current structural boundary
  checks.
- Replace `npm run coverage` with real test coverage once at least one active
  test group exists.

Exit criteria:

- `npm run build` fails on TypeScript/module errors and passes only after active
  runtime code compiles.
- The lifted evidence tree is either compile-clean or intentionally excluded
  with documentation.
- No active production code imports `../../backend/src/...` or missing SGP
  modules.

## Phase 2 - Lock Versioned Bus Contracts

Primary write scope:

- `packages/contracts/`
- `docs/consumers.md`
- `tests/contract/`

Tasks:

- Define versioned request, response, spool, audit, retry, DLQ, and replay
  envelopes.
- Expand event taxonomy from `S-1299` to the documented event classes and return
  classes.
- Normalize statuses across docs and code: pending, building, validation
  failed, signed, sent, accepted, rejected, retry, timeout, DLQ, excluded,
  failed.
- Encode error categories from `docs/consumers.md` as exported types.
- Define idempotency keys for each family:
  tenant, environment, event class, source event/entity ids, competence where
  applicable, payload hash, and rectification/exclusion markers.
- Add contract fixture tests that validate representative JSON envelopes.
- Add versioning policy and consumer compatibility rules.

Exit criteria:

- `npm test` validates the full contract taxonomy and sample fixtures.
- `docs/consumers.md` and exported contract types agree.
- SGP can implement against contracts without reading eSocial internals.

## Phase 3 - Build The Autonomous eSocial Database

Primary write scope:

- `infra/migrations/`
- DB test scripts
- DB-focused tests

Tasks:

- Replace the three-table minimal schema with the real autonomous model:
  messages, event records, event family state, submission batches, certificate
  metadata, response classification, retries, DLQ/replay, totalizers, audit
  evidence, circuit state, and validation failures.
- Add every relation currently referenced by promoted runtime code or remove the
  reference before activation.
- Implement tenant RLS on every tenant-scoped relation.
- Add uniqueness constraints for idempotency.
- Add append-only audit/status history.
- Avoid cross-database FKs and all SGP schema references.
- Replace `npm run test:db` and `npm run migrate:dev` with real PostgreSQL
  execution against an ephemeral/local database.

Exit criteria:

- Fresh database can run all migrations from zero.
- RLS tests prove tenant isolation and required worker bypass semantics.
- Duplicate idempotency tests cannot create duplicate regulatory submissions.
- Migration checker still forbids FDW, shared schemas, and SGP schema FKs.

## Phase 4 - Implement The Active MQ Handler

Primary write scope:

- `services/submission/`
- `services/shared/`
- `packages/domain/src/submission/`
- queue transport adapters
- contract tests

Tasks:

- Validate SQS/EventBridge message envelopes at ingress.
- Persist incoming messages and idempotency outcomes in `esocial`.
- Route by kind and event class to the correct domain pipeline.
- Publish response, spool update, audit event, retry event, or DLQ event through
  explicit publisher interfaces.
- Handle partial batch failures and malformed messages deterministically.
- Add real SQS FIFO attributes: message group, deduplication id, correlation id,
  max attempts, and DLQ target.
- Make the active `services/submission` handler return Lambda batch item
  failures where applicable.

Exit criteria:

- Unit tests cover accepted, rejected, retry, timeout, duplicate, malformed, and
  DLQ paths.
- No fake protocol/receipt success is emitted without a submission or sandbox
  fixture response.
- Handler behavior is deterministic and idempotent.

## Phase 5 - Promote XML Builders Boundary-Cleanly

Primary write scope:

- `packages/domain/src/sgp-lifted/esocial-worker/builders/` during migration
- final production builder location under `packages/domain/src/`
- `docs/events.md`
- `docs/templates/`
- golden tests

Tasks:

- For each event family, define the normalized input DTO that SGP sends to
  eSocial. DTOs must contain opaque source ids, not SGP table dependencies.
- Refactor builders away from direct reads of `hr.*`, `payroll.*`, `saude.*`,
  and `public.esocial_event`.
- Promote golden XML tests event family by event family.
- Preserve byte-sensitive fixtures; only update goldens with intentional
  contract changes.
- Add metadata tests for event code, leiaute version, XML root, XSD binding, and
  table-version dependencies.

Suggested order:

1. Tables: S-1000, S-1005, S-1010, S-1020, S-1030, S-1040, S-1050, S-1060,
   S-1070.
2. Periodic payroll: S-1200, S-1202, S-1207, S-1210, S-1298, S-1299.
3. Worker/SST/TSV: S-2200, S-2205, S-2206, S-2210, S-2220, S-2230, S-2240,
   S-2298, S-2299, S-2300, S-2306, S-2399.
4. Benefits/process/exclusion: S-2400, S-2405, S-2410, S-2416, S-2418,
   S-2420, S-2501, S-3000.

Exit criteria:

- Active builders compile without SGP module/database imports.
- Golden tests cover every promoted event family.
- Invalid DTO tests fail before signing/submission.

## Phase 6 - Activate XSD, XML Security, Signing, And SOAP Sandbox

Primary write scope:

- `packages/pki-pades/`
- XML/XSD services under `packages/domain/`
- `services/certificado/`
- SOAP transport services/tests
- `docs/references/`

Tasks:

- Move signing/certificate code into the standalone PKI boundary.
- Implement certificate custody metadata, encrypted secret references, rotation,
  revocation, and audit.
- Add XML parser hardening and XXE rejection tests.
- Enforce XSD validation before signing and submission.
- Build a committed SOAP/WSDL stub for deterministic sandbox tests.
- Add environment-bound routing tests for qualification, restricted production,
  and production configuration.
- Preserve hashes of request XML, signed payload, SOAP request, and SOAP
  response.

Exit criteria:

- Signing tests use only generated/local fixtures.
- SOAP tests cannot hit `gov.br` endpoints in test mode.
- Invalid XML cannot be signed or submitted.
- Request/response hashes are persisted and exposed in audit/status outputs.

## Phase 7 - Implement Returns, Totalizers, And Status Publication

Primary write scope:

- `services/retorno/`
- return parser code
- status publisher code
- `docs/consumers.md`
- return tests

Tasks:

- Promote protocol, processing, and totalizer parsers into active tests.
- Persist return payloads and classifications under `esocial`.
- Map eSocial response codes to accepted, rejected, retry, timeout, DLQ, and
  operator-action states.
- Publish status/spool updates to SGP without writing `public.esocial_event`.
- Handle S-5001, S-5002, S-5011, S-5012, and S-5013 totalizers.
- Add reconciliation views or API outputs for competence closing workflows.

Exit criteria:

- Return parser tests cover success, rejection, SOAP fault, malformed XML, and
  totalizer variants.
- SGP-facing status events contain enough data to update its local projection.
- Totalizer evidence is traceable to source batch/event/protocol/receipt.

## Phase 8 - Retry, DLQ, Replay, And Observability

Primary write scope:

- submission/return services
- `infra/migrations/`
- `infra/cdk/`
- `docs/operations.md`
- tests for retry/DLQ/replay

Tasks:

- Implement retry budgets, exponential/backoff policy, circuit breaker state,
  terminal DLQ classification, and operator replay.
- Persist every status transition append-only.
- Emit structured logs with request id, correlation id, tenant id, event class,
  batch id, protocol, receipt, and idempotency key.
- Add metrics for accepted, rejected, retry, DLQ, timeout, SOAP latency, queue
  age, and parser failures.
- Add traces around message handling, XML build, XSD, signing, SOAP, parsing,
  persistence, and publication.
- Write runbooks for replay, DLQ triage, certificate rotation, sandbox outage,
  official rejection, tenant incident, and audit evidence extraction.

Exit criteria:

- Fault-injection tests prove retry and DLQ paths.
- Operator runbooks match implemented commands/APIs.
- Metrics and logs have stable names documented in `docs/operations.md`.

## Phase 9 - Build Real Infra And LocalStack Evidence

Primary write scope:

- `infra/cdk/`
- `scripts/templates-generate.mjs` or real CDK app
- generated templates
- LocalStack test harness
- deployment docs

Tasks:

- Replace the static CDK writer with a real CDK app or rename the script if it
  remains a template generator.
- Define Lambdas/services, queues, DLQs, EventBridge buses/rules, IAM, KMS,
  secrets, database connectivity, alarms, dashboards, and stage configuration.
- Add LocalStack-backed SQS/EventBridge integration tests.
- Add migration deployment hooks.
- Separate qualification, restricted-production, and production configuration.

Exit criteria:

- `npm run templates:check` verifies the honestly named deterministic template
  generator, or a future `cdk:synth` performs real synthesis.
- `npm run integration:localstack` sends a message through queues and observes
  response/audit/status outputs.
- Generated templates include runtime resources, not only queues.

## Phase 10 - SGP Consumer Migration And Release Evidence

Primary write scope:

- `docs/consumers.md`
- SGP migration notes
- release checklist
- contract package publication metadata

Tasks:

- Publish the contract package with versioned examples.
- Write SGP migration notes: request DTOs, status update consumer behavior,
  idempotency, error handling, retry/DLQ operator process, and cutover steps.
- Add end-to-end sandbox evidence using deterministic fixtures first, then
  restricted-production evidence when an owner authorizes real-service tests.
- Add a release readiness checklist covering security, data protection,
  observability, migrations, rollback, and evidence retention.

Exit criteria:

- SGP can integrate only through backend-produced envelopes and status events.
- eSocial owns operational dashboards and certificate/DLQ/replay workflows.
- Release evidence proves contract, runtime, database, infra, operations, and
  sandbox behavior.

## Gate Uplift Checklist

| Current gate | Target behavior |
| --- | --- |
| `npm test` | Contract and focused unit tests for active packages. |
| `npm run lint` | ESLint plus boundary checks. |
| `npm run build` | TypeScript/package compilation. |
| `npm run coverage` | Coverage from active tests with meaningful thresholds. |
| `npm run test:db` | Real PostgreSQL migration, RLS, idempotency, and audit tests. |
| `npm run migrate:dev` | Applies migrations to a local dev database or explicit ephemeral database. |
| `npm run integration:localstack` | SQS/EventBridge-compatible message round trip with local PostgreSQL evidence. |
| `npm run test:integration` | SOAP stub, queue, DB, return, retry/DLQ integration tests. |
| `npm run templates:check` | Reproducible deterministic template generation. |

## Worker Split

- Contracts worker: `packages/contracts/`, `docs/consumers.md`,
  `tests/contract/`.
- Database worker: `infra/migrations/`, DB scripts, DB tests.
- Submission worker: `services/submission/`, `packages/domain/src/submission/`,
  queue publishers.
- XML/event worker: promoted builder code, `docs/events.md`,
  `docs/templates/`.
- PKI/SOAP worker: `packages/pki-pades/`, certificate service, SOAP tests.
- Returns worker: `services/retorno/`, parsers, status publication.
- Infra/Ops worker: `infra/cdk/`, generated templates, `docs/operations.md`.
- Docs/runbook worker: `docs/`, `README.md`, consumer and operator runbooks.

Workers must assume others are active in the same codebase and must not revert
or overwrite changes outside their ownership scope.

## First Implementation Wave Recommendation

Start with phases 1 through 4 before broad event-builder promotion. The reason
is mechanical: until the repository compiles, contracts are locked, migrations
execute, and the active MQ handler persists/publishes real state, promoting more
builders will increase copied surface area without creating a runnable service.

Minimum first-wave closure:

- Real TypeScript build.
- Contract-complete submit/status/DLQ envelopes for at least S-1299.
- Real `esocial` DB migration for submit/status/idempotency.
- Active SQS-like handler tests for accepted, duplicate, malformed, retry, and
  DLQ paths.
- No active production code path writes `public.esocial_event`.
