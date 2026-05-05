# R1-01 — Remaining Table Events

## Scope

Promote S-1005, S-1020, S-1030, S-1040, S-1050, S-1060, and S-1070 into the
active Round 0 builder path.

## Primary Write Scope

- `packages/contracts/src/dtos/`
- `packages/contracts/src/schema-generation/write-schemas.mjs`
- `packages/contracts/examples/v1/requests/`
- `packages/contracts/schemas/v1/`
- `packages/domain/src/builders/s1005/`
- `packages/domain/src/builders/s1020/`
- `packages/domain/src/builders/s1030/`
- `packages/domain/src/builders/s1040/`
- `packages/domain/src/builders/s1050/`
- `packages/domain/src/builders/s1060/`
- `packages/domain/src/builders/s1070/`
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/`
- `tests/integration/soap-submission-pipeline.test.mjs`
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do Not Touch

- Runtime code outside the table builder/dispatcher path.
- Round 0 evidence files.
- Migrations.

## Family Checklist

| Event | Source evidence | Golden | XSD | Required DTO replacement for SGP reads |
| --- | --- | --- | --- | --- |
| S-1005 | `sgp-lifted/esocial-worker/builders/s1005.builder.ts` and old `xml/builders/tables` logic | `s1005.golden.xml` | `evtTabEstab.xsd` | Branch/workplace registration, employer registration, CNAE, validity. |
| S-1020 | `sgp-lifted/esocial-worker/builders/s1020.builder.ts` and old `xml/builders/tables` logic | `s1020.golden.xml` | `evtTabLotacao.xsd` | Lotation code/type, FPAS/third-party codes, employer registration, establishment reference. |
| S-1030 | `sgp-lifted/esocial-worker/builders/s1030.builder.ts` | `s1030.golden.xml` | missing `evtTabCargo.xsd` | Job position code/name/CBO, career/reference structure fields. |
| S-1040 | `sgp-lifted/esocial-worker/builders/s1040.builder.ts` | `s1040.golden.xml` | missing `evtTabFuncao.xsd` | Function code/name/CBO, employer registration. |
| S-1050 | `sgp-lifted/esocial-worker/builders/s1050.builder.ts` and old `xml/builders/tables` logic | `s1050.golden.xml` | `evtTabJornada.xsd` | Work schedule code/description/daily hours, employer registration. |
| S-1060 | `sgp-lifted/esocial-worker/builders/s1060.builder.ts` | `s1060.golden.xml` | legacy `evtTabAmbiente/v02_05_00`, no current XSD | Decide whether to retire as legacy or bind current reference before promotion. |
| S-1070 | `sgp-lifted/esocial-worker/builders/s1070.builder.ts` and old `xml/builders/tables` logic | `s1070.golden.xml` | `evtTabProcesso.xsd` | Process number/type/subject, employer registration, matter indicators. |

## Required Work

1. Replace `Round1Pending` stubs with concrete DTOs and validators.
2. Generate schemas/examples for all seven table events.
3. Add active per-family builders under `packages/domain/src/builders/`.
4. Wire each builder into `SUBMISSION_DISPATCHERS`.
5. Add golden XML tests, metadata tests, and invalid-DTO tests.
6. Extend the SOAP submission integration test to include every promoted family.
7. Remove or quarantine corresponding lifted builder files after active tests
   prove parity.

## Exit Criteria

- `npm run build`, `npm run lint`, `npm test`, and `npm run test:integration`
  pass.
- S-1030/S-1040/S-1060 are either promoted with valid XSD bindings or explicitly
  deferred with owner/date/reason in `docs/work/round-1/plan.md`.
