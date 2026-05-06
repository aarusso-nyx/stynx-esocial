# A3 — Load Tests (`tests/load/` with k6)

> **Wave A.** Performance. Parallel with A1, A2, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 3.
- Round-3 prompt `B2-load-and-capacity.md`.
- Round-4 A2 perf-bench output (per-area latency baselines).

## Tasks

1. **`tests/load/`** with k6:
   - `smoke.js` — 50 RPS, 1 min ramp.
   - `sustained.js` — 1000 RPS, 30 min.
   - `spike.js` — 100 → 5000 RPS in 10 s, hold 5 min.
   - `soak.js` — 200 RPS, 8 h.
2. **Workload mix**: weighted by realistic traffic — periodic events
   (S-1200/S-1299) dominant during competence-close windows; tables
   sparse; worker events steady; returns ≈ submit rate.
3. **Targets** (closure budgets):
   - Sustained 1000 msg/s per submission Lambda at concurrency 50.
   - Spike absorbs 5000 msg/s within 30 s without DLQ growth.
   - Soak: zero leak (memory, FDs, DB connections).
4. **CI runs against LocalStack + ephemeral Postgres** (no real
   deployed environment in R5; full restricted-production runs are R6
   territory).
5. **Reports**: throughput, latency percentiles, error rate, queue
   age, Lambda concurrency timeline, DB connection counts →
   `docs/release/1.2.0/load/<scenario>/`.
6. **Capacity model** (jupyter or markdown) deriving Lambda
   concurrency, RDS instance class, and queue settings from a target
   throughput. Lives in `docs/operations.md`.
7. **Smoke runs nightly** in CI; full sustained run weekly.

## Primary write scope

- `tests/load/**`
- `docs/release/1.2.0/load/**`
- `docs/operations.md` — capacity model + load runbook
- `.github/workflows/load.yml`

## Do not touch

- Production code semantics.
- Real deployed environment (R6 covers that).

## Exit criteria

- 4 load shapes covered; targets met against LocalStack.
- Capacity model documented.
- In-CI smoke + weekly sustained.

## Verification

```text
k6 run tests/load/sustained.js
ls docs/release/1.2.0/load/
```

Report: sustained throughput, spike absorption time, soak leak status,
capacity-model sizing.
