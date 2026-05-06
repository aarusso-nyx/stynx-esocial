# A2 — Chaos Suite Expanded

> **Wave A.** Resilience. Parallel with A1, A3, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 2.
- Round-3 prompt `B1-chaos-engineering.md` (the design lives there).
- Existing `tests/chaos/local-chaos.test.mjs`.

## Tasks

1. **Expand `tests/chaos/`** to 7 named scenarios with seeded random
   inputs (`fast-check` for input generation, deterministic seeds):
   - **Publisher transient failure**: SQS publish throws on N % of
     attempts; system retries; clean state reached.
   - **DB transient error**: random `INSERT` throws; idempotency
     lookup recovers.
   - **SOAP stub timeout**: random delays > circuit threshold;
     breaker opens, half-opens, closes; messages eventually deliver.
   - **Cert just-expired race**: cert `not_after` falls between
     resolve-time and sign-time; pipeline transitions to
     `validation_failed` cleanly with category `signing`.
   - **RLS context missing**: worker forgets `app.current_tenant_id`;
     query fails fast (no leak); audit row appears.
   - **Clock skew**: 5-minute simulated drift; signed timestamps
     handled correctly.
   - **Partial-batch failures**: half of an SQS batch fails; correct
     `batchItemFailures` returned; survivors complete.
2. **Determinism**: pin seeds; on failure, log seed for reproduction.
3. **CI cadence**:
   - `chaos.yml` weekly with full suite.
   - Smoke subset per PR.
   - Runs against ephemeral Postgres + LocalStack.
4. **SLO under chaos**: end-to-end p99 still meets perf budget with a
   documented chaos-mode tolerance.
5. **Evidence**: per-scenario log + seed inventory →
   `docs/release/1.2.0/chaos/`.

## Primary write scope

- `tests/chaos/**`
- `.github/workflows/chaos.yml`
- `docs/release/1.2.0/chaos/`
- `docs/operations.md` — chaos runbook

## Do not touch

- Production code (only insert fault-injection hooks if absent;
  coordinate with B5 / C2).

## Exit criteria

- All 7 scenarios green; seeds logged.
- Weekly CI run passes.
- SLO under chaos documented.

## Verification

```text
npm run test:chaos
gh workflow run chaos.yml
```

Report: scenarios covered, MTTR per scenario, hooks added.
