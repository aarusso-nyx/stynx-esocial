# Scanner CI Proof

Status: waiting for a real GitHub Actions run.

`.github/workflows/security.yml` already runs `npm audit`, OSV Scanner, Trivy,
CycloneDX SBOM generation, and SPDX SBOM generation. Round 6 still needs one
green workflow URL plus uploaded SBOM/scanner artifacts before F1.3 can be
closed.

Required evidence:

- Security workflow URL.
- OSV Scanner output.
- Trivy filesystem output.
- CycloneDX SBOM artifact.
- SPDX SBOM artifact.
