# Lifted eSocial Events

The lifted implementation lives under
`packages/domain/src/sgp-lifted/esocial-worker/`. Golden XML examples are copied
under `docs/templates/golden/` so operators and reviewers can inspect concrete
payload shape without walking source fixtures.

## Table Events

Round 0 Wave B active builders live in `packages/domain/src/builders/<event>/`.
They consume A3 DTOs from `@esocial/contracts`, produce unsigned XML for the
signing/XSD/SOAP workers, and do not import or query SGP code. Earlier
`xml/builders/*` entries remain compatibility evidence until B1 switches the
dispatcher to the Round 0 entrypoints.

Promoted table builders live in
`packages/domain/src/xml/builders/tables/index.ts`. They accept normalized DTOs
from the bus and never read SGP databases, SGP schemas, or SGP modules. The
lifted `sgp-lifted` builder files remain migration evidence only when the
family has not yet been promoted.

| Event | Purpose | Production implementation | Status | XML example |
| --- | --- | --- | --- | --- |
| S-1000 | Employer/contributor information | `builders/s1000/builder.ts` | Promoted in Round 0 Wave B | `templates/golden/builders/s1000.golden.xml` |
| S-1005 | Establishment/workplace table | `xml/builders/tables` | Promoted in Phase 5 | `templates/golden/builders/s1005.golden.xml` |
| S-1010 | Rubric table | `builders/s1010/builder.ts` | Promoted in Round 0 Wave B | `templates/golden/builders/s1010.golden.xml` |
| S-1020 | Tax lotation table | `xml/builders/tables` | Promoted in Phase 5 | `templates/golden/builders/s1020.golden.xml` |
| S-1030 | Job/cargo table | `builders/s1030.builder.ts` | Deferred: lifted golden exists, but no active XSD binding is present in `packages/domain/src/sgp-lifted/esocial-worker/xsd/` | `templates/golden/builders/s1030.golden.xml` |
| S-1040 | Function table | `builders/s1040.builder.ts` | Deferred: lifted golden exists, but no active XSD binding is present in `packages/domain/src/sgp-lifted/esocial-worker/xsd/` | `templates/golden/builders/s1040.golden.xml` |
| S-1050 | Work schedule table | `xml/builders/tables` | Promoted in Phase 5 | `templates/golden/builders/s1050.golden.xml` |
| S-1060 | Work environment table | `builders/s1060.builder.ts` | Deferred: lifted golden uses legacy `evtTabAmbiente/v02_05_00`, and no active XSD binding is present in the current bundle | `templates/golden/builders/s1060.golden.xml` |
| S-1070 | Administrative/judicial process table | `xml/builders/tables` | Promoted in Phase 5 | `templates/golden/builders/s1070.golden.xml` |

### Promoted Table DTOs

Common DTO fields for every promoted table event:

| Field | Required | Meaning |
| --- | --- | --- |
| `eventClass` | Yes | One of `S-1000`, `S-1005`, `S-1010`, `S-1020`, `S-1050`, or `S-1070`. |
| `tenantId` | Yes | Opaque eSocial tenant identifier from the ingress contract. |
| `sourceEntityId` | Yes | Opaque SGP source entity id. The eSocial service does not dereference it. |
| `sourceEventId` | No | Opaque producer event id used for traceability when present. |
| `competence` | Yes | Table validity start in `YYYY-MM` format. |
| `operation` | No | Currently `inclusao`; alteration/exclusion DTOs are a follow-up contract decision. |
| `environment` | No | eSocial environment code; defaults to `2` for qualification/sandbox. |
| `processEmitter` | No | eSocial `procEmi`; defaults to `1`. |
| `processVersion` | No | eSocial `verProc`; defaults to the lifted golden value `SGP-0.0.1` until Phase 10 product-version finalization. |
| `eventId` | No | Optional precomputed eSocial `Id`; otherwise derived deterministically from `eventClass`, `tenantId`, and `sourceEntityId`. |

Event-specific DTO fields:

| Event | DTO branch | Required event-specific fields |
| --- | --- | --- |
| S-1000 | `employer` | `registrationNumber`; optional `classTrib`, `cooperativeIndicator`, `constructionIndicator`, `payrollExemptionIndicator`, `electronicRecordOption`. |
| S-1005 | `establishment` | `registrationNumber`, `employerRegistrationNumber`; optional `cnaePreponderante`. |
| S-1010 | `rubric` | `code`, `description`, `type`, `employerRegistrationNumber`; optional `tableId`, `natureCode`, `incidences`, `remunerationCeiling`. |
| S-1020 | `taxLotation` | `code`, `employerRegistrationNumber`; optional `typeCode`, `fpasCode`, `thirdPartyCode`. |
| S-1050 | `workSchedule` | `code`, `description`, `dailyHours`, `employerRegistrationNumber`. |
| S-1070 | `process` | `processNumber`, `subject`, `employerRegistrationNumber`; optional `processType`, `matterIndicator`. |

