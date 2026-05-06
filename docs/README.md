# esocial Documentation

esocial owns the standalone eSocial runtime: DTO ingress, XML builders, XSD
validation, signing boundary, SOAP submission, return parsing, retry policy,
certificate custody, and operational evidence.

SGP remains the business system of record. It triggers eSocial from domain
actions and keeps the local projection table `public.esocial_events`; it does
not expose browser-facing eSocial routes or run eSocial XML/SOAP code.

## Map

| Document | Purpose |
| --- | --- |
| [architecture.md](architecture.md) | Service boundary, data flow, and production-grade checklist. |
| [consumers.md](consumers.md) | Producer/consumer contract for SGP and future integrations. |
| [codex-bootstrap.md](codex-bootstrap.md) | Worker-oriented bootstrap plan for the next implementation sessions. |
| [events.md](events.md) | Lifted event inventory, source code locations, and XML examples. |
| [references.md](references.md) | Copied SGP regulatory/reference corpus and usage rules. |
| [operations.md](operations.md) | Local database, deployment template, replay/DLQ, and incident runbooks. |
| [sgp-migration.md](sgp-migration.md) | SGP cutover, rollback, DTO, idempotency, and status-consumer notes. |
| [release-checklist.md](release-checklist.md) | Release readiness checklist and deferred evidence gates. |
| [release/0.2.0/README.md](release/0.2.0/README.md) | Round 1 Batch 5 evidence bundle and release status. |
| [templates/README.md](templates/README.md) | Golden XML and WSDL example custody. |

## Reference Corpus

The retained SGP eSocial reference corpus was copied under
`docs/references/esocial/`. The developer-facing legal fact summary was copied
to `docs/references/law-esocial.md`. These files are local working references
for this repository; production acceptance still requires code, tests, golden
fixtures, and deployment evidence.

## Current Release Posture

Round 1 Batch 5 promotes all unblocked Round 1 event families, retires lifted
builders/parsers/tests, and keeps only the XSD bundle under documented
retention. `S-1030`, `S-1040`, and `S-1060` remain owner-blocked table DTOs
until their missing or legacy XSD decisions close.
