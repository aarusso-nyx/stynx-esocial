# B1 — Real Cert Provisioning + Rotation Automation

> **Wave B.** PKI. Blocked by A1. Parallel with B2, B3.

## Authorization required

- ☐ Real-cert provisioning agreement (CA / partner) signed.
- ☐ Rotation runbook owner named (typically the security team).
- ☐ Cost authorization for cert-provisioning vendor fees.

Record in `docs/release/1.3.0/authorizations/B1.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 2.
- Round-3 prompt `C4-cert-rotation-automation.md`.
- A1 evidence (initial cert provisioned).

## Tasks

1. **`services/cert-rotator/`** Lambda on a schedule:
   - Daily.
   - Selects certs in `tenant_certificate` with
     `not_after - now < 30 days` and `revoked_at IS NULL`.
   - Emits `certificate.rotation_due` audit event + 30-day alarm.
   - For tenants opted into **automatic provisioning**: pulls a
     freshly-provisioned cert from the onboarding flow and updates
     `secret_ref`. Round-3 default is **opt-in**; manual remains the
     path for most tenants.
2. **Cache invalidation**: certificate-store cache subscribes to a
   "rotation" event; on rotation, all stale handles evicted within
   seconds. Test demonstrates the eviction.
3. **Drill** (extends the round-1 drill with real material):
   - Provision a tenant cert with `not_after` 1 hour ahead.
   - Submit a build → success.
   - Roll the clock past `not_after`.
   - Submit a build → `CertificateExpiredError` → `validation_failed`.
   - Insert a rotated cert (new ARN, new `not_after`).
   - Submit a build → success without code changes.
4. **Expiry alarms**:
   - 30-day alarm: ticket.
   - 7-day alarm: page.
   - 0-day (expired): page + circuit-breaker open for that tenant
     until rotated.
5. **Evidence** under `docs/release/1.3.0/cert-rotation/`: drill
   timeline, alarm history, cache eviction trace.

## Primary write scope

- `services/cert-rotator/`
- `infra/cdk/src/cert-rotator-stack.ts`
- `packages/domain/src/certificate-store/` (cache eviction hook)
- `tests/integration/cert-rotation/`
- `docs/operations.md` — automated-rotation runbook
- `docs/release/1.3.0/cert-rotation/`

## Do not touch

- Storage of certificate bytes in DB (forbidden; remains as Secrets
  Manager reference only).
- Other waves' resources.

## Exit criteria

- Rotator Lambda deployed in restricted-production.
- Drill executed end-to-end with real cert.
- Alarms fire at 30 / 7 / 0-day thresholds (verified).
- Cache eviction tested.

## Verification

```text
npm run cdk:synth:restricted-production
npm run test:integration -- cert-rotation
ls docs/release/1.3.0/cert-rotation/
```

Report: rotation cadence, alarms tested, drill outcome.
