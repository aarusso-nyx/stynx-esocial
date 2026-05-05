# 08 — Retry, DLQ, Replay, and Observability

> **Phase 8 of [`../plan.md`](../plan.md).** Wave 3, runs after Phases 4
> and 7. Touches submission and return services, infrastructure, and
> documentation. Operates across worker scopes — coordinate explicitly.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Observability: structured logs, metrics,
  traces, alarms, correlation IDs, dashboards, and runbooks." Currently
  missing.
- [`../diag.md`](../diag.md) — "Operational opacity" called out as High
  risk; no metrics, traces, dashboards, alarms, runbooks, replay, or DLQ
  handling today.
- [`../plan.md`](../plan.md) — Phase 8 task list and exit criteria.

Today, the submission and return paths produce no metrics, no traces, no
structured logs, and no operator surfaces for replay or DLQ triage. This
phase makes the runtime operable.

## Operating principles

- Status transitions are append-only. Every state change writes a row to
  `esocial.event_status_history`, never an in-place update.
- Logs are structured (JSON). Every log line carries: `requestId`,
  `correlationId`, `tenantId`, `eventClass`, `batchId`, `protocol`,
  `receipt`, `idempotencyKey` (where each is known).
- Metric and log names are stable and documented. Renaming a metric is a
  breaking change — coordinate with consumers.
- Retries have budgets. Beyond the budget, the message goes to DLQ —
  there is no "retry forever" path.
- Operator replay is explicit and audited. Replaying a DLQ message
  appends an audit event and starts a new processing chain with a fresh
  idempotency-derivation rule documented in the runbook.

## Tasks

1. **Retry policy.** Implement:
   - Exponential backoff with jitter for transport-class failures.
   - Per-class retry budget (e.g., 5 attempts for transport, 1 for
     validation, 0 for malformed).
   - Persistence in `esocial.event_retry_schedule`: next attempt time,
     attempt count, budget remaining, last classification.
2. **Circuit breaker.** Per environment + endpoint, track the breaker
   state in `esocial.endpoint_circuit_state` (open/closed/half-open).
   When open, new submissions are deferred (not rejected) and surfaced
   via a metric.
3. **Terminal DLQ classification.** Once retries are exhausted (or the
   classification is terminal from the start), publish to the DLQ topic
   with a structured payload: original envelope, last classification,
   attempt history, hashes, and a replay hint.
4. **Operator replay.** Provide a command/API surface that:
   - Lists DLQ messages with filters (tenant, event class, classification).
   - Replays a selected message into the request topic with a new
     correlation id and an audit trail.
   - Refuses to replay if the underlying schema has changed
     incompatibly — fail loud.
5. **Append-only status history.** Verify (and tighten) the constraint
   from Phase 3: `event_status_history` accepts only `INSERT` from the
   worker role. Add a smoke test in CI.
6. **Structured logging.** Adopt a single logger (e.g., `pino`) and
   define the field set listed under operating principles. Wire it
   through every active service (`services/submission`, `services/retorno`,
   `services/certificado`, `services/http-gateway`, etc.). Log at:
   - Ingress (envelope shape, idempotency lookup result).
   - Each major stage (build, validate, sign, submit, parse return,
     publish).
   - Every retry/DLQ decision.
7. **Metrics.** Emit at least: `accepted`, `rejected`, `retry`, `dlq`,
   `timeout`, `soap_latency_ms`, `queue_age_ms`, `parser_failures`. Use
   CloudWatch EMF for Lambda contexts (or a chosen metrics library) and
   document the names.
8. **Traces.** Wrap message handling, XML build, XSD, signing, SOAP,
   parsing, persistence, and publication in spans. Carry the trace via
   the correlation id and SQS message attributes.
9. **Runbooks.** Under `docs/operations.md`, document:
   - Replay procedure (DLQ → request topic).
   - DLQ triage decision tree.
   - Certificate rotation.
   - Sandbox outage response.
   - Official rejection investigation.
   - Tenant incident scope-down.
   - Audit evidence extraction.
   Each runbook references real commands/API calls implemented in
   earlier phases — runbooks must not describe behavior that does not
   exist.

## Primary write scope

- `services/submission/`, `services/retorno/`, `services/certificado/`
- `packages/domain/src/` (retry/circuit/DLQ logic)
- `infra/migrations/` (only forward migrations; do not mutate landed
  files) — coordinate with Phase 3 worker if a column is needed
- `infra/cdk/src/` — alarm/log group/dashboard wiring (the resources
  themselves are Phase 9; this phase declares the metric *names* the
  alarms will key off)
- `docs/operations.md`
- Tests for retry/DLQ/replay under `tests/integration/retry/`

## Do not touch

- `packages/contracts/src/` — Phase 2 owns it. New retry/DLQ envelopes
  belong there; coordinate.
- Builders and signing — Phases 5/6 own them. This phase wraps them in
  observability and retry, but does not change their behavior.

## Exit criteria

- Fault-injection tests prove the retry path: a transient transport
  failure followed by a successful submission produces exactly one
  accepted regulatory submission.
- Fault-injection tests prove the DLQ path: a terminal failure produces
  a DLQ message and no accepted submission.
- Replay tests prove an operator can move a DLQ message back to the
  request topic with audit evidence.
- Operator runbooks in `docs/operations.md` reference only commands/APIs
  that exist.
- Metric and log field names are documented in `docs/operations.md` and
  match what the code emits.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration   # retry + DLQ + replay
npm run coverage
```

Report: retry budget per classification, runbooks added, metric names
emitted (list), and one example log line per major stage.
