# A1 — Mutation Testing (Stryker, ≥ 80 % score)

> **Wave A.** Quality engineer. Parallel with A2, A3, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 1.
- Round-3 prompt `A4-mutation-testing.md` (the design lives there).
- Round-4 A1 (95 % coverage prerequisite — landed in R4).

## Tasks

1. **Install Stryker**:
   `@stryker-mutator/core`,
   `@stryker-mutator/typescript-checker`,
   `@stryker-mutator/vitest-runner`.
2. **Per-package configs** at `packages/<pkg>/stryker.conf.cjs`:
   - `packages/domain/src/builders/**`
   - `packages/domain/src/returns/**`
   - `packages/domain/src/submission/**`
   - `packages/pki-pades/src/**`
   - `packages/domain/src/transport/**`
   - `packages/domain/src/observability/redaction.ts`
3. **Threshold**: high ≥ 80, low ≥ 70, break < 70. CI fails on break.
4. **CI integration**:
   - Daily nightly job (`mutation.yml`) — full run.
   - On-PR: only the changed-package shard runs (use `dirty` list).
   - Results → `docs/release/1.2.0/mutation/`.
5. **Survivor triage**: any surviving mutant becomes a real test
   (preferred) or an exclusion comment with a justified reason.
6. **Regression alarm**: > 5-point drop week-over-week → auto-open
   tracking issue.

## Primary write scope

- `stryker.conf.cjs` per package
- New tests killing survivors
- `.github/workflows/mutation.yml`
- `docs/release/1.2.0/mutation/`

## Do not touch

- Production code semantics. Tests only, plus narrow refactors with
  reviewer flag if mutation-friendliness requires it.

## Exit criteria

- Mutation score ≥ 80 % per listed package.
- Nightly CI green.
- Survivors triaged.

## Verification

```text
npx stryker run --configFile packages/domain/stryker.conf.cjs
```

Report: per-package mutation scores, survivors triaged, CI runtime.