### Promoted Table Metadata

| Event | Root | Event element | Namespace | XSD binding | Table dependencies |
| --- | --- | --- | --- | --- | --- |
| S-1000 | `eSocial` | `evtInfoEmpregador` | `http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtInfoEmpregador.xsd` | None |
| S-1005 | `eSocial` | `evtTabEstab` | `http://www.esocial.gov.br/schema/evt/evtTabEstab/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabEstab.xsd` | S-1000 |
| S-1010 | `eSocial` | `evtTabRubrica` | `http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabRubrica.xsd` | S-1000 |
| S-1020 | `eSocial` | `evtTabLotacao` | `http://www.esocial.gov.br/schema/evt/evtTabLotacao/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabLotacao.xsd` | S-1000 |
| S-1050 | `eSocial` | `evtTabJornada` | `http://www.esocial.gov.br/schema/evt/evtTabJornada/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabJornada.xsd` | S-1000 |
| S-1070 | `eSocial` | `evtTabProcesso` | `http://www.esocial.gov.br/schema/evt/evtTabProcesso/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabProcesso.xsd` | S-1000 |

## Periodic Payroll Events

Promoted periodic builders live in
`packages/domain/src/xml/builders/periodic/index.ts`. They accept normalized
DTOs from the bus, use SGP ids only as opaque source identifiers, and do not
read payroll, HR, eSocial state, or SGP database tables.

| Event | Purpose | Production implementation | Status | XML example |
| --- | --- | --- | --- | --- |
| S-1200 | Worker remuneration | `builders/s1200/builder.ts` | Promoted in Round 0 Wave B | `templates/golden/builders/s1200-three-workers.golden.xml` |
| S-1202 | RPPS remuneration | `xml/builders/periodic` | Promoted in Phase 5 | `templates/golden/builders/s1202-rpps-workers.golden.xml` |
| S-1207 | RPPS benefit payment | `xml/builders/periodic` | Promoted in Phase 5 | `templates/golden/builders/s1207-rpps-benefit.golden.xml` |
| S-1210 | Labor income payment | `xml/builders/periodic` | Promoted in Phase 5 | `templates/golden/builders/s1210-confirmed-payments.golden.xml` |
| S-1298 | Reopening periodic events | `xml/builders/periodic` | Promoted in Phase 5 | `templates/golden/builders/s1298.golden.xml` |
| S-1299 | Periodic closure | `builders/s1299/builder.ts` | Promoted in Round 0 Wave B | `templates/golden/builders/s1299.golden.xml` |

No preferred periodic payroll event is deferred in this batch.

### Promoted Periodic DTOs

Common DTO fields for every promoted periodic event:

| Field | Required | Meaning |
| --- | --- | --- |
| `eventClass` | Yes | One of `S-1200`, `S-1202`, `S-1207`, `S-1210`, `S-1298`, or `S-1299`. |
| `tenantId` | Yes | Opaque eSocial tenant identifier from the ingress contract. |
| `sourceEventId` | No | Opaque producer event id used for traceability when present. |
| `competence` | Yes | Monthly apuracao period in `YYYY-MM` format. |
| `employerRegistrationNumber` | Yes | Employer registration number used to fill `ideEmpregador`; the builder does not resolve it. |
| `operation` | No | Currently `original`; rectification/exclusion DTOs remain separate contract work. |
| `environment` | No | eSocial environment code; defaults to `2` for qualification/sandbox. |
| `processEmitter` | No | eSocial `procEmi`; defaults to `1`. |
| `processVersion` | No | eSocial `verProc`; defaults to the lifted golden value `SGP-0.0.1` until Phase 10 product-version finalization. |

Event-specific DTO fields:

