# D2 — SBOM Continuous + Vuln-Triage SLA Enforcement

> **Wave D.** Supply chain. Parallel with D1, D3, A, B, C.

## Read first

- [`../plan.md`](../plan.md) — closure item 11.
- Round-3 prompt `C6-sbom-vuln-triage.md` (the design lives there).
- Existing `scripts/sbom.mjs` from round 0.

## Tasks

1. **Extend `scripts/sbom.mjs`** to emit both CycloneDX **and** SPDX.
2. **Per-Lambda SBOM** in deployment artifacts (output under
   `docs/release/1.1.0/sbom/lambdas/`).
3. **CVE scanners** in CI:
   - `npm audit --omit=dev` already runs from round-0 C4; keep.
   - Add `osv-scanner -L package-lock.json` step.
   - Add `trivy fs .` step (filesystem scan; container scan if any
     containers ship — see B1).
   - **Critical / high** finding → CI fail.
4. **SBOM diff PR comments** for any change to `package*.json`.
5. **Triage SLA enforcement**:
   - SLA from round-3 C1: critical < 7 days, high < 30 days,
     medium < 90 days.
   - Auto-create a tracking issue with the deadline label.
   - A weekly digest workflow lists open issues + days remaining.
6. **SLSA provenance attestations** attached to GitHub Releases for
   every published package (contracts, SDK).

## Primary write scope

- `scripts/sbom.mjs`
- `.github/workflows/security.yml` (new) or extend `ci.yml`
- `docs/release/1.1.0/sbom/`
- `docs/operations.md` — vuln-triage runbook

## Do not touch

- Application code.
- Other waves' work.

## Exit criteria

- SBOMs in CycloneDX + SPDX every release.
- `osv-scanner` + `trivy` in CI; critical/high → fail.
- Weekly digest issued.
- Provenance attestations attached.
- One PR demonstrates the SBOM-diff comment.

## Verification

```text
npm run sbom -- --format=cyclonedx --out docs/release/1.1.0/sbom/contracts.cdx.json
npm run sbom -- --format=spdx --out docs/release/1.1.0/sbom/contracts.spdx.json
osv-scanner -L package-lock.json
trivy fs .
```

Report: SBOM formats published, scanner findings, SLA backlog,
provenance attestation result.
