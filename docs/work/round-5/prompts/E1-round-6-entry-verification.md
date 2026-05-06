# E1 — Round-6 Entry Verification

> **Wave E (last).** Coordinator. Blocked by Waves A–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 13.
- `../round-6/plan.md`.
- `docs/release/1.0.0/blocked-artifacts.json` (R4 D3 enriched it
  with owner / target_round / target_date).

## Why this exists

Round 6 is the immediate/local closure round. E1 verifies the Round 5
evidence that Round 6 depends on and separates anything that still needs
external authorization into Round 7.

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
2. **Readiness record** captured in
   `docs/release/1.2.0/round-6-entry.md`:
   - Each Round 6 prerequisite is PASS / PARTIAL / BLOCKED.
   - External blockers are routed to `docs/work/round-7/plan.md`.
3. **Gate**: R6 plan readiness checklist. If any prereq is open, the
   prompt fails and an issue is opened naming the open prereq +
   owner. Round 6 can start only for the unblocked local-safe batches.
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

- Every Round 6 prerequisite is recorded as PASS / PARTIAL / BLOCKED.
- External blockers are explicitly routed to Round 7.
- If any local prerequisite is BLOCKED: tracking issues opened; R5 close
  blocked until resolved.

## Verification

```text
node scripts/round-6-readiness.mjs
test -f docs/release/1.2.0/round-6-entry.md
```

Report: R6 prereqs PASS / PARTIAL / BLOCKED count, external blockers
routed to Round 7, and Round 6 go/no-go.