| Event | DTO branch | Required event-specific fields |
| --- | --- | --- |
| S-1200 | `workers[]` | `payrollRunId`, `payrollRunStatus=GENERATED`; each worker carries `employeeId`, `registration`, `cpf`, `categoryCode`, and `rubrics[]` with `code`, `kind`, and `amount`; optional `tableCode`, `quantity`, `establishmentRegistrationNumber`, `lotationCode`, `ideDmDev`, `eventId`. |
| S-1202 | `workers[]` | `payrollRunId`, `payrollRunStatus=GENERATED`; each RPPS worker carries `employeeId`, `registration`, `cpf`, `categoryCode`, and `rubrics[]`; optional `tableCode`, `quantity`, `establishmentRegistrationNumber`, `ideDmDev`, `eventId`. |
| S-1207 | `benefits[]` | `payrollRunId`, `payrollRunStatus=GENERATED`; each benefit carries `employeeId`, `beneficiaryCpf`, `benefitSourceKind`, `benefitSourceId`, `benefitNumber`, `activeBenefitCount=1`, and `rubrics[]`; optional `establishmentRegistrationNumber`, `ideDmDev`, `eventId`. |
| S-1210 | `payments[]` | `paymentBatchId`, `paymentBatchStatus=PAID`, `confirmedTotal`; each payment carries `employeeId`, `cpf`, `amount`, and `paymentDate`; optional `payrollRunId`, `ideDmDev`, `eventId`. |
| S-1298 | Reopening closure evidence | `acceptedClosureReceipt`, `acceptedClosureAt`; optional `sourceEntityId`, `eventId`. The builder fails before XML if the accepted S-1299 receipt is absent. |
| S-1299 | Closure acceptance summary | `pendingPeriodicEvents[]`, `acceptedEventCounts.remuneration`, `acceptedEventCounts.payments`; `pendingPeriodicEvents` must be empty before XML is built; optional `sourceEntityId`, `eventId`. |

### Promoted Periodic Metadata

| Event | Root | Event element | Namespace | XSD binding | Table dependencies | Receipt dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| S-1200 | `eSocial` | `evtRemun` | `http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtRemun.xsd` | S-1000, S-1005, S-1010, S-1020 | None |
| S-1202 | `eSocial` | `evtRmnRPPS` | `http://www.esocial.gov.br/schema/evt/evtRmnRPPS/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtRmnRPPS.xsd` | S-1000, S-1005, S-1010 | None |
| S-1207 | `eSocial` | `evtBenPrRP` | `http://www.esocial.gov.br/schema/evt/evtBenPrRP/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtBenPrRP.xsd` | S-1000, S-1010 | S-2410 |
| S-1210 | `eSocial` | `evtPgtos` | `http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtPgtos.xsd` | S-1000 | S-1200, S-1202, S-1207 |
| S-1298 | `eSocial` | `evtReabreEvPer` | `http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtReabreEvPer.xsd` | S-1000 | S-1299 |
| S-1299 | `eSocial` | `evtFechaEvPer` | `http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtFechaEvPer.xsd` | S-1000 | S-1200, S-1202, S-1207, S-1210 |

## Non-Periodic Labor, SST, and TS-V Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-2200 | Worker admission/initial registration | `builders/s2200/builder.ts` | `templates/golden/builders/s2200.golden.xml` |
| S-2205 | Worker cadastral change | `builders/s2205.builder.ts` | `templates/golden/builders/s2205.golden.xml` |
| S-2206 | Worker contract change | `builders/s2206.builder.ts` | `templates/golden/builders/s2206-promotion.golden.xml` |
| S-2210 | Work accident communication | `builders/s2210.builder.ts` | `templates/golden/builders/s2210-inicial.golden.xml` |
| S-2220 | Occupational health monitoring | `builders/s2220.builder.ts` | `templates/golden/builders/s2220-admissional.golden.xml` |
| S-2230 | Temporary leave/absence | `builders/s2230.builder.ts` | `templates/golden/builders/s2230-medical-leave.golden.xml` |
| S-2240 | Workplace risk exposure | `builders/s2240.builder.ts` | `templates/golden/builders/s2240-noise-start.golden.xml` |
| S-2298 | Reintegration | `s2298/s2298.builder.ts` | See builder tests; no standalone golden copied in this lift snapshot. |
| S-2299 | Termination | `builders/s2299.builder.ts` | `templates/golden/builders/s2299-with-notice.golden.xml` |
| S-2300 | TS-V start | `builders/s2300.builder.ts` | `templates/golden/builders/s2300-estagiario.golden.xml` |
| S-2306 | TS-V contract change | `s2306/s2306.builder.ts` | See builder tests; no standalone golden copied in this lift snapshot. |
| S-2399 | TS-V termination | `builders/s2399.builder.ts` | `templates/golden/builders/s2399-estagiario.golden.xml` |

