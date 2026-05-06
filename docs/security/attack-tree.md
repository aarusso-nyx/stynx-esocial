# eSocial Attack Tree

Root: compromise regulatory correctness, tenant confidentiality, or operator
trust in the standalone eSocial bus.

## 1. Submit an Unauthorized Event

- Reuse a valid SGP message with a different tenant.
- Forge an idempotency key for another source event.
- Abuse replay API to resubmit a terminal DLQ item.
- Bypass tenant RLS with a missing `app.current_tenant_id`.

Controls: DTO schema validation, tenant-bound idempotency, RLS, replay audit.
Open Round 5 work: replay authorization tests and operator API implementation.

## 2. Exfiltrate Sensitive Data

- Read database rows across tenants.
- Dump certificate material from SQL.
- Force XML parser to resolve external entities.
- Leak PII through logs or SOC evidence packs.

Controls: no certificate bytes in DB, parser hardening, redaction policy,
append-only audit. Open Round 5 work: DSR endpoints and PII catalog enforcement.

## 3. Break Regulatory Submission Integrity

- Submit unsigned XML.
- Submit XML built for the wrong leiaute version.
- Skip XSD validation before signing.
- Route qualification traffic to production endpoints.

Controls: build-sign-submit pipeline tests, non-production gov.br guard, hashes
for request/signed/SOAP payloads. Open Round 5 work: new event family promotion
for S-1030/S-1040/S-1060.

## 4. Hide Operational Failure

- Drop status publication after a rejected return.
- Suppress DLQ creation after retry exhaustion.
- Mutate audit/status history after triage.
- Disable SLO alarms.

Controls: status history append-only grants, DLQ tests, generated CloudWatch
alarms. Open Round 5 work: burn-rate alarms and external alarm subscription
evidence.
