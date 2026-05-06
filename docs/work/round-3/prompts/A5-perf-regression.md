# A5 — Performance Regression Suite

> **Wave A.** Performance / CI. Parallel with A1–A4. Feeds B2 + B6.

## Read first

- [`../plan.md`](../plan.md) — closure item 5.
- [`../assessment.md`](../assessment.md) — performance section.

## Tasks

1. **Bench harness** at `tests/perf/`:
   - `vitest bench` (or `mitata` / `tinybench`) with stable warmup +
     statistical-significance config.
   - Per-area suites: `builder-bench` (DTO → XML for every family),
     `xsd-bench`, `sign-bench`, `parse-return-bench`,
     `idempotency-key-bench`.
   - Sample size large enough that p99 is meaningful.
2. **Baselines** captured once per release; stored under
   `docs/release/1.0.0/perf-baselines/`. CI compares current run
   against the baseline; regression > 15 % fails.
3. **Latency budgets** (the closure target):
   - p95 ingress (envelope received → DB row written) ≤ 200 ms.
   - p99 SOAP-stub round-trip ≤ 500 ms.
   - p99 end-to-end (DTO → spool publish) ≤ 1500 ms.
   - p99 sign latency ≤ 50 ms.
   - p99 XSD latency ≤ 100 ms.
   These are budget assertions; CI fails on breach.
4. **CI integration**:
   - Nightly job runs the full suite; uploads HTML report.
   - Per-PR: a small "smoke perf" subset runs to catch obvious
     regressions; full suite runs on `main`.
   - Reports diff vs. baseline in PR comment.
5. **Regression triage**: any regression must come with a recorded
   reason in the PR description (intentional? bug?). If intentional,
   the baseline updates in the same PR.

## Primary write scope

- `tests/perf/**`
- `docs/release/1.0.0/perf-baselines/**`
- `.github/workflows/perf.yml`
- `package.json` scripts (`bench`, `bench:smoke`, `bench:baseline`)

## Do not touch

- Production code semantics. Only add bench targets; tighten code in
  separate PRs that reference perf budgets.

## Exit criteria

- Latency budgets enforced; one demonstrated PR-blocking failure
  recorded as evidence.
- Baselines committed; regression diff in PR comment.

## Verification

```text
npm run bench:smoke
npm run bench
test -f docs/release/1.0.0/perf-baselines/builder.json
```

Report: per-area p50/p95/p99 numbers, baseline file count, CI runtime,
regression-detection demo.
