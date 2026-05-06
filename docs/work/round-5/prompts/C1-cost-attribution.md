# C1 — Cost Attribution Schema + Observability

> **Wave C.** FinOps. Parallel with C2, A, B, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 9.
- Round-3 prompt `B4-cost-observability.md` (the design lives there).

## Tasks

1. **Cost-allocation tags** on every CDK resource:
   `tenant`, `stage`, `service`, `event-class-family`, `cost-center`.
   Verified by `scripts/assert-cdk-tags.mjs` (extends round-1 IAM
   script).
2. **Per-tenant cost attribution**:
   - Forward migration creates `esocial.cost_attribution`.
   - Each event record persists the tag context.
   - Daily aggregation Lambda (`services/cost-aggregator/`) reads
     CloudWatch metrics + Cost Explorer (LocalStack stub in CI) and
     writes per-tenant rows.
   - Tenants billed-by-event get a per-event-class breakdown.
3. **Cost dashboards** (CloudWatch + QuickSight or equivalent):
   - Spend by tenant, by event class, by stage.
   - Cost-per-message trend.
   - Anomaly alarms → SNS topic.
4. **Budgets** (AWS Budgets):
   - Per-stage soft + hard budgets.
   - Alarm at 50 / 80 / 100 / 120 % of monthly forecast.
5. **Capacity-cost model** in `docs/operations.md` linking A3 capacity
   model to dollar figures.

## Primary write scope

- `infra/cdk/src/cost-observability-stack.ts`
- `infra/migrations/<next>-cost-attribution.sql`
- `services/cost-aggregator/` (new Lambda)
- `scripts/assert-cdk-tags.mjs`
- `docs/operations.md` — cost runbook
- `docs/release/1.2.0/cost/`

## Do not touch

- Production data. Tests use synthetic tenants.
- Other waves' work.

## Exit criteria

- All resources tagged; assertion script verifies.
- Per-tenant cost rows visible in `esocial.cost_attribution` after
  one daily aggregation in LocalStack.
- Budget alarms wired (tested via dry-run).

## Verification

```text
npm run cdk:synth
node scripts/assert-cdk-tags.mjs
psql … -c "select tenant, sum(cost_usd) from esocial.cost_attribution group by 1;"
```

Report: tags enforced, aggregator runtime, anomaly thresholds.
