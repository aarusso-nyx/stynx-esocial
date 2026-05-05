# 03 — Build the Autonomous eSocial Database

> **Phase 3 of [`../plan.md`](../plan.md).** Wave 1, runs in parallel with
> Phase 2 once Phase 1 has landed. Owns the `Database worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Database migrations: Minimal partial.
  Migrations create schema `esocial`, three tables (`submission_message`,
  `submission_batch`, `event_record`)…"
- [`../diag.md`](../diag.md) — "Database Shape Does Not Match Code"
  enumerates the relations the lifted runtime references that don't exist
  in current migrations.
- [`../plan.md`](../plan.md) — Phase 3 task list and exit criteria.
- `docs/architecture.md` — boundary rules: no FDW, no shared schemas, no
  cross-database FKs to SGP, schema is owned by `esocial`.

Today, four migration files exist (`001-esocial-core.sql`,
`010-02-esocial-ddl.sql`, `040-esocial-functions.sql`,
`070-esocial-final.sql`) and they create a minimal three-table set. The
runtime in the lifted tree references many additional relations: tenant
certificates, circuit state, retry schedule, response classification,
per-event emission/pending state, totalizers, XSD validation failures,
and reconciliation views. None of these exist in migrations today.

`npm run test:db` and `npm run migrate:dev` are currently regex linters,
not real PostgreSQL execution. This phase's job is to model the autonomous
schema and run it against a real database.

## Operating principles

- No cross-database FKs and no SGP schema references in any migration.
- All tenant-scoped relations enforce RLS by default. Bypass is by
  worker-role grant, not by `SECURITY DEFINER` shortcuts.
- Idempotency is enforced at the database level via uniqueness constraints,
  not only in application code.
- Status history is append-only.
- Migrations are forward-only. No mutating edits to landed migration files —
  add a new migration to evolve.
- The `check-migrations.mjs` forbidden-string canaries (FDW, shared schemas,
  SGP schema FKs) must continue to pass.

## Tasks

1. **Model the autonomous schema.** Add migrations for at minimum:
   - `esocial.tenant` (or accept tenant id as opaque, with tenant config
     metadata table only).
   - `esocial.tenant_certificate` — certificate custody metadata,
     encrypted-secret reference (e.g., AWS Secrets Manager ARN), validity,
     rotation/revocation timestamps. **No certificate bytes in the database.**
   - `esocial.endpoint_circuit_state` — per-environment, per-endpoint
     circuit-breaker state.
   - `esocial.submission_message` (already exists; expand fields as needed
     for idempotency and correlation).
   - `esocial.submission_batch` (expand for batch metadata, leiaute version,
     environment).
   - `esocial.event_record` (expand for event class, source ids,
     competence, signed payload reference, protocol, receipt).
   - `esocial.event_retry_schedule` — next attempt time, attempt count,
     budget remaining, last classification.
   - `esocial.response_classification` — mapping of regulatory return codes
     to canonical statuses.
   - `esocial.s1xxx_dispatch_state`, `s1200_emission_state`,
     `s1202_emission_state`, `s1210_emission_state`, `s1299_emission_state`,
     `s2200_emission_state`, `s2205_pending_alteration`, `s2210_pending`,
     `s2220_pending`, `s2230_pending`, `s2240_pending`, `s2298_event`,
     `s2299_pending`, `s2306_event`, `s3000_request` — per-family
     reconciliation state.
   - `esocial.esocial_totalizer` — S-50xx totalizer records linked back to
     batch/event/protocol/receipt.
   - `esocial.xsd_validation_failure` — XSD failures preserved with the
     offending payload hash and node path.
   - `esocial.audit_event_log` — append-only audit evidence linked to
     batches/events.
   - `esocial.event_status_history` — append-only state transitions per
     event record.
   - Reconciliation views: `esocial.v_competence_periodics_pending`,
     `esocial.v_event_failures`.
2. **Tenant RLS.** Every tenant-scoped relation has a policy keyed on the
   `app.current_tenant` setting (or whatever the project conventionally
   uses; pick one and document it in `docs/architecture.md`). Add a policy
   for the worker role that can read across tenants for operational tasks
   (e.g., DLQ triage), and an explicit test that proves both sides.
3. **Idempotency uniqueness.** Add unique constraints that match the
   idempotency key shape locked in Phase 2. The DB must reject duplicate
   regulatory submissions even if the application layer has a bug.
4. **Append-only history.** Status/audit tables reject `UPDATE` and
   `DELETE` from the worker role; allow only `INSERT`. Use triggers or
   role grants — pick one and document it.
5. **Replace the structural DB gates with real ones:**
   - `npm run migrate:dev` runs migrations against a real local PostgreSQL
     (or ephemeral container) from zero. Document how to start the local
     DB in `docs/operations.md` (create the file if missing — Phase 8 owns
     its full content; just leave a stub).
   - `npm run test:db` runs migrations against an ephemeral PostgreSQL,
     then exercises:
     - Fresh migration from zero.
     - Tenant RLS isolation: tenant A cannot see tenant B's rows; worker
       role can.
     - Idempotency uniqueness: a duplicate insert fails.
     - Append-only audit history: `UPDATE`/`DELETE` against status/audit
       tables fail under the worker role.
   - The current `check-migrations.mjs` forbidden-string checks remain in
     CI as a separate `lint:migrations` step (or as part of `npm run lint`).

## Primary write scope

- `infra/migrations/` (forward-only new files; do not mutate landed ones
  unless they have not yet shipped)
- `scripts/check-migrations.mjs` (compose old + new behavior; do not
  delete the canaries)
- `package.json` scripts for `migrate:dev`, `test:db`
- DB-focused tests under `tests/db/` (new directory)
- `docs/architecture.md` (RLS pattern, tenant context variable, custody
  metadata pattern)
- `docs/operations.md` (stub — local DB bring-up)

## Do not touch

- `packages/contracts/` — Phase 2 owns it. Read it for idempotency-key
  shape; do not modify.
- `services/` runtime — Phase 4 wires the handler against the schema, not
  this phase.
- Lifted code under `packages/domain/src/sgp-lifted/` — its references are
  inputs to this design, not files to edit.
- `infra/cdk/` — Phase 9 owns it.

## Exit criteria

- A fresh database can run all migrations from zero with no errors.
- RLS tests prove tenant isolation and the worker bypass semantics.
- Duplicate idempotency tests cannot create duplicate regulatory submissions.
- Append-only history cannot be mutated under the worker role.
- Migration checker still forbids FDW, shared schemas, and SGP schema FKs.
- No certificate bytes are stored in the database; only encrypted-secret
  references and metadata.
- `npm run migrate:dev` and `npm run test:db` perform real PostgreSQL
  execution. Their structural-only behavior is gone (or moved into a
  dedicated `lint:migrations` step).

## Verification commands

```text
# Bring up local PG (documented in docs/operations.md), then:
npm run migrate:dev
npm run test:db
npm run lint           # boundary canaries still pass
npm run build          # nothing broken downstream
```

Report: tables added, views added, RLS policies added, and the four
behavioral assertions exercised (fresh-from-zero, RLS, idempotency,
append-only).
