# 03 — Worker, SST, and TS-V Events (Batch 3)

> **Wave B (promotion).** Blocked by Batch 0. Largest batch — 11 families.
> Worker scope: XML/event (worker / SST / TS-V sub-domains).

## Read first

- [`../plan.md`](../plan.md), [`../assessment.md`](../assessment.md)
- `packages/domain/src/builders/s2200/` — round-0 worker pattern.
- `packages/domain/src/sgp-lifted/esocial-worker/builders/` — evidence
  source.
- `docs/templates/golden/builders/s2{2,3}*.golden.xml`.

## Splitting across workers

This batch can be split:

- **Worker A — Worker data + termination**: S-2205, S-2206, S-2298, S-2299.
- **Worker B — SST**: S-2210, S-2220, S-2230, S-2240.
- **Worker C — TS-V**: S-2300, S-2306, S-2399.

Workers must coordinate edits to:
- `packages/domain/src/submission/submission-dispatcher.ts`
- `packages/domain/src/builders/index.ts`
- `tests/integration/soap-submission-pipeline.test.ts`
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

Use the **single-line dispatcher entry per family** convention so
merges are automatic.

## Family table

| Event | XSD | Golden(s) | Special requirements |
| --- | --- | --- | --- |
| S-2205 | `evtAltCadastral.xsd` | `s2205.golden.xml` | DTO carries worker/dependent changes; opaque prior-S-2200 reference. |
| S-2206 | `evtAltContratual.xsd` | `s2206-promotion.golden.xml` | DTO carries contract/table references as opaque ids; no HR joins. |
| S-2210 | `evtCAT.xsd` | `s2210-inicial`, `s2210-obito`, `s2210-reabertura` | **Remove** `public.esocial_event` lookup; DTO carries original receipt for reopening/death variants. |
| S-2220 | `evtMonit.xsd` | 4 ASO/exam variants | Discriminated DTO for exam type + result. |
| S-2230 | `evtAfastTemp.xsd` | medical-leave, vacation | Discriminated DTO for leave/vacation. |
| S-2240 | `evtExpRisco.xsd` | noise start/change/end | `operation: 'start' \| 'change' \| 'end'` field controls flow. |
| S-2298 | `evtReintegr.xsd` | **no committed golden** | Generate from lifted builder output before deleting lifted source. |
| S-2299 | `evtDeslig.xsd` | with-notice, without-notice | DTO carries termination components (no payroll reads). |
| S-2300 | `evtTSVInicio.xsd` | estagiario, autonomo, conselheiro | Discriminated TS-V category DTO. |
| S-2306 | `evtTSVAltContr.xsd` | **no committed golden** | Generate from lifted builder output before deleting lifted source. |
| S-2399 | `evtTSVTermino.xsd` | estagiario, autonomo, conselheiro | DTO carries accepted S-2300/S-2306 context as opaque ids. |

## Operating principles

Same as Batch 1. Plus:

- **Discriminated DTOs** use the `kind: 'foo' | 'bar'` TS pattern with
  exhaustive switch in builder. Add a compile-time `assertNever`
  helper to catch missed branches.
- **No `public.esocial_event` reads.** S-2210 and S-2298 in lifted
  source query receipts via that table; the round-1 DTO must carry the
  receipt as a field.
- **Generate goldens for S-2298 and S-2306.** Run the lifted builder
  against a deterministic test DTO (constructed in this prompt's PR),
  capture the output, save under
  `docs/templates/golden/builders/<family>.golden.xml`, and treat that
  as the byte-equal target. Document the generation script under
  `tests/golden/scripts/<family>-generate.mjs`.

## Tasks per family

The 12-step task list from Batch 1 applies. Variant-rich families add:

- **Per-variant golden tests** wired through a test-table parameter.
- **Variant exhaustiveness test**: a TS test asserts every union member
  is handled by the dispatcher's switch.

## Cross-batch dependency: S-2298 ↔ Batch 4 (S-2418 reactivation)

S-2298 (worker reintegration) can be triggered by a benefit-reactivation
flow (S-2418). The DTO carries the originating S-2418 receipt as an
optional opaque field; the actual reconciliation lives downstream in
SGP. No runtime dependency on Batch 4 ordering.

## Primary write scope

- `packages/contracts/src/dtos/{s2205,s2206,s2210,s2220,s2230,s2240,s2298,s2299,s2300,s2306,s2399}.ts`
- `packages/contracts/src/dtos/round1-pending.ts` (remove eleven)
- `packages/contracts/schemas/v1/<family>.json` (×11)
- `packages/contracts/examples/v1/requests/<family>.json` (×11)
- `packages/domain/src/builders/<family>/` (×11)
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/<family>.test.ts` (×11; parameterized for variants)
- `tests/golden/scripts/{s2298,s2306}-generate.mjs` (new)
- `docs/templates/golden/builders/{s2298,s2306}.golden.xml` (new)
- `tests/integration/soap-submission-pipeline.test.ts`
- Lifted-source deletions for the eleven promoted families
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do not touch

- Round-0 builders or evidence.
- Other batches' families.
- Benefit-lifecycle builders (Batch 4).
- Migrations themselves.

## Exit criteria

- All 11 families ACTIVE_FULL.
- `EsocialRound1PendingDto` no longer covers any of the 11.
- S-2298 and S-2306 goldens are committed and tested.
- Variant exhaustiveness tested for every discriminated DTO.
- No `public.esocial_event` references in active code:
  ```text
  grep -R "public\\.esocial_event\\|hr\\.\\|payroll\\.\\|saude\\." \
    packages/domain/src services --include='*.ts' | grep -v sgp-lifted
  # expect: empty
  ```
- Lifted source for the 11 promoted families is gone.
- All gates green.

## Verification

```text
npm run build
npm run lint
npm run coverage
npm run test:db
npm run test:integration
ls packages/domain/src/builders | grep -E "^s2(2|3)"
# expect: 11 directories
ls packages/domain/src/sgp-lifted/esocial-worker/builders | grep -E "^s2(2|3)" | wc -l
# expect: 0
```

Report: families promoted (per worker), discriminator variants
covered, lifted-source files deleted, generated goldens (S-2298,
S-2306), and any cross-batch contract coordination with Batch 2 (S-1207
↔ benefit data) or Batch 4 (S-2298 ↔ S-2418).
