# C7 — Tamper-Evident Audit Log

> **Wave C.** Audit worker. Parallel with C2–C6.

## Read first

- [`../plan.md`](../plan.md) — closure item 11.
- Round-0 / round-1: append-only triggers in place.
- C3 SOC 2 requirements (immutable audit logs).

## Tasks

1. **Per-tenant Merkle log**:
   - Each row appended to `audit_event_log` carries a hash chain
     reference: `prev_hash`, `row_hash = H(prev_hash || canonical_row)`.
   - Forward migration adds the columns.
   - Trigger fills them on insert.
2. **Periodic anchor**:
   - Hourly Lambda computes the latest tip per tenant; writes the
     anchor (hash + sequence number + timestamp) to:
     - An immutable S3 bucket (object-lock mode = compliance,
       1-year retention).
     - A separate audit-anchor account (cross-account isolation).
   - Optional: third-party timestamping (RFC 3161) — owner-decision.
3. **Verification CLI/API**:
   - `npm run audit:verify -- --tenant <id> --since <ts>` recomputes
     the chain and asserts it matches the latest anchor.
   - HTTP endpoint `GET /audit/verify` (auth-protected) for
     auditors.
4. **Tamper alarm**:
   - Verifier failure → page + circuit-breaker open for that
     tenant; B3 DR runbook covers restore from anchor.
5. **Anchor replication**:
   - Multi-region (B5) replicates the anchor bucket cross-region.

## Primary write scope

- `infra/migrations/<next>-merkle-audit.sql`
- `services/audit-anchor/` (new Lambda)
- `packages/domain/src/audit/merkle.ts`
- `scripts/audit-verify.mjs`
- `services/http-gateway/src/audit/verify.ts`
- `tests/integration/audit-tamper/`
- `docs/operations.md` — tamper-detection runbook

## Do not touch

- Append-only triggers themselves (extended, not replaced).
- Other waves' resources beyond cross-account anchor S3.

## Exit criteria

- Hash chain populated for every audit row going forward.
- Hourly anchor publishes; bucket object-locked.
- Verifier CLI + API reachable.
- Tamper test (forced row mutation in a non-prod copy) detected.

## Verification

```text
psql … -c "select count(*) from esocial.audit_event_log where row_hash is null;"
# expect: 0 for new rows
npm run audit:verify -- --tenant t-test
```

Report: anchor cadence, verification time, tamper-test outcome,
multi-region anchor replication latency.
