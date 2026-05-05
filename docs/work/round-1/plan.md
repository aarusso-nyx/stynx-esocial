# Round 1 Builder Promotion Plan

Round 0 proved the runtime on S-1000, S-1010, S-1200, S-1299, S-2200, and all
S-50xx returns. Round 1 promotes the remaining non-return families without
changing architecture: SGP sends DTOs only; eSocial builds XML, validates XSD,
signs, submits through the deterministic SOAP stub, parses returns, persists
status/audit evidence, and publishes bus updates.

## Current Baseline

- Active dispatcher: `packages/domain/src/submission/submission-dispatcher.ts`.
  It wires only the five Round 0 builders; all other event classes currently use
  `dispatchBuildingPlaceholder()`.
- Active Round 0 builders:
  `packages/domain/src/builders/{s1000,s1010,s1200,s1299,s2200}/builder.ts`.
- Older active-ish evidence builders:
  `packages/domain/src/xml/builders/tables/index.ts` and
  `packages/domain/src/xml/builders/periodic/index.ts`. Round 1 should either
  promote their logic into the `packages/domain/src/builders/<event>/builder.ts`
  pattern or retire them after equivalent per-family builders exist.
- Lifted migration evidence:
  `packages/domain/src/sgp-lifted/esocial-worker/` and `tests/sgp-lifted/`.
  These files are not product code.
- Contract gap: `packages/contracts/src/dtos/round1-pending.ts` still marks every
  non-Round-0 event as `round1Pending: true`.

## Closure Target

Round 1 is done when CI proves:

1. Every non-return event class except the five Round 0 families has a concrete
   v1 DTO and no longer uses `EsocialRound1PendingDto`.
2. `SUBMISSION_DISPATCHERS` routes every non-return class to an active builder.
3. Every promoted family has:
   - DTO validator and JSON Schema/example updates.
   - Active builder in `packages/domain/src/builders/<event>/builder.ts`.
   - Golden XML fixture under `docs/templates/golden/builders/`.
   - Golden test, metadata test, invalid-DTO test, and integration test.
   - XSD binding through the active validator.
4. `npm run test:integration` round-trips at least one DTO per promoted family
   through build, XSD, sign, SOAP stub, persistence, and status publication.
5. `packages/domain/src/sgp-lifted/` is empty or contains only a documented
   evidence subset with a file-by-file reason.
6. `tests/sgp-lifted/` is removed after all useful parity fixtures are promoted.

## Per-Family Inventory

Direct SGP reads are from lifted source only. Round 1 must replace each listed
schema/table dependency with explicit DTO fields and opaque source ids.

