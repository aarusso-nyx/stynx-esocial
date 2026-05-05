# Operations

This document describes the implemented Round 0 operating surface. Round 0 is a
deterministic qualification-style runtime: it uses local PostgreSQL, local
queue/event harnesses, deterministic SOAP stubs, sandbox certificate material in
tests, and generated CloudFormation review templates. Real eSocial endpoints,
real certificates, and restricted-production evidence are deferred to Round 2
under explicit owner authorization.

## Local PostgreSQL

The database scripts require `psql` on `PATH` and a local PostgreSQL user that
can create databases, create roles, and install `pgcrypto`.

Default local URLs:

```bash
postgresql://$USER@localhost:5432/postgres
postgresql://$USER@localhost:5432/esocial_dev
```

Run a fresh local migration:

```bash
npm run migrate:dev
```

By default this recreates the local `esocial_dev` database and applies the full
migration chain from zero. Use a dedicated throwaway database for this command.

Override the target database:

```bash
ESOCIAL_DATABASE_URL=postgresql://$USER@localhost:5432/esocial_dev npm run migrate:dev
```

Explicit database URLs are not reset unless requested:

```bash
ESOCIAL_MIGRATE_RESET=1 ESOCIAL_DATABASE_URL=postgresql://$USER@localhost:5432/esocial_dev npm run migrate:dev
```

Run the database behavior tests:

```bash
npm run test:db
```

`npm run test:db` creates a temporary database, applies every migration from
zero, creates non-superuser app and worker roles, proves tenant isolation,
checks duplicate idempotency rejection, and verifies append-only history
rejection for worker updates/deletes.

## Tenant Context

Application sessions must set the tenant before tenant-scoped reads or writes:

```sql
SET app.current_tenant_id = '<tenant uuid>';
```

Worker sessions that need cross-tenant operational visibility must use a role
with membership in `esocial_worker`.

## Deployment Templates

Round 0 still uses a deterministic CloudFormation template generator, not AWS
CDK synthesis. The command surface remains named accordingly:

```bash
npm run templates:generate
npm run templates:check
```

Committed review artifacts live under `infra/cdk/cdk.out/` and are checked for
reproducibility by `npm run templates:check`. Non-production generation writes
two stage templates by default:

| Stage | Endpoint host | Production endpoint access |
| --- | --- | --- |
| `qualification` | `esocial-qualification.local` | No `gov.br` URL. |
| `restricted-production` | `esocial-restricted.local` | No `gov.br` URL. |
| `production` | `webservices.esocial.gov.br` | Requires explicit operator confirmation. |

Stage configuration is data-driven under `infra/cdk/config/`:

| Stage | Config | Endpoint host indirection |
| --- | --- | --- |
| `qualification` | `infra/cdk/config/qualification.json` | `ESOCIAL_QUALIFICATION_ENDPOINT_HOST` |
| `restricted-production` | `infra/cdk/config/restricted-production.json` | `ESOCIAL_RESTRICTED_PRODUCTION_ENDPOINT_HOST` |
| `production` | `infra/cdk/config/production.json` | `ESOCIAL_PRODUCTION_ENDPOINT_HOST` |

Production template generation is intentionally blocked unless the operator sets
`ESOCIAL_PROD_CONFIRM=1`, sets the legacy
`ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE=1`, or passes `--confirm-production`.

The generated templates include the current deployment surface: private VPC
subnets, service and database security groups, RDS PostgreSQL with the `esocial`
database name, Secrets Manager placeholders, separate KMS keys for database,
certificate secret, and queue encryption, FIFO request, response, spool, retry,
replay, and DLQ queues, EventBridge audit bus, nine Lambda functions
(`submission`, `retorno`, `certificado`, `http-gateway`, `tabelas`,
`trabalhador`, `folha`, `fechamento`, `exclusao`), one scoped IAM role per
Lambda, event source mappings, a CodeBuild migration hook, CloudWatch alarms,
and a dashboard. Template tests assert there are no `Resource: "*"` grants or
IAM action wildcards in generated role policies.

## CI And Branch Protection

GitHub workflow definitions:

```bash
.github/workflows/ci.yml
.github/workflows/release.yml
.github/dependabot.yml
```

Required branch-protection checks for `main` are configured out-of-band in
GitHub and must include:

| Check | Required command surface |
| --- | --- |
| `unit` | `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run coverage`, `npm audit --omit=dev --audit-level=high`, `npm run sbom`. |
| `integration` | `npm run migrate:dev`, `npm run test:db`, `npm run test:integration`, `npm run integration:localstack`, `npm run templates:check`, `npm run cdk:synth:qualification`, `npm run cdk:synth:restricted-production`, `node scripts/assert-cdk-iam-scoped.mjs`. |

Repository policy also requires signed commits for protected branches. The
release workflow publishes `@esocial/contracts` only with `NODE_AUTH_TOKEN`
provided by GitHub secrets, runs `ESOCIAL_PROD_CONFIRM=1 npm run
cdk:synth:production` plus the IAM-scope assertion first, and attaches
`sbom/contracts-active-services.cdx.json` to the GitHub Release.

