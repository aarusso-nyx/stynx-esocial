# @esocial/contracts

## 1.1.0-rc.0

- Promotes the Round 1 DTO surface for 27 additional active event classes:
  `S-1005`, `S-1020`, `S-1050`, `S-1070`, `S-1202`, `S-1207`, `S-1210`,
  `S-1298`, `S-2205`, `S-2206`, `S-2210`, `S-2220`, `S-2230`, `S-2240`,
  `S-2298`, `S-2299`, `S-2300`, `S-2306`, `S-2399`, `S-2400`, `S-2405`,
  `S-2410`, `S-2416`, `S-2418`, `S-2420`, `S-2501`, and `S-3000`.
- Keeps `S-1030`, `S-1040`, and `S-1060` as explicit owner-blocked
  `round1Pending` table DTOs until the missing/legacy XSD decision is resolved
  in `docs/work/round-1/leiaute-blockers.md`.
- Keeps the S-50xx event classes as `retorno` request stubs while their active
  surface is the return parser/status path, not SGP-produced source DTOs.
- Publishes JSON Schemas and deterministic request examples for every exported
  event class in the 40-class v1 taxonomy. Active source-DTO schemas reject
  `round1Pending`; blocked table and S-50xx return-stub schemas require it.
- Tightens ingress behavior: submitted request envelopes must carry an
  `idempotency-key` that exactly matches `buildEsocialIdempotencyKey()` for the
  envelope fields and payload hash. Mismatches are rejected as
  `validation_failed` before persistence.
- Enforces envelope `version: "v1"` for request, response, spool, audit, retry,
  DLQ, and replay families.
- Breaking for producers that still send historical XML/signed envelopes,
  omit the helper-generated idempotency key, or omit the `version`
  discriminator. This remains an RC package until SGP accepts the breaking
  coordination plan and the three blocked table DTO decisions are closed.

## 1.0.0

Initial production-target v1 transport contract.

- Exports TypeScript definitions for request, response, spool, audit, retry,
  DLQ, replay, idempotency, payload, status, event-class, and error-category
  surfaces.
- Ships JSON schema artifacts under `schemas/v1/`.
- Adds typed SGP request DTOs for `S-1000`, `S-1010`, `S-1200`, `S-1299`,
  and `S-2200`; all other event classes are represented by `Round1Pending`
  stubs.
- Rejects XML and signature-bearing fields such as `payloadXml` and
  `signedEnvelope` from the SGP request DTO parser.
- Ships deterministic request examples for all 40 supported eSocial event
  classes under `examples/v1/requests/`.
- Defines forward-only envelope versioning with `version: "v1"` and the
  canonical lowercase status taxonomy.
- Keeps SGP references opaque: source event id, payroll run id, employee id,
  source entity ids, and source system are payload identifiers, not database
  relationships.
