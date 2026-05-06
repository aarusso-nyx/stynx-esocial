# F4 — LGPD Runtime Closure

> **Round-6 Batch F4.** Compliance owner. Hard blocker from R5. Parallel.
> F4.3 needs **D2** to start.

## Read first

- [`../plan.md`](../plan.md) — Carryover Backlog Batch F4.
- R5 prompt `B2-lgpd-dpia-dsr.md` (the original attempt).
- `docs/compliance/lgpd-dpia.md` (R5 draft).
- `docs/compliance/pii-catalog.md` (R5 scaffold).
- Retention columns in `audit_event_log`, `event_record`, `dlq_item`
  (R5 forward migration).

## Decision (locked)

**D2 = (b) — In-process approval queue.**

- Sweeper writes pending delete batches to `audit_event_log` of kind
  `retention.pending`.
- No row is deleted until a row in `lgpd_approval` (forward migration
  in this batch) appears with matching `batch_id` and
  `approver_role = 'Data Protection Officer'`.
- The role label is **`Data Protection Officer (TBD)`** until a real
  DPO is named; the manual `lgpd_approval` insert is the gate.
- An open GitHub issue tracks the named-DPO gap: title
  `LGPD: name destructive-retention DPO`; close it when a real DPO is
  assigned and the role label updates from `(TBD)` to the role's name.

Record the locked decision in
`docs/release/1.2.0/lgpd/destructive-workflow-owner.md` referencing
this section + the open issue URL.

## Tasks

### F4.1 — DSR API

Three endpoints under
`services/http-gateway/src/lgpd/` (or `services/lgpd/` —
pick one and document):

- **`POST /lgpd/access`**: given a CPF/CNPJ + tenant, return
  structured projection of records related to the subject. **No
  unredacted XML.**
- **`POST /lgpd/erase`**: soft-delete + redact PII at rest;
  preserve audit trail (legal obligation).
- **`POST /lgpd/export`**: export the subject's records in
  structured format.

For all three:

- Auth-protected via the same surface as DLQ replay (round-1 IAM
  SigV4 / OIDC).
- Audited: `audit_event_log` row of kind `lgpd.<action>` for every
  request (success and failure).
- Tenant-scoped: RLS enforces.
- Synthetic-tenant tests in `tests/integration/lgpd/`.

### F4.2 — Retention sweeper

`services/retention-sweeper/` (or extend an existing service):

- Nightly Lambda.
- Selects rows where `expires_at < now()` per
  `audit_event_log` / `event_record` / `dlq_item`.
- **Writes to a pending queue first** (per D2 default); does NOT
  delete directly until approval is recorded.
- Once approved, deletes the batch; appends `audit_event_log` row
  of kind `retention.expire` per batch.
- Tamper-evident: deletes are signed into the R5 B5 Merkle chain.
- CloudWatch alarm on failure.

### F4.3 — Owner-approved destructive-retention workflow

- Implement the in-process approval queue per **D2=(b)**:
  - Forward migration creates `esocial.lgpd_approval(batch_id,
    approver_role, approver_actor, approved_at)`.
  - Sweeper sits idle on `retention.pending` rows until **any** DB
    row in `lgpd_approval` with matching `batch_id` and
    `approver_role = 'Data Protection Officer'` is inserted manually.
  - Manual-flip procedure documented in `docs/operations.md`
    LGPD-runbook section: SQL view to list pending batches, exact
    `INSERT` template for `lgpd_approval`, recovery procedure if
    accidental approval.
- **No DPO-facing CLI** in this batch (that's a follow-on once a real
  DPO is named — covered by the open issue).
- Tests assert:
  - Pending rows do **not** delete without an `lgpd_approval` row.
  - Approved batches delete cleanly.
  - Approval row append-only (no UPDATE/DELETE under worker role —
    R1 append-only triggers extend here).
  - Tamper chain extends through deletes (R5 B5 Merkle anchor signs
    the delete batch).

## Primary write scope

- `services/lgpd/` or `services/http-gateway/src/lgpd/` (pick one)
- `services/retention-sweeper/`
- `infra/migrations/<next>-lgpd-approval.sql`
- `tests/integration/lgpd/`
- `docs/operations.md` — DSR runbook + retention-approval flow
- `docs/release/1.2.0/lgpd/`
- `docs/release/1.2.0/lgpd/destructive-workflow-owner.md` (D2 record)

## Do not touch

- Builders, signing, transport — DSR layer wraps them.
- Other carry-over batches.
- R6 expansion batches.

## Exit criteria

- DSR endpoints reachable, auth-gated, audited, tenant-scoped.
- Retention sweeper runs nightly in CI / LocalStack.
- Destructive workflow records D2 choice; pending rows cannot
  delete without approval; approved rows delete cleanly.
- `audit_event_log` chain extended through deletes (tamper-evident).
- DPIA updated with the runtime artifacts now in place.

## Verification

```text
curl -X POST $GW/lgpd/access -H "$AUTH" -d '{"tenant":"t-test","subject":"00000000000"}'
psql … -c "select kind, count(*) from esocial.audit_event_log where kind like 'lgpd.%' group by 1;"
psql … -c "select kind, count(*) from esocial.audit_event_log where kind like 'retention.%' group by 1;"
ls docs/release/1.2.0/lgpd/
```

Report: DSR API routes deployed, sweeper runtime, approval-flow
demo (pending → approved → deleted), tamper-chain extension,
D2 choice.
