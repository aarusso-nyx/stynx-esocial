# R1-02 — Remaining Periodic Events

## Scope

Promote S-1202, S-1207, S-1210, and S-1298 into the active Round 0 pipeline.

## Primary Write Scope

- `packages/contracts/src/dtos/`
- `packages/contracts/src/schema-generation/write-schemas.mjs`
- `packages/domain/src/builders/s1202/`
- `packages/domain/src/builders/s1207/`
- `packages/domain/src/builders/s1210/`
- `packages/domain/src/builders/s1298/`
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/`
- `tests/integration/soap-submission-pipeline.test.mjs`
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do Not Touch

- Benefit lifecycle builders except to reference their DTO output contracts.
- Migrations unless a new forward-only evidence table is explicitly required.

## Family Checklist

| Event | Source evidence | Golden | XSD | Required DTO replacement for SGP reads |
| --- | --- | --- | --- | --- |
| S-1202 | `sgp-lifted/esocial-worker/builders/s1202.builder.ts` and old `xml/builders/periodic` logic | `s1202-rpps-workers.golden.xml` | `evtRmnRPPS.xsd` | RPPS worker remuneration lines, rubrics, employer, establishment, registration, payroll-run metadata. |
| S-1207 | `sgp-lifted/esocial-worker/builders/s1207.builder.ts` and old `xml/builders/periodic` logic | `s1207-rpps-benefit.golden.xml` | `evtBenPrRP.xsd` | Benefit remuneration lines, S-2410 benefit identifiers, rubrics, payroll-run metadata. |
| S-1210 | `sgp-lifted/esocial-worker/builders/s1210.builder.ts` and old `xml/builders/periodic` logic | `s1210-confirmed-payments.golden.xml` | `evtPgtos.xsd` | Payment batch details, beneficiary CPF, amount, payment date, linked demonstratives. |
| S-1298 | `sgp-lifted/esocial-worker/builders/s1298.builder.ts` and old `xml/builders/periodic` logic | `s1298.golden.xml` | `evtReabreEvPer.xsd` | Accepted S-1299 receipt, accepted-at timestamp, competence, employer registration. |

## Required Work

1. Replace `Round1Pending` stubs with concrete periodic DTOs.
2. Encode receipt dependencies explicitly in DTO fields; do not query eSocial or
   SGP tables from builders.
3. Promote builders from old `xml/builders/periodic` or lifted source into
   `packages/domain/src/builders/<event>/builder.ts`.
4. Wire dispatcher entries and integration tests.
5. Add invalid-DTO tests for missing receipt/payment/rubric/benefit fields.
6. Update docs and evidence artifacts.

## Exit Criteria

- `npm run test:integration` proves all four events pass build, XSD, signing,
  SOAP stub, persistence, and status publication.
- S-1207 states its dependency on S-2410 DTO data without waiting for a live SGP
  database lookup.
