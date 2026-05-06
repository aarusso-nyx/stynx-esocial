# C4 — Certificate Rotation Automation

> **Wave C.** PKI worker. Parallel with C2, C3, C5–C7.

## Read first

- [`../plan.md`](../plan.md) — closure item 10.
- Round-1 prompt 06 — cert rotation drill.
- `services/certificado/`.

## Tasks

1. **Rotation Lambda** (`services/cert-rotator/`) on a schedule:
   - Runs daily.
   - Selects certs in `tenant_certificate` with `not_after - now <
     30 days` and `revoked_at IS NULL`.
   - For each: emits a `certificate.rotation_due` audit event and a
     CloudWatch alarm fires for SRE follow-up (24-h SLA).
   - For tenants opted into **automatic provisioning** (round-2
     scoped): pulls a freshly-provisioned cert from a tenant
     onboarding flow and updates `secret_ref`. Round-3 default is
     **opt-in**; manual remains the path for most tenants.
2. **Cache invalidation**: certificate-store cache (round-1 Batch 6)
   subscribes to a "rotation" event; on rotation, all stale handles
   evicted within seconds. Test demonstrates the eviction.
3. **Drill automation** (extends round-1 hardening):
   - A scheduled chaos scenario (B1) rolls a tenant cert mid-flight;
     the system handles it without failed submissions.
4. **Expiry alarms**:
   - 30-day alarm: ticket.
   - 7-day alarm: page.
   - 0-day (expired): page + circuit-breaker open for that tenant
     until rotated.

## Primary write scope

- `services/cert-rotator/`
- `infra/cdk/src/cert-rotator-stack.ts`
- `packages/domain/src/certificate-store/` (cache eviction hook)
- `tests/integration/cert-rotation/`
- `docs/operations.md` — automated-rotation runbook

## Do not touch

- Storage of certificate bytes in DB (forbidden; remains as
  Secrets Manager reference only).
- Other waves' resources.

## Exit criteria

- Rotator Lambda deployed; daily schedule.
- Alarms wired; 30/7/0-day thresholds.
- Cache eviction tested.
- Chaos scenario demonstrates mid-flight rotation safety.

## Verification

```text
npm run cdk:synth
npm run test:integration -- cert-rotation
```

Report: rotation cadence, alarm thresholds, chaos drill outcome,
tenants onto auto vs. manual rotation.
