# XML Templates and Examples

This directory keeps byte-reviewable XML, return, and SOAP examples used by the
active tests and release evidence.

| Path | Source |
| --- | --- |
| `golden/builders/*.golden.xml` | Canonical active builder goldens plus documented blocked-table examples. |
| `golden/returns/*.golden.xml` | Canonical S-50xx totalizer return parser fixtures. |
| `wsdl/ws-enviar-lote-eventos.wsdl` | SOAP submission WSDL fixture from the lifted submission tests. |

Treat these files as contract examples. Do not normalize or reformat them unless
the corresponding builder/parser behavior and golden tests are intentionally
updated.