| Event | Lifted builder | Direct SGP reads in lifted source | Golden fixtures | XSD binding | Dependencies / notes |
| --- | --- | --- | --- | --- | --- |
| S-1005 | `sgp-lifted/esocial-worker/builders/s1005.builder.ts` | `hr.branch`, `hr.company` | `s1005.golden.xml` | `evtTabEstab.xsd` | Requires S-1000 employer. Promote from old `xml/builders/tables` or lifted builder into per-family builder. |
| S-1020 | `sgp-lifted/esocial-worker/builders/s1020.builder.ts` | `hr.branch`, `hr.company`, `hr.work_location` | `s1020.golden.xml` | `evtTabLotacao.xsd` | Requires S-1000; often references establishment/workplace from S-1005. |
| S-1030 | `sgp-lifted/esocial-worker/builders/s1030.builder.ts` | `hr.company`, `hr.job_position`, `hr.job_structure_reference_link`, `hr.reference_catalog_entry` | `s1030.golden.xml` | missing `evtTabCargo.xsd` in current bundle | Needs XSD reference decision before integration can be green. |
| S-1040 | `sgp-lifted/esocial-worker/builders/s1040.builder.ts` | `hr.company`, `hr.job_function` | `s1040.golden.xml` | missing `evtTabFuncao.xsd` in current bundle | Needs XSD reference decision before integration can be green. |
| S-1050 | `sgp-lifted/esocial-worker/builders/s1050.builder.ts` | `hr.company`, `hr.shift` | `s1050.golden.xml` | `evtTabJornada.xsd` | Requires S-1000. |
| S-1060 | `sgp-lifted/esocial-worker/builders/s1060.builder.ts` | `hr.branch`, `hr.company`, `hr.work_location` | `s1060.golden.xml` | missing current `evtTabAmbiente.xsd`; golden uses legacy `v02_05_00` | Treat as special legacy compatibility item; either bind current leiaute or mark retired with evidence. |
| S-1070 | `sgp-lifted/esocial-worker/builders/s1070.builder.ts` | `hr.administrative_process`, `hr.company` | `s1070.golden.xml` | `evtTabProcesso.xsd` | Requires S-1000. |
| S-1202 | `sgp-lifted/esocial-worker/builders/s1202.builder.ts` | `hr.company`, `hr.employee`, `hr.employment_link`, `payroll.employee_payroll_item`, `payroll.payroll_earning_deduction`, `payroll.payroll_run` | `s1202-rpps-workers.golden.xml` | `evtRmnRPPS.xsd` | Requires S-1000, S-1005, S-1010. |
| S-1207 | `sgp-lifted/esocial-worker/builders/s1207.builder.ts` | `hr.company`, `hr.employee`, `hr.pension_grant`, `hr.retirement_grant`, `payroll.employee_payroll_item`, `payroll.payroll_earning_deduction`, `payroll.payroll_run` | `s1207-rpps-benefit.golden.xml` | `evtBenPrRP.xsd` | Requires S-1000, S-1010, and S-2410 benefit start data. |
| S-1210 | `sgp-lifted/esocial-worker/builders/s1210.builder.ts` | `hr.company`, `hr.employee`, `payroll.payment_remittance_detail`, `payroll.payment_remittance_file` | `s1210-confirmed-payments.golden.xml` | `evtPgtos.xsd` | Receipt/data dependency on S-1200, S-1202, S-1207 payment bases. |
| S-1298 | `sgp-lifted/esocial-worker/builders/s1298.builder.ts` | `hr.company` | `s1298.golden.xml` | `evtReabreEvPer.xsd` | Requires accepted S-1299 receipt. |
| S-2205 | `sgp-lifted/esocial-worker/builders/s2205.builder.ts` | `hr.company`, `hr.employee`, `hr.employee_dependent` | `s2205.golden.xml` | `evtAltCadastral.xsd` | Requires prior S-2200 worker registration. |
| S-2206 | `sgp-lifted/esocial-worker/builders/s2206.builder.ts` | `hr.branch`, `hr.company`, `hr.employee`, `hr.employment_contract`, `hr.employment_link`, `hr.job_function`, `hr.job_position`, `hr.work_location` | `s2206-promotion.golden.xml` | `evtAltContratual.xsd` | Requires S-2200 plus table dependencies S-1005, S-1020, S-1030, S-1040, S-1050. |
| S-2210 | `sgp-lifted/esocial-worker/builders/s2210.builder.ts` | `hr.company`, `hr.employee`, `hr.work_location`, `public.esocial_event`, `saude.cat_emission`, `saude.cat_kind`, `saude.work_accident` | `s2210-inicial.golden.xml`, `s2210-obito.golden.xml`, `s2210-reabertura.golden.xml` | `evtCAT.xsd` | Must remove `public.esocial_event` receipt lookup/update; DTO carries prior receipt/reference. |
| S-2220 | `sgp-lifted/esocial-worker/builders/s2220.builder.ts` | `hr.company`, `hr.employee`, `hr.work_location`, `saude.aso_exam_item`, `saude.aso_record`, `saude.aso_status`, `saude.medical_exam` | `s2220-admissional.golden.xml`, `s2220-demissional.golden.xml`, `s2220-periodico.golden.xml`, `s2220-retorno-trabalho.golden.xml` | `evtMonit.xsd` | SST health-monitoring DTO must carry exam details and sequence semantics. |
| S-2230 | `sgp-lifted/esocial-worker/builders/s2230.builder.ts` | `hr.absence_reason`, `hr.company`, `hr.employee`, `hr.leave_record`, `hr.vacation_record` | `s2230-medical-leave.golden.xml`, `s2230-vacation.golden.xml` | `evtAfastTemp.xsd` | Leave/vacation variants need explicit discriminated DTO. |
| S-2240 | `sgp-lifted/esocial-worker/builders/s2240.builder.ts` | `hr.company`, `hr.employee`, `hr.work_location`, `saude.environmental_exposure`, `saude.epi_delivery`, `saude.epi_inventory`, `saude.risk_management_program` | `s2240-noise-start.golden.xml`, `s2240-noise-change.golden.xml`, `s2240-noise-end.golden.xml` | `evtExpRisco.xsd` | Exposure start/change/end variants need explicit operation field. |
| S-2298 | `sgp-lifted/esocial-worker/s2298/s2298.builder.ts` | `hr.branch`, `hr.company`, `hr.employee`, `hr.employment_link`, `hr.reintegration_order`, `public.esocial_event` | no copied standalone golden; lifted builder spec exists | `evtReintegr.xsd` | Should get a new golden copied from builder output before promotion. |
| S-2299 | `sgp-lifted/esocial-worker/builders/s2299.builder.ts` | `hr.branch`, `hr.company`, `hr.employee`, `hr.employment_link`, `hr.termination_reason`, `hr.work_location`, `payroll.payroll_run`, `payroll.v_termination_components` | `s2299-with-notice.golden.xml`, `s2299-without-notice.golden.xml` | `evtDeslig.xsd` | Termination needs remuneration/FGTS component DTO, not payroll reads. |
| S-2300 | `sgp-lifted/esocial-worker/builders/s2300.builder.ts` | `hr.branch`, `hr.company`, `hr.employee`, `hr.employee_dependent`, `hr.employment_link`, `hr.tsv_contract`, `hr.work_location` | `s2300-estagiario.golden.xml`, `s2300-autonomo.golden.xml`, `s2300-conselheiro.golden.xml` | `evtTSVInicio.xsd` | TS-V category variants should be a discriminated DTO. |
| S-2306 | `sgp-lifted/esocial-worker/s2306/s2306.builder.ts` | `hr.company`, `hr.employee`, `hr.employment_link`, `hr.tsv_contract`, `hr.tsv_contract_change` | no copied standalone golden; lifted builder spec exists | `evtTSVAltContr.xsd` | Needs new golden copied from builder output before promotion. |
| S-2399 | `sgp-lifted/esocial-worker/builders/s2399.builder.ts` | `hr.company`, `hr.employee`, `hr.employment_link`, `hr.tsv_contract` | `s2399-estagiario.golden.xml`, `s2399-autonomo.golden.xml`, `s2399-conselheiro.golden.xml` | `evtTSVTermino.xsd` | Requires accepted S-2300/S-2306 context when applicable. |
| S-2400 | `sgp-lifted/esocial-worker/builders/s2400.builder.ts` | `hr.company`, `hr.employee`, `hr.employee_dependent`, `hr.retirement_grant` | `s2400.golden.xml` | `evtCdBenefIn.xsd` | Benefit beneficiary registration; dependency for S-2405/S-2410. |
| S-2405 | `sgp-lifted/esocial-worker/builders/s2405.builder.ts` | `hr.company`, `hr.employee`, `hr.recertification_beneficiary`, `hr.recertification_record`, `hr.retirement_grant` | `s2405.golden.xml` | `evtCdBenefAlt.xsd` | Requires prior S-2400. |
| S-2410 | `sgp-lifted/esocial-worker/builders/s2410.builder.ts` | `hr.company`, `hr.employee`, `hr.pension_grant`, `hr.retirement_grant`, `hr.retirement_rule` | `s2410-retirement.golden.xml`, `s2410-pension.golden.xml` | `evtCdBenIn.xsd` | Dependency for S-1207 and benefit lifecycle events. |
| S-2416 | `sgp-lifted/esocial-worker/builders/s2416.builder.ts` | `hr.company`, `hr.employee`, `hr.pension_grant` | `s2416-pension-founder.golden.xml` | `evtCdBenAlt.xsd` | Requires prior S-2410. |
| S-2418 | `sgp-lifted/esocial-worker/builders/s2418.builder.ts` | `hr.company`, `hr.employee`, `hr.pension_grant`, `hr.retirement_grant` | `s2418-retirement.golden.xml`, `s2418-pension.golden.xml` | `evtReativBen.xsd` | Requires prior terminated/suspended benefit state. |
| S-2420 | `sgp-lifted/esocial-worker/builders/s2420.builder.ts` | `hr.company`, `hr.pension_grant` | `s2420-pension.golden.xml` | `evtCdBenTerm.xsd` | Requires prior S-2410 and optionally S-2416/S-2418 state. |
| S-2501 | `sgp-lifted/esocial-worker/builders/s2501.builder.ts` | none in lifted builder | `s2501.golden.xml` | `evtContProc.xsd` | Unusual process-tax event; keep its own checklist inside Batch 4. |
| S-3000 | `sgp-lifted/esocial-worker/builders/s3000.builder.ts` | `hr.company`, `hr.employee`, `public.esocial_event` | `s3000.golden.xml` | `evtExclusao.xsd` | Unusual exclusion semantics; DTO must carry original event class, receipt, and reason. |

