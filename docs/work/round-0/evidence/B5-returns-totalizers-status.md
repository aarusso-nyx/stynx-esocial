# B5 Returns, Totalizers, Status Publication Evidence

Date: 2026-05-05

## Scope Closed

- Active return handler tests now cover protocol success, regulatory rejection,
  SOAP fault, malformed XML, all S-50xx totalizer variants, and unknown
  regulatory-code gaps.
- `ReturnProcessor` resolves the originating `event_record` from explicit
  payload IDs or from protocol/receipt lookup through the return repository.
- Postgres return persistence exposes `resolveOrigin()` and stores audit gap
  flags alongside parsed/classified return evidence. Raw XML stays in
  `esocial.submission_message`; audit payloads carry hash, reference, and byte
  length.
- SQL reconciliation remains the chosen Round 0 surface in
  `docs/operations.md`: `v_event_failures`, `v_competence_periodics_pending`,
  and `esocial.esocial_totalizer` queries.

## Regulatory-Code Mapping Coverage

A4 seeds 13 response-classification rows:

- `201` -> accepted
- `202`, `301`, `500`, `503` -> retry
- `401`, `402` -> rejected
- `403`, `404`, `409` -> failed
- `TIMEOUT` -> timeout
- `SOAP_FAULT`, `MALFORMED_XML` -> handler-normalized failed outcomes in B5

Unknown fixture coverage: code `999` is intentionally unmapped and now produces
status `failed`, category `regulatory`, and audit flag `unknown_regulatory_code`.

## Totalizer Variants Exercised

- `S-5001`
- `S-5002`
- `S-5011`
- `S-5012`
- `S-5013`

Coverage is 5/5 expected S-50xx variants.

## Verification

- `pwd`: `/Users/aarusso/Development/stech/stynx-esocial`
- `git status --short --branch`: `## main...origin/main [ahead 1]`
- `npm test`: passed, 59 tests
- `npm run build`: passed
- `node --test services/retorno/__tests__/*.test.mjs tests/returns/*.test.mjs`: passed, 13 tests
- `npm run lint`: passed
- `npm run test:db`: passed
- `npm run test:integration`: passed, 9 tests
- `grep -R "public\\.esocial_event\\|hr\\.\\|payroll\\.\\|saude\\." services/retorno packages/domain/src/returns --include="*.ts" | grep -v sgp-lifted`: no output

## Known Contract Note

The current A3 transport contract does not include `kind: "totalizer"` as a
top-level spool kind; totalizer updates are published with `kind: "retorno"` and
`response_payload.return_kind: "totalizer"`. B5 did not edit contracts.