Local infrastructure evidence:

```bash
npm run integration:localstack
```

This command runs `scripts/integration-localstack.mjs`, which delegates to the
compiled submission handler through a local LocalStack-compatible queue/event
harness and a real temporary PostgreSQL database. It sends a submit envelope
through the request queue, verifies response queue, spool queue, and audit bus
outputs, and checks the persisted `esocial.event_record` status. It remains an
honest deterministic harness in Round 0; it does not deploy real CDK stacks or
call live AWS services.

## Return Reconciliation

Phase 7 exposes reconciliation through database views, not an HTTP API. Operators
and SGP integration tests should use read-only SQL against the eSocial service
database; SGP still consumes bus status updates and does not query these views in
normal operation.

Pending competence closure:

```sql
SELECT tenant_id, environment, competence, pending_count, pending_events
FROM esocial.v_competence_periodics_pending
ORDER BY tenant_id, environment, competence;
```

Terminal event failures:

```sql
SELECT
  tenant_id,
  environment,
  event_class,
  competence,
  status,
  last_error_code,
  last_error_message
FROM esocial.v_event_failures
ORDER BY tenant_id, environment, competence, event_class;
```

Totalizer traceability:

```sql
SELECT
  totalizer_class,
  source_event_class,
  competence,
  batch_id,
  event_record_id,
  protocol_number,
  receipt_number,
  payload_hash
FROM esocial.esocial_totalizer
WHERE tenant_id = '<tenant uuid>'
ORDER BY created_at DESC;
```

Return handling persists raw response evidence under `esocial.submission_message`;
audit rows carry `response_sha256`, a local raw-response reference, and payload
byte length rather than duplicating XML. It appends `esocial.event_status_history`
and stores S-50xx regulatory totalizers in `esocial.esocial_totalizer`. The active
tests cover protocol success, regulatory rejection, SOAP faults, malformed XML,
all S-5001/S-5002/S-5011/S-5012/S-5013 totalizer variants, and PostgreSQL
totalizer persistence. SOAP faults are terminal `failed` transport outcomes in
Round 0; malformed XML is a terminal `failed` schema outcome and must not create
an `esocial_totalizer` row. Unknown regulatory response codes are terminal
`failed` regulatory outcomes with `audit_flags` containing
`unknown_regulatory_code`.

## Retry, DLQ, And Replay

The implemented retry API lives in `packages/domain/src/operations/` and is
exported from `@esocial/domain`.

Retry budget by classification:

| Classification | Budget |
| --- | ---: |
| `transport` | 5 |
| `timeout` | 5 |
| `internal` | 0 |
| `authentication` | 1 |
| `validation` | 0 |
| `schema` | 0 |
| `xml_build` | 0 |
| `signing` | 0 |
| `malformed` | 0 |
| `regulatory` | 0 |
| `configuration` | 0 |
| `idempotency` | 0 |
| `totalizer_parse` | 0 |

Retry scheduling uses `decideRetry()` with exponential backoff, deterministic
jitter, and the policy above. Persist the returned retry decision through
`buildRetryScheduleCommand()` into `esocial.event_retry_schedule`.

DLQ triage API:

```ts
import { listDlqMessages } from '@esocial/domain';

const messages = listDlqMessages(dlqPayloads, {
  tenantId: '<tenant uuid>',
  eventClass: 'S-1299',
  classification: 'transport',
});
```

Terminal DLQ payloads are built with `buildTerminalDlqPayload()`. They contain
the original envelope, last classification, attempt history, hashes, and a
replay hint. The helper is covered by `tests/integration/retry/`.

Replay API:

```ts
import { buildReplayRequestFromDlq } from '@esocial/domain';

const replay = buildReplayRequestFromDlq({
  dlq,
  replayedBy: 'operator:<id>',
  replayReason: 'official endpoint recovered',
});
```

The HTTP replay endpoint uses IAM SigV4/API Gateway identity as its auth
boundary. Unauthenticated `POST /dlq/:id/replay` requests are rejected before
repository access. Authenticated operators can replay through the configured
handler, which refuses completed-idempotency clashes unless `?force=true`,
publishes the derived request, and appends an audit event with action
`dlq.replay.requested`.

## Observability

Structured logs use the shared Pino factory in
`packages/domain/src/observability/logger.ts`. Every line carries the same log
dictionary, with unknown values emitted as `null` instead of omitting the field:

| Field | Meaning |
| --- | --- |
| `requestId` | SGP contract request id or SQS record id before JSON validation. |
| `correlationId` | Cross-service correlation id propagated from the request envelope. |
| `tenantId` | Opaque tenant identifier from the request envelope. |
| `eventClass` | eSocial event class such as `S-1299` or `S-5001`. |
| `batchId` | eSocial submission batch id when persistence has assigned it. |
| `protocol` | eSocial protocol number when returned by SOAP or return parsing. |
| `receipt` | eSocial receipt number when returned by processing. |
| `idempotencyKey` | Contract idempotency key. |
| `attempt` | SQS record index or envelope attempt number. |
| `stage` | Handler stage: `ingress`, `ingress-validation`, `idempotency-lookup`, `build`, `xsd`, `sign`, `submit`, `parse-return`, or `publish`. |

