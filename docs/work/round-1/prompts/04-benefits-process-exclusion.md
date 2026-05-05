# 04 — Benefits, Process, and Exclusion (Batch 4)

> **Wave B (promotion).** Blocked by Batch 0. Coordinates with Batch 2
> (S-1207 ↔ S-2410) and Batch 3 (S-2298 ↔ S-2418).

## Read first

- [`../plan.md`](../plan.md), [`../assessment.md`](../assessment.md)
- `packages/domain/src/builders/s2200/` and the round-0 worker pattern.
- `docs/templates/golden/builders/s24*.golden.xml`,
  `s2501.golden.xml`, `s3000.golden.xml`.

## Scope

Promote eight families with non-trivial semantics:

| Event | XSD | Golden(s) | Special requirements |
| --- | --- | --- | --- |
| S-2400 | `evtCdBenefIn.xsd` | `s2400.golden.xml` | DTO carries beneficiary + dependents; dependency source for S-2405/S-2410. |
| S-2405 | `evtCdBenefAlt.xsd` | `s2405.golden.xml` | Requires prior S-2400 receipt as opaque field. |
| S-2410 | `evtCdBenIn.xsd` | retirement, pension | DTO carries the benefit identifier S-1207 will reference. |
| S-2416 | `evtCdBenAlt.xsd` | pension-founder | Requires prior S-2410. |
| S-2418 | `evtReativBen.xsd` | retirement, pension | Requires prior suspended/terminated benefit; emits opaque receipt for S-2298. |
| S-2420 | `evtCdBenTerm.xsd` | pension | Requires prior benefit start + termination reason/date. |
| S-2501 | `evtContProc.xsd` | `s2501.golden.xml` | Process-tax event with per-tax-base cases. |
| S-3000 | `evtExclusao.xsd` | `s3000.golden.xml` | Exclusion: DTO must carry original event class, receipt, and reason. |

## Operating principles

Same as Batch 1. Plus:

- **Receipt dependencies as opaque fields.** No `public.esocial_event`
  reads. S-3000 must reject DTOs missing `originalEventClass`,
  `originalReceipt`, and `exclusionReason`.
- **S-2501**: process-tax base is a list; invalid-DTO tests cover
  empty list + duplicate process-number cases.
- **S-3000**: integration test must cover at least exclusions for both a
  table family (e.g., S-1005) and a non-table family (e.g., S-2200) to
  prove the exclusion router is event-class-agnostic.

## Cross-batch contract coordination

- **S-2410 → S-1207** (Batch 2): publish the `s2410.benefitIdentifier`
  DTO field as the contract S-1207 references. Coordinate with Batch 2
  worker to keep the field name stable. Both batches must use the same
  literal.
- **S-2418 → S-2298** (Batch 3): publish optional
  `s2418.reactivatedBenefitReceipt` as the field S-2298 carries.

## Tasks per family

The 12-step task list from Batch 1 applies. Per-family additions
above are the only deltas. Plus:

- **S-3000 has its own router.** Add a sub-dispatcher
  `dispatchExclusionByOriginalClass(dto)` that selects rendering rules
  per the event class being excluded.
- **S-2501 base-case test**: parameterized test covers at least three
  representative process-number formats.

## Forward migration

If exclusion needs a separate persistence shape (rather than reusing
`event_record`), raise to Batch 0 owner — schema changes do not land
from this batch. Default assumption: `event_record` carries the
exclusion via existing fields and a `kind = 'exclusion'` discriminator;
verify before assuming otherwise.

## Primary write scope

- `packages/contracts/src/dtos/{s2400,s2405,s2410,s2416,s2418,s2420,s2501,s3000}.ts`
- `packages/contracts/src/dtos/round1-pending.ts` (remove eight)
- `packages/contracts/schemas/v1/<family>.json` (×8)
- `packages/contracts/examples/v1/requests/<family>.json` (×8)
- `packages/domain/src/builders/<family>/` (×8)
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `packages/domain/src/submission/exclusion-router.ts` (new, S-3000)
- `tests/golden/<family>.test.ts` (×8)
- `tests/integration/soap-submission-pipeline.test.ts`
- Lifted-source deletions for the eight promoted families
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do not touch

- Round-0 builders or evidence.
- Other batches' families.
- Migrations themselves.
- Real endpoint or certificate configuration.

## Exit criteria

- All 8 families ACTIVE_FULL.
- `EsocialRound1PendingDto` no longer covers any of the 8.
- S-2410 benefit-identifier field is the literal Batch 2 (S-1207) uses.
- S-2418 reactivated-receipt field is the literal Batch 3 (S-2298) uses.
- S-3000 cannot exclude without `originalEventClass`,
  `originalReceipt`, and `exclusionReason`.
- S-3000 integration test covers a table-family exclusion and a
  non-table-family exclusion.
- Lifted source for the 8 promoted families is gone.
- All gates green.

## Verification

```text
npm run build
npm run lint
npm run coverage
npm run test:integration
ls packages/domain/src/builders | grep -E "^s2(4|5)|^s3000"
# expect: 8 directories
ls packages/domain/src/sgp-lifted/esocial-worker/builders | grep -E "^s2(4|5)|^s3000"
# expect: empty
```

Report: families promoted, exclusion router cases covered, S-2501
process-base variants, contract coordination outcomes with Batches 2
and 3, and any forward-migration request raised to Batch 0.
