# Wave A Execution Summary

Captured on 2026-05-05 after running prompts A1 through A4.

## Prompt Status

- A1 baseline and decisions: complete. Baseline is captured in
  `docs/work/round-0/evidence/A1-baseline.txt`; decisions are captured in
  `docs/work/round-0/decisions.md`.
- A2 real TypeScript build: complete. Root `npm run build` runs `tsc -b` and
  regenerates contract schemas/examples. ESLint and migration boundary canaries
  run under `npm run lint`. `npm test` runs Vitest plus the active Node test
  suites.
- A3 contracts frozen: complete. `@esocial/contracts@1.0.0` exposes 40 event
  classes, 12 statuses, 11 error categories, 7 envelope families, Round 0 DTOs,
  Round 1 pending DTO stubs, 48 JSON Schema files, and DTO-only request examples.
- A4 autonomous schema: complete. Forward migrations `082` through `086`, real
  `migrate:dev`, and real ephemeral-Postgres `test:db` are in place.

## Verification

- `npm ci`: pass, 0 vulnerabilities.
- `npm run build`: pass.
- `npm run lint`: pass.
- `npm test`: pass, 40 tests.
- `npm run coverage`: pass, aggregate line coverage 73.34%; still below the
  Round 0 target and recorded in `A2-coverage.txt`.
- `npm run migrate:dev`: pass; first run applied 11 migrations to
  `esocial_round0_dev`, second run skipped 11 already-applied migrations.
- `npm run test:db`: pass; ephemeral PostgreSQL ready in 4043 ms, DB suite pass.
- `npm run test:integration`: pass, 9 tests.
- `npm run integration:localstack`: pass; local queue/Event/PostgreSQL round trip
  completed in 2409 ms.
- `npm run templates:check`: pass.
- `npm publish --dry-run --workspace @esocial/contracts`: pass for
  `@esocial/contracts@1.0.0`.

## Remaining Round 0 Gaps

- `npm run cdk:synth` is still absent. C3 owns the real-CDK replacement or
  explicit command rename.
- Aggregate coverage is 73.34%, below the Round 0 target. Main uncovered areas
  are operations helpers and Postgres transport/repository code.
- Active exact `any` count is 0 in `packages/contracts/src`,
  `packages/domain/src` excluding `sgp-lifted`, `packages/pki-pades/src`, and
  `services/*/src`. Four `as Record<string, unknown>` narrowing casts remain.
- No active non-lifted `@nestjs/` or `backend/src` imports remain.
