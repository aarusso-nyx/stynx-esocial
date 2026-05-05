# 07 — Returns, Totalizers, and Status Publication

> **Phase 7 of [`../plan.md`](../plan.md).** Wave 2, runs after Phase 6 has
> the SOAP stub working. Owns the `Returns worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — service entrypoints are mostly stubs returning
  `{ service, records, boundary: 'esocial' }`. `services/retorno/` is one
  of them.
- [`../diag.md`](../diag.md) — there are no return parser tests, no
  totalizer handling, and no status publication that updates SGP without
  writing SGP tables.
- [`../plan.md`](../plan.md) — Phase 7 task list and exit criteria.
- [`../../consumers.md`](../../consumers.md) — the spool/status update
  shape SGP expects.
- The lifted parser code under `packages/domain/src/sgp-lifted/.../parsers/`
  for protocol/processing/totalizer.

This phase closes the loop: regulatory responses come in, get classified,
get persisted, and produce the status update that SGP consumes. Critical
constraint: the eSocial service updates **its own** state and emits
**bus events**; SGP listens and updates its local projection. We never
write `public.esocial_event` from active code.

## Operating principles

- Return parsing is deterministic. Identical bytes produce identical
  classifications.
- Status publication is at-least-once but idempotent — SGP must be able
  to receive the same status update twice without producing duplicate
  effects. Carry an idempotency key on the spool envelope.
- Return payloads are persisted in `esocial` (not in SGP schemas).
- Totalizers are linked to the originating batch, event, protocol, and
  receipt. Reconciliation views must be able to walk that chain.
- No fake totalizer success. If S-50xx data is missing for a competence,
  the reconciliation view says so honestly.

## Tasks

1. **Promote parsers** for protocol, processing, and totalizers from the
   lifted tree into active locations under `packages/domain/src/returns/`
   (or similar). Promote the corresponding tests; wire them into
   `npm test`. Cover at least:
   - Successful protocol response.
   - Rejection with regulatory error code.
   - SOAP fault.
   - Malformed XML.
   - Each totalizer variant: `S-5001`, `S-5002`, `S-5011`, `S-5012`,
     `S-5013`.
2. **Persist returns.** On every return, persist:
   - Raw response payload (or a hash + an object-store reference if the
     payload is large) in `esocial`.
   - Parsed classification linked to the originating event/batch.
   - Status transition appended to `event_status_history` (Phase 3).
3. **Map regulatory codes** to canonical statuses via
   `esocial.response_classification`. The mapping is data, not code —
   seed it via a forward migration owned by Phase 3 if rows do not exist.
   The categories are: `accepted`, `rejected`, `retry`, `timeout`, `dlq`,
   `operator_action_required`.
4. **Publish status/spool updates** to SGP. The publisher writes onto the
   spool topic with the Phase-2 envelope. Carry: tenant, environment,
   event class, source ids, competence, status, regulatory codes,
   protocol, receipt, hashes, and idempotency key. Do not write
   `public.esocial_event` or any SGP schema.
5. **Handle totalizers.** S-50xx events are not user-submitted; they are
   regulatory responses to a closed competence. On totalizer arrival:
   - Persist the totalizer row in `esocial.esocial_totalizer` linked to
     batch/event/protocol/receipt.
   - Append an audit event.
   - Publish a totalizer-status update on the spool topic so SGP can
     close the competence locally.
6. **Reconciliation views.** Implement (or finalize) the views from
   Phase 3 — `v_competence_periodics_pending`, `v_event_failures` — and
   expose them either as read-only API outputs or as documented SQL
   queries in `docs/operations.md`. Pick one and apply it consistently.

## Primary write scope

- `services/retorno/`
- `packages/domain/src/returns/` (new)
- Status/spool publisher under `services/submission/src/` or a dedicated
  `services/status/` (pick one and document)
- `docs/consumers.md` (status mapping table)
- Return tests under `tests/returns/`

## Do not touch

- `packages/contracts/src/` — Phase 2 owns the spool envelope shape.
  Coordinate with Phase 2 owner if a field is missing.
- `infra/migrations/` for the `response_classification` table or
  totalizer table shape — Phase 3 owns it. Seed data via forward
  migrations only.
- Signing/SOAP — Phase 6 owns it. This phase consumes the SOAP response
  bytes; it does not modify the SOAP path.
- `services/submission/` ingress logic — Phase 4 owns it. You may add a
  return-side handler in the same service if that's the layout choice.

## Exit criteria

- Return parser tests cover success, rejection, SOAP fault, malformed
  XML, and every totalizer variant.
- SGP-facing status events contain enough data to update its local
  projection: at minimum, source ids, status, regulatory codes,
  protocol, receipt, and an idempotency key.
- No active code writes `public.esocial_event` or any SGP schema.
- Totalizer evidence is traceable: `esocial.esocial_totalizer` rows link
  to batch/event/protocol/receipt.
- Reconciliation views or API outputs answer: which competences are
  still pending, which events failed terminally and why.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
grep -R "public\\.esocial_event\\|hr\\.\\|payroll\\.\\|saude\\." \
   services packages --include="*.ts" | grep -v sgp-lifted
```

Report: regulatory-code mappings seeded, totalizer variants covered, and
the chosen reconciliation surface (views vs. API).
