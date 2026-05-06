# F2 — Mutation Testing Closure

> **Round-6 Batch F2.** Quality owner. Parallel with all other batches.
> Long-running; will not gate D2 reference-site publish.

## Read first

- [`../plan.md`](../plan.md) — Carryover Backlog Batch F2.
- R5 mutation-testing report (worker findings):
  - `npm run mutation` runs but **fails (0 % score)**.
  - 3902 survived mutants.
  - 2218 compile/runtime errors.
  - Single Vitest smoke test wires the harness.
- R5 prompt `A1-mutation-testing.md` (the original design).

## Decision (locked)

**D1 = (a) — Full coverage.** 80 % mutation score, uniform across:

- `packages/domain/src/builders/`
- `packages/domain/src/returns/`
- `packages/domain/src/submission/`
- `packages/domain/src/transport/`
- `packages/domain/src/observability/redaction.ts`
- All of `packages/pki-pades/`

No tiering. Estimated effort: **4–6 engineer-weeks**. F2 runs in
parallel with everything else and **does not gate** any other R6
batch (including D2 reference-site publish — D2 gates on F1, not F2).

Record this decision in `docs/release/1.2.0/mutation/decision.md`.

## Tasks

1. **Fix the 2218 compile/runtime errors first.** Without a compiling
   Stryker config, the score is meaningless.
   - Inspect Stryker config for missing path mappings, broken project
     references, vitest-runner incompatibilities.
   - Verify per-package `stryker.conf.cjs` `mutate:` patterns match
     the actual source layout.
   - Run `npx stryker run --configFile <pkg>/stryker.conf.cjs`
     iteratively until errors hit zero.
2. **Wire real test surface.** The current single Vitest smoke test
   leaves Stryker with nothing to kill mutants. Wire the full vitest
   project graph for each mutation target — Stryker's vitest-runner
   honors the project's own vitest config.
3. **Establish the 80 % threshold uniformly per D1=(a).** Update
   every target package's `stryker.conf.cjs`:
   ```js
   thresholds: { high: 80, low: 70, break: 70 }
   ```
   Same threshold for every package in the D1=(a) target list.
4. **Triage 3902 survivors.** For each survivor:
   - **Reachable but uncovered semantic** → add a test that kills it.
   - **Equivalent mutant** (semantically identical to original) → add an
     `// stryker-disable-next-line` comment with one-line justification.
   - **Untestable side effect** (logging, observability, AWS-SDK
     wiring) → ignore in `mutator.excludedMutations` for that file
     with a code-comment justification; do **not** broaden the
     exclusion globally.
5. **Iteration loop**: re-run, kill more mutants, repeat until target
   threshold met.
6. **CI integration**:
   - Nightly job runs full suite; uploads HTML report to
     `docs/release/1.2.0/mutation/`.
   - Per-PR shard runs only the changed package's mutation suite.
   - Threshold breach fails CI.
7. **Score regression alarm** (R3 A4 + R4 D1 drift cron): >5-point
   week-over-week drop opens a tracking issue.

## Primary write scope

- `packages/<pkg>/stryker.conf.cjs` per target package
- `packages/<pkg>/__tests__/` — new tests killing survivors
- Inline `// stryker-disable-next-line` comments for equivalents
- `.github/workflows/mutation.yml` — full + sharded
- `docs/release/1.2.0/mutation/`
- `docs/release/1.2.0/mutation/decision.md` (D1 record)

## Do not touch

- Production code semantics — tests only, plus narrow refactors with
  reviewer flag if mutation-friendliness genuinely requires it.
- Other carry-over batches (F1, F3, F4, F5, F6).
- R6 expansion batches (A–E).

## Exit criteria

- Stryker compiles cleanly: 0 compile/runtime errors.
- 80 % score met on every D1=(a) target package.
- Surviving mutants triaged (real-test-killed, equivalent-disabled, or
  side-effect-excluded with comment).
- Nightly CI green; per-PR shard runs.
- HTML report at `docs/release/1.2.0/mutation/index.html`.
- Decision record at `docs/release/1.2.0/mutation/decision.md`.

## Verification

```text
npx stryker run --configFile packages/pki-pades/stryker.conf.cjs
npx stryker run --configFile packages/contracts/stryker.conf.cjs
npx stryker run --configFile packages/domain/stryker.conf.cjs
ls docs/release/1.2.0/mutation/
```

Report: error count fixed (2218 → 0), score per package (target 80 %),
survivor triage counts (killed / equivalent / excluded), CI runtime
budget, total engineer-weeks consumed vs the 4–6 week budget.
