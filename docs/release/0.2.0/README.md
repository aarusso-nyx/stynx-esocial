# Release Evidence 0.2.0

Round 1 Batch 5 evidence for the standalone eSocial runtime.

## Status

- Active source DTO/build/submit classes: 32.
- Active S-50xx return parser/status classes: 5.
- Owner-blocked source table DTOs: S-1030, S-1040, S-1060.
- Lifted builders, lifted return parsers, and tests/sgp-lifted are retired.
- Retained lifted path: packages/domain/src/sgp-lifted/esocial-worker/xsd/; see docs/work/round-1/lifted-retention.md.
- Final local gate status: `npm test`, `npm run lint`, `npm run build`,
  `npm run coverage`, `npm run test:db`, `npm run test:integration`,
  `npm run integration:localstack`, `npm run cdk:synth`,
  `npm run templates:check`, `npm audit --omit=dev --audit-level=high`, and
  `npm run sbom -- --out docs/release/0.2.0/sbom/contracts-active-services.cdx.json`
  passed.

## Owner Blocks

Final package publication remains RC-only until SGP accepts the breaking idempotency/version requirement and the blocked table-event XSD decisions are closed or explicitly retired.
