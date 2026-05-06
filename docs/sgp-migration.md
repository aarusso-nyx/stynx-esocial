# SGP Migration Notes

SGP remains the HR/payroll system of record. eSocial owns XML, signing, SOAP,
return parsing, retry/DLQ, replay, audit evidence, and operational dashboards.
SGP integrates only through the versioned contracts in `@esocial/contracts`.

## Public Package

Install the contract package from the restricted npm registry:

```bash
npm install @esocial/contracts@1.1.0-rc.0
```

Use only exported types, constants, schemas, and examples. Do not import eSocial
service internals, SQL files, handlers, or domain modules into SGP.

## Request DTOs

For every active event class listed in `docs/events.md`, SGP sends a v1 request
envelope to `sgp.esocial.submit.request`. Round 1 Batch 5 makes the promoted
DTO path active for every unblocked family from S-1000 through S-3000, plus the
S-50xx return parser/status surface. `S-1030`, `S-1040`, and `S-1060` remain
typed owner-blocked table DTOs with `round1Pending: true`; SGP must not enqueue
them as active regulatory work until their leiaute/XSD decisions close.
S-50xx schemas are not SGP source DTOs; they document the internal `retorno`
envelope shape for official totalizer XML that eSocial parses and republishes
as status/totalizer updates.

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
| `payload` | One of the `EsocialSourceDto` variants. SGP sends DTO fields only, never XML or signed material. |

Use `buildEsocialIdempotencyKey()` from `@esocial/contracts` before enqueueing.
The same tenant, environment, event class, source identity, competence, and
payload hash must produce the same key.

Active DTO map:

| Event | SGP builder inputs | Evidence fixture |
| --- | --- | --- |
| `S-1000` | Employer CNPJ, validity start, legal name, tax classification, optional cooperation/construction/payroll-exemption indicators. | `docs/release/0.1.0/input-dtos/s1000.dto.json` |
| `S-1005` | Employer CNPJ, validity start, opaque establishment source id, establishment registration number, optional CNAE preponderante. | `packages/contracts/examples/v1/requests/S-1005.request.json` |
| `S-1010` | Employer CNPJ, validity start, rubric code/table id, description, type, nature, incidence codes, optional ceiling data. | `docs/release/0.1.0/input-dtos/s1010.dto.json` |
| `S-1020` | Employer CNPJ, validity start, opaque lotation source id, lotation code, optional lotation type, FPAS, and third-party code. | `packages/contracts/examples/v1/requests/S-1020.request.json` |
| `S-1050` | Employer CNPJ, validity start, opaque schedule source id, schedule code, description, daily hours. | `packages/contracts/examples/v1/requests/S-1050.request.json` |
| `S-1070` | Employer CNPJ, validity start, opaque process source id, process number, subject, optional process type and matter indicator. | `packages/contracts/examples/v1/requests/S-1070.request.json` |
| `S-1200` | Employer CNPJ, competence, payroll run id, worker remuneration entries, rubrics, lotation and establishment references. | `docs/release/0.1.0/input-dtos/s1200.dto.json` |
| `S-1202` | Employer CNPJ, competence, payroll run id, RPPS worker remuneration entries, category, rubrics, and optional establishment evidence. | `packages/contracts/examples/v1/requests/S-1202.request.json` |
| `S-1207` | Employer CNPJ, competence, payroll run id, opaque S-2410 benefit source id, benefit number, beneficiary CPF, and benefit rubrics. | `packages/contracts/examples/v1/requests/S-1207.request.json` |
| `S-1210` | Employer CNPJ, competence, payment batch id, confirmed total, payment rows, and accepted S-1200/S-1202/S-1207 receipt references. | `packages/contracts/examples/v1/requests/S-1210.request.json` |
| `S-1298` | Employer CNPJ, competence, accepted S-1299 closure receipt, and acceptance timestamp for reopening evidence. | `packages/contracts/examples/v1/requests/S-1298.request.json` |
| `S-1299` | Employer CNPJ, competence, payroll run id, accepted periodic event counts, pending periodic event list, closure metadata. | `docs/release/0.1.0/input-dtos/s1299.dto.json` |
| `S-2200` | Employer CNPJ, employee id, CPF, registration, admission date, category, contract and personal source identifiers. | `docs/release/0.1.0/input-dtos/s2200.dto.json` |
| `S-2205` | Employer CNPJ, employee id, CPF, registration, change date, updated worker identity fields, and optional dependent DTOs. | `packages/contracts/examples/v1/requests/S-2205.request.json` |
| `S-2206` | Employer CNPJ, employee id, CPF, registration, change discriminator, dates, description, job/function/category, and optional workplace reference. | `packages/contracts/examples/v1/requests/S-2206.request.json` |
| `S-2210` | Employer CNPJ, employee id, CPF, registration, CAT discriminator, accident date, and original CAT receipt for death/reopening variants. | `packages/contracts/examples/v1/requests/S-2210.request.json` |
| `S-2220` | Employer CNPJ, employee id, CPF, registration, exam discriminator, exam date, and optional ASO/procedure/doctor evidence. | `packages/contracts/examples/v1/requests/S-2220.request.json` |
| `S-2230` | Employer CNPJ, employee id, CPF, registration, leave discriminator, start date, leave reason, and optional vacation/acquisition evidence. | `packages/contracts/examples/v1/requests/S-2230.request.json` |
| `S-2240` | Employer CNPJ, employee id, CPF, registration, `operation=start|change|end`, condition dates, workplace registration, risk metadata, intensity, and responsible CPF. | `packages/contracts/examples/v1/requests/S-2240.request.json` |
| `S-2298` | Employer CNPJ, employee id, CPF, registration, reintegration discriminator, dates, optional process number, and accepted S-2299 receipt. | `packages/contracts/examples/v1/requests/S-2298.request.json` |
| `S-2299` | Employer CNPJ, employee id, CPF, registration, termination discriminator/date/reason, demonstrative id, projected notice date, and severance rubrics. | `packages/contracts/examples/v1/requests/S-2299.request.json` |
| `S-2300` | Employer CNPJ, TS-V worker id, CPF, name, birth date, registration, category, start date, role, pay, and optional workplace/email. | `packages/contracts/examples/v1/requests/S-2300.request.json` |
| `S-2306` | Employer CNPJ, TS-V contract id, CPF, registration, change discriminator/date, and role/pay/internship/workplace evidence. | `packages/contracts/examples/v1/requests/S-2306.request.json` |
| `S-2399` | Employer CNPJ, TS-V contract id, CPF, registration, termination date, accepted S-2300 receipt, and optional accepted S-2306 receipt. | `packages/contracts/examples/v1/requests/S-2399.request.json` |
| `S-2400` | Employer CNPJ, opaque beneficiary id, CPF, name, birth/start dates, sex, marital status, and optional dependents. | `packages/contracts/examples/v1/requests/S-2400.request.json` |
| `S-2405` | Employer CNPJ, beneficiary id/CPF/name, change date, and accepted S-2400 receipt. | `packages/contracts/examples/v1/requests/S-2405.request.json` |
| `S-2410` | Employer CNPJ, `benefitKind`, stable `benefitIdentifier`, beneficiary CPF, benefit number, start date, benefit type, and optional pension/death metadata. | `packages/contracts/examples/v1/requests/S-2410.request.json` |
| `S-2416` | Employer CNPJ, `benefitIdentifier`, beneficiary CPF, benefit number, change date, accepted S-2410 receipt, benefit type, and pension-founder metadata. | `packages/contracts/examples/v1/requests/S-2416.request.json` |
| `S-2418` | Employer CNPJ, `benefitIdentifier`, beneficiary CPF, benefit number, reactivation/effect dates, accepted S-2410 receipt, prior suspended/terminated receipt, and optional `reactivatedBenefitReceipt`. | `packages/contracts/examples/v1/requests/S-2418.request.json` |
| `S-2420` | Employer CNPJ, `benefitIdentifier`, beneficiary CPF, benefit number, termination date/reason, and accepted S-2410 receipt. | `packages/contracts/examples/v1/requests/S-2420.request.json` |
| `S-2501` | Employer CNPJ, process number, optional linked process numbers, payment period, sequence, observation, and non-empty process tax-base list. | `packages/contracts/examples/v1/requests/S-2501.request.json` |
| `S-3000` | Employer CNPJ, `originalEventClass`, `originalReceipt`, `exclusionReason`, and the applicable worker/benefit/period identity fields. | `packages/contracts/examples/v1/requests/S-3000.request.json` |

