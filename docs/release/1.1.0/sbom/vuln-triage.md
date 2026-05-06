# SBOM And Vulnerability Triage

Round 4 extended `scripts/sbom.mjs` to emit CycloneDX and SPDX.

Generated locally:

```bash
npm run sbom -- --format=spdx --out docs/release/1.1.0/sbom/contracts.spdx.json
npm run sbom -- --format=cyclonedx --out docs/release/1.1.0/sbom/contracts.cdx.json
```

CI additions:

- `npm audit --omit=dev --audit-level=high`
- OSV Scanner against `package-lock.json`
- Trivy filesystem scan for high/critical findings

Triage SLA:

- Critical: 7 days
- High: 30 days
- Medium: 90 days
