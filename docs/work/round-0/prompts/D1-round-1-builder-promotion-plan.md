# D1 — Round-1 Builder Promotion Plan

> **Wave D, step 1.** Planner scope. Blocked by C5. Round-1 entry point.
> This prompt **plans**; it does not implement. Implementation is round 1.

## Read first

- All round-0 outputs, especially the working pipeline B1→B5 and the
  five families promoted in B2.
- The lifted tree under `packages/domain/src/sgp-lifted/` — surviving
  contents at end of round 0.

## Why this exists

Round 0 proves the pipeline on five representative families. The remaining
~30 families (S-1005, S-1020, S-1030, S-1040, S-1050, S-1060, S-1070,
S-1202, S-1207, S-1210, S-1298, S-2205, S-2206, S-2210, S-2220, S-2230,
S-2240, S-2298, S-2299, S-2300, S-2306, S-2399, S-2400, S-2405, S-2410,
S-2416, S-2418, S-2420, S-2501, S-3000) are mechanical promotions along
the same path. D1 produces the round-1 plan and per-family prompts.

## Tasks

1. **Per-family inventory.** For each non-round-0 family, capture:
   - Lifted builder file path (`sgp-lifted/.../builders/<family>/`).
   - Direct SGP table reads (grep `hr.*`, `payroll.*`, `saude.*`).
   - Golden fixtures available under `docs/templates/golden/`.
   - Leiaute version per `docs/references/`.
   - Inter-family dependencies (e.g., S-1200 depends on S-1010 versions
     — round-0 already handled; round 1 must not reintroduce coupling).
2. **Group families into batches** that can be parallelized:
   - Batch 1: remaining tables (S-1005, S-1020, S-1030, S-1040, S-1050,
     S-1060, S-1070).
   - Batch 2: remaining periodic (S-1202, S-1207, S-1210, S-1298).
   - Batch 3: worker/SST/TSV (S-2205, S-2206, S-2210, S-2220, S-2230,
     S-2240, S-2298, S-2299, S-2300, S-2306, S-2399).
   - Batch 4: benefits/process/exclusion (S-2400, S-2405, S-2410,
     S-2416, S-2418, S-2420, S-2501, S-3000).
3. **Per-batch prompts** under `docs/work/round-1/prompts/`:
   - Each batch is one prompt per family or one prompt per batch with
     explicit per-family checklists. Prefer per-batch with checklists;
     it lowers prompt count without losing granularity.
   - Each prompt mirrors B2: define DTO (or confirm existing stub),
     promote builder, golden test, metadata test, invalid-DTO test,
     wire B1 dispatch, delete lifted source, sign-pipeline integration
     proven by extending `npm run test:integration`.
4. **Round-1 closure target.**
   - All ~30 families have active builders, golden tests, metadata
     tests, invalid-DTO tests.
   - `packages/domain/src/sgp-lifted/` is empty (or contains only the
     evidence categories round 1 explicitly defers, with the file list
     and reason).
   - `tests/sgp-lifted/` is gone.
   - All families pass `npm run test:integration` end-to-end.
5. **Round-2 scoping note.** Document the round-2 entry: real
   eSocial-sandbox connectivity, restricted-production deployment,
   real certificate provisioning. This requires explicit owner
   authorization and is out of round-1 scope.

## Primary write scope

- `docs/work/round-1/plan.md` (new)
- `docs/work/round-1/prompts/**` (new — at minimum a README + one
  prompt per batch)
- `docs/work/round-1/README.md` (orientation, mirrors round-0)

## Do not touch

- Round-0 artifacts under `docs/work/round-0/`.
- Source code (this prompt plans only).

## Exit criteria

- A complete round-1 plan exists with per-batch prompts.
- Each prompt is self-contained and references the round-0 pipeline as
  the path to follow.
- Inter-family dependencies are explicit (no surprise coupling at
  round-1 implementation time).
- The round-1 closure target is concrete and verifiable from CI.

## Verification

```text
ls docs/work/round-1/prompts/
wc -l docs/work/round-1/plan.md
```

Report: families per batch, expected prompt count, dependencies, and
any family that warrants its own prompt rather than a batch line item
(e.g., S-3000 process-event has unusual semantics).
