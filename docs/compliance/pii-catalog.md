# PII Catalog

| Domain | Data | Source | Stored In | Retention Class | Notes |
| --- | --- | --- | --- | --- | --- |
| Tenant | CNPJ, tenant code | SGP onboarding | `esocial.tenant`, DTOs | `regulatory_audit` | Required for regulatory submission. |
| Worker | CPF, name, worker identifiers | SGP DTOs | event payload hashes, XML artifacts, status evidence | `regulatory_event` | SGP remains system of record. |
| Payroll | remuneration, payment totals, rubrics | SGP DTOs | event records, totalizers | `regulatory_event` | Subject to statutory retention. |
| Certificates | certificate fingerprint, secret reference | tenant certificate setup | `esocial.tenant_certificate` | `credential_metadata` | No certificate bytes or private keys in SQL. |
| Operators | actor identifier, replay/triage reason | operator tooling | `esocial.audit_event_log` | `operator_audit` | Redact direct personal data in logs. |

## Data Minimization Rules

- Persist hashes for XML and SOAP artifacts when bytes are not required for
  replay or statutory evidence.
- Keep source IDs opaque. Do not add SGP foreign keys or shared database URLs.
- Treat logs and SOC 2 evidence as export surfaces that must use redaction by
  default.
