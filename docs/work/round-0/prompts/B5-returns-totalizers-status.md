# B5 — Returns, Totalizers, Status Publication

> **Wave B, step 5.** Returns worker. Blocked by A3 + A4. Parallel with B1–B4.

## Read first

- [`../assessment.md`](../assessment.md) — Returns parser is
  production-ready; handler is a placeholder.
- [`../../plan.md`](../../plan.md) — Phase 7.
- `packages/domain/src/returns/parsers.ts` — keeps as-is, wire it.
- `services/retorno/src/handler.ts` — current placeholder.
- A4's `response_classification`, `event_status_history`,
  `esocial_totalizer`, view `v_event_failures`.

## Why this exists

The full S-50xx parser surface exists and is solid. What's missing is the
live ingress handler that consumes return XML from the bus, classifies
it, persists it, and publishes status updates SGP can consume. B5 closes
the loop.

## Tasks

1. **Active retorno handler** at `services/retorno/src/handler.ts`:
   - Validates the inbound return envelope against A3's JSON Schema.
   - Loads XML payload, runs hardened parser (B3 hardened it).
   - Classifies via `parsers.ts`: protocol, processing, totalizer,
     SOAP fault.
   - Looks up the originating `event_record` by protocol/receipt.
2. **Persistence.**
   - Raw response payload: hashed; if large, store in S3/object-store
     (round 0 may use a local fixture path; document the future
     production target). Hash + reference in `audit_event_log`.
   - Parsed classification → `event_status_history` row (transition
     to `accepted` / `rejected` / `retry` / `timeout` / etc.).
   - Totalizers (S-5001/5002/5011/5012/5013) → `esocial_totalizer`
     rows linked to batch/event/protocol/receipt.
3. **Regulatory-code mapping.** Use `esocial.response_classification`
   (seeded by A4). For unknown codes: persist as `failed` with category
   `regulatory` and emit an audit event flagging the gap. Round-1 work
   will close any reported gaps.
4. **Spool publication.** Emit a spool envelope to SGP with:
   - tenant, environment, event class, source ids, competence,
     final status, regulatory codes, protocol, receipt, hashes,
     idempotency key.
   - **No SGP schema writes.** The handler publishes; SGP consumes.
5. **Totalizer status update.** S-50xx events are not user-submitted;
   they reconcile a competence. On totalizer arrival:
   - `esocial.esocial_totalizer` row.
   - `audit_event_log` row.
   - Spool envelope of kind `totalizer` so SGP can close its local
     competence projection.
6. **Reconciliation surface.** Pick one and apply consistently:
   - Read-only API in `services/http-gateway` exposing `v_event_failures`
     and `v_competence_periodics_pending`. (C2 wires auth on the HTTP
     gateway.)
   - **OR** SQL queries in `docs/operations.md` for operator use.
   Prefer the API path; document the choice.
7. **Tests.** Under `services/retorno/__tests__/`:
   - Successful protocol response → status `accepted`, spool emitted,
     audit row.
   - Regulatory rejection → status `rejected`, classification row,
     spool emitted.
   - SOAP fault → status `failed`, category `transport`, audit row.
   - Malformed XML → status `failed`, category `schema`, audit row,
     no totalizer row.
   - Each totalizer variant (S-5001, S-5002, S-5011, S-5012, S-5013)
     → `esocial_totalizer` row, spool of kind `totalizer`.
   - Unknown regulatory code → `failed` + `regulatory`, audit gap-flag.

## Primary write scope

- `services/retorno/src/**`, `__tests__/**`
- `packages/domain/src/returns/**` (only handler-side helpers; parsers
  stay as-is unless A3 surfaces a contract gap)
- `docs/consumers.md` — mapping table for status / regulatory codes
- `docs/operations.md` — reconciliation queries (if API not chosen)

## Do not touch

- Contracts (A3), migrations (A4), builders (B2), signing (B3), SOAP
  outbound (B4).
- `parsers.ts` algorithms — they are production-ready. Only wire them.

## Exit criteria

- All seven test paths above pass.
- `services/retorno` writes status, audit, totalizer, and spool rows
  consistent with the `esocial.response_classification` mapping.
- `grep -R "public\\.esocial_event\\|hr\\.\\|payroll\\.\\|saude\\." services/retorno packages/domain/src/returns --include="*.ts" | grep -v sgp-lifted`
  returns nothing.
- Reconciliation surface is documented and reachable.
- `npm run test:integration` (B4) extended to include a return path:
  signed-and-sent message arrives back as a return, transitions to
  `accepted`, totalizer ingested.

## Verification

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
```

Report: regulatory-code mapping coverage (rows in
`response_classification`), totalizer variants exercised (5/5 expected),
the chosen reconciliation surface (API vs. SQL), and any unknown
regulatory codes encountered during fixture testing.
