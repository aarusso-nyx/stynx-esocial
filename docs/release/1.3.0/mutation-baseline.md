# Builder Mutation Baseline

Configuration: `stryker.conf.mjs`.

Scope: `packages/domain/src/builders/**/*.ts`, with string literal mutations
excluded to avoid churn in committed XML literal builders.

Initial run: `npm run test:mutation` on 2026-05-07.

Initial result: 0.00 % mutation score. The Stryker run completed and wrote
`.stryker-tmp/mutation-report.json` and `.stryker-tmp/mutation-report.html`,
but the active `vitest` runner only executed
`tests/vitest/contracts/contracts-smoke.test.ts`. Builder coverage lived in
`node --test` files under `tests/golden/`, so Stryker was wired but was not
exercising the builder behavior.

Closure run: `npm run test:mutation` on 2026-05-07 after adding
`tests/vitest/domain/builders-golden.test.ts`.

Closure result: 72.30 % mutation score, above the 70 % break threshold. The run
reported 569 killed mutants, 178 survived mutants, and 40 no-coverage mutants
across `packages/domain/src/builders/**/*.ts`.

Remaining improvement surface: surviving mutants are concentrated in optional
DTO fallback branches and validation-array mutants in
`packages/domain/src/builders/common.ts`, `periodic-adapter.ts`,
`benefits-process-exclusion-adapter.ts`, and the low-level S-1200/S-1210/S-1298
builders. They are below the accepted break threshold and should be handled as
ordinary hardening backlog rather than a release blocker.
