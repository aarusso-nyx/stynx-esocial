# Operations

This is a Phase 3 stub for local database execution. Phase 8 owns the full
runbook set for replay, DLQ triage, certificate rotation, sandbox outage,
official rejection handling, tenant incidents, and audit extraction.

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

The repository currently uses a deterministic CloudFormation template generator,
not AWS CDK synthesis. The command surface is named accordingly:

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

Production template generation is intentionally blocked unless the operator sets
`ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE=1` or passes `--confirm-production`.

The generated templates include the current deployment surface: private VPC
subnets, service and database security groups, RDS PostgreSQL with the `esocial`
database name, Secrets Manager placeholders, KMS encryption, FIFO request,
response, spool, retry, replay, and DLQ queues, EventBridge audit bus, nine
Lambda functions (`submission`, `retorno`, `certificado`, `http-gateway`,
`tabelas`, `trabalhador`, `folha`, `fechamento`, `exclusao`), event source
mappings, a CodeBuild migration hook, CloudWatch alarms, and a dashboard.

Local infrastructure evidence:

```bash
npm run integration:localstack
```

This command runs the compiled submission handler through a local
LocalStack-compatible queue/event harness and a real temporary PostgreSQL
database. It sends a submit envelope through the request queue, verifies response
queue, spool queue, and audit bus outputs, and checks the persisted
`esocial.event_record` status.

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
| `internal` | 3 |
| `authentication` | 1 |
| `validation` | 1 |
| `schema` | 1 |
| `xml_build` | 1 |
| `signing` | 1 |
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

The replay helper refuses incompatible schemas, derives a fresh request id,
correlation id, and idempotency key, and returns an audit event with action
`dlq.replay.requested`. Operators must publish `replay.request` to the request
topic and `replay.auditEvent` to the audit topic in one operational transaction.

## Observability

Structured logs use `buildStructuredLogEntry()` or `createStructuredLogger()`.
Every major stage should include these stable fields when known:

```text
requestId
correlationId
tenantId
eventClass
batchId
protocol
receipt
idempotencyKey
```

Example stage log:

```json
{"timestamp":"2026-05-05T12:00:00.000Z","level":"info","service":"submission","stage":"submit.accepted","message":"Submission accepted by sandbox.","requestId":"request-1","correlationId":"correlation-1","tenantId":"00000000-0000-4000-8000-000000000820","eventClass":"S-1299","batchId":"00000000-0000-4000-8000-000000000841","protocol":"1.2.202605.000000000000000001","receipt":"1.1.0000000000000000001","idempotencyKey":"idem-1"}
```

Metric helpers emit CloudWatch EMF-compatible JSON via `buildMetricPayload()` or
`createMetricEmitter()`. Stable metric names:

| Metric | Unit |
| --- | --- |
| `esocial.accepted` | Count |
| `esocial.rejected` | Count |
| `esocial.retry` | Count |
| `esocial.dlq` | Count |
| `esocial.timeout` | Count |
| `esocial.soap_latency_ms` | Milliseconds |
| `esocial.queue_age_ms` | Milliseconds |
| `esocial.parser_failures` | Count |

Trace spans use `withTraceSpan()` around message handling, XML build, XSD,
signing, SOAP, parsing, persistence, and publication. The helper records service,
span name, start/end timestamps, duration, status, and the same correlation
fields as logs.

## Incident Runbooks

DLQ triage:

1. Load DLQ payloads from the operator queue adapter.
2. Filter with `listDlqMessages()` by tenant, event class, and classification.
3. Inspect `errors`, `attempt_history`, `hashes`, and `replay_hint`.
4. If replay is allowed, call `buildReplayRequestFromDlq()` and publish the
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

1. Insert the new `esocial.tenant_certificate` metadata row with status
   `ACTIVE`, a new secret reference, and fingerprint.
2. Mark the old row `ROTATING`, then `REVOKED` after all in-flight batches
   settle.
3. Verify access through `CertificateCustodyService.resolveCertificate()`;
   every access appends audit metadata through the configured repository.

Tenant incident scope-down:

1. Use tenant-scoped SQL with `SET app.current_tenant_id = '<tenant uuid>'` for
   app-role reads.
2. For worker-role incident views, filter all operational SQL by `tenant_id`.
3. Do not query or mutate any SGP schema from eSocial remediation.

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
