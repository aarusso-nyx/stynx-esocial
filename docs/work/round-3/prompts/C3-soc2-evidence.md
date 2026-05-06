# C3 — SOC 2-Shaped Audit Evidence Pack

> **Wave C.** Compliance worker. Blocked by C1. Parallel with C2, C4–C7.

## Read first

- [`../plan.md`](../plan.md) — closure item 8.
- C1 threat model.
- SOC 2 TSC (Trust Services Criteria): Security, Availability,
  Confidentiality (round-3 scope; Processing Integrity + Privacy
  optional).

## Tasks

1. **Control matrix** at `docs/compliance/soc2-control-matrix.md`
   mapping each TSC criterion to:
   - The implementing CDK construct / migration / code path.
   - The test that verifies it (round-1 / round-3 test paths).
   - The evidence file under `docs/release/1.0.0/soc2/`.
2. **Evidence collection** automated where possible:
   - Access logs (CloudTrail) → stored 365 days, immutable bucket.
   - Change management (PR + review records via GitHub API).
   - Vulnerability management (C6 SBOM + CVE scan results).
   - Incident response (PagerDuty / SNS log).
   - DR drill log (B3) included.
   - Pen test report (C1) included.
3. **Quarterly evidence run**: a script
   `scripts/soc2-evidence.mjs` collects the artifacts into a
   versioned snapshot under
   `docs/release/1.0.0/soc2/<quarter>/`.
4. **Auditor handoff** template: a one-page index pointing to every
   control's evidence.

## Primary write scope

- `docs/compliance/soc2-control-matrix.md`
- `scripts/soc2-evidence.mjs`
- `docs/release/1.0.0/soc2/`
- `docs/operations.md` — SOC 2 evidence cadence

## Do not touch

- Application code — this is documentation + collection.

## Exit criteria

- Control matrix complete for Security, Availability, Confidentiality.
- Quarterly evidence script runs cleanly.
- Auditor handoff template ready.

## Verification

```text
node scripts/soc2-evidence.mjs --quarter 2026-Q3
ls docs/release/1.0.0/soc2/2026-Q3/
```

Report: criteria covered, evidence categories collected, manual gaps
documented.
