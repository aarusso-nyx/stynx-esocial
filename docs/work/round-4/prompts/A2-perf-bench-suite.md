# A2 — `tests/perf/` Bench Suite

> **Wave A.** Performance engineer. Parallel with A1, A3, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 3.
- Round-3 prompt `A5-perf-regression.md`.
- `scripts/perf-regression.mjs` — already exists (smoke baseline).
- `docs/release/1.0.0/perf-baselines/` — baselines already present.

## Tasks

1. **Create `tests/perf/`** with vitest-bench (or `mitata` /
   `tinybench`) suites:
   - `builder-bench.ts` — DTO → XML for every active family.
   - `xsd-bench.ts` — XSD validation latency.
   - `sign-bench.ts` — RSA-SHA256 signing.
   - `parse-return-bench.ts` — every S-50xx variant.
   - `idempotency-key-bench.ts` — key construction.
2. **Wire `npm run bench:smoke`** to a small subset, `npm run bench` to
   full, `npm run bench:baseline` to capture baselines (already
   scaffolded in `scripts/perf-regression.mjs` — extend it).
3. **Latency budgets** (closure target):
   - p99 sign latency ≤ 50 ms.
   - p99 XSD latency ≤ 100 ms.
   - p99 builder latency ≤ 50 ms per family.
   - p99 idempotency-key build ≤ 1 ms.
   - p99 return-parse ≤ 25 ms per variant.
   Budgets enforced by `scripts/perf-regression.mjs`; CI fails on
   regression > 15 % vs baseline or breach of absolute budget.
4. **PR-comment diff vs baseline** via a CI step that emits markdown.
5. **Evidence**: per-area p50/p95/p99 written to
   `docs/release/1.1.0/perf/`.

## Primary write scope

- `tests/perf/**` (new)
- `scripts/perf-regression.mjs` (extend)
- `.github/workflows/perf.yml` (new or extend)
- `docs/release/1.1.0/perf/`

## Do not touch

- Production code semantics. Tightening must be a separate PR
  citing the perf result.
- Baselines in `docs/release/1.0.0/perf-baselines/` (read-only here).

## Exit criteria

- 5 bench suites under `tests/perf/`.
- PR-comment diff lands.
- Latency-budget breach demoed (intentionally regress, observe failure,
  restore).

## Verification

```text
npm run bench:smoke
npm run bench
ls tests/perf/
```

Report: per-area numbers, budget breach demo, CI runtime.
