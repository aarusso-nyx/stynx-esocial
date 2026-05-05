# Round 1 — Production-Grade Closure (Revised)

Round 1 closes the structural gaps round 0 left open and promotes the
remaining ~30 event families along the round-0 pipeline. This README is
an orientation; the authoritative documents are
[`./plan.md`](./plan.md) and [`./assessment.md`](./assessment.md).

## Pipeline (unchanged from round 0)

```text
DTO -> active builder -> XSD -> sign -> SOAP stub -> persist -> publish
                                                              \-> return-parser -> status
```

## Why this plan was rewritten

Round 0 closed behaviorally — the pipeline really runs end-to-end for the
five representative families (S-1000, S-1010, S-1200, S-1299, S-2200) and
all S-50xx returns. But round 0 left four of its eleven closure items
PARTIAL/FAIL:

- `npm run cdk:synth` script missing.
- Coverage thresholds unenforced (vitest reports 1.06 % because
  `node --test` suites aren't instrumented).
- Contract publication deferred.
- DLQ replay endpoint unauthenticated; idempotency-key not invoked at
  ingress; envelope version not enforced; append-only / PII redaction /
  TLS rejection untested.

Promoting 30 families on top of those gaps would compound risk. So round
1 is now **gap closure first, then promotion, then hardening, then
release**.

## Inputs (read these before executing)

- [`./plan.md`](./plan.md) — round-1 closure target, batches, exit
  criteria.
- [`./assessment.md`](./assessment.md) — round-0 closure audit synthesis.
- [`../round-0/plan.md`](../round-0/plan.md) — round-0 charter for context.
- [`../round-0/prompts/`](../round-0/prompts/) — round-0 conventions.
- `docs/release/0.1.0/` — round-0 evidence bundle.
- `packages/contracts/src/dtos/round1-pending.ts` — DTO stubs to retire.
- `packages/domain/src/submission/submission-dispatcher.ts` — dispatcher
  with placeholders to wire.
- `packages/domain/src/sgp-lifted/esocial-worker/` — evidence corpus to
  retire family-by-family.

## Execution order

| Batch | File | Notes |
| --- | --- | --- |
| 0 | [`prompts/00-round-0-fixups.md`](prompts/00-round-0-fixups.md) | Blocking. Closes round-0 structural gaps before any promotion. |
| 1 | [`prompts/01-remaining-tables.md`](prompts/01-remaining-tables.md) | Tables. Promotes the unblocked subset; documents leiaute deferrals. |
| 1B | [`prompts/01b-blocked-table-events.md`](prompts/01b-blocked-table-events.md) | Follow-on for S-1030, S-1040, and S-1060 after leiaute owner decision. |
| 2 | [`prompts/02-remaining-periodic.md`](prompts/02-remaining-periodic.md) | Periodic. After Batch 1 (S-1207 ↔ S-2410 dependency noted). |
| 3 | [`prompts/03-worker-sst-tsv.md`](prompts/03-worker-sst-tsv.md) | Worker / SST / TS-V. Largest batch; can split by SST vs. TS-V. |
| 4 | [`prompts/04-benefits-process-exclusion.md`](prompts/04-benefits-process-exclusion.md) | Benefits / process / exclusion. S-3000 and S-2501 carry extra cases. |
| 5 | [`prompts/05-cleanup-and-evidence.md`](prompts/05-cleanup-and-evidence.md) | Lifted-tree retirement, contracts 1.1.0 release, 0.2.0 evidence bundle. |
| 6 | [`prompts/06-hardening.md`](prompts/06-hardening.md) | DLQ auth, TLS, redaction tests, RLS-deny tests, no-op service triage. |
| 7 | [`prompts/07-round-2-scoping.md`](prompts/07-round-2-scoping.md) | Plans round 2 (real eSocial connectivity, real certs). Planning only. |

Within batches 1–4, families with disjoint scopes can be promoted in
parallel.

## Closure target

A green CI pipeline that:

- Closes all 15 round-1 items in [`./plan.md`](./plan.md#round-1-closure-target-done-means).
- Has an empty (or explicitly documented) `packages/domain/src/sgp-lifted/`.
- Publishes `@esocial/contracts@1.1.0` with full DTO coverage of every
  non-return event class.
- Produces a complete evidence bundle under `docs/release/0.2.0/`.

## Worker discipline

Each prompt declares a **Primary write scope** and a **Do not touch**
list. Workers must not revert or overwrite changes outside their
ownership scope. Cross-scope coordination happens through Batch 0
(structural fixes) or Batch 6 (hardening) — not through direct edits.

## Round 2

Round 2 starts only after round-1 closure. Its scope is real eSocial
qualification/restricted-production connectivity, real certificate
provisioning and rotation drills, real endpoint allowlists, and
operator-authorized evidence capture. It is not part of round 1.
[`prompts/07-round-2-scoping.md`](prompts/07-round-2-scoping.md) plans
the round-2 charter; round 2 itself is out of scope here.