SGP must not populate XML, SOAP endpoint URL, `signedEnvelope`, certificate
reference, or official response fields. Those are eSocial-owned runtime fields.

## Status Consumer

SGP consumes `sgp.esocial.spool.update` and updates only its local
`public.esocial_events` projection.

Rules:

- Treat the spool topic as at-least-once delivery.
- Deduplicate by `idempotency-key`, `message_id`, and `occurred_at`.
- Build request `idempotency-key` values with
  `buildEsocialIdempotencyKey()` from `@esocial/contracts`; eSocial rejects
  mismatched envelope keys as `validation_failed` before creating any database
  row.
- Accept only canonical lowercase statuses from `docs/consumers.md`.
- Mirror protocol, receipt, response code, classification, and operator-action
  flags from `response_payload`.
- Do not query the eSocial database to fill missing SGP fields. If a field is
  missing from the spool envelope, the contract must be fixed.

Canonical status examples are retained in
`docs/release/0.1.0/status/published-samples.json`. SGP behavior by status:

| Status | SGP projection behavior |
| --- | --- |
| `received`, `queued`, `processing`, `submitted` | Keep the projection pending and display the last known stage. |
| `accepted`, `processed` | Store protocol/receipt and mark the projection successful. |
| `rejected`, `validation_failed`, `failed` | Store official code or canonical error category and surface remediation text. |
| `retry_scheduled`, `replayed` | Keep the original projection and append retry/replay metadata. |
| `dlq`, `operator_action_required` | Block local completion and link to the eSocial operator incident. |

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

- eSocial schedules retry for retryable transport, timeout, and authentication
  failures within the documented budget. In the current sandbox policy,
  `transport`, `timeout`, and `authentication` have a non-zero default budget.
- eSocial publishes retry, DLQ, audit, and replay evidence.

Operator-driven:

- eSocial operators triage DLQ payloads with `listDlqMessages()`.
- Approved replay uses `buildReplayRequestFromDlq()` and publishes a replay
  request plus audit event.
- SGP does not replay by mutating old source records. It may trigger a new
  domain action only when business state changed.

## Cutover Steps

1. Deploy `@esocial/contracts@1.1.0-rc.0` into SGP backend code for shadow
   validation only. Promote to final `1.1.0` after SGP accepts the breaking
   idempotency/version requirement and the three blocked table events are
   resolved or retired.
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
