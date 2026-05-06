# C1 — External Pen Test Execution

> **Wave C.** Security. Parallel with A / B / D once vendor + scope
> are signed.

## Authorization required

- ☐ Pen-test vendor selected.
- ☐ NDA signed.
- ☐ Scope statement approved (typically: HTTP gateway, DLQ replay,
  LGPD DSR APIs, audit verifier, operator-facing console where
  present).
- ☐ Budget allocated.
- ☐ Test-window booked against restricted-production with synthetic
  tenants only.

Record in `docs/release/1.3.0/authorizations/C1.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 3.
- Round-5 B1 — threat model + attack tree (the pen test exercises the
  attack tree's high-impact nodes first).
- Round-3 prompt `C1-threat-model-and-pentest.md`.

## Tasks

1. **Scope statement** committed at
   `docs/release/1.3.0/pentest/scope.md`:
   - In scope: HTTP gateway routes, DLQ replay endpoint, LGPD DSR
     endpoints, audit verifier endpoint, IAM scoping, RDS exposure,
     KMS key policies, certificate-store cache TTL.
   - Out of scope: gov.br endpoints (third-party), tenant code
     (SGP).
2. **Synthetic data only** for every test — no real CNPJs, no real
   CPFs. R5 B2 retention sweeper preserves audit only.
3. **Test execution** by the vendor; results delivered as a report.
4. **Findings logged** at `docs/release/1.3.0/pentest/findings/`:
   - Each finding gets a tracking issue.
   - Severity assigned per the round-5 B1 SLA.
   - Critical / high closed before D1/D2 publish.
5. **Remediation PRs** under labels `security` + `pentest-finding`.
   Coordinate with the worker that owns the affected area
   (e.g., a DLQ-replay finding routes to the security-engineering
   worker, not the doc worker).
6. **Final report** (redacted) at
   `docs/release/1.3.0/pentest/report.pdf` (or markdown). The
   un-redacted version retained in the audit-anchor account only.

## Primary write scope

- `docs/release/1.3.0/pentest/`
- Remediation PRs (whatever code area they touch — coordinated)

## Do not touch

- Production stage.
- Gov.br endpoints.

## Exit criteria

- Vendor report attached.
- All critical / high findings closed.
- Medium findings tracked with a target close date.
- D1 / D2 publish unblocked from the security-finding side.

## Verification

```text
ls docs/release/1.3.0/pentest/
gh issue list --label pentest-finding --state closed
```

Report: findings by severity, remediation count, residual-risk
register.
