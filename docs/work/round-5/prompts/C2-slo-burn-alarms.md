# C2 — SLO Definitions + Burn-Rate Alarms

> **Wave C.** SRE. Parallel with C1, A, B, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 10.
- Round-3 prompt `B6-autoscaling-and-slo.md` (the design lives there).
- A3 load-test results (sizing).
- Round-3 metrics dictionary in `docs/operations.md`.

## Tasks

1. **SLO definitions** in `docs/operations.md`:
   - **Availability**: 99.9 % monthly (≤ 43 min downtime).
   - **Freshness**: p95 status update emitted within 60 s of
     envelope ingress (excluding regulatory wait).
   - **End-to-end latency**: p99 ≤ 1500 ms (per round-3 budget).
   - **Error rate**: < 0.5 % rejected at validation; < 0.1 %
     unexpected internal.
2. **Burn-rate alarms** (CloudWatch + SNS):
   - **Fast-burn** (2 %/h sustained): page.
   - **Slow-burn** (10 %/24h): ticket.
   - Multi-window multi-burn-rate (Google SRE workbook pattern).
3. **SLO dashboards** as code in `infra/cdk/src/slo.ts`:
   - One panel per SLO.
   - Error-budget remaining gauge.
   - Burn-rate trend.
4. **Lambda autoscaling tuning** derived from A3 capacity model:
   - Reserved concurrency per service.
   - Provisioned concurrency for `submission` + `retorno` during
     peak windows; CDK scheduled scaling.
   - SQS `BatchSize`, `MaximumBatchingWindowInSeconds`,
     `MaximumConcurrency` tuned.
5. **RDS sizing** right-sized per A3.

## Primary write scope

- `infra/cdk/src/slo.ts` (new)
- `infra/cdk/src/{compute,database,messaging}-stack.ts` tuning
- `docs/operations.md` — SLO + burn-alarm runbook
- `scripts/assert-slo-alarms.mjs`
- `docs/release/1.2.0/slo/`

## Do not touch

- Application code semantics.
- Other waves' resources beyond tuning.

## Exit criteria

- Per-service concurrency, SQS settings, RDS sizing finalized.
- SLOs documented; burn alarms wired.
- Dashboard panel for each SLO.
- One demo burn-alarm fires under a deliberate regression and
  resolves on rollback.

## Verification

```text
npm run cdk:synth
node scripts/assert-slo-alarms.mjs
```

Report: per-service capacity numbers, SLO targets, burn thresholds,
demo alarm result.
