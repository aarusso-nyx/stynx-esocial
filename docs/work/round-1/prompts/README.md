# Round 1 Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a
self-contained brief: a fresh agent should be able to read **only** the
prompt (plus the assessment docs it references) and execute that batch.

## Order and blocking graph

| # | File | Wave | Blocked by |
| --- | --- | --- | --- |
| 00 | [`00-round-0-fixups.md`](00-round-0-fixups.md) | A (structural) | — |
| 01 | [`01-remaining-tables.md`](01-remaining-tables.md) | B (promotion) | 00 |
| 02 | [`02-remaining-periodic.md`](02-remaining-periodic.md) | B | 00, 01 |
| 03 | [`03-worker-sst-tsv.md`](03-worker-sst-tsv.md) | B | 00 (S-2210 notes S-2298 dependency on benefit reactivation) |
| 04 | [`04-benefits-process-exclusion.md`](04-benefits-process-exclusion.md) | B | 00 (S-2410 ↔ S-1207 from batch 02) |
| 05 | [`05-cleanup-and-evidence.md`](05-cleanup-and-evidence.md) | C (closure) | 01–04 |
| 06 | [`06-hardening.md`](06-hardening.md) | C | 00, 05 |
| 07 | [`07-round-2-scoping.md`](07-round-2-scoping.md) | D (planning) | 06 |

Within batch 03, SST (S-2210/2220/2230/2240) and TS-V (S-2300/2306/2399)
have disjoint write scopes and can be split across two workers.
S-2205/2206 (worker-data alteration) and S-2298/2299 (reintegration /
termination) are also disjoint enough to parallelize.

## Operating principles (every prompt)

- Round-0 fixups land first; no promotion proceeds with FAIL/PARTIAL
  round-0 items.
- Each promotion deletes the corresponding lifted source in the same
  change.
- No structural-only gates — every claim must be CI-provable.
- No SGP schema reads/writes from active code. SGP source ids stay
  opaque.
- Idempotent and deterministic. Append-only history. Forward-only
  migrations.
- No real certificates / endpoints / production data — round 2 only.
- Workers stay inside declared scope. Cross-scope changes route through
  batch 00 or 06.

## Closure target

Defined in [`../plan.md`](../plan.md#round-1-closure-target-done-means).
A PR is "round-1 done" only when all 15 closure items are provable from
CI.
