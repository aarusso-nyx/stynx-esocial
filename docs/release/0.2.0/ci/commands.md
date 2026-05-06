# Batch 5 Command Evidence

All commands were run from the repository root on Round 1 Batch 5 after the
lifted-tree deletion and evidence bundle generation.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | Passed: 84 tests | Includes `tests/contract/round1-completeness.test.mjs`. |
| `npm run lint` | Passed | ESLint, boundary canaries, and migration lint. |
| `npm run build` | Passed | `tsc -b` plus contract schema generation. |
| `npm run coverage` | Passed | 74.59% line, 70.23% branch, 76.48% functions. |
| `npm run test:db` | Passed | Ephemeral PostgreSQL migration/RLS/idempotency/history proof. |
| `npm run test:integration` | Passed: 17 tests | Templates check, SOAP pipeline, retry/DLQ/replay, return PostgreSQL, LocalStack test files. |
| `npm run integration:localstack` | Passed | Local queue/event/PostgreSQL round trip: response=1, spool=1, audit=1. |
| `npm run cdk:synth` | Passed | Synthesized qualification, restricted-production, and production stacks to `infra/cdk/cdk.synth.out`. |
| `npm run templates:check` | Passed | Qualification and restricted-production review templates verified. |
| `npm audit --omit=dev --audit-level=high` | Passed | Found 0 vulnerabilities. |
| `npm run sbom -- --out docs/release/0.2.0/sbom/contracts-active-services.cdx.json` | Passed | 515 CycloneDX components. |