## Batch Plan

| Batch | Families | Parallelization notes |
| --- | --- | --- |
| 1. Tables | S-1005, S-1020, S-1030, S-1040, S-1050, S-1060, S-1070 | S-1030, S-1040, S-1060 are blocked on XSD/leiaute decisions; the other four can promote immediately. |
| 2. Periodic | S-1202, S-1207, S-1210, S-1298 | Run after Batch 1 table dependencies are ready. S-1207 also depends on S-2410 DTO shape. |
| 3. Worker/SST/TSV | S-2205, S-2206, S-2210, S-2220, S-2230, S-2240, S-2298, S-2299, S-2300, S-2306, S-2399 | Split worker/SST and TS-V workers if needed. S-2298 and S-2306 need new copied goldens. |
| 4. Benefits/process/exclusion | S-2400, S-2405, S-2410, S-2416, S-2418, S-2420, S-2501, S-3000 | S-3000 and S-2501 have unusual semantics and must get extra integration cases. |
| 5. Cleanup/evidence | Lifted tree, docs, CI evidence | Runs only after Batches 1-4 are green. |

## Required Prompt Outputs

Each batch prompt must produce:

- Contract DTO updates and generated schemas/examples.
- Active builders and exports.
- Dispatcher wiring.
- Golden, metadata, invalid-DTO, and integration tests.
- Updates to `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`,
  and release evidence.
- Removal or explicit quarantine of corresponding lifted source.

## Round 2 Entry

Round 2 starts only after Round 1 closes. Its scope is real eSocial
qualification/restricted-production connectivity, real certificate provisioning
and rotation drills, real endpoint allowlists, and operator-authorized evidence
capture. It is not part of Round 1.
