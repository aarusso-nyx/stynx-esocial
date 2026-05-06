# F1 — Drift Audit Cron

> **Wave F.** Quality worker. Parallel with F2; F3 last.

## Read first

- [`../plan.md`](../plan.md) — closure expectations.
- All round-3 closure items — F1 verifies they stay green.

## Tasks

1. **Quarterly drift-audit job** (`drift-audit.yml`):
   - Runs the round-1 + round-3 closure-verification scripts:
     completeness gate, coverage thresholds, mutation thresholds,
     IAM scope, SLO budgets, append-only test, redaction test,
     SBOM diff, SLA backlog, ADR coverage, doc reproducibility.
   - Posts a summary to GitHub Issues with the delta vs. last
     quarter.
   - Files tickets for any item that regressed.
2. **Spot-check script**:
   - `scripts/drift-audit.mjs` — local invocation that mirrors
     CI's checks.
   - Useful before a release.
3. **Per-PR slim drift check**:
   - On every PR, verify that no closure item moved backward
     (e.g., coverage threshold drop, ADR removed, runbook
     deletion).

## Primary write scope

- `scripts/drift-audit.mjs`
- `.github/workflows/drift-audit.yml`
- `docs/operations.md` — drift-audit cadence

## Do not touch

- Other waves' resources.

## Exit criteria

- Drift cron runs quarterly.
- Per-PR slim check live.
- One demonstrated drift detection (e.g., dropping a threshold and
  observing the failure, then restoring).

## Verification

```text
node scripts/drift-audit.mjs
gh workflow run drift-audit.yml
```

Report: checks covered, cadence, demo outcome.
