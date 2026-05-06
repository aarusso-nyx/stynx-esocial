# B4 — Secrets / KMS Rotation Automation

> **Wave B.** Security. Blocked by B1. Parallel with B2, B3, B5.

## Read first

- [`../plan.md`](../plan.md) — closure item 7.
- Round-3 prompt `C5-secrets-rotation.md` (the design lives there).

## Why this is greenfield-internal (not owner-blocked)

KMS auto-rotation, RDS-credential rotation, and JWT-signing-key rotation
all rotate **service-side** secrets the project owns. They differ from
**eSocial certificate** rotation (Round 7, owner-blocked) which depends on
external real-cert provisioning.

## Tasks

1. **KMS rotation**:
   - All customer-managed CMKs in CDK have
     `enableKeyRotation: true` (annual auto).
   - A test asserts every CMK in synthesized templates has rotation
     enabled.
2. **Secrets Manager rotation**:
   - **DB credentials** — 30-day rotation Lambda using AWS
     RDS-Secret-Rotation construct.
   - **JWT/API signing keys** (DLQ replay auth, LGPD DSR auth) —
     90-day rotation with rolling-key support so old + new both
     verify during overlap.
   - **(Real eSocial certs are Round 7 — explicitly excluded here.)**
3. **Audit + alarm**:
   - Rotation success → `audit_event_log` row of kind
     `secret.rotated`.
   - Rotation failure → CloudWatch alarm + page; runbook entry.
4. **Application reload**:
   - Lambdas re-fetch secrets on cache TTL expiry (≤ 5 min) so a
     rotated secret is picked up automatically.
   - `loadConfig()` (R3 A3) supports `refresh-on-error` for transient
     auth failures.

## Primary write scope

- `infra/cdk/src/secrets-rotation-stack.ts`
- `services/db-credentials-rotator/` or AWS RDS rotation construct
- `packages/domain/src/config/refresh.ts` (extend R3 A3)
- `tests/integration/secrets-rotation/`
- `docs/operations.md` — rotation runbook
- `docs/release/1.2.0/secrets/`

## Do not touch

- eSocial certificate rotation (Round 7 owns).
- Application semantics beyond secret-refresh hook.

## Exit criteria

- All non-cert secrets have a rotation policy.
- All CMKs have annual auto-rotation.
- Rotation events audited.
- Failure alarms wired and tested in LocalStack.

## Verification

```text
npm run cdk:synth
node scripts/assert-secrets-rotation.mjs
npm run test:integration -- secrets-rotation
```

Report: secret types covered, rotation cadence, alarm thresholds.
