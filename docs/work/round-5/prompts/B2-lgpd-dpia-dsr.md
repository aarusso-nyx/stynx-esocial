# B2 — LGPD DPIA + DSR APIs + Retention Sweeper

> **Wave B.** Compliance. Blocked by B1. Parallel with B3, B4, B5.

## Read first

- [`../plan.md`](../plan.md) — closure item 5.
- Round-3 prompt `C2-lgpd-compliance.md` (the design lives there).
- B1 threat model (privacy attack surface).
- Round-0 redaction policy.

## Tasks

1. **DPIA** at `docs/compliance/lgpd-dpia.md`:
   - Lawful basis per data category (CPF, CNPJ, salary, etc.).
   - Data flows (SGP → eSocial → gov.br) with retention per stage.
   - Third-party processors (AWS, gov.br) and their agreements.
   - Risks + mitigations.
   - DPO sign-off line.
2. **PII catalog** at `docs/compliance/pii-catalog.md`: every field
   where PII can land + the redaction/retention rule.
3. **Retention schedule**:
   - Forward migration adds `retention_class` and `expires_at` per
     row in `audit_event_log`, `event_record`, `dlq_item`.
   - **`services/retention-sweeper/`** Lambda: nightly, deletes
     expired rows; deletes append `audit_event_log` rows of kind
     `retention.expire`.
   - B5 Merkle anchor signs the deletion batch.
4. **DSR APIs** under `services/lgpd/` (or extend
   `services/http-gateway/src/lgpd/`):
   - `POST /lgpd/access` — return subject's structured projection
     (no unredacted XML).
   - `POST /lgpd/erase` — soft-delete + redact PII at rest;
     preserve audit trail (legal obligation).
   - `POST /lgpd/export` — export the subject's records.
   - All three protected by **same auth surface as DLQ replay**
     (round-1 IAM SigV4 / OIDC).
   - All three audited via `lgpd.<action>`.
5. **Cross-border note**: gov.br transfer documented in DPIA.
6. **CI tests**: each endpoint covers happy path + auth-required +
   tenant-scoped + audit-row.

## Primary write scope

- `docs/compliance/lgpd-dpia.md`, `pii-catalog.md`
- `infra/migrations/<next>-retention.sql`
- `services/lgpd/` or extend `http-gateway`
- `services/retention-sweeper/` (new Lambda)
- `tests/integration/lgpd/`
- `docs/operations.md` — DSR runbook
- `docs/release/1.2.0/lgpd/`

## Do not touch

- Builders, signing, transport — DSR layer wraps them.
- Other waves' work.

## Exit criteria

- DPIA committed + DPO-signed line filled.
- DSR APIs deployed (LocalStack); auth + audit tested.
- Retention sweeper runs nightly; tamper-evident via B5.
- PII catalog matches code (CI grep verifies field list).

## Verification

```text
curl -X POST $GW/lgpd/access -H "$AUTH" -d '{...}'
psql … -c "select count(*) from esocial.audit_event_log where kind='retention.expire';"
```

Report: DSR API SLAs, retention windows per data class, sweeper batch
size + runtime.
