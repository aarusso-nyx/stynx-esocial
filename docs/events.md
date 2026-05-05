# Lifted eSocial Events

The lifted implementation lives under
`packages/domain/src/sgp-lifted/esocial-worker/`. Golden XML examples are copied
under `docs/templates/golden/` so operators and reviewers can inspect concrete
payload shape without walking source fixtures.

## Table Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-1000 | Employer/contributor information | `builders/s1000.builder.ts` | `templates/golden/builders/s1000.golden.xml` |
| S-1005 | Establishment/workplace table | `builders/s1005.builder.ts` | `templates/golden/builders/s1005.golden.xml` |
| S-1010 | Rubric table | `builders/s1010.builder.ts` | `templates/golden/builders/s1010.golden.xml` |
| S-1020 | Tax lotation table | `builders/s1020.builder.ts` | `templates/golden/builders/s1020.golden.xml` |
| S-1030 | Job/cargo table | `builders/s1030.builder.ts` | `templates/golden/builders/s1030.golden.xml` |
| S-1040 | Function table | `builders/s1040.builder.ts` | `templates/golden/builders/s1040.golden.xml` |
| S-1050 | Work schedule table | `builders/s1050.builder.ts` | `templates/golden/builders/s1050.golden.xml` |
| S-1060 | Work environment table | `builders/s1060.builder.ts` | `templates/golden/builders/s1060.golden.xml` |
| S-1070 | Administrative/judicial process table | `builders/s1070.builder.ts` | `templates/golden/builders/s1070.golden.xml` |

## Periodic Payroll Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-1200 | Worker remuneration | `builders/s1200.builder.ts` | `templates/golden/builders/s1200-three-workers.golden.xml` |
| S-1202 | RPPS remuneration | `builders/s1202.builder.ts` | `templates/golden/builders/s1202-rpps-workers.golden.xml` |
| S-1207 | RPPS benefit payment | `builders/s1207.builder.ts` | `templates/golden/builders/s1207-rpps-benefit.golden.xml` |
| S-1210 | Labor income payment | `builders/s1210.builder.ts` | `templates/golden/builders/s1210-confirmed-payments.golden.xml` |
| S-1298 | Reopening periodic events | `builders/s1298.builder.ts` | `templates/golden/builders/s1298.golden.xml` |
| S-1299 | Periodic closure | `builders/s1299.builder.ts` | `templates/golden/builders/s1299.golden.xml` |

## Non-Periodic Labor, SST, and TS-V Events

| Event | Purpose | Lifted implementation | XML example |
| --- | --- | --- | --- |
| S-2200 | Worker admission/initial registration | `builders/s2200.builder.ts` | `templates/golden/builders/s2200.golden.xml` |
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
| S-5001 | Social-security contribution totalizer | `parsers/s5001-totalizer.parser.ts` | `templates/golden/returns/s5001-totalizer.golden.xml` |
| S-5002 | IRRF totalizer | `parsers/s5002-totalizer.parser.ts` | `templates/golden/returns/s5002-totalizer.golden.xml` |
| S-5011 | Employer contribution totalizer | `parsers/s5011-totalizer.parser.ts` | `templates/golden/returns/s5011-totalizer.golden.xml` |
| S-5012 | IRRF consolidation totalizer | `parsers/s5012-totalizer.parser.ts` | `templates/golden/returns/s5012-totalizer.golden.xml` |
| S-5013 | FGTS totalizer | `parsers/s5013-totalizer.parser.ts` | `templates/golden/returns/s5013-totalizer.golden.xml` |

## Template Custody

Builder XML examples are copied from
`packages/domain/src/sgp-lifted/esocial-worker/builders/__fixtures__/`.
Return XML examples are copied from
`packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/`.
They should be changed only with intentional contract updates and matching tests.
