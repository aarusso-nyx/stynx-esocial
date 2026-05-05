# R1-04 — Benefits, Process, And Exclusion Events

## Scope

Promote S-2400, S-2405, S-2410, S-2416, S-2418, S-2420, S-2501, and S-3000.

## Primary Write Scope

- `packages/contracts/src/dtos/`
- `packages/contracts/src/schema-generation/write-schemas.mjs`
- `packages/domain/src/builders/s2400/`
- `packages/domain/src/builders/s2405/`
- `packages/domain/src/builders/s2410/`
- `packages/domain/src/builders/s2416/`
- `packages/domain/src/builders/s2418/`
- `packages/domain/src/builders/s2420/`
- `packages/domain/src/builders/s2501/`
- `packages/domain/src/builders/s3000/`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/`
- `tests/integration/soap-submission-pipeline.test.mjs`
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do Not Touch

- Worker/SST/TSV builders except for documented dependency references.
- Real endpoint or certificate configuration.

## Family Checklist

| Event | Source evidence | Golden | XSD | Special requirement |
| --- | --- | --- | --- | --- |
| S-2400 | `builders/s2400.builder.ts` | `s2400.golden.xml` | `evtCdBenefIn.xsd` | DTO carries beneficiary registration and dependents. |
| S-2405 | `builders/s2405.builder.ts` | `s2405.golden.xml` | `evtCdBenefAlt.xsd` | Requires prior S-2400 context. |
| S-2410 | `builders/s2410.builder.ts` | `s2410-retirement.golden.xml`, `s2410-pension.golden.xml` | `evtCdBenIn.xsd` | DTO is dependency source for S-1207. |
| S-2416 | `builders/s2416.builder.ts` | `s2416-pension-founder.golden.xml` | `evtCdBenAlt.xsd` | Requires prior S-2410 context. |
| S-2418 | `builders/s2418.builder.ts` | `s2418-retirement.golden.xml`, `s2418-pension.golden.xml` | `evtReativBen.xsd` | Requires previous suspended/terminated benefit context. |
| S-2420 | `builders/s2420.builder.ts` | `s2420-pension.golden.xml` | `evtCdBenTerm.xsd` | Requires prior benefit start and termination reason/date. |
| S-2501 | `builders/s2501.builder.ts` | `s2501.golden.xml` | `evtContProc.xsd` | Process-tax event; keep separate invalid cases for process number and tax bases. |
| S-3000 | `builders/s3000.builder.ts` | `s3000.golden.xml` | `evtExclusao.xsd` | Exclusion event; DTO must carry original event class, receipt, and exclusion reason. |

## Required Work

1. Replace `Round1Pending` stubs with concrete DTOs and schemas/examples.
2. Promote lifecycle builders and encode dependencies as explicit DTO fields.
3. Add extra integration tests for S-2501 and S-3000 because their semantics are
   not simple lifecycle updates.
4. Remove `public.esocial_event` reads from S-3000 promotion; original event
   reference is DTO input.
5. Update SGP migration notes with benefit lifecycle and exclusion cutover rules.

## Exit Criteria

- S-2410 output/DTO shape is available for S-1207 dependency modeling.
- S-3000 cannot exclude without explicit original-event receipt/reference fields.
- All eight events pass the full pipeline integration tests.
