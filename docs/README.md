# stynx-esocial Documentation

stynx-esocial owns the eSocial runtime that was lifted out of SGP: XML builders,
XSD validation, signing boundary, SOAP submission, return parsing, retry policy,
certificate custody, and operational evidence.

SGP remains the business system of record. It triggers eSocial from domain
actions and keeps the local projection table `public.esocial_events`; it does
not expose browser-facing eSocial routes or run eSocial XML/SOAP code.

## Map

| Document | Purpose |
| --- | --- |
| [architecture.md](architecture.md) | Service boundary, data flow, and production-grade checklist. |
| [events.md](events.md) | Lifted event inventory, source code locations, and XML examples. |
| [references.md](references.md) | Copied SGP regulatory/reference corpus and usage rules. |
| [templates/README.md](templates/README.md) | Golden XML and WSDL example custody. |

## Reference Corpus

The retained SGP eSocial reference corpus was copied under
`docs/references/esocial/`. The developer-facing legal fact summary was copied
to `docs/references/law-esocial.md`. These files are local working references
for this repository; production acceptance still requires code, tests, golden
fixtures, and deployment evidence.
