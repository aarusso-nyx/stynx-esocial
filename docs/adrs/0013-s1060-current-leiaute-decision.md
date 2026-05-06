# ADR 0013 — S-1030/S-1040/S-1060 Current Leiaute Binding

## Status

Accepted.

## Context

Round 6 F3 locked on binding `S-1030`, `S-1040`, and `S-1060` to the current
eSocial S-1.3 XSD publication instead of retaining legacy or lifted evidence.

On 2026-05-06, the current gov.br technical documentation page listed
`Esquemas XSD eSocial - Leiautes v. S-1.3 (até NT 06/2026) - produção em
27/04/2026`. The downloaded ZIP did not contain `evtTabCargo.xsd`,
`evtTabFuncao.xsd`, or `evtTabAmbiente.xsd`. It did contain current table XSDs
such as `evtTabEstab.xsd`, `evtTabLotacao.xsd`, `evtTabProcesso.xsd`, and
`evtTabRubrica.xsd`.

## Decision

Do not synthesize or stub current XSD bindings for `S-1030`, `S-1040`, or
`S-1060`. Keep those three event classes on `Round1Pending` until an official
current schema source is available or product/regulatory ownership decides they
are retired for this standalone service.

## Consequences

- Round 6 F3 remains blocked by source material instead of partially faking
  active support.
- The blocker is routed to Round 7 external/regulatory ownership.
- Existing active builders and dispatchers remain unchanged.
