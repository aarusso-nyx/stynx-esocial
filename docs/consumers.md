# Consumer Contract

This document is for systems that produce eSocial work for this service or
consume its status updates. The first consumer is SGP.

The executable contract lives in `packages/contracts/src/`. This document and
the exported TypeScript contract are the same public boundary: when either one
changes, both must change in the same commit.

## Boundary Summary

SGP owns business decisions. eSocial owns regulatory transmission.

SGP must:

- Validate the domain action and authorization.
- Create or update its local `public.esocial_events` projection.
- Send a normalized request envelope to eSocial.
- Consume status/audit updates and mirror receipt/error data locally.

SGP must not:

- Query the eSocial database.
- Depend on eSocial SQL schemas or tables.
- Send raw payroll tables as a transport contract.
- Expose browser-facing `/api/v1/esocial/*` routes as an SGP feature.

## Transport

Allowed transports:

- SQS FIFO queues for command, status, retry, DLQ, and replay messages.
- EventBridge for audit/status events.
- Backend-only HTTPS for synchronous admin or diagnostic operations, when a
  queue is not suitable.

Forbidden transports:

- PostgreSQL FDW.
- Shared database URLs.
- Cross-database foreign keys.
- Direct writes from SGP into schema `esocial`.

## Topics

| Topic | Family | Producer | Consumer | Purpose |
| --- | --- | --- | --- | --- |
| `sgp.esocial.submit.request` | `request` | SGP | eSocial submission service | Request XML build/sign/submit for one batch. |
| `sgp.esocial.submit.response` | `response` | eSocial | SGP | Return protocol, receipt, rejection, timeout, or retry status. |
| `sgp.esocial.spool.update` | `spool` | eSocial | SGP | Update SGP `public.esocial_events` projection. |
| `sgp.esocial.audit` | `audit` | eSocial | SGP/audit sink | Append audit evidence for mutation or transmission events. |
| `sgp.esocial.retry` | `retry` | eSocial | eSocial submission service | Schedule another attempt with reason and next-at metadata. |
| `sgp.esocial.dlq` | `dlq` | eSocial | eSocial operators/replay tooling | Hold exhausted or operator-action failures. |
| `sgp.esocial.replay` | `replay` | eSocial operators | eSocial submission service | Re-drive an approved DLQ item without mutating the original envelope. |

The topic prefix still names the initial producer integration. It is a transport
contract, not a database or package namespace.

## Versioned Envelopes

Every transport family carries `version: "v1"` and a family discriminator:
`request`, `response`, `spool`, `audit`, `retry`, `dlq`, or `replay`.

All envelopes include:

- `version`
- `family`
- `request-id`
- `correlation-id`
- `idempotency-key`
- `created_at`
- `tenant_id`
- `environment`, either `PRODUCTION` or `QUALIFICATION`
- `event_class`, one of the 40 exported `EsocialRelayEventClass` values
- `source`, containing opaque SGP references such as `source_event_id`,
  `payroll_run_id`, `employee_id`, `source_entity_id`, and
  `source_entity_ids`

`request` envelopes add:

- `kind`, such as `submit`, `tabelas`, `trabalhador`, `folha`,
  `fechamento`, `exclusao`, `retorno`, or `certificado`
- `attempt`
- `max-attempts`
- `reply-to`
- `dead-letter-topic`
- `payload_hash`
- `payload`

The `request.payload` is an SGP request DTO. SGP sends typed business data and
opaque source identifiers only; it does not send XML, SOAP envelopes, PKCS#7
material, or a `signedEnvelope`. The eSocial service builds XML, validates XSD,
signs, submits, parses returns, and publishes status.

Round 0 DTOs are implemented for:

| Event | DTO purpose | Required source fields |
| --- | --- | --- |
| `S-1000` | Employer/contributor information | `tenantId`, `sourceEventId`, `employerCnpj`, `validityStart`, `legalName`, `taxClassification` |
| `S-1010` | Rubric table | `tenantId`, `sourceEventId`, `employerCnpj`, `validityStart`, `rubricCode`, `rubricTableId`, incidence codes |
| `S-1200` | Worker remuneration | `tenantId`, `sourceEventId`, `employerCnpj`, `competence`, `payrollRunId`, `workers[]` |
| `S-1299` | Periodic closure | `tenantId`, `sourceEventId`, `employerCnpj`, `competence`, `payrollRunId`, accepted/pending event summary |
| `S-2200` | Admission/initial worker registration | `tenantId`, `sourceEventId`, `employerCnpj`, `employeeId`, `cpf`, `admissionDate`, registration/contract fields |

All other exported event classes have `Round1Pending` DTO stubs so the v1 type
surface covers the full 40-class taxonomy without pretending their builders
landed in Round 0. Stub payloads carry `round1Pending: true` and
`deferredReason: "builder_not_promoted_in_round0"`.

DTO-level `environment`, when present, is one of `qualification`,
`restricted_production`, or `production`. Envelope environment values remain the
current transport values shown above until the submission worker consumes the
DTO contract directly.

