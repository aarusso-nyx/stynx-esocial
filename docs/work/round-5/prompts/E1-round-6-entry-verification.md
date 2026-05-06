# E1 — Round-6 Entry Verification

> **Wave E (last).** Coordinator. Blocked by Waves A–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 13.
- `../round-6/plan.md`.
- `docs/release/1.0.0/blocked-artifacts.json` (R4 D3 enriched it
  with owner / target_round / target_date).

## Why this exists

R6 is gated by external authorizations and deployed infrastructure.
Some of those gates are met by R5 outputs (threat model from B1, SLOs
from C2, anchor cross-region prereq from B5). E1 verifies every R6
prerequisite is signed off **before** R6 starts; otherwise R6 stalls
mid-wave.

## Tasks

1. **Audit R6 prerequisites** per `../round-6/plan.md`:
   - Threat model committed and reviewed (B1).
   - LGPD DPIA signed by DPO (B2).
   - SLOs documented and dashboards live (C2).
   - Cost dashboards live (C1).
   - Audit Merkle anchor live + cross-region replication wiring
     stubbed (B5).
   - Reference site live (D1).
   - All 35/35 non-return classes ACTIVE_FULL (D2).
   - Coverage 95 %, mutation ≥ 80 %.
   - Chaos suite weekly green.
   - Load tests soak run green.
   - SBOM + vuln SLA enforcement live (R4 D2).
2. **Owner sign-off** captured in
   `docs/release/1.2.0/round-6-entry.md`:
   - Each owner identified in `blocked-artifacts.json` confirms
     readiness for R6 batches that depend on them.
3. **Gate**: R6 plan readiness checklist. If any prereq is open, the
   prompt fails and an issue is opened naming the open prereq +
   owner. R6 cannot start.
4. **Update `blocked-artifacts.json`** entries that are no longer
   blocked because R5 closed an upstream gate (e.g., threat-model
   prereq for pen-test).

## Primary write scope

- `docs/release/1.2.0/round-6-entry.md`
- `docs/release/1.0.0/blocked-artifacts.json` (status updates)
- `scripts/round-6-readiness.mjs`

## Do not touch

- R5 outputs (read-only here).
- R6 implementation.

## Exit criteria

- Every R6 prerequisite is recorded as PASS or BLOCKED with owner.
- If all PASS: R6 can start.
- If any BLOCKED: tracking issues opened; R5 close blocked until
  resolved.

## Verification

```text
node scripts/round-6-readiness.mjs
test -f docs/release/1.2.0/round-6-entry.md
```

Report: R6 prereqs PASS / BLOCKED count, owners contacted, R6
go/no-go.
