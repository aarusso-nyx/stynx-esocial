# D3 — `blocked-artifacts.json` Review

> **Wave D.** Release / governance. Parallel with D1, D2, A, B, C.

## Read first

- [`../plan.md`](../plan.md) — closure item 12.
- `docs/release/1.0.0/blocked-artifacts.json` — current 5 deferrals.

## Tasks

1. **Audit each blocker** in `blocked-artifacts.json`:
   - restricted-production
   - real certificates
   - official eSocial endpoint calls
   - DR and multi-region drills
   - SDK publish
2. **For each**: add fields:
   - `owner` — named individual or role.
   - `target_round` — `round-5`, `round-6`, `round-7`, or
     `unscheduled`.
   - `target_date` — ISO date.
   - `decision_required` — short string of the unblock condition.
3. **Round-routing**:
   - Items handled in round 5 (greenfield-internal) — none of the 5
     fit; round 5 is internal.
   - Items handled in round 6 (owner-blocked) — all 5 fit; route to
     `docs/work/round-6/`.
   - Items unscheduled — promote to round-7 charter (E1) with a
     dedicated batch.
4. **Lifecycle script** `scripts/blocked-artifacts-lint.mjs`:
   - Validates every entry has the required fields.
   - Fails CI if any entry is older than `target_date`.
   - Wired under `npm run lint`.
5. **Cross-reference** the routing in
   `docs/work/round-6/plan.md` and `docs/work/round-7/plan.md` (E1
   creates the latter).

## Primary write scope

- `docs/release/1.0.0/blocked-artifacts.json` (extend schema —
  forward-only; copy the file to
  `docs/release/1.1.0/blocked-artifacts.json` if treating as
  per-version)
- `scripts/blocked-artifacts-lint.mjs` (new)
- `package.json` `lint` (extend)
- `docs/work/round-6/plan.md` (cross-link; coordinate with R6 owner)
- `docs/release/1.1.0/governance/`

## Do not touch

- Round-0 / round-1 evidence under `docs/release/0.x/`.

## Exit criteria

- Every blocker has owner + target round + target date.
- Lifecycle script in CI; one stale-blocker demo passes.
- Routing reflected in round-6 plan.

## Verification

```text
node scripts/blocked-artifacts-lint.mjs
jq 'map(select(.owner == null))' docs/release/1.0.0/blocked-artifacts.json
# expect: []
```

Report: blockers with owners, blockers routed to R6 vs R7, stale demo
result.
