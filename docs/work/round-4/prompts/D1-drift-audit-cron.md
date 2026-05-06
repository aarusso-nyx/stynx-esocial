# D1 — Drift Audit Cron

> **Wave D.** Quality / CI. Parallel with D2, D3, A, B, C.

## Read first

- [`../plan.md`](../plan.md) — closure item 10.
- Round-3 prompt `F1-drift-audit-cron.md` (the design lives there).

## Tasks

1. **`scripts/drift-audit.mjs`** runs the union of round-1 + round-3
   closure-verification scripts:
   - completeness gate (`tests/round1-completeness.test.ts`)
   - coverage threshold (now 95 % per A1)
   - mutation thresholds (R5 will add; tolerated absent in R4)
   - IAM scope (`assert-cdk-iam-scoped.mjs`)
   - SLO budgets (R5 will add)
   - append-only test
   - redaction test
   - SBOM diff (D2)
   - SLA backlog
   - ADR coverage (C2)
   - doc reproducibility
   Exits non-zero on any regression.
2. **`drift-audit.yml`** workflow:
   - Quarterly schedule (cron `0 0 1 */3 *`).
   - On run, posts a summary to GitHub Issues with delta vs last
     quarter.
   - Files tickets for items that regressed.
3. **Per-PR slim drift check** in `ci.yml`:
   - Verifies no closure item moved backward in the diff (e.g.,
     coverage threshold drop, ADR removed, runbook deletion).
4. **Demo**: deliberately drop the coverage threshold or delete an
   ADR in a feature branch; confirm the slim check fails; restore.

## Primary write scope

- `scripts/drift-audit.mjs`
- `.github/workflows/drift-audit.yml`
- `.github/workflows/ci.yml` (slim check step)
- `docs/operations.md` — drift cadence section

## Do not touch

- Other waves' work.

## Exit criteria

- Quarterly cron live.
- Per-PR slim check live.
- Demo regression caught.

## Verification

```text
node scripts/drift-audit.mjs
gh workflow run drift-audit.yml
```

Report: checks covered, demo result.
