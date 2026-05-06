# C3 — Cost Attribution Real-CUR Validation

> **Round-7 Batch C3.** Parallel with C2 after A1 lands.

## Authorization required

- ☐ Owner from [`../owners.md`](../owners.md) C3 row named (R5 C1
      / cost-aggregator author).
- ☐ Restricted-production AWS account deployed (Round 7 A1 lands).
- ☐ At least one **real CUR cycle** has completed (~24 h post-deploy
      + 1–2 days for cost-allocation-tag propagation; usually 3 days
      total minimum).
- ☐ AWS Cost Explorer + CUR S3 bucket read grants in place.
- ☐ A2 authorization record committed.

If any checkbox is unchecked, the prompt does not start. **Do not
synthesize CUR data.**

## Read first

- [`../plan.md`](../plan.md) — C3 closure-target row.
- R5 prompt `C1-cost-attribution.md`.
- `services/cost-aggregator/` (R5 C1 implementation).
- `esocial.cost_attribution` schema.

## Tasks

1. **Run `services/cost-aggregator/`** against the real CUR for the
   first complete cycle:
   - Daily aggregation Lambda triggered manually for the cycle's
     window.
   - Outputs land in `esocial.cost_attribution` per-tenant rows.
2. **Validate against real CUR** within ±5 % tolerance:
   - Pull the same window's CUR-derived totals (per
     cost-allocation-tag breakdown).
   - Compare per-tenant + per-event-class breakdowns.
   - For each row: `abs(local - cur) / cur ≤ 0.05`.
3. **Capture validation** at
   `docs/release/1.3.0/cost/cur-validation.md`:
   - Cycle window (start / end timestamps in UTC).
   - Account ID redacted to last 4 digits.
   - Per-tenant comparison table (synthetic tenants only).
   - Discrepancy summary.
   - Sign-off line with owner name + date.
4. **If discrepancies > 5 %**: file a finding rather than silently
   reconcile. Open a tracking issue with:
   - The exact row(s) over tolerance.
   - Hypotheses (tag propagation lag? aggregator bug? CUR
     latency?).
   - Named owner for the follow-up (default: C3 row owner).
   - **C3 still completes** (the validation ran; the finding is the
     deliverable). Re-run after fix is a separate PR.
5. **Update `blocked-artifacts.json`**: flip the C3 entry to
   `resolved` with `resolved_at` + validation-file path. **If a
   finding is open**: status remains `resolved-with-finding` and the
   issue URL is recorded.

## Primary write scope

- `docs/release/1.3.0/cost/cur-validation.md`
- `services/cost-aggregator/` (only if a tolerance fix is needed —
  separate PR; A3 itself is validation, not code change)
- `docs/release/1.0.0/blocked-artifacts.json` (one entry resolved)
- `docs/release/1.3.0/round-5-status.md`

## Do not touch

- Production data in any committed artifact.
- A2 / C2 (separate prompts).
- The cost-aggregator's logic — A3 validates; fixes are follow-up
  PRs.

## Exit criteria

- One real CUR cycle validated.
- Validation file committed with redacted account ID + per-tenant
  comparison.
- Tolerance result: pass (within ±5 %) or finding opened with named
  owner.
- `blocked-artifacts.json` reflects resolution (`resolved` or
  `resolved-with-finding`).

## Verification

```text
test -f docs/release/1.3.0/cost/cur-validation.md
jq '.[] | select(.area | test("C3")) | .status' docs/release/1.0.0/blocked-artifacts.json
# expect: "resolved" or "resolved-with-finding"
psql … -c "select tenant, sum(cost_usd) from esocial.cost_attribution where cycle_window = $1 group by 1;"
```

Report: cycle window validated, per-tenant tolerance results,
finding (if any) with issue URL + owner.
