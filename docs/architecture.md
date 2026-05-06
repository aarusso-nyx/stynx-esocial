# Architecture

esocial is the isolated eSocial product boundary. It receives normalized
typed DTO envelopes from SGP, builds and validates XML, signs payloads through
the certificate boundary, submits batches to the eSocial national environment,
parses returns and totalizers, and publishes status/audit updates back to SGP.
This resolves the Round 0 A1 architecture decision: SGP sends DTOs and receives
status events; SGP never sends, signs, or consumes XML payloads.

## Boundary

| Concern | Owner |
| --- | --- |
| SGP domain action, tenant authorization, and local audit | SGP |
| SGP event projection table `public.esocial_events` | SGP |
| Event kind taxonomy and queue/audit envelopes | esocial contracts |
| XML builders, XSD validation, signing, SOAP, retries, returns | esocial |
| Certificate custody and rotation workflow for eSocial | esocial |
| Browser-facing eSocial operation UI | esocial |

SGP must not use FDW, shared schemas, or direct SQL access into esocial.
Cross-boundary traffic is queue/event delivery or backend-only HTTPS.

## Runtime Stack

The active runtime stack is AWS Lambda handlers written in plain TypeScript.
This is the lighter standalone path for the current MQ-handler surface:
queue-triggered functions, explicit package boundaries, and no Nest runtime in
active production code. Round 2 moved the retained XSD bundle into
`packages/domain/src/xml/xsd/bundle/`; active production code and XSD metadata
no longer depend on `packages/domain/src/sgp-lifted/`.

Round 1 Batch 6 trims the Lambda surface to the services with distinct runtime
responsibilities: `submission`, `retorno`, `certificado`, and `http-gateway`.
The previous family-named handlers (`tabelas`, `trabalhador`, `folha`,
`fechamento`, and `exclusao`) were deleted because they only returned
placeholder data and had no separate queue, authorization profile, retry model,
or operational runbook. Event-family routing now remains inside the active
submission pipeline, where the typed DTO contract, idempotency check, XML
builder dispatch, status publication, and observability fields are tested once
for every event class.

## Flow

1. SGP validates a business action such as admission, contract change,
   reintegration, termination, payroll generation, payment, closure, or benefit
   change.
2. SGP records a pending event in `public.esocial_events` and sends a typed DTO
   envelope to esocial. The DTO contains opaque SGP source identifiers and
   business payload data, not XML or signing material.
3. esocial builds XML from active standalone builders, validates the payload
   against the bound XSD, signs where required, and submits through the official
   SOAP transport.
4. esocial parses responses and totalizers, updates its own operational
   records, and publishes status/audit updates.
5. SGP consumes the update and mirrors receipt/status/error data into
   `public.esocial_events` for local reports and audit traces.

## FIFO Grouping

Submission, spool, retry, and DLQ publishers use FIFO grouping by
`MessageGroupId = ${tenant_id}:${event_class}` so one tenant/event family is
ordered without serializing unrelated tenants or event classes. The
`MessageDeduplicationId` is derived from the inbound idempotency key plus the
outbound event id, and the `correlation-id` is propagated through the envelope,
publisher command, and handler logs.

## Database Boundary

The service owns only the PostgreSQL schema `esocial`. Migrations must not
create FDW links, shared schemas, cross-database references, or foreign keys to
SGP-owned objects. SGP identifiers such as source event, payroll run, employee,
or source entity ids are stored as opaque payload identifiers.

Tenant RLS uses the session setting `app.current_tenant_id`. Application
connections must set it before reading or writing tenant-scoped tables:

```sql
SET app.current_tenant_id = '<tenant uuid>';
```

Every tenant-scoped relation, including retry, DLQ, validation, totalizer,
audit, and event-family state tables, has RLS enabled and forced with tenant
policies keyed on `app.current_tenant_id` plus the documented worker bypass.
Normal application roles can only see rows whose `tenant_id` matches
`app.current_tenant_id`. Operational workers receive
membership in the `esocial_worker` database role; that role is the explicit
cross-tenant bypass for retry, DLQ triage, replay, and evidence extraction. The
bypass is granted by role membership, not by `SECURITY DEFINER` shortcuts.

Certificate custody tables store encrypted secret references and certificate
metadata only. Inline certificate material, PFX/PEM bytes, and private keys do
not belong in the database.

`esocial.audit_event_log` and `esocial.event_status_history` are append-only.
Workers can insert and read these tables, but update and delete operations are
rejected by role grants and append-only triggers.

## Production-Grade Gaps

The active repository now has executable service wiring, deterministic
integration/e2e tests against sandbox adapters, certificate-custody boundaries,
deployment synthesis evidence, observability, DLQ/retry runbooks, and blocked
artifact lifecycle checks. Remaining production gaps are explicit owner-blocked
items: real certificates, real restricted-production endpoint calls, package
publication authorization, and production-like DR/multi-region drills. These
are routed through `docs/release/1.1.0/blocked-artifacts.json` and the Round 6
/ Round 7 plans.
