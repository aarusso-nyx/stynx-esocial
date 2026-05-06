# B4 — Cost Observability and Budgets

> **Wave B.** FinOps worker. Parallel with B1–B3, B5, B6.

## Read first

- [`../plan.md`](../plan.md) — closure item 14 (referenced).
- C7 audit log shape (cost-attribution links to event records).

## Tasks

1. **Cost-allocation tags** on every CDK resource: `tenant`,
   `stage`, `service`, `event-class-family`, `cost-center`. Verified
   by an extension to the IAM-scope script (round-1 Batch 0).
2. **Per-tenant cost attribution**:
   - Each event record persists the AWS resource-tag context.
   - A daily aggregation job (Lambda + Athena over CloudWatch
     metrics + Cost Explorer) writes per-tenant cost rows to
     `esocial.cost_attribution` (forward migration).
   - Tenants billed-by-event have a per-event-class breakdown.
3. **Cost dashboards** (CloudWatch + QuickSight or equivalent):
   - Spend by tenant, by event class, by stage.
   - Cost-per-message trend.
   - Anomaly alarms (SNS topic for FinOps).
4. **Budgets** (AWS Budgets):
   - Per-stage soft + hard budgets.
   - Alarm at 50/80/100/120 % of monthly forecast.
5. **Capacity-cost model** in `docs/operations.md` linking B2's
   capacity model to dollar figures.

## Primary write scope

- `infra/cdk/src/cost-observability-stack.ts`
- `infra/migrations/<next>-cost-attribution.sql`
- `services/cost-aggregator/` (new Lambda)
- `docs/operations.md` — cost runbook
- `docs/release/1.0.0/cost/`

## Do not touch

- Production data; tests use synthetic tenants.

## Exit criteria

- All resources tagged; assertion script verifies.
- Per-tenant cost rows visible in `esocial.cost_attribution` after
  one daily aggregation.
- Budget alarms wired (tested via budget threshold dry-run).

## Verification

```text
npm run cdk:synth
node scripts/assert-cdk-tags.mjs
psql … -c "select tenant, sum(cost_usd) from esocial.cost_attribution group by 1;"
```

Report: tags enforced, aggregator runtime, anomaly-alarm thresholds,
sample per-tenant cost row.
