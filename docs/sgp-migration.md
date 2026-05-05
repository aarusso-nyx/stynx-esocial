# SGP Migration Notes

SGP remains the HR/payroll system of record. eSocial owns XML, signing, SOAP,
return parsing, retry/DLQ, replay, audit evidence, and operational dashboards.
SGP integrates only through the versioned contracts in `@esocial/contracts`.

## Public Package

Install the contract package from the restricted npm registry:

```bash
npm install @esocial/contracts@1.0.0
```

Use only exported types, constants, schemas, and examples. Do not import eSocial
service internals, SQL files, handlers, or domain modules into SGP.

## Request DTOs

For every event class listed in `docs/events.md`, SGP sends a v1 request
envelope to `sgp.esocial.submit.request`.

Required SGP-sourced fields:

| Field | SGP source |
| --- | --- |
| `tenant_id` | Current tenant UUID. |
| `environment` | `QUALIFICATION` before cutover; `PRODUCTION` only after go-live approval. |
| `event_class` | One of the 40 exported `EsocialRelayEventClass` values. |
| `source.source_event_id` | SGP local eSocial projection/event id when present. |
| `source.payroll_run_id` | Payroll run identifier for competence-scoped events. |
| `source.employee_id` | Employee identifier for worker-scoped events. |
| `source.source_entity_id` or `source_entity_ids` | Opaque SGP source identifiers for tables, benefits, exclusions, and grouped events. |
| `payload_hash` | SHA-256 hash of the normalized payload. |
| `payload` | `EsocialRelayRequestPayload` with batch id, event ids, endpoint, event class, and signed-envelope metadata. |

Use `buildEsocialIdempotencyKey()` from `@esocial/contracts` before enqueueing.
The same tenant, environment, event class, source identity, competence, and
payload hash must produce the same key.

## Status Consumer

SGP consumes `sgp.esocial.spool.update` and updates only its local
`public.esocial_events` projection.

Rules:

- Treat the spool topic as at-least-once delivery.
- Deduplicate by `idempotency-key`, `message_id`, and `occurred_at`.
- Accept only canonical lowercase statuses from `docs/consumers.md`.
- Mirror protocol, receipt, response code, classification, and operator-action
  flags from `response_payload`.
- Do not query the eSocial database to fill missing SGP fields. If a field is
  missing from the spool envelope, the contract must be fixed.

## Error Handling

SGP displays business-readable status, but eSocial owns remediation.

| Category | SGP behavior |
| --- | --- |
| `validation`, `schema`, `xml_build` | Mark local projection as failed/rejected and show the contract or XML error. |
| `signing`, `authentication`, `configuration` | Mark operator action required; link to eSocial operations, not SGP admin screens. |
| `transport`, `timeout`, `internal` | Show retrying/temporarily unavailable while eSocial retry budget is active. |
| `regulatory` | Mark rejected and expose official code/description. |
| `idempotency` | Keep the first known outcome and surface the conflict for review. |
| `totalizer_parse` | Mark operator action required; eSocial owns parser and evidence extraction. |

## Retry, DLQ, And Replay

Automatic:

- eSocial schedules retry for retryable transport, timeout, and internal
  failures within the documented budget.
- eSocial publishes retry, DLQ, audit, and replay evidence.

Operator-driven:

- eSocial operators triage DLQ payloads with `listDlqMessages()`.
- Approved replay uses `buildReplayRequestFromDlq()` and publishes a replay
  request plus audit event.
- SGP does not replay by mutating old source records. It may trigger a new
  domain action only when business state changed.

## Cutover Steps

1. Deploy `@esocial/contracts@1.0.0` into SGP backend code.
2. Map each existing SGP eSocial domain action to one request-envelope builder.
3. Start writing `public.esocial_events` as a local projection before enqueueing.
4. Publish qualification traffic to `sgp.esocial.submit.request`.
5. Enable the SGP spool consumer in shadow mode and compare local projection
   updates with historical behavior.
6. Run eSocial gates: `npm test`, `npm run test:db`,
   `npm run test:integration`, `npm run integration:localstack`, and
   `npm run templates:check`.
7. Freeze old SGP XML/SOAP paths for migrated event classes.
8. Switch SGP backend actions to enqueue-only behavior for those classes.
9. Monitor eSocial dashboards, DLQ, retry, and audit topics for one payroll
   competence cycle.
10. Remove old SGP browser-facing eSocial routes and direct XML/SOAP execution
    after the release owner approves parity evidence.

Rollback:

- Stop SGP request publishing.
- Drain or pause eSocial request queues.
- Keep eSocial audit evidence immutable.
- Re-enable the historical SGP path only for event classes not already accepted
  by the official environment.
- Reconcile SGP `public.esocial_events` from the last spool/audit envelope before
  replaying any business action.

## Restricted-Production Gate

Restricted-production or real-service evidence requires explicit owner
authorization, redaction rules, and a named release window. Until then, only
deterministic qualification fixtures and sandbox adapters are allowed.
