# R1-03 — Worker, SST, And TS-V Events

## Scope

Promote S-2205, S-2206, S-2210, S-2220, S-2230, S-2240, S-2298, S-2299,
S-2300, S-2306, and S-2399.

## Primary Write Scope

- `packages/contracts/src/dtos/`
- `packages/contracts/src/schema-generation/write-schemas.mjs`
- `packages/domain/src/builders/s22xx*/`, `s2298/`, `s2299/`, `s2300/`,
  `s2306/`, `s2399/`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/`
- `tests/integration/soap-submission-pipeline.test.mjs`
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do Not Touch

- Benefit/process/exclusion builders.
- SGP lifted services except to remove a family after its active builder and
  tests are green.

## Family Checklist

| Event | Source evidence | Golden | XSD | Special requirement |
| --- | --- | --- | --- | --- |
| S-2205 | `builders/s2205.builder.ts` | `s2205.golden.xml` | `evtAltCadastral.xsd` | DTO carries worker/dependent changes and prior S-2200 context. |
| S-2206 | `builders/s2206.builder.ts` | `s2206-promotion.golden.xml` | `evtAltContratual.xsd` | DTO carries contract/table references; no HR joins. |
| S-2210 | `builders/s2210.builder.ts` | `s2210-inicial`, `s2210-obito`, `s2210-reabertura` | `evtCAT.xsd` | Remove `public.esocial_event` lookup/update; DTO carries original receipt for reopening/death variants. |
| S-2220 | `builders/s2220.builder.ts` | four ASO/exam variants | `evtMonit.xsd` | Discriminated DTO for exam type and result. |
| S-2230 | `builders/s2230.builder.ts` | medical leave and vacation variants | `evtAfastTemp.xsd` | Discriminated DTO for leave/vacation. |
| S-2240 | `builders/s2240.builder.ts` | noise start/change/end variants | `evtExpRisco.xsd` | Operation field controls start/change/end. |
| S-2298 | `s2298/s2298.builder.ts` | no copied standalone golden | `evtReintegr.xsd` | Generate and copy a golden before deleting lifted source. |
| S-2299 | `builders/s2299.builder.ts` | with-notice and without-notice variants | `evtDeslig.xsd` | DTO carries termination components instead of payroll reads. |
| S-2300 | `builders/s2300.builder.ts` | estagiario/autonomo/conselheiro variants | `evtTSVInicio.xsd` | Discriminated TS-V category DTO. |
| S-2306 | `s2306/s2306.builder.ts` | no copied standalone golden | `evtTSVAltContr.xsd` | Generate and copy a golden before deleting lifted source. |
| S-2399 | `builders/s2399.builder.ts` | estagiario/autonomo/conselheiro variants | `evtTSVTermino.xsd` | DTO carries accepted S-2300/S-2306 context where needed. |

## Required Work

1. Replace all SGP table reads with explicit DTO fields.
2. Add DTO validators for variant discriminators and required receipt fields.
3. Promote builders and dispatch entries.
4. Add golden and metadata tests for every listed variant.
5. Add invalid-DTO tests for missing prior receipts, missing worker identity, and
   incompatible variant payloads.
6. Extend integration tests with at least one happy path per event and one
   representative variant for S-2210, S-2220, S-2230, S-2240, S-2299, S-2300,
   and S-2399.

## Exit Criteria

- No active code imports or reads `hr.*`, `payroll.*`, `saude.*`, or
  `public.esocial_event`.
- S-2298 and S-2306 have committed golden XML fixtures.
