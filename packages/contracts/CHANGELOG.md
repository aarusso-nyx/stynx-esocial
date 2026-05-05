# @esocial/contracts

## 1.0.0

Initial production-target v1 transport contract.

- Exports TypeScript definitions for request, response, spool, audit, retry,
  DLQ, replay, idempotency, payload, status, event-class, and error-category
  surfaces.
- Ships JSON schema artifacts under `schemas/v1/`.
- Ships deterministic request examples for all 40 supported eSocial event
  classes under `examples/v1/requests/`.
- Defines forward-only envelope versioning with `version: "v1"` and the
  canonical lowercase status taxonomy.
- Keeps SGP references opaque: source event id, payroll run id, employee id,
  source entity ids, and source system are payload identifiers, not database
  relationships.
