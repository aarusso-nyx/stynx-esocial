# A4 — Mutation Testing (Stryker, ≥80 % score)

> **Wave A.** Test infrastructure. Parallel with A1–A3, A5.

## Read first

- [`../plan.md`](../plan.md) — closure item 2.
- [`../assessment.md`](../assessment.md) — coverage section.
- A1 output (must already meet ≥95 % statement coverage; mutation
  testing on under-covered code is wasted runtime).

## Tasks

1. **Install Stryker** (`@stryker-mutator/core`,
   `@stryker-mutator/typescript-checker`, `@stryker-mutator/vitest-runner`).
2. **Per-package configs** (`packages/<pkg>/stryker.conf.cjs`) covering:
   - `packages/domain/src/builders/**`
   - `packages/domain/src/returns/**`
   - `packages/domain/src/submission/**`
   - `packages/pki-pades/src/**`
   - `packages/domain/src/transport/**`
   - `packages/domain/src/observability/redaction.ts`
   - Excluding `sgp-lifted/`.
3. **Threshold**: high ≥80, low ≥70, break <70. CI fails on break.
4. **CI integration**:
   - Daily nightly job (not per-PR) that runs all packages.
   - On-PR: only the changed-package shard runs (use `dirty` list to
     scope).
   - Results uploaded as artifact; HTML report under
     `docs/release/1.0.0/mutation/`.
5. **Survivor triage**: any surviving mutant becomes a real test
   (preferred) or, if the mutant produces semantically-identical
   behavior, an exclusion comment justifying it. No silent ignores.
6. **Alarm**: on mutation-score regression > 5 points week-over-week,
   open a tracking issue automatically (CI step).

## Primary write scope

- `stryker.conf.cjs` per package
- New tests written to kill survivors
- CI workflow additions (`.github/workflows/mutation.yml`)
- `docs/release/1.0.0/mutation/` (artifact target)

## Do not touch

- Production code semantics (tests only, plus narrowly-scoped refactors
  with reviewer flag if required to make code mutation-friendly).
- Other waves.

## Exit criteria

- Mutation score ≥80 % per listed package.
- CI nightly job green.
- Surviving mutants either killed or explicitly justified.

## Verification

```text
npx stryker run --configFile packages/domain/stryker.conf.cjs
# expect: pass with score >= 80
ls docs/release/1.0.0/mutation/
```

Report: per-package mutation scores, surviving mutants triaged,
CI runtime budget.
