# Architecture

stynx-esocial is the isolated eSocial product boundary. It receives normalized
event envelopes from SGP, builds and validates XML, signs payloads through the
certificate boundary, submits batches to the eSocial national environment, parses
returns and totalizers, and publishes status/audit updates back to SGP.

## Boundary

| Concern | Owner |
| --- | --- |
| SGP domain action, tenant authorization, and local audit | SGP |
| SGP event projection table `public.esocial_events` | SGP |
| Event kind taxonomy and queue/audit envelopes | stynx-esocial contracts |
| XML builders, XSD validation, signing, SOAP, retries, returns | stynx-esocial |
| Certificate custody and rotation workflow for eSocial | stynx-esocial |
| Browser-facing eSocial operation UI | stynx-esocial |

SGP must not use FDW, shared schemas, or direct SQL access into stynx-esocial.
Cross-boundary traffic is queue/event delivery or backend-only HTTPS.

## Flow

1. SGP validates a business action such as admission, contract change,
   reintegration, termination, payroll generation, payment, closure, or benefit
   change.
2. SGP records a pending event in `public.esocial_events` and sends a normalized
   envelope to stynx-esocial.
3. stynx-esocial builds XML from the lifted builders, validates the payload,
   signs where required, and submits through the official SOAP transport.
4. stynx-esocial parses responses and totalizers, updates its own operational
   records, and publishes status/audit updates.
5. SGP consumes the update and mirrors receipt/status/error data into
   `public.esocial_events` for local reports and audit traces.

## Production-Grade Gaps

The current repository contains the lifted SGP implementation and structural
checks. Production readiness still needs service wiring, executable integration
tests against sandbox adapters, certificate lifecycle implementation, deployment
evidence, observability, DLQ/retry runbooks, and explicit homologation evidence
for the official eSocial restricted-production environment.