Additional golden variants are retained for S-2210 reopening/death, S-2220 exam
types, S-2230 vacation, S-2240 start/change/end, S-2299 notice variants, S-2300
category variants, and S-2399 category variants.

### Round 0 Wave B DTO and Metadata References

The Round 0 active builders use the A3 DTO names below. They intentionally keep
SGP identifiers opaque and produce unsigned XML; XSD validation, signing, SOAP
submission, and status persistence are owned by the adjacent Wave B workers.

| Event | DTO type | Active builder | Event element | XSD binding | Dependencies |
| --- | --- | --- | --- | --- | --- |
| S-1000 | `S1000EmployerInfoDto` | `packages/domain/src/builders/s1000/builder.ts` | `evtInfoEmpregador` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtInfoEmpregador.xsd` | None |
| S-1010 | `S1010RubricDto` | `packages/domain/src/builders/s1010/builder.ts` | `evtTabRubrica` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabRubrica.xsd` | S-1000 |
| S-1200 | `S1200RemunerationDto` | `packages/domain/src/builders/s1200/builder.ts` | `evtRemun` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtRemun.xsd` | S-1000, S-1005, S-1010, S-1020 |
| S-1299 | `S1299ClosureDto` | `packages/domain/src/builders/s1299/builder.ts` | `evtFechaEvPer` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtFechaEvPer.xsd` | S-1000; receipts from S-1200, S-1202, S-1207, S-1210 |
| S-2200 | `S2200AdmissionDto` | `packages/domain/src/builders/s2200/builder.ts` | `evtAdmissao` | `packages/domain/src/sgp-lifted/esocial-worker/xsd/evtAdmissao.xsd` | S-1000, S-1030, S-1050 |

Known A3 DTO follow-ups for S-2200: the DTO lacks explicit address/contact,
sex, marital status, education level, nationality, worker dependents'
`depIRRF`, and cargo-name fields. The active builder currently uses deterministic
Round 0 defaults where the fixture needs those XML nodes; A3 should widen the
contract before real SGP cutover.

## Public-Benefit and RPPS Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-2400 | Benefit beneficiary registration | `builders/s2400.builder.ts` | `templates/golden/builders/s2400.golden.xml` |
| S-2405 | Beneficiary cadastral change | `builders/s2405.builder.ts` | `templates/golden/builders/s2405.golden.xml` |
| S-2410 | Benefit start | `builders/s2410.builder.ts` | `templates/golden/builders/s2410-retirement.golden.xml` |
| S-2416 | Benefit change | `builders/s2416.builder.ts` | `templates/golden/builders/s2416-pension-founder.golden.xml` |
| S-2418 | Benefit reactivation | `builders/s2418.builder.ts` | `templates/golden/builders/s2418-retirement.golden.xml` |
| S-2420 | Benefit termination | `builders/s2420.builder.ts` | `templates/golden/builders/s2420-pension.golden.xml` |

## Process, Exclusion, and Return Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-2501 | Labor process tax information | `builders/s2501.builder.ts` | `templates/golden/builders/s2501.golden.xml` |
| S-3000 | Event exclusion | `builders/s3000.builder.ts` | `templates/golden/builders/s3000.golden.xml` |
| S-5001 | Social-security contribution totalizer | `packages/domain/src/returns/parsers.ts` | `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/s5001-totalizer.golden.xml` |
| S-5002 | IRRF totalizer | `packages/domain/src/returns/parsers.ts` | `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/s5002-totalizer.golden.xml` |
| S-5011 | Employer contribution totalizer | `packages/domain/src/returns/parsers.ts` | `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/s5011-totalizer.golden.xml` |
| S-5012 | IRRF consolidation totalizer | `packages/domain/src/returns/parsers.ts` | `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/s5012-totalizer.golden.xml` |
| S-5013 | FGTS totalizer | `packages/domain/src/returns/parsers.ts` | `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/s5013-totalizer.golden.xml` |

## Template Custody

Promoted table builder XML examples are canonicalized under
`docs/templates/golden/builders/` and covered by active tests in
`tests/golden/`.

Unpromoted builder XML examples are copied from
`packages/domain/src/sgp-lifted/esocial-worker/builders/__fixtures__/` until
their families move into active production builders.
Return XML examples are copied from
`packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/`.
They should be changed only with intentional contract updates and matching tests.
The S-50xx fixture set is exercised by `tests/returns/return-parser.test.mjs`;
status publication and PostgreSQL totalizer traceability are covered by
`tests/returns/return-processor.test.mjs` and
`tests/integration/return-postgres.test.mjs`.
