# Backend Golden Fixtures

These fixtures pin deterministic regulatory and payroll output. Keep sample
identifiers fictitious, avoid secrets, and change expected files only when the
output contract intentionally changes.

## R3-016 Official Output Goldens

- `tce/state-payroll-v01/`: source-pending TCE-MG payroll adapter JSON. It
  intentionally keeps `sourceStatus=UNVERIFIED_LAYOUT` and
  `officialConformance=false`; do not promote it to an official regulatory
  layout without an owner-approved source.
- `transparency/public-payroll-v01/`: public payroll transparency JSON and CSV
  surface, including minimized fields only.
- `comprovante-anual-v01/`: annual income statement aggregate input and PDF/A
  expected output.

Regenerate these only for intentional contract changes:

```bash
SGP_UPDATE_R3_016_GOLDENS=1 npm --workspace backend exec jest -- \
  --config ../tests/backend/jest-unit.json \
  --runTestsByPath src/report-service/yearly-income/pdf-a-yearly.service.spec.ts

SGP_UPDATE_R3_016_GOLDENS=1 npm --workspace backend exec jest -- \
  --config ../tests/backend/jest-e2e.json \
  --runTestsByPath ../tests/backend/tce-golden.e2e-spec.ts ../tests/backend/transparency-public.e2e-spec.ts
```

Then rerun the same commands without `SGP_UPDATE_R3_016_GOLDENS=1` and include
the fixture diff in review.

## R4-14 SIAFIC Golden

- `siafic-v01/`: neutral SIAFIC payroll-accounting JSON contract for
  `EMPENHO`, `LIQUIDACAO`, and `PAGAMENTO`.

This fixture intentionally keeps `officialConformance=false`,
`productionHomologation=OUT_OF_SCOPE`, and
`layoutSelection=DEFERRED_OWNER_DECISION` because no owner-selected Decreto
11.453/2023 SIAFIC layout version is pinned in the SGP references.

Run it through the live dispatcher:

```bash
npm run test:e2e -- tests/backend/siafic-sync.e2e-spec.ts --runInBand
```

## R4-15 TCE RREO/RGF Goldens

- `tce/rreo-v01/{sp,mg}/`: LRF RREO neutral builder envelopes shaped for SP and
  MG target profiles.
- `tce/rgf-v01/{sp,mg}/`: LRF RGF neutral builder envelopes shaped for SP and
  MG target profiles.

These fixtures pin SGP's source-pending fiscal-report envelope contract. They
must keep `sourceStatus=CALLER_SELECTED_LRF_STRUCTURE`,
`layoutStatus=UNVERIFIED_LAYOUT`, and `officialConformance=false` until an
owner-selected official state layout is linked and covered by state-specific
manual goldens.

Regenerate only for intentional builder contract changes:

```bash
SGP_UPDATE_R4_15_GOLDENS=1 npm run test:backend -- --runInBand --testPathPatterns='rreo|rgf'
```

Then rerun the same command without `SGP_UPDATE_R4_15_GOLDENS=1`.