`response` envelopes add:

- `kind`
- `status`
- `attempt`
- `processed_at`
- optional `protocol_number`, `receipt_number`, `response_code`, and
  `response_description`
- optional request, payload, signed-payload, and response hashes
- optional structured `errors`
- optional response `payload`

`spool` envelopes add:

- `message_id`
- `kind`
- `status_transition.from`
- `status_transition.to`
- optional `response_payload`, `response_hash`, and `errors`
- `occurred_at`

Return/status spool updates use `kind: "retorno"` and carry enough data for SGP
to update only its local projection:

- `response_payload.return_kind`: `protocol`, `processing`, `totalizer`,
  `soap_fault`, or `malformed_xml`.
- `response_payload.protocol_number` and `response_payload.receipt_number`.
- `response_payload.response_code` and `response_payload.response_description`.
- `response_payload.classification`, copied from `esocial.response_classification`
  when the official code is mapped.
- `response_payload.operator_action_required`.
- `response_payload.batch_id` and `response_payload.event_record_id`.
- `response_payload.totalizer_id`, `totalizer_class`, and `competence` when a
  regulatory S-50xx totalizer was received.

The spool idempotency key is the original return request idempotency key. SGP
must treat duplicate spool updates with the same key as at-least-once delivery,
not as distinct regulatory outcomes.

`audit` envelopes add:

- optional `actor_id`
- `action`
- optional `status`
- `target`
- optional `before`, `after`, and `errors`
- `occurred_at`

`retry` envelopes add:

- `kind`
- `status`, either `retry` or `timeout`
- `attempt`
- `max-attempts`
- `next_attempt_at`
- `retry_reason`
- optional `errors`

`dlq` envelopes add:

- `kind`
- `status`, either `dlq` or `failed`
- `final_attempt`
- `dlq_reason`
- `failed_at`
- `errors`
- optional `replay_topic`

`replay` envelopes add:

- `kind`
- `status: "pending"`
- `original_request_id`
- `replay_request_id`
- `replayed_by`
- `replay_reason`
- optional replay `payload`

## Event Classes

The request `event_class` and all downstream status/audit envelopes use the
full exported event taxonomy:

- Tables: `S-1000`, `S-1005`, `S-1010`, `S-1020`, `S-1030`, `S-1040`,
  `S-1050`, `S-1060`, `S-1070`.
- Periodic: `S-1200`, `S-1202`, `S-1207`, `S-1210`, `S-1298`, `S-1299`.
- Worker/SST/TSV: `S-2200`, `S-2205`, `S-2206`, `S-2210`, `S-2220`,
  `S-2230`, `S-2240`, `S-2298`, `S-2299`, `S-2300`, `S-2306`, `S-2399`.
- Benefits/process/exclusion: `S-2400`, `S-2405`, `S-2410`, `S-2416`,
  `S-2418`, `S-2420`, `S-2501`, `S-3000`.
- Returns: `S-5001`, `S-5002`, `S-5011`, `S-5012`, `S-5013`.

## Idempotency

Consumers must build idempotency keys with
`buildEsocialIdempotencyKey(input)` from `@esocial/contracts`.

The key input includes:

- Transport family.
- Tenant id.
- Environment.
- Event class.
- Source event id, source entity id, or source entity ids.
- Competence when the event is competence-scoped.
- Payload hash.
- Rectification marker when the operation rectifies a prior event.
- Exclusion marker when the operation excludes a prior event.

The submitted envelope's `idempotency-key` must exactly equal the helper output
for the envelope family, tenant, environment, event class, source identifiers,
competence, and payload hash. The submission handler enforces this before
database persistence; a mismatch is published as `validation_failed` on the
response, spool, and audit surfaces and does not create an `esocial` database
row.

The same payload hash for the same tenant/source/event/environment/family must
not create duplicate regulatory submissions unless a deliberate replay,
rectification, or exclusion operation changes the marker fields.

Phase 3 must enforce the same key shape in the `esocial` database with a unique
constraint or equivalent idempotency ledger. Phase 2 deliberately defines only
the public contract and deterministic key builder.

## Status Semantics

The canonical status union has exactly 12 lowercase values:

| State | Meaning |
| --- | --- |
| `pending` | SGP accepted the domain action and queued work, or a replay is waiting to run. |
| `building` | eSocial is constructing XML. |
| `validation_failed` | Local DTO, XSD, or business preflight failed before submission. |
| `signed` | Payload was signed and is ready for submission. |
| `sent` | Batch was sent to the eSocial endpoint. |
| `accepted` | Endpoint returned protocol/receipt success. |
| `rejected` | Endpoint rejected the event or batch. |
| `retry` | Retry is scheduled and the event remains active. |
| `timeout` | Transport timed out and retry policy applies. |
| `dlq` | Retry budget was exhausted or failure requires operator action. |
| `excluded` | S-3000 exclusion was accepted. |
| `failed` | Non-retryable internal or configuration failure. |