Redaction is mandatory before a log line is written:

| Data class | Policy |
| --- | --- |
| XML payloads | Replace with `[REDACTED_XML_PAYLOAD]`. |
| Certificate fingerprints | Keep only the last 8 characters. |
| Certificate/private key material | Replace with `[REDACTED_CERTIFICATE_MATERIAL]`. |
| CPF/CNPJ | Mask middle digits. |
| Salary/remuneration fields | Replace with `[REDACTED_SALARY]`. |

Metric helpers emit CloudWatch EMF-compatible JSON via `buildMetricPayload()` or
`createMetricEmitter()`. Stable metric names:

| Metric | Kind | Unit |
| --- | --- | --- |
| `esocial.accepted` | Counter | Count |
| `esocial.rejected` | Counter | Count |
| `esocial.retry` | Counter | Count |
| `esocial.dlq` | Counter | Count |
| `esocial.timeout` | Counter | Count |
| `esocial.validation_failed` | Counter | Count |
| `esocial.parser_failures` | Counter | Count |
| `esocial.circuit_open_events` | Counter | Count |
| `esocial.soap_latency_ms` | Histogram | Milliseconds |
| `esocial.xsd_latency_ms` | Histogram | Milliseconds |
| `esocial.sign_latency_ms` | Histogram | Milliseconds |
| `esocial.queue_age_ms` | Histogram | Milliseconds |

Trace spans use `withTraceSpan()` around handler work and named stages:
`handler`, `ingress`, `ingress-validation`, `idempotency-lookup`, `build`,
`xsd`, `sign`, `soap`, `submit`, `parse-return`, `persist`, and `publish`.
The helper annotates OpenTelemetry spans with the same correlation fields and
propagates the correlation id through baggage.

## Incident Runbooks

Replay from DLQ to request topic:

1. Filter terminal payloads with `listDlqMessages()` and confirm
   `replay_hint.eligible` is true.
2. Call `buildReplayRequestFromDlq({ dlq, replayedBy, replayReason })`.
3. Publish `replay.request` to `sgp.esocial.submit.request`.
4. Publish `replay.auditEvent` to `sgp.esocial.audit`.
5. Confirm the new request has a fresh request id, correlation id, and
   idempotency key. Do not mutate the old SGP source record to replay.

DLQ triage decision tree:

1. Load DLQ payloads from the operator queue adapter.
2. Filter with `listDlqMessages()` by tenant, event class, and classification.
3. Inspect `errors`, `attempt_history`, `hashes`, and `replay_hint`.
4. For `transport` or `timeout`, check the sandbox outage runbook before replay.
5. For `regulatory`, replay only after a business-data correction produced a new
   DTO or the official rejection is proven transient by the release owner.
6. For `schema`, `xml_build`, `signing`, `configuration`, or `authentication`,
   open an eSocial operator incident; SGP should not repair these locally.
7. If replay is allowed, call `buildReplayRequestFromDlq()` and publish the
   returned request/audit pair.

Sandbox outage:

1. Use `decideCircuitBreakerState()` before new sandbox submissions.
2. When it returns `defer`, stop sending to the endpoint and emit
   `esocial.retry` plus a structured `retry.defer` log.
3. Record success/failure with `recordCircuitBreakerOutcome()` after each probe.

Official rejection investigation:

1. Read the SGP-facing spool update for `response_payload.response_code`,
   `response_payload.classification`, `protocol_number`, and `receipt_number`.
2. Query `esocial.v_event_failures` for the same tenant/event/competence.
3. Extract matching audit evidence from `esocial.audit_event_log` by
   `correlation_id`, `batch_id`, or `event_record_id`.

Certificate rotation:

1. Store the new A1 certificate secret in Secrets Manager. Never commit the
   certificate, private key, `.pfx`, `.p12`, `.pem`, `.key`, or `.crt`.
2. Insert the new `esocial.tenant_certificate` metadata row with status
   `ACTIVE`, a new secret reference, validity window, and fingerprint.
3. Mark the old row `ROTATING`, then `REVOKED` after all in-flight batches
   settle.
4. Invalidate any process-local certificate cache before the next submission.
5. Verify access through `CertificateCustodyService.resolveCertificate()`;
   every access appends audit metadata through the configured repository.

Tenant incident scope-down:

1. Pause request publishing for the affected tenant only.
2. Use tenant-scoped SQL with `SET app.current_tenant_id = '<tenant uuid>'` for
   app-role reads.
3. For worker-role incident views, filter all operational SQL by `tenant_id`.
4. Move only that tenant's open DLQ and retry items to incident review.
5. Do not query or mutate any SGP schema from eSocial remediation.

Audit evidence extraction:

```sql
SELECT occurred_at, event_type, actor, payload_hash, payload
FROM esocial.audit_event_log
WHERE tenant_id = '<tenant uuid>'
  AND (correlation_id = '<correlation id>'
       OR batch_id = '<batch uuid>'
       OR event_record_id = '<event uuid>')
ORDER BY occurred_at;
```
