# C6 — SBOM Continuous + Vulnerability Triage SLA

> **Wave C.** Supply-chain worker. Parallel with C2–C5, C7.

## Read first

- [`../plan.md`](../plan.md) — closure item 8.
- C1 SLA (critical < 7 d, high < 30 d, medium < 90 d).
- Round-0 prompt C4 (initial SBOM).

## Tasks

1. **CycloneDX SBOM** generated on every release (already in C4 round
   0). Round 3 adds:
   - SPDX SBOM alongside CycloneDX.
   - Per-Lambda SBOM in deployment artifacts.
   - SBOM diffs surfaced in PR comments for any `package*.json`
     change.
2. **Vulnerability scanning**:
   - `npm audit` + `osv-scanner` + `trivy` (for container layers if
     used) run on every PR.
   - Critical / high CVE → CI failure.
   - SBOM stored under `docs/release/1.0.0/sbom/` and uploaded to a
     vendor-neutral SBOM registry (Dependency-Track / equivalent).
3. **Triage workflow**:
   - Critical / high CVE auto-creates an issue with the SLA from C1.
   - A weekly digest summarizes the triage state.
4. **Container image scanning** (if D2 operator console or any
   service uses containers):
   - Base image pinned by digest.
   - `trivy image` in CI.
5. **Provenance**:
   - SLSA-level statements committed alongside the contracts release
     (D1 SDK release adds the same).
   - Build provenance attestations attached to GitHub Releases.

## Primary write scope

- `scripts/sbom.mjs` (extend round-0 version)
- `.github/workflows/security.yml` (new, or extend ci.yml)
- `docs/release/1.0.0/sbom/`
- `docs/operations.md` — vuln triage runbook

## Do not touch

- Application code semantics.

## Exit criteria

- SBOMs generated per release in CycloneDX + SPDX.
- CVE scanners run on every PR; CI fails on critical / high.
- Weekly digest delivered.
- Provenance attestations attached.

## Verification

```text
npm run sbom -- --format=cyclonedx --out docs/release/1.0.0/sbom/contracts.cdx.json
npm run sbom -- --format=spdx --out docs/release/1.0.0/sbom/contracts.spdx.json
osv-scanner -L package-lock.json
```

Report: SBOMs published, scanners enabled, triage SLA status, CVE
backlog.