State changes must be append-oriented in audit evidence. Producers must not use
synonyms or transport-only status values.

### Regulatory Return Mapping

Return processing maps official response codes through
`esocial.response_classification`; the mapping is data, not hard-coded status
logic. The handler-normalized SGP-facing mappings are:

| Code | Canonical status | Retryable | Operator action |
| --- | --- | --- | --- |
| `201` | `accepted` | No | No |
| `202` | `retry` | Yes | No |
| `301` | `retry` | Yes | No |
| `401` | `rejected` | No | Yes |
| `402` | `rejected` | No | Yes |
| `403` | `failed` | No | Yes |
| `404` | `failed` | No | Yes |
| `409` | `failed` | No | Yes |
| `500` | `retry` | Yes | No |
| `503` | `retry` | Yes | No |
| `TIMEOUT` | `timeout` | Yes | No |
| `SOAP_FAULT` | `failed` | No | Yes |
| `MALFORMED_XML` | `failed` | No | Yes |

SOAP faults are transport failures and are published as `failed` return
outcomes with `transport` errors. Malformed or unsupported return XML is
published as `failed` with `schema` errors and no totalizer row. Unknown
regulatory codes are published as `failed` with `regulatory` errors and
`audit_flags: ["unknown_regulatory_code"]` so the mapping gap is explicit.

## Error Categories

Use explicit lowercase categories:

| Category | Meaning |
| --- | --- |
| `validation` | Malformed, incomplete, or contract-invalid consumer request. |
| `schema` | XML does not match the official schema bundle. |
| `xml_build` | Builder failed to produce event XML. |
| `signing` | Certificate, key access, or signature failure. |
| `transport` | Network, timeout, TLS, SQS, EventBridge, or SOAP envelope failure. |
| `regulatory` | Official eSocial environment business-rule rejection. |
| `configuration` | Missing or invalid service, tenant, endpoint, or certificate configuration. |
| `authentication` | Credential, certificate identity, or authorization failure. |
| `idempotency` | Duplicate, conflicting, or replay-forbidden idempotency outcome. |
| `totalizer_parse` | Return or totalizer payload could not be parsed. |
| `internal` | Unexpected service failure. |

## Versioning Policy

Contract versions are forward-only.

- `v1` is the initial production-target transport contract.
- Additive v1 changes may add optional fields, new schemas, or new DTO branches
  without changing existing required fields or discriminator values.
- Breaking changes are introduced with new exported types, schemas, fixtures,
  and a new envelope `version: "v2"` discriminator while keeping existing v1
  types intact during the overlap window.
- SGP discovers schema changes through the published `@esocial/contracts`
  package semver, this document, and contract fixture updates.
- Producers include the envelope `version` discriminator on every message.
- Consumers negotiate compatibility by accepting only known versions and
  rejecting unknown versions with a `validation` error and `failed` status.
- Breaking changes require a new version, migration notes, and an overlap
  window agreed with SGP.
- Deprecated versions remain readable for at least one release train after the
  replacement is published, unless the owner explicitly authorizes a
  pre-production hard cut.

Compatibility matrix:

| Change | Contract version | Package semver | SGP action |
| --- | --- | --- | --- |
| Optional response/status field | `v1` | minor | Consume when useful; old consumers keep working. |
| New Round 1 DTO replacing a `Round1Pending` stub | `v1` | minor | Upgrade `@esocial/contracts`, emit the promoted DTO branch. |
| New required field in an existing DTO/envelope | `v2` | major | Run overlap: SGP emits v1 until it is upgraded to v2. |
| Removed/renamed field or discriminator | `v2` | major | Migrate producer and consumer together during the overlap window. |
| Status or error taxonomy change | `v2` unless purely additive | major for breaking, minor for additive | Update SGP mappings and contract tests before cutover. |

## Package Artifacts

The SGP-facing package is `@esocial/contracts@1.0.0`.

Published contents:

- TypeScript definitions from `packages/contracts/dist/`.
- JSON schemas under `packages/contracts/schemas/v1/` for `request`,
  `response`, `spool`, `audit`, `retry`, `dlq`, `replay`, the DTO union, and
  one DTO schema per exported event class.
- Deterministic request examples under
  `packages/contracts/examples/v1/requests/` for every supported event class.
- `packages/contracts/CHANGELOG.md` as the release surface summary.

The package is configured for restricted npm publication. Creating a git tag or
publishing the package is a release-owner action, not part of local validation.

## SGP Integration Notes

SGP should map eSocial responses back to `public.esocial_events` without owning
XML, signing, SOAP, retry internals, DLQ replay, or raw XML/SOAP inspection.
SGP can expose local read-only status in its own business screens, but
operational eSocial dashboards, certificate rotation, DLQ replay, and payload
evidence belong in this repository.

## Compatibility

This project is pre-production. Do not add backward-compatibility shims for old
R6 names or old status values. Rename contracts directly when they are wrong,
update consumers and tests, and document the new contract here.
