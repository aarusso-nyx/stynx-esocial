# B3 — Disaster Recovery: Backup, Restore, Drill

> **Wave B.** Infra / SRE worker. Parallel with B1, B2, B4–B6.

## Read first

- [`../plan.md`](../plan.md) — closure item 7.
- B5 multi-region (coordinated drill).
- Round-0 prompt C3 (real CDK).

## Tasks

1. **Backup policy**:
   - RDS automated snapshots, retention 35 days. Cross-region copy of
     daily snapshot to a DR region.
   - PITR enabled with 5-minute granularity (RPO ≤ 5 min).
   - Audit log Merkle anchors (C7) replicated to DR region.
   - Secrets Manager replication to DR region for `tenant_certificate`
     refs (no certs are in DB).
2. **Restore drill** (CI / quarterly):
   - Spin up an isolated stack from the latest snapshot.
   - Validate RLS, idempotency, append-only triggers via the existing
     test suite against the restored DB.
   - Time-to-restore target: ≤ 1 hour wall-clock (RTO).
   - Drill runs quarterly; logs land in `docs/release/1.0.0/dr/`.
3. **Runbook** in `docs/operations.md`:
   - Failure scenarios: RDS impaired, region down, accidental delete,
     ransomware, audit-log tampering detected (C7), pod-kill.
   - Per-scenario recovery procedure with explicit commands.
   - Communication plan + status-page hook.
4. **Tabletop exercise** template + the first run logged.
5. **Tampering recovery**: integration with C7 — if Merkle
   verification fails, restore from a known-good anchor.

## Primary write scope

- `infra/cdk/src/disaster-recovery-stack.ts`
- `scripts/dr-drill.mjs`
- `docs/operations.md` — DR runbook
- `docs/release/1.0.0/dr/`
- `.github/workflows/dr-drill.yml` (quarterly cron)

## Do not touch

- Production resources — drills run in dedicated DR stack.

## Exit criteria

- RTO ≤ 1 h, RPO ≤ 5 min documented and proven.
- Quarterly drill cron green.
- Runbook references real commands.

## Verification

```text
node scripts/dr-drill.mjs --stage restricted-production
```

Report: measured RTO/RPO, drill date, scenarios exercised, and any
gaps surfaced (e.g., secrets that didn't replicate).
