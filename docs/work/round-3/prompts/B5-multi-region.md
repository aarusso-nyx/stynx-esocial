# B5 — Multi-Region Readiness

> **Wave B.** Infra worker. Parallel with B1–B4, B6. Coordinates with B3.

## Read first

- [`../plan.md`](../plan.md) — closure item 7.
- B3 backup/restore (RPO/RTO).
- Round-0 prompt C3 (CDK stacks).

## Tasks

1. **Topology decision** (active-passive recommended for round 3):
   - Primary region: sa-east-1 (or the production region).
   - DR region: us-east-1 (or another sa-* if compliance allows).
   - Document in an ADR (E1).
2. **Replication wiring**:
   - RDS cross-region read replica with automated promotion script.
   - Secrets Manager replication for `tenant_certificate` refs.
   - SQS / EventBridge: messages durable in primary; on failover,
     DR-region resources take over (DNS-flip pattern).
   - Audit-log Merkle anchors (C7) replicated.
3. **Failover procedure** (`scripts/failover.mjs`):
   - Promote DR replica to primary.
   - Update Route 53 weighted records.
   - Verify quiet period (no in-flight messages stranded).
   - Smoke-test restricted-production endpoint post-failover.
4. **Failover drill** (quarterly), logged to
   `docs/release/1.0.0/multi-region/`. Runs against
   restricted-production stage with owner approval.
5. **Failback**: documented procedure with the inverse of the
   failover steps; requires a window where in-flight messages can
   drain.

## Primary write scope

- `infra/cdk/src/multi-region-stack.ts`
- `scripts/failover.mjs`, `scripts/failback.mjs`
- `docs/operations.md` — failover/failback runbook
- ADR draft (E1 finalizes)

## Do not touch

- Production data. Drills use restricted-production with synthetic
  tenants.

## Exit criteria

- Active-passive topology deployed in restricted-production.
- One drill executed end-to-end with logged evidence.
- RTO observed ≤ 1 h. RPO observed ≤ 5 min.

## Verification

```text
node scripts/failover.mjs --dry-run --stage restricted-production
```

Report: regions selected, drill date, RTO/RPO observed, post-failover
smoke-test result, gaps flagged.
