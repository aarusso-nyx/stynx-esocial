# B1 — Submission Handler Real Runtime

> **Wave B, step 1.** Submission worker. Blocked by A2, A3, A4. Blocks C1, C2, C3.

## Read first

- [`../plan.md`](../plan.md) — round-0 closure target items 4, 6, 7.
- [`../assessment.md`](../assessment.md) — Submission asymmetry,
  XML-build-not-wired.
- [`../decisions.md`](../decisions.md) — eSocial owns XML build, sign,
  SOAP submit. SGP sends DTOs.
- A3's frozen contracts under `packages/contracts/`.
- A4's autonomous schema and `tests/db/`.

## Why this exists

The active processor accepts a *pre-signed envelope* and emits a synthetic
`accepted` response. This is incompatible with the resolved architecture
(eSocial owns XML build → sign → submit). B1 rewrites the processor to
take a typed DTO, persist with idempotency, and dispatch into the real
pipeline (XML build via B2, sign via B3, SOAP via B4, return via B5). For
the round-0 families, the dispatch surface is wired to placeholder
"BUILDING" stops until B2/B3/B4 land; the round closure depends on all of
B1–B5 going green together.

## Tasks

1. **Replace the simulator.** Delete the synthetic accepted-response code
   in `packages/domain/src/submission/submission-processor.ts` and the
   simulator helpers it calls. The processor is rewritten around the DTO
   ingress contract from A3.
2. **Ingress validation.** Use the A3 JSON Schema to parse
   `event.Records[].body`. Failure → DLQ publish + audit event +
   `validation_failed` persist (no batch-item-failure for schema errors).
3. **Idempotency lookup.** Build the idempotency key per A3. `INSERT …
   ON CONFLICT DO NOTHING RETURNING id` against the unique index from A4.
   On conflict, look up and re-emit the prior outcome.
4. **Persist as `building`.** New events land at status `building` with
   the DTO stored as jsonb. Status history row written.
5. **Routing surface.** `dispatchByEventClass(dto, ctx)` — a single
   dispatcher table keyed on `event_class`. Each entry calls into the
   builder/signer/submitter (placeholders behind B2/B3/B4 until they
   land). Adding a family is a single-line entry.
6. **Real publishers.** Replace any in-process simulator with explicit
   publisher interfaces:
   - `ResponsePublisher` → submit response queue (SQS FIFO).
   - `SpoolPublisher` → spool topic.
   - `AuditPublisher` → EventBridge audit bus.
   - `RetryPublisher` → retry queue.
   - `DlqPublisher` → DLQ queue.
   Each interface has a real AWS-SDK implementation and an in-memory
   test double for unit tests.
7. **FIFO attributes.** Outbound FIFO publishes carry:
   - `MessageGroupId = ${tenant_id}:${event_class}` (document this in
     `docs/architecture.md` under "FIFO grouping").
   - `MessageDeduplicationId = idempotency_key + outbound_event_id`.
   - `correlationId` propagated end-to-end via SQS message attribute and
     Pino log fields.
8. **Lambda batch-item failures.** The handler returns
   `{ batchItemFailures: [{ itemIdentifier }] }` for items that should
   redrive (transient transport failure). It does not return failures
   for malformed-or-rejected items — those go to DLQ.
9. **Tests.** Under `services/submission/__tests__/` and
   `packages/domain/src/submission/__tests__/`:
   - **Accepted-shape DTO** → persisted as `building`, spool update
     emitted with `building` status (NOT a synthetic `accepted`).
   - **Duplicate envelope** → idempotency hit; same outcome re-emitted;
     no second insert.
   - **Malformed JSON** → DLQ publish; no DB row.
   - **Wrong envelope version** → DLQ publish; no DB row.
   - **Validation failure** (DTO fails JSON Schema) → persisted as
     `validation_failed`; audit event published; spool published with
     status `validation_failed`.
   - **Transient publisher failure** (mock throws) → record listed in
     `batchItemFailures`.
   - **Terminal failure** (non-retryable error category) → DLQ publish;
     not in `batchItemFailures`.

## Primary write scope

- `services/submission/src/**`
- `services/shared/src/**` (handler-result shared types)
- `packages/domain/src/submission/**`
- `packages/domain/src/transport/**` (publisher interfaces + AWS impls)
- New tests under `services/submission/__tests__/` and
  `packages/domain/src/submission/__tests__/`

## Do not touch

- `packages/contracts/**` — A3 owns it. If a field is missing, raise it as
  an A3 follow-up.
- `infra/migrations/**` — A4 owns it. New columns are forward migrations
  through A4 ownership.
- Builders / signing / SOAP / returns — B2/B3/B4/B5 own them. B1 calls into
  placeholders that B2–B4 fill in.
- `infra/cdk/**` — C3 owns it.

## Exit criteria

- `services/submission` compiles, lints, tests green.
- All seven test paths above pass.
- No `accepted` status is ever emitted from B1's code path (only B4 + B5
  produce `accepted` after a real SOAP round trip + return parse).
- The simulator file is gone or contains only re-exports of the real
  processor.
- `grep -R "public\\.esocial_event\\|hr\\.\\|payroll\\.\\|saude\\." services packages/domain/src --include="*.ts" | grep -v sgp-lifted`
  returns no hits.
- The handler returns `{ batchItemFailures }` per the AWS contract.

## Verification

```text
npm run build
npm run lint
npm test --workspaces=services/submission --workspaces=packages/domain
npm run test:db
```

Report: number of test cases, the routing-surface design (one paragraph),
and any contract gaps surfaced for A3 follow-up.
