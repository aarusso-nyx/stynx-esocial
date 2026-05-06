# B3 — SOC 2 Evidence Pack

> **Wave B.** Compliance. Blocked by B1. Parallel with B2, B4, B5.

## Read first

- [`../plan.md`](../plan.md) — closure item 6.
- Round-3 prompt `C3-soc2-evidence.md` (the design lives there).
- B1 threat model.

## Tasks

1. **Control matrix** at `docs/compliance/soc2-control-matrix.md`
   mapping each TSC criterion (Security, Availability,
   Confidentiality) to:
   - The implementing CDK construct / migration / code path.
   - The test that verifies it (round-1 / round-3 / round-5 paths).
   - The evidence file under `docs/release/1.2.0/soc2/`.
2. **Evidence collection automation**:
   - CloudTrail → 365-day retention bucket (Object Lock).
   - GitHub PR review records via Octokit.
   - Vulnerability management (R4 D2 SBOM + CVE).
   - Incident response (PagerDuty / SNS log — placeholder until
     R7 wires real on-call).
   - DR drill log placeholder (R6 ships the drill).
   - Pen-test report placeholder (R6 ships).
3. **Quarterly evidence run** via `scripts/soc2-evidence.mjs` that
   collects the artifacts into a versioned snapshot under
   `docs/release/1.2.0/soc2/<quarter>/`.
4. **Auditor handoff template** — one-page index pointing to every
   control's evidence.

## Primary write scope

- `docs/compliance/soc2-control-matrix.md`
- `scripts/soc2-evidence.mjs`
- `docs/release/1.2.0/soc2/`
- `docs/operations.md` — SOC 2 evidence cadence

## Do not touch

- Application code (this is documentation + collection).

## Exit criteria

- Control matrix complete for Security / Availability /
  Confidentiality.
- Quarterly evidence script runs cleanly.
- Auditor handoff template ready.
- DR + pen-test placeholders explicit, with R6 ownership noted.

## Verification

```text
node scripts/soc2-evidence.mjs --quarter 2026-Q3
ls docs/release/1.2.0/soc2/2026-Q3/
```

Report: criteria covered, evidence categories collected, R6 deferrals.
