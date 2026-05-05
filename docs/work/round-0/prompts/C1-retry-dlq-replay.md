# C1 — Retry, DLQ, Replay

> **Wave C, step 1.** Submission/Returns workers. Blocked by B1 + B4 + B5.

## Read first

- [`../../plan.md`](../../plan.md) — Phase 8.
- A4's `event_retry_schedule`, `endpoint_circuit_state`, `dlq_item`.
- B4's transport interface and the typed errors it raises.

## Why this exists

The schema and publishers exist for retry/DLQ/replay; nothing actually
runs them. Without runners, a `retry` row sits forever and a `dlq` event
has no operator surface. C1 wires the runners and gives operators the
replay path.

## Tasks

1. **Retry classifier.** A pure function `classify(error) -> { category,
   retryable, budget }` covering:
   - Transport errors (5xx/timeout) → retryable, budget 5.
   - Validation / schema → not retryable, budget 0.
   - Regulatory rejection → not retryable, budget 0 (DLQ).
   - Authentication / certificate expiry → retryable once, budget 1
     (operator may rotate).
   - Internal → not retryable, budget 0 (DLQ).
2. **Retry scheduler.**
   - On retryable failure, write `event_retry_schedule` row with
     `next_attempt_at = now() + backoff(attempt)` (exponential with
     jitter) and `budget_remaining = budget - attempt`.
   - A poller (Lambda triggered on schedule, or a separate handler;
     pick one and document) selects rows where `next_attempt_at <= now()`
     and re-publishes the original request with `attempt + 1`.
   - On budget exhaustion → DLQ.
3. **Circuit breaker.** Per (environment, endpoint):
   - `closed`: normal operation; resets failure count on success.
   - `open`: pass-through to "deferred" — message returned to retry
     queue with elongated backoff; do not count attempts.
   - `half_open`: probe one message; success → close, failure → re-open.
   - State persisted in `endpoint_circuit_state`. Transitions append to
     `audit_event_log`.
4. **DLQ classification + persistence.** When a message goes to DLQ:
   - Insert `dlq_item` row with original envelope, classification,
     attempt history, hashes, and a replay hint.
   - Publish DLQ event for downstream observability (C2 dashboards).
5. **Operator replay.**
   - HTTP gateway endpoint (`POST /dlq/:id/replay`) protected by IAM
     SigV4 (round 0; round 1 may add OIDC).
   - On replay: append `audit_event_log` row (kind: `dlq.replay`),
     re-publish onto the request queue with a fresh `correlationId` and
     a new attempt counter, mark `dlq_item.resolved_at = now()`.
   - Refuse replay if the original idempotency key would clash with a
     since-completed run unless `?force=true`.
6. **Append-only enforcement** verified end-to-end:
   - A test asserts `UPDATE event_status_history`/`audit_event_log`
     under the worker role fails (extends A4 tests).
7. **Fault-injection tests.**
   - Transient transport failure (B4 stub mode) → retry path observed,
     eventual success transitions to `sent`.
   - Persistent transport failure → DLQ after budget.
   - Circuit breaker opens after N consecutive failures; subsequent
     messages are deferred not retried.
   - Replay round-trip → second submission accepted; idempotency key
     evolution documented in test assertions.

## Primary write scope

- `services/submission/src/retry/**`
- `services/retorno/src/retry/**` (only if returns also retry)
- `services/http-gateway/src/dlq/**` (replay endpoint)
- `packages/domain/src/operations/retry.ts`,
  `circuit-breaker.ts` (if these stubs already exist, fill them; else
  create)
- `tests/integration/retry/**`

## Do not touch

- Contracts (A3) — coordinate any envelope additions through A3.
- Migrations (A4) — forward migrations only via A4.
- Builders / signing / transport — B2/B3/B4 own them. C1 wraps them.
- Observability — C2 owns logging/metrics. C1 emits events with the
  fields C2 will consume but does not pick a logger.

## Exit criteria

- All four fault-injection tests pass.
- Replay endpoint is reachable in `npm run test:integration` and
  guarded against accidental clobber by idempotency-key clash detection.
- Circuit breaker has at least one open/half-open/close transition
  test.
- DLQ has a queryable surface (`dlq_item` rows + reconciliation view).
- No infinite-retry path exists (proven by budget exhaustion test).

## Verification

```text
npm run build
npm run test:integration
```

Report: per-classification budgets, backoff function, average end-to-end
latency under transient failure (3 retries), and the replay clash-rule
behavior.
