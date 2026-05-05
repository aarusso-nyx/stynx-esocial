# A4 — Autonomous Schema with Real Postgres Gates

> **Wave A, step 4.** Database worker. Blocks B1, B3, B5, C1, C3.

## Read first

- [`../decisions.md`](../decisions.md) — A1 enumerated the actual schema
  state and migration files. Start there.
- [`../../plan.md`](../../plan.md) — Phase 3 task list.
- [`../assessment.md`](../assessment.md) — Schema/code mismatch finding.
- `infra/migrations/*.sql` — what's already landed.

## Why this exists

`npm run migrate:dev` and `npm run test:db` are regex linters today. The
runtime references many relations not present in active migrations. Without
real Postgres gates, every Wave-B prompt depends on a database that may not
match the code.

## Tasks

1. **Inventory the actual schema.** From A1's findings, list:
   - Tables that exist.
   - Tables required by Wave-B work that do not exist.
   - Tables referenced by `sgp-lifted` that round 0 does not need (will
     be deferred to round 1's promotion).
2. **Forward migrations only.** Do **not** mutate landed migration files.
   Add new files using a numeric prefix that continues the existing
   sequence. Each file: idempotent (`CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, etc.). One concern per file.
3. **Required round-0 relations** (add the ones missing per the inventory):
   - `esocial.tenant_certificate` — id, tenant_id, environment, label,
     secret_ref (Secrets Manager ARN), serial, subject, issuer,
     not_before, not_after, revoked_at, rotated_at, fingerprint_sha256,
     audit timestamps. Constraint: `secret_ref` matches an ARN regex.
     **No certificate bytes.**
   - `esocial.endpoint_circuit_state` — environment, endpoint, state
     (`closed | open | half_open`), failure_count, last_failure_at,
     opened_at, half_open_probe_at.
   - `esocial.event_retry_schedule` — event_record_id, attempt,
     next_attempt_at, classification, last_error, budget_remaining.
   - `esocial.response_classification` — regulatory_code, status,
     category, retryable, description. Seed all known eSocial return
     codes via a seed migration.
   - `esocial.s1xxx_dispatch_state` — generic per-event-class dispatch
     state for table events.
   - `esocial.s1200_emission_state`, `s1299_emission_state`,
     `s2200_emission_state` — round-0 family state tables.
   - `esocial.event_status_history` — event_record_id, from_status,
     to_status, reason, transitioned_at, actor (worker | operator).
     Append-only.
   - `esocial.audit_event_log` — event_record_id (nullable),
     batch_id (nullable), kind, payload (jsonb), occurred_at, actor.
     Append-only.
   - `esocial.xsd_validation_failure` — event_record_id, payload_hash,
     node_path, message, occurred_at.
   - `esocial.dlq_item` — original envelope, last classification,
     attempt history, hashes, replay hint, opened_at, resolved_at,
     resolved_by.
   - `esocial.esocial_totalizer` — competence, event_class, employer,
     batch_id, event_record_id, protocol, receipt, payload (jsonb),
     ingested_at.
   - View `esocial.v_competence_periodics_pending`.
   - View `esocial.v_event_failures`.
4. **Tenant RLS.** Every tenant-scoped relation has policies keyed on
   `current_setting('app.current_tenant_id', true)`. Worker role
   (`esocial_worker`) bypasses with a documented role grant. App role
   (`esocial_app`) enforces. Document the convention in
   `docs/architecture.md` (one paragraph).
5. **Idempotency uniqueness.** Add unique constraints matching the
   round-0 idempotency-key shape from A3:
   - `submission_message_transport_idempotency_ux` on
     (tenant_id, environment, idempotency_key).
   - `event_record_regulatory_idempotency_ux` on
     (tenant_id, environment, event_class, source_event_id, competence,
     payload_hash, rectification_marker, exclusion_marker).
6. **Append-only history.** `event_status_history` and `audit_event_log`
   reject UPDATE/DELETE under the worker role. Use either trigger-based
   `RAISE EXCEPTION` or per-role grants — pick one and document.
7. **Real `migrate:dev` and `test:db`.**
   - `scripts/migrate-dev.mjs` — runs every file in `infra/migrations/`
     in lexical order against `DATABASE_URL`. Idempotent.
   - `scripts/test-db.mjs` — boots an ephemeral Postgres (Testcontainers
     or a documented Docker compose), runs migrations from zero,
     executes assertions:
     - Migrations from zero exit clean.
     - Tenant RLS isolates A from B; worker role sees both.
     - Duplicate insert on each idempotency-uniqueness index fails.
     - UPDATE/DELETE on `event_status_history` and `audit_event_log`
       fails under the worker role.
     - Seed migration populated `response_classification`.
   - `package.json`: `migrate:dev` and `test:db` invoke the new scripts;
     the regex check moves to `lint:migrations` and runs under
     `npm run lint`.
8. **Migration-checker preserved.** Forbidden-string canaries (FDW,
   shared schemas, SGP schema FKs) keep firing. Round 0 does not relax
   them.

## Primary write scope

- `infra/migrations/**` (forward-only)
- `scripts/migrate-dev.mjs`, `scripts/test-db.mjs` (new)
- `scripts/check-migrations.mjs` (compose; do not delete canaries)
- `package.json` (script wiring)
- `docs/architecture.md` (RLS / tenant-context paragraph)
- `tests/db/**` (new) for the assertion suite

## Do not touch

- Code under `packages/`, `services/`, `infra/cdk/`.

## Exit criteria

- `npm run migrate:dev` requires a `DATABASE_URL`, runs SQL, exits 0.
- `npm run test:db` boots ephemeral Postgres, runs migrations, runs the
  five behavioral assertions, exits 0.
- `npm run lint` still runs the migration canaries.
- All round-0 required relations exist; their RLS policies, uniqueness
  constraints, and append-only behavior are tested.
- No migration mutates `hr.*`, `payroll.*`, `saude.*`, `public.esocial_event`.

## Verification

```text
docker compose -f tests/db/docker-compose.yml up -d
DATABASE_URL=postgres://... npm run migrate:dev
DATABASE_URL=postgres://... npm run test:db
npm run lint
```

Report: relations added, RLS policies added, uniqueness constraints added,
seed rows inserted into `response_classification`, and the cold-start time
of the ephemeral Postgres for CI capacity planning.
