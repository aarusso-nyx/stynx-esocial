# XML Templates and Examples

This directory keeps byte-reviewable examples from the lifted SGP eSocial
implementation.

| Path | Source |
| --- | --- |
| `golden/builders/*.golden.xml` | Builder fixtures from `packages/domain/src/sgp-lifted/esocial-worker/builders/__fixtures__/`. |
| `golden/returns/*.golden.xml` | Return parser fixtures from `packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__/`. |
| `wsdl/ws-enviar-lote-eventos.wsdl` | SOAP submission WSDL fixture from the lifted submission tests. |

Treat these files as contract examples. Do not normalize or reformat them unless
the corresponding builder/parser behavior and golden tests are intentionally
updated.
