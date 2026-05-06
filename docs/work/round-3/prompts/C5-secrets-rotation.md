# C5 — Secrets / KMS Rotation Automation

> **Wave C.** Security worker. Parallel with C2–C4, C6–C7.

## Read first

- [`../plan.md`](../plan.md) — closure item 10.
- Round-0 prompt C3 (KMS keys, Secrets Manager).

## Tasks

1. **KMS key rotation**:
   - All customer-managed CMKs have annual auto-rotation enabled
     (CDK `enableKeyRotation: true`).
   - A test asserts every CMK in synthesized templates has rotation.
2. **Secrets Manager rotation**:
   - DB credentials: 30-day rotation Lambda using AWS-provided
     templates.
   - JWT/API signing keys (DLQ replay auth, LGPD DSR auth): 90-day
     rotation; rolling-key support so old + new both verify during
     overlap.
   - SOAP client credentials (round-2 introduces these; C5 wires
     rotation): per gov.br rules.
3. **Audit + alarm**:
   - Rotation success → `audit_event_log` row of kind
     `secret.rotated`.
   - Rotation failure → alarm + page; cert-rotator-style runbook.
4. **Application reload**:
   - Lambdas re-fetch secrets on cache TTL expiry (≤ 5 min) so a
     rotated secret is picked up automatically.
   - `loadConfig()` (A3) supports refresh-on-error for transient
     auth failures.

## Primary write scope

- `infra/cdk/src/secrets-rotation-stack.ts`
- `services/db-credentials-rotator/` (or use AWS RDS
  Secret-Rotation construct directly)
- `packages/domain/src/config/refresh.ts` (A3 extension)
- `tests/integration/secrets-rotation/`
- `docs/operations.md` — rotation runbook

## Do not touch

- Application semantics beyond secret-refresh hook.

## Exit criteria

- All secrets have a rotation policy.
- All CMKs have annual auto-rotation.
- Rotation events audited.
- Failure alarms wired.

## Verification

```text
npm run cdk:synth
node scripts/assert-secrets-rotation.mjs
npm run test:integration -- secrets-rotation
```

Report: secret types covered, rotation cadence per type, alarm
thresholds, tested rotation scenarios.
