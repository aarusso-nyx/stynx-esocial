# E1 — S-1030 / S-1040 / S-1060 Schema Decision

## Objective

Resolve the Round 6 F3 blocker without fabricating current XSD bindings.

## Context

Round 6 checked the gov.br S-1.3 XSD package published for production on
2026-04-27. The package did not contain `evtTabCargo.xsd`,
`evtTabFuncao.xsd`, or `evtTabAmbiente.xsd`. ADR
`docs/adrs/0013-s1060-current-leiaute-decision.md` records the decision to keep
the three event classes pending until an official source or retirement decision
exists.

## Tasks

1. Ask the regulatory/product owner to confirm whether `S-1030`, `S-1040`, and
   `S-1060` are active service obligations for this standalone product.
2. If active:
   - attach the official current XSD package/source;
   - promote DTOs, schemas, examples, builders, goldens, dispatcher entries,
     and integration tests in a normal implementation branch;
   - remove the `Round1Pending` classification only after green evidence.
3. If not active:
   - record the owner decision in a follow-up ADR;
   - update `docs/events.md`, `docs/consumers.md`, and `docs/sgp-migration.md`;
   - adjust completeness tests so they do not claim false active support.

## Exit Criteria

- Official source or retirement decision attached.
- ADR updated or superseded.
- `docs/release/1.2.0/events/s1030-s1040-s1060.md` no longer reports a source
  blocker.
