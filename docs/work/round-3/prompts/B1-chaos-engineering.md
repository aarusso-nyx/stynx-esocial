# B1 — Chaos Engineering Suite

> **Wave B.** Resilience worker. Parallel with B2–B6.

## Read first

- [`../plan.md`](../plan.md) — closure item 6.
- Round-0 prompt C1 (retry/DLQ) — runtime to chaos against.

## Tasks

1. **Chaos suite** at `tests/chaos/` with seeded random scenarios:
   - **Publisher transient failure**: random SQS publish throws on N %
     of attempts; system retries and reaches a clean state.
   - **DB transient error**: random `INSERT` throws (deadlock,
     conflict, network); idempotency lookup recovers.
   - **SOAP stub timeout**: random delays > circuit-breaker threshold;
     breaker opens, half-opens, closes; messages eventually deliver.
   - **Cert just expired race**: cert `not_after` falls between
     resolve-time and sign-time; pipeline transitions to
     `validation_failed` cleanly with category `signing`.
   - **RLS context missing**: worker code forgets to set
     `app.current_tenant_id`; query fails fast (no cross-tenant leak)
     and audit row appears.
   - **Clock skew**: simulated 5-minute clock drift; signed timestamps
     handled correctly.
   - **Partial-batch failures**: half of an SQS batch fails; correct
     `batchItemFailures` returned; survivors complete.
2. **Determinism**: every scenario pins a seed; on failure, the seed
   is logged for reproduction. Seeded `fast-check` for input
   generation.
3. **CI cadence**: weekly chaos job (`chaos.yml`) runs the full suite
   against ephemeral Postgres + LocalStack. Smoke subset runs per PR.
4. **Chaos in restricted-prod stage** (optional): document the
   procedure (B5 multi-region drill orchestrates it). Round-3 closure
   needs only the in-CI suite green.
5. **SLO verification**: under chaos, end-to-end p99 should still meet
   the perf budget from A5 (with a documented chaos-mode tolerance).

## Primary write scope

- `tests/chaos/**`
- `.github/workflows/chaos.yml`
- `docs/release/1.0.0/chaos/` (artifact target)
- `docs/operations.md` — chaos runbook entry

## Do not touch

- Production code (only insert fault-injection hooks if the existing
  surface doesn't expose them; coordinate with C7 / B6).

## Exit criteria

- Chaos suite covers the seven scenarios above.
- Weekly CI run green.
- SLO under chaos mode documented.
- Each scenario's result logged in `docs/release/1.0.0/chaos/`.

## Verification

```text
npm run test:chaos
gh workflow run chaos.yml
```

Report: scenarios covered, seed inventory, mean-time-to-recovery per
scenario, and any production-code hooks added.
