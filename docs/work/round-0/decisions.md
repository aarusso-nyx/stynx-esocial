# Round 0 Decisions

Captured by prompt `A1-baseline-and-decisions.md` on 2026-05-05.

## Baseline Evidence

The preflight output is captured verbatim in
[`evidence/A1-baseline.txt`](evidence/A1-baseline.txt).

Baseline result:

- `pwd`: `/Users/aarusso/Development/stech/stynx-esocial`
- `git status --short --branch`: `main...origin/main` with untracked
  `docs/work/round-0/` at start.
- `npm test`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with `tsc -b`.
- `npm run coverage`: passed.
- `npm run test:db`: passed against ephemeral PostgreSQL.
- `npm run migrate:dev`: passed against local `esocial_dev`.
- `npm run integration:localstack`: passed against the current local
  queue/EventBridge-compatible harness and PostgreSQL.
- `npm run test:integration`: passed.
- `npm run cdk:synth`: failed because the command is currently absent. The
  current repo uses `templates:generate` and `templates:check`, so C3 must either
  restore real CDK synthesis under `cdk:synth` or keep honest command naming and
  update the Round 0 gate.

## Contract Surface

The contract package is already broad, but still uses a pre-signed submit
payload shape that conflicts with the Round 0 DTO-ingress decision. A3 should
freeze the taxonomy and replace the submit payload with typed DTO ingress.

`EsocialRelayEventClass` currently has 40 members:

- `S-1000`
- `S-1005`
- `S-1010`
- `S-1020`
- `S-1030`
- `S-1040`
- `S-1050`
- `S-1060`
- `S-1070`
- `S-1200`
- `S-1202`
- `S-1207`
- `S-1210`
- `S-1298`
- `S-1299`
- `S-2200`
- `S-2205`
- `S-2206`
- `S-2210`
- `S-2220`
- `S-2230`
- `S-2240`
- `S-2298`
- `S-2299`
- `S-2300`
- `S-2306`
- `S-2399`
- `S-2400`
- `S-2405`
- `S-2410`
- `S-2416`
- `S-2418`
- `S-2420`
- `S-2501`
- `S-3000`
- `S-5001`
- `S-5002`
- `S-5011`
- `S-5012`
- `S-5013`

Status values are exactly:

- `pending`
- `building`
- `validation_failed`
- `signed`
- `sent`
- `accepted`
- `rejected`
- `retry`
- `timeout`
- `dlq`
- `excluded`
- `failed`

Error categories are exactly:

- `validation`
- `schema`
- `xml_build`
- `signing`
- `transport`
- `regulatory`
- `configuration`
- `authentication`
- `idempotency`
- `totalizer_parse`
- `internal`

Envelope families are exactly:

- `request`
- `response`
- `spool`
- `audit`
- `retry`
- `dlq`
- `replay`

`buildEsocialIdempotencyKey` exists in
`packages/contracts/src/idempotency.ts`. Its input fields are:

- `family`
- `tenant_id`
- `environment`
- `event_class`
- `source_event_id`
- `source_entity_id`
- `source_entity_ids`
- `competence`
- `payload_hash`
- `rectification`
- `exclusion`

Per-envelope JSON Schemas exist under `packages/contracts/schemas/v1/` for:

- `request`
- `response`
- `spool`
- `audit`
- `retry`
- `dlq`
- `replay`

## Schema State

Migration files currently present:

- `infra/migrations/001-esocial-core.sql`
- `infra/migrations/010-02-esocial-ddl.sql`
- `infra/migrations/040-esocial-functions.sql`
- `infra/migrations/070-esocial-final.sql`
- `infra/migrations/080-autonomous-database.sql`
- `infra/migrations/081-response-classification-seeds.sql`

Tables created directly:

- `esocial.submission_message`
- `esocial.submission_batch`
- `esocial.event_record`
- `esocial.tenant`
- `esocial.tenant_certificate`
- `esocial.endpoint_circuit_state`
- `esocial.event_retry_schedule`
- `esocial.response_classification`
- `esocial.esocial_totalizer`
- `esocial.xsd_validation_failure`
- `esocial.audit_event_log`
- `esocial.event_status_history`

State tables created dynamically by `080-autonomous-database.sql`:

- `esocial.s2200_emission_state`
- `esocial.s2205_pending_alteration`
- `esocial.s2210_pending`
- `esocial.s2220_pending`
- `esocial.s2230_pending`
- `esocial.s2240_pending`
- `esocial.s2298_event`
- `esocial.s2299_pending`
- `esocial.s2306_event`
- `esocial.s3000_request`

Views:

- `esocial.v_competence_periodics_pending`
- `esocial.v_event_failures`

Important functions and triggers:

- `esocial.touch_updated_at()`
- `esocial.publish_audit_event()`
- `esocial.current_tenant_id()`
- `esocial.has_worker_bypass()`
- `esocial.prevent_append_only_mutation()`
- Touch/update triggers on mutable operational tables.
- Append-only triggers on `esocial.audit_event_log` and
  `esocial.event_status_history`.

A4 should add forward migrations only. It must not mutate landed migrations.

## Architecture Decision

Round 0 resolves the architecture ambiguity in favor of the documented service
boundary:

**eSocial accepts typed DTOs from SGP, builds XML, validates against XSD, signs,
submits via SOAP, parses returns, and publishes status. SGP never sees XML.**

`docs/architecture.md` was updated to state this explicitly and to stop implying
that SGP sends XML or pre-signed payload material.

## CDK Output Policy

Keep `infra/cdk/cdk.out/*.json` committed as deterministic review artifacts
with a reproducibility check. C3 may replace the generator with real CDK, but if
templates remain committed then `npm run cdk:synth` or its replacement must
prove that regenerated output is byte-identical.

## Gitignore Policy

The root `.gitignore` was expanded from the minimal three-line form. It now
covers dependency/build/test output, logs, local environment files, IDE/macOS
noise, certificate/private-key extensions, and `.localstack/`.

Because the CDK-output policy is "committed templates with reproducibility
check", `infra/cdk/cdk.out/` is intentionally not ignored in Round 0 A1.
