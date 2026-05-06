# C2 — SOC 2 External Evidence

> **Round-7 Batch C2.** Parallel with C3 after A1 lands.

## Authorization required

- ☐ Owner from [`../owners.md`](../owners.md) C2 row named (default:
      same owner as R5 B3 SOC 2 evidence pack where possible).
- ☐ AWS billing read grant on restricted-production account.
- ☐ AWS CloudTrail read grant on restricted-production account.
- ☐ AWS access-review (IAM policy snapshot + role-membership) read
      grant.
- ☐ A2 authorization record committed.

If any checkbox is unchecked, the prompt does not start.

## Read first

- [`../plan.md`](../plan.md) — C2 closure-target row.
- R5 prompt `B3-soc2-evidence.md`.
- `scripts/soc2-evidence.mjs` (R5 author extends this script).
- `docs/compliance/soc2-control-matrix.md`.

## Tasks

1. **Extend `scripts/soc2-evidence.mjs`** to pull from the deployed
   restricted-production AWS account:
   - **CloudTrail**: management-event log sample for a 365-day window
     (or available retention if shorter); store under
     `docs/release/1.3.0/soc2/<quarter>/external/cloudtrail/`.
   - **GitHub PR-review export**: pull change-management history via
     Octokit for the same window; store under
     `.../github-pr-reviews/`.
   - **Access-review export**: IAM policy snapshots + role-membership
     CSV; store under `.../access-review/`.
2. **Redact** before commit:
   - Account IDs masked to last 4 digits.
   - Real CNPJs replaced with synthetic-tenant placeholders.
   - Real CPFs blocked entirely (none should appear in
     management-event logs; assert).
   - Secret ARN suffixes truncated.
3. **Owner sign-off** — owner from C2 row commits a signed
   `evidence-signoff.md` at the root of
   `docs/release/1.3.0/soc2/<quarter>/external/` listing every
   evidence file with `sha256` and a one-line attestation.
4. **Un-redacted retention**: full evidence retained in the
   audit-anchor account only; **no commit of un-redacted data**.
5. **Update `blocked-artifacts.json`**: flip the C2 entry to
   `resolved` with `resolved_at` + the evidence-folder path.
6. **Update `docs/compliance/soc2-control-matrix.md`** rows that
   were "external evidence pending" → "evidence attached" with the
   path.

## Primary write scope

- `scripts/soc2-evidence.mjs` (extension only)
- `docs/release/1.3.0/soc2/<quarter>/external/`
- `docs/compliance/soc2-control-matrix.md` (status flip)
- `docs/release/1.0.0/blocked-artifacts.json` (one entry resolved)
- `docs/release/1.3.0/round-5-status.md`

## Do not touch

- Production data in any committed artifact.
- A2 / C3 (separate prompts).
- R5 B3 local evidence (read-only here; C2 extends, doesn't replace).

## Exit criteria

- All 3 external evidence categories pulled and committed (redacted).
- Owner sign-off file present.
- `blocked-artifacts.json` reflects resolution.
- SOC 2 control matrix rows updated.
- `npm run` extension passes; full evidence regeneration is
  reproducible from the same commit.

## Verification

```text
node scripts/soc2-evidence.mjs --quarter 2026-Q4 --external
ls docs/release/1.3.0/soc2/2026-Q4/external/
test -f docs/release/1.3.0/soc2/2026-Q4/external/evidence-signoff.md
jq '.[] | select(.area | test("C2")) | .status' docs/release/1.0.0/blocked-artifacts.json
# expect: "resolved"
grep -RE "[0-9]{12}" docs/release/1.3.0/soc2/2026-Q4/external/ | head
# expect: only redacted forms (XXXX-XXXX-NNNN)
```

Report: evidence categories, redaction policy applied, owner
sign-off, control-matrix rows resolved.
