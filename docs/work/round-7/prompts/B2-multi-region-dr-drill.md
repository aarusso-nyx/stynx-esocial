# B2 — Multi-Region Active-Passive Failover Drill

> **Wave B.** Infra / SRE. Blocked by A1. Parallel with B1, B3.

## Authorization required

- ☐ Multi-region budget for restricted-production allocated.
- ☐ DR drill owner named.
- ☐ Maintenance-window slot booked (≥ 4 h).

Record in `docs/release/1.3.0/authorizations/B2.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 4.
- Round-3 prompt `B5-multi-region.md` (the design lives there).
- Round-5 B5 anchor cross-region wiring (already provisioned).
- Round-3 B3 backup/restore plan.

## Tasks

1. **CDK multi-region stack** under `infra/cdk/src/multi-region-stack.ts`
   for restricted-production:
   - Primary region (sa-east-1).
   - DR region (us-east-1 or other; record decision in ADR).
   - RDS cross-region read replica.
   - Secrets Manager replication for `tenant_certificate` refs.
   - SQS / EventBridge: durable in primary; DR resources idle.
   - Audit-log Merkle anchors (R5 B5) cross-region replicated.
2. **`scripts/failover.mjs`** + **`scripts/failback.mjs`**:
   - Failover: promote DR replica; flip Route 53 weighted records;
     verify quiet period; smoke-test post-failover.
   - Failback: inverse, with drain window for in-flight messages.
3. **Failover drill** scheduled in the booked window:
   - Run `failover.mjs --stage restricted-production`.
   - Observe RTO (target ≤ 1 h) and RPO (target ≤ 5 min).
   - Run smoke per-category submission post-failover.
   - Run `failback.mjs --stage restricted-production`.
   - Confirm DLQ depth back to baseline.
4. **Evidence** at `docs/release/1.3.0/multi-region/`: timeline,
   measured RTO/RPO, smoke result, gaps surfaced.
5. **Runbook** in `docs/operations.md` — failover and failback
   procedures with explicit commands.

## Primary write scope

- `infra/cdk/src/multi-region-stack.ts`
- `scripts/failover.mjs`, `scripts/failback.mjs`
- `docs/operations.md` — failover/failback section
- `docs/release/1.3.0/multi-region/`
- ADR for DR region choice (R4 C2 owns template).

## Do not touch

- Production data — drills use synthetic tenants only.
- Other waves' resources.

## Exit criteria

- Active-passive topology deployed in restricted-production.
- One drill executed end-to-end with logged evidence.
- RTO ≤ 1 h, RPO ≤ 5 min observed.
- Failback verified.

## Verification

```text
node scripts/failover.mjs --dry-run --stage restricted-production
ls docs/release/1.3.0/multi-region/
```

Report: regions selected, drill date, observed RTO/RPO, gaps flagged.
