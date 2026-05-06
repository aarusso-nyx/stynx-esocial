# eSocial Threat Model

## Scope

This model covers the standalone eSocial service bus from SGP DTO ingress through
XML build, validation, signing, SOAP submission, return parsing, status
publication, replay, and operator evidence. SGP identifiers remain opaque
payload fields and are not database relationships.

## Trust Boundaries

| Boundary | Assets | Controls |
| --- | --- | --- |
| SGP to eSocial queues | DTO payloads, idempotency keys, correlation IDs | Versioned contracts, schema validation, tenant ID validation, replay-safe idempotency |
| eSocial database | Event records, status history, audit log, totalizers | `esocial` schema, tenant RLS, append-only history, worker-role grants |
| Certificate custody | Tenant certificate references | Secrets Manager references only, KMS key rotation, no certificate bytes in SQL |
| XML and SOAP processing | XML payloads, signatures, SOAP responses | XXE/DTD hardening, XSD validation before signing, endpoint allowlist |
| Operator surfaces | DLQ, replay, DSR, evidence exports | Least privilege, immutable audit trail, redacted logs |

## Threats

| Threat | Impact | Existing Control | Round 5 Gap |
| --- | --- | --- | --- |
| Cross-tenant message replay | Unauthorized regulatory submission | Tenant-scoped idempotency keys and RLS | Add replay authorization policy tests for operator API |
| Certificate material leakage | Regulatory credential compromise | DB stores secret refs only | External Secrets Manager rotation evidence is not present locally |
| SOAP SSRF or production endpoint misuse | Data exfiltration or unauthorized gov.br calls | Non-production template host guard | Runtime egress allowlist needs live network policy evidence |
| XML parser entity expansion | Process crash or data disclosure | Parser hardening tests from earlier rounds | Keep canary coverage in every new parser |
| Audit log tampering | Loss of non-repudiation | Append-only DB grants and triggers | Merkle chain is scaffolded, not yet enforced by trigger |
| Excessive retention | LGPD violation | Retention columns scaffolded in Round 5 | Sweeper service/API not implemented |
| Cost attribution loss | Unbounded spend or tenant dispute | Template tag evidence scaffolded | CUR/Cost Explorer integration is external |

## Required Evidence

- `npm run secrets:assert-rotation`
- `npm run audit:verify`
- `npm run slo:assert`
- `npm run cost:evidence`
- `npm run round6:readiness -- --allow-blocked`
