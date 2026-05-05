# 04 — Implement the Active MQ Handler

> **Phase 4 of [`../plan.md`](../plan.md).** Wave 1, runs after Phases 1–3
> have landed. Closes the first wave. Owns the `Submission worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — "Active domain package: Partial. …
  `submission-processor.ts` produces a simulated accepted response and
  spool update for submit envelopes."
- [`../diag.md`](../diag.md) — "Current Runtime Path" describes what the
  handler does and does not do today. Almost nothing real.
- [`../plan.md`](../plan.md) — Phase 4 task list and exit criteria.
- [`../../consumers.md`](../../consumers.md) — the consumer-facing message
  shapes and status outputs.
- The Phase-2 contracts under `packages/contracts/src/` and the Phase-3
  schema under `infra/migrations/`. **Both must be locked before this phase
  runs.**

Today, `services/submission/src/handler.ts` reads `event.Records`, parses
JSON, and returns a synthetic accepted response. There is no validation,
no idempotency, no DB write, no publish, no XML, no SOAP. That is the gap
this phase closes for the **handler shell** — XML, signing, SOAP, and
return parsing remain Phase 5–7.

## Operating principles

- The handler must be deterministic and idempotent: the same message
  delivered N times must produce one persisted regulatory submission.
- Validate envelopes at ingress against the Phase-2 contracts. Reject
  malformed or unknown-version messages explicitly.
- No fake protocol/receipt success may be emitted. Until Phase 6 wires
  real signing/SOAP, the handler must persist and emit only states that
  the data actually justifies (`pending`, `building`, `validation_failed`).
  Do not emit `accepted` from a stubbed path.
- No direct SGP schema reads or writes (`hr.*`, `payroll.*`, `saude.*`,
  `public.esocial_event`). SGP source references stay opaque ids in
  payloads.
- Partial batch failure semantics: return `batchItemFailures` for SQS so
  in-batch survivors do not redeliver.

## Tasks

1. **Validate envelopes at ingress.** Use the Phase-2 contracts to parse
   `event.Records[].body`. On schema failure, classify as malformed:
   persist a minimal trace, publish to DLQ topic, and report the record
   in `batchItemFailures` only if redrive could help (it cannot for
   schema failures — drop to DLQ instead).
2. **Persist incoming messages and idempotency outcomes** in `esocial`.
   The idempotency-key uniqueness constraint from Phase 3 is the source
   of truth. On conflict, look up the prior outcome and re-emit it
   instead of reprocessing.
3. **Route by kind and event class** to the correct domain pipeline. For
   this phase, the pipeline is allowed to stop at "validated and
   persisted as `building`" while Phases 5–7 wire actual XML/sign/SOAP/
   return. Define the routing surface so adding builders later is a
   single-file change per family.
4. **Publish via explicit publisher interfaces**: response, spool update,
   audit event, retry event, DLQ event. Wire real SQS/EventBridge
   publishers behind the interfaces. Provide an in-memory test double for
   unit tests.
5. **Real SQS FIFO attributes** on outbound publishes: `MessageGroupId`
   (per tenant + event class, document the choice), `MessageDeduplicationId`
   (derived from idempotency key + outbound event id), `correlationId`
   propagated end-to-end.
6. **Lambda batch item failures.** The active handler must return
   `{ batchItemFailures: [...] }` where applicable, so SQS does not retry
   the whole batch on partial failures.
7. **Consolidate the simulator.** Delete or fence
   `packages/domain/src/submission/submission-processor.ts`'s synthetic
   accepted response. The processor must now take a typed envelope, look
   up idempotency, persist, route, and return a real result. Do not keep
   the synthetic path as a fallback.
8. **Tests.** Under `tests/integration/` (or equivalent), unit-test the
   handler against an in-memory publisher and a real (ephemeral) database
   (the same one Phase 3 wires). Cover:
   - Accepted-shape envelope → persisted as `building`, published spool
     update, no synthetic protocol/receipt.
   - Duplicate envelope → looked up, no second insert, idempotent re-emit.
   - Malformed JSON / wrong version → DLQ publish, no DB row.
   - Validation failure (Phase-2 contract reject) → persisted as
     `validation_failed`, audit event published, no spool update with a
     positive status.
   - Retry-classified transport failure (mock the publisher to throw) →
     `batchItemFailures` includes the record.
   - DLQ-classified terminal failure → DLQ publish, no batch item failure.

## Primary write scope

- `services/submission/src/`
- `services/shared/src/` (handler-result helpers)
- `packages/domain/src/submission/`
- Queue transport adapters (new files under `packages/domain/src/transport/`
  or similar — pick a location and document it)
- Contract tests for the handler under `tests/integration/` or
  `tests/handler/` (new)

## Do not touch

- `packages/contracts/src/` — Phase 2 owns the envelopes. If you need a
  field that does not exist, raise it as a Phase-2 follow-up rather than
  editing here.
- `infra/migrations/` — Phase 3 owns the schema. If you need a new column,
  request a forward migration through Phase-3 ownership.
- Builders under `packages/domain/src/sgp-lifted/` — Phase 5 owns
  promotion. The handler must call a placeholder routing surface for now,
  not the lifted code.
- Signing / SOAP — Phase 6 owns it.

## Exit criteria

- Unit tests cover the seven paths above (accepted-shape, duplicate,
  malformed, version-reject, validation-failure, retry, DLQ).
- No fake protocol/receipt success is emitted without real submission or
  sandbox fixture response.
- Handler behavior is deterministic and idempotent — proven by the
  duplicate test.
- The synthetic processor in `packages/domain/src/submission/` is gone or
  has been replaced by the real processor.
- No active production code path writes `public.esocial_event`.
- `services/submission` returns `{ batchItemFailures }` per AWS contract.

## Verification commands

```text
npm run build
npm run lint
npm test
npm run test:db        # database constraints still hold
npm run coverage       # coverage on the active processor + handler
grep -R "public\\.esocial_event" services packages   # no active hits
```

Report: paths covered by tests, any contract gaps you uncovered (route to
Phase 2), and the routing surface design (one paragraph).
