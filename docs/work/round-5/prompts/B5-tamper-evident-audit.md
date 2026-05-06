# B5 — Tamper-Evident Audit Log (Merkle + Anchor)

> **Wave B.** Audit. Blocked by B1. Parallel with B2, B3, B4.

## Read first

- [`../plan.md`](../plan.md) — closure item 8.
- Round-3 prompt `C7-tamper-evident-audit.md` (the design lives there).
- Round-1 append-only triggers (already in place).

## Tasks

1. **Per-tenant Merkle log**:
   - Forward migration adds `prev_hash` and
     `row_hash = H(prev_hash || canonical_row)` columns to
     `audit_event_log`.
   - Trigger fills them on insert.
2. **Periodic anchor Lambda**:
   - Hourly: compute latest tip per tenant; write anchor (hash +
     sequence + timestamp) to:
     - **Immutable S3 bucket** (Object Lock = compliance, 1-year
       retention).
     - Separate audit-anchor account (cross-account isolation in
       CDK).
   - Optional RFC 3161 timestamping — owner-decision (note in
     `docs/operations.md`).
3. **Verifier**:
   - CLI: `npm run audit:verify -- --tenant <id> --since <ts>`
     recomputes the chain and asserts it matches the latest anchor.
   - HTTP endpoint: `GET /audit/verify` (auth-protected) for
     auditors. Same auth surface as DLQ replay.
4. **Tamper alarm**:
   - Verifier failure → page + tenant-scoped circuit-breaker open
     until SRE acknowledges; restore from anchor (R6 DR runbook
     covers cross-region restore).
5. **Anchor replication**: cross-region (R6 wires multi-region S3
   replication; B5 commits anchor bucket with replication config).
6. **Coordination with B2**: retention-sweeper deletions are signed
   into the Merkle log so deletes are tamper-evident too.

## Primary write scope

- `infra/migrations/<next>-merkle-audit.sql`
- `services/audit-anchor/` (new Lambda)
- `packages/domain/src/audit/merkle.ts`
- `scripts/audit-verify.mjs`
- `services/http-gateway/src/audit/verify.ts`
- `tests/integration/audit-tamper/`
- `docs/operations.md` — tamper-detection runbook
- `docs/release/1.2.0/audit/`

## Do not touch

- Append-only triggers themselves (extended, not replaced).
- Cross-region replication wiring (R6 finalizes).

## Exit criteria

- Hash chain populated for every audit row going forward.
- Hourly anchor publishes; bucket Object-Locked.
- Verifier CLI + API reachable.
- Tamper test (forced row mutation in a non-prod copy) is detected.
- B2 retention deletes are tamper-evident.

## Verification

```text
psql … -c "select count(*) from esocial.audit_event_log where row_hash is null;"
# expect 0 for new rows
npm run audit:verify -- --tenant t-test
```

Report: anchor cadence, verification time, tamper-test outcome.
