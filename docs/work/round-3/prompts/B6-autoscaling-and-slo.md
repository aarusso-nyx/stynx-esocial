# B6 — Autoscaling Tuning + SLOs / Error Budgets

> **Wave B.** SRE worker. Parallel with B1–B5. Consumes A5 + B2 outputs.

## Read first

- [`../plan.md`](../plan.md) — closure item 5 (perf) + general SRE.
- A5 baselines, B2 load results.

## Tasks

1. **Lambda autoscaling**:
   - Reserved concurrency per service, derived from B2 capacity model.
   - Provisioned concurrency for `submission` and `retorno` during
     peak windows (competence-close); CDK uses scheduled scaling.
   - SQS `BatchSize`, `MaximumBatchingWindowInSeconds`,
     `MaximumConcurrency` tuned per B2 results.
2. **RDS scaling**:
   - Right-size instance per B2 results.
   - Aurora-Postgres optional (decide in ADR; default RDS Postgres).
   - Read replicas for reconciliation views; reads use a separate URL.
3. **SLO definition** in `docs/operations.md`:
   - Availability: 99.9 % monthly (≤ 43 min downtime).
   - Freshness: p95 status update emitted within 60 s of envelope
     ingress (excluding regulatory wait).
   - End-to-end latency: per A5 budgets.
   - Error rate: < 0.5 % rejected at validation; < 0.1 % unexpected
     internal.
4. **Error-budget burn alarms** (CloudWatch + SNS):
   - Fast-burn (2 %/h sustained): page.
   - Slow-burn (10 %/24h): ticket.
5. **SLO dashboards** as code in `infra/cdk/src/dashboards.ts`
   extension; consumed by C2 observability prompts.

## Primary write scope

- `infra/cdk/src/{compute,database,messaging}-stack.ts` tuning
- `infra/cdk/src/slo.ts` (new alarm + dashboard helpers)
- `docs/operations.md` — SLO definitions + burn-alarm runbook

## Do not touch

- Application code semantics.
- Other waves' resources beyond tuning.

## Exit criteria

- Per-service concurrency, SQS settings, RDS sizing finalized in CDK.
- SLOs documented; burn alarms wired.
- Dashboard panel for each SLO.

## Verification

```text
npm run cdk:synth
node scripts/assert-slo-alarms.mjs
```

Report: per-service capacity numbers, SLO targets, burn-alarm
thresholds, and the runbook entries each alarm points at.
