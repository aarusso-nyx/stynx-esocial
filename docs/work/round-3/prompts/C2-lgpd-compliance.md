# C2 — LGPD Compliance + DSR APIs

> **Wave C.** Compliance worker. Blocked by C1. Parallel with C3–C7.

## Read first

- [`../plan.md`](../plan.md) — closure item 9.
- C1 threat model (privacy attack surface).
- LGPD (Lei 13.709/2018) — Brazilian privacy law.
- Round-0 redaction policy.

## Tasks

1. **DPIA** (Data Protection Impact Assessment) at
   `docs/compliance/lgpd-dpia.md`:
   - Lawful basis per data category (CPF, CNPJ, salary, etc.).
   - Data flows (SGP → eSocial → gov.br) with retention per stage.
   - Third-party processors (AWS, gov.br) and their agreements.
   - Risks + mitigations.
   - Sign-off line for the DPO (data protection officer).
2. **Retention schedule** enforced in DB:
   - Migration adding `retention_class` and `expires_at` per row in
     `audit_event_log`, `event_record`, `dlq_item`.
   - A retention-sweeper Lambda deletes expired rows nightly with
     audit trail (deletes append to `audit_event_log` with kind
     `retention.expire`).
   - Tamper-evident anchor (C7) signs the deletion batch.
3. **DSR APIs** at `services/http-gateway/src/lgpd/`:
   - `POST /lgpd/access` — given a CPF/CNPJ + tenant, return the
     subset of records related to that subject (no XML payloads
     unredacted; structured projection only).
   - `POST /lgpd/erase` — soft-delete records related to the
     subject; preserve the audit trail (legal obligation) but
     redact PII at rest.
   - `POST /lgpd/export` — export the subject's records in a
     structured format.
   - All three protected by the same auth surface as DLQ replay
     (round-1 Batch 0 task 9). Audited via `lgpd.<action>`.
4. **PII catalog** in `docs/compliance/pii-catalog.md` listing every
   field where PII can land (`event_record.payload`, `audit_event_log`,
   logs, etc.) and the redaction/retention rule for each.
5. **Cross-border transfer**: eSocial sends data to gov.br; document
   that transfer in DPIA. Round-2 already constrained endpoints; C2
   confirms compliance.

## Primary write scope

- `docs/compliance/lgpd-dpia.md`, `pii-catalog.md`
- `infra/migrations/<next>-retention.sql`
- `services/lgpd/` (new Lambda) or extend `http-gateway`
- `services/retention-sweeper/` (new Lambda)
- `docs/operations.md` — DSR runbook
- `docs/release/1.0.0/lgpd/`

## Do not touch

- Builders, signing, transport — privacy layer wraps them.
- Other waves' resources.

## Exit criteria

- DPIA committed and DPO-signed.
- DSR APIs deployed; e2e tested under auth.
- Retention sweeper runs nightly; tamper-evident.
- PII catalog matches code (CI grep verifies field list).

## Verification

```text
curl -X POST $GW/lgpd/access -H "$AUTH" -d '{...}'
psql … -c "select count(*) from esocial.audit_event_log where kind='retention.expire';"
```

Report: DSR API SLAs, retention windows per data class, PII catalog
size, sweeper batch size + runtime.
