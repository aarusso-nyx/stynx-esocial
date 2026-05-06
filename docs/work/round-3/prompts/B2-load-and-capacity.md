# B2 — Load and Capacity Testing

> **Wave B.** Performance worker. Parallel with B1, B3–B6. Builds on A5.

## Read first

- [`../plan.md`](../plan.md) — closure item 5.
- A5 baselines.
- B6 SLOs / autoscaling targets.

## Tasks

1. **Load harness** with `k6` (or `artillery`):
   - Smoke: 50 RPS, 1 min — ramp test; smoke baseline.
   - Sustained: 1000 RPS, 30 min — capacity check.
   - Spike: 100 → 5000 RPS in 10 s, hold 5 min — autoscaling check.
   - Soak: 200 RPS, 8 h — leak / drift check.
2. **Workload mix**: weighted by realistic traffic — periodic events
   (S-1200/S-1299) dominant during competence-close windows; tables
   sparse; worker events steady; returns ~equal to submit rate.
3. **Targets** (closure-item budgets):
   - Sustained 1000 msg/s per submission Lambda at concurrency 50.
   - Spike absorbs 5000 msg/s within 30 s without DLQ growth.
   - Soak: zero leak (memory, file descriptors, DB connections).
4. **Run targets**:
   - Local dev: deterministic SOAP stub, ephemeral Postgres.
   - Restricted-production stage (B5 wires the topology): full path
     with real cert + real qualification SOAP. Run quarterly with
     owner approval; never in production.
5. **Reports**: load test summary uploaded to
   `docs/release/1.0.0/load/<scenario>/` with: throughput,
   latency percentiles, error rate, queue age, Lambda concurrency
   timeline, DB connection counts.
6. **Capacity model**: a calculator (jupyter or markdown) that
   derives required Lambda concurrency, RDS instance class, and
   queue settings from a target throughput.

## Primary write scope

- `tests/load/**`
- `docs/release/1.0.0/load/**`
- `docs/operations.md` — capacity model + load runbook
- `.github/workflows/load.yml` (manual / nightly)

## Do not touch

- Production code semantics; tightening must be a follow-up PR
  citing the load result.
- Real production environment (load runs against
  restricted-production with owner sign-off only).

## Exit criteria

- Three load shapes covered; targets met.
- Capacity model in docs.
- One in-CI smoke load runs nightly.

## Verification

```text
k6 run tests/load/sustained.js
ls docs/release/1.0.0/load/
```

Report: sustained throughput achieved, spike absorption time, soak
leak status, and the per-component sizing recommended by the capacity
model.
