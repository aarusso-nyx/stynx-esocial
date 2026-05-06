# LGPD DPIA

## Processing Purpose

The service processes personal and payroll data solely to submit legally
required eSocial events, parse official returns, publish status to SGP, and
retain regulatory audit evidence.

## Legal Basis

Primary basis: legal/regulatory obligation. Operator audit and security logging
are legitimate operational controls for the regulated service.

## Data Subject Rights

Round 6 adds a repository-local DSR runtime service under `services/lgpd/`.
The service exposes the same action model the HTTP gateway will route in a
deployed stage:

| Request | Required API | Current Status |
| --- | --- | --- |
| Access | `POST /lgpd/access` | Implemented locally; role `lgpd:read`; redacted projection only |
| Correction | delegated to SGP source-of-truth workflow | Documented |
| Deletion | `POST /lgpd/erase` | Implemented locally; role `lgpd:erase`; redacts PII while preserving audit |
| Export | `POST /lgpd/export` | Implemented locally; role `lgpd:export`; JSON export with XML/PII redaction |
| Restriction | operator case workflow | Covered by retention approval queue and audit trail |

## Retention

Migration `087-retention-cost-merkle.sql` adds retention class and expiry
columns to active evidence tables. Migration `088-lgpd-approval.sql` adds the
append-only `esocial.lgpd_approval` table. The Round 6 sweeper runtime plans
expired rows into `retention.pending` batches and refuses destructive expiry
until a matching approval row exists with
`approver_role = 'Data Protection Officer'`.

## Residual Risk

- External Secrets Manager, CloudTrail, and AWS access review exports are not in
  the local repository.
- A named DPO is still required before production destructive-retention
  operation; Round 6 uses `Data Protection Officer (TBD)` in runbooks.
- Full production DPIA needs owner sign-off before real certificates or endpoint
  traffic are authorized.
