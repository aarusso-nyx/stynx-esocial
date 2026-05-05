# 06 — Hardening Pass

> **Wave C (closure).** Blocked by Batch 0 (its prerequisites) and
> Batch 5 (its release context). Coordinator scope.

## Read first

- [`../plan.md`](../plan.md) — round-1 closure target items 6, 7, 8, 9, 10, 11, 12.
- [`../assessment.md`](../assessment.md) — security findings.
- Round-0 prompts B3 (PKI/security), C1 (retry/DLQ), C2 (observability).

## Why this exists

Batch 0 closed the most urgent round-0 leftovers. Some hardening work is
broader than fixups and benefits from being done after round-1 family
promotion is stable: no-op service handler triage, a positive
sgp-lifted import canary, deeper RLS-deny coverage, full observability
parity for round-1 families, certificate-rotation drill.

## Tasks

### 1. No-op service handler triage

Five services return placeholder data: `tabelas`, `trabalhador`,
`folha`, `fechamento`, `exclusao`. Decide per-service:

- **Keep + implement**: write a real handler. The handler may be a thin
  router that forwards to the existing submission pipeline by event
  class (e.g., `tabelas` routes table-event submit envelopes the same
  way `submission` does for everything else). If we keep a service,
  it must have a real reason — typically a distinct queue or
  authorization profile.
- **Delete**: remove from CDK Lambda surface, from workspaces, from
  `package.json` workspaces array, from runbooks. Update
  `docs/operations.md`. The CDK synth-IAM gate (Batch 0) verifies the
  removal didn't leave dangling IAM.

Document the per-service decision in `docs/architecture.md` with a
one-paragraph rationale. The default expectation: `submission` and
`retorno` are the only Lambda handlers needed; the five no-ops are
deletion candidates unless an owner names a use case.

### 2. Positive sgp-lifted import canary

`scripts/check.mjs` bans `hr.*`, `payroll.*`, `saude.*`,
`public.esocial_event`, `@nestjs`, `backend/src`. Add a positive
assertion: **no active code path may import from `sgp-lifted/`.**

```js
// scripts/check.mjs (addition)
const imports = grepActiveImportSpecifiers();
const liftedImports = imports.filter(i => i.includes('/sgp-lifted/'));
if (liftedImports.length > 0) fail('active code imports from sgp-lifted/', liftedImports);
```

Wire under `npm run lint:boundaries`. Run in CI on every PR.

### 3. Per-stage TLS rejection coverage

Batch 0 added explicit `rejectUnauthorized: true` and a single test.
This batch expands coverage:

- **Per-stage tests**: `qualification` (stub allowed), `restricted-production`,
  `production` — assert factory throws on `http://`.
- **Cipher suite asserts**: production transport must use TLS 1.2+ and
  reject downgrade. Add a smoke test.
- **Certificate-pinning hook**: stub the production transport with a
  pinned-cert verification function. Round 2 will populate real
  thumbprints; Batch 6 wires the hook.

### 4. RLS / append-only deeper coverage

Round-0-fixups (Batch 0) added the basic UPDATE/DELETE rejection test.
Extend:

- **TRUNCATE rejection** under worker role.
- **Cross-tenant SELECT denial**: tenant A worker session attempting
  to read tenant B rows returns empty (RLS) and audit row is
  appended.
- **Worker bypass scope**: worker role can SELECT all tenants for
  operational queries but cannot DML cross-tenant.

### 5. Observability parity for round-1 families

Every round-1 family must emit the named log fields and named metrics
defined by Round-0 prompt C2. Add a structural test:

```ts
it('every active builder emits a build-stage log with required fields', () => {
  for (const family of ESOCIAL_RELAY_EVENT_CLASSES) {
    const captured = runBuilderUnderLogger(family, sampleDto(family));
    expect(captured).toContainPinoLineWithFields([
      'requestId', 'correlationId', 'tenantId', 'eventClass', 'stage'
    ]);
  }
});
```

Same for the `sign`, `submit`, `parse-return`, `publish` stages where
the family flows through them.

### 6. Certificate-rotation drill

Round-0 schema and custody service support rotation; Round-0
operations.md described it. Batch 6 adds a behavioral test:

- Provision a tenant cert with `not_after` 1 hour from now.
- Submit a build → assert success.
- Roll the clock past `not_after`.
- Submit a build → assert `CertificateExpiredError` and event status
  `validation_failed` with category `signing`.
- Insert a rotated cert (new ARN, new `not_after`).
- Submit a build → assert success without code changes.

### 7. PII redaction expanded

Batch 0 added a unit test for the redaction policy. Batch 6 adds:

- **End-to-end test**: drive a full DTO → integration round-trip with
  CPF/CNPJ/salary fixtures; capture all log lines; assert no verbatim
  leak across the whole pipeline.
- **Metric label hygiene**: assert no metric labels carry PII (`tenantId`
  is opaque, never CPF/CNPJ).

### 8. Operator alarm completeness

Round-0 declared an alarm registry. Batch 6 verifies:

- Each declared alarm has a corresponding metric being emitted (a CI
  test asserts the union of declared alarm metric names ⊆ emitted
  metric names).
- Each alarm has a runbook entry in `docs/operations.md` referencing
  the page operators see.

## Primary write scope

- `services/{tabelas,trabalhador,folha,fechamento,exclusao}/` — per
  decision: implement or delete.
- `infra/cdk/src/` — Lambda surface trimmed if services are deleted.
- `scripts/check.mjs` — positive sgp-lifted import canary.
- `packages/domain/src/transport/` — TLS hardening + cert-pinning hook.
- `tests/db/rls.test.ts` — extended.
- `tests/observability/log-fields.test.ts` (new).
- `tests/observability/redaction-e2e.test.ts` (new).
- `tests/certificado/rotation.test.ts` (new).
- `infra/cdk/src/alarms.ts` (audit only; no resource changes unless a
  metric name was missed).
- `docs/architecture.md` — service-deletion rationale.
- `docs/operations.md` — alarm runbook entries; service surface update.

## Do not touch

- Active builders (Batches 1–4 own them).
- Contract DTOs (Batches 1–4 own them).
- Migrations.
- Round-0 or round-1 evidence bundles (read-only).

## Exit criteria

- All five no-op services are either real or deleted with named
  rationale.
- Positive sgp-lifted import canary in `lint:boundaries`; CI fails on
  active import.
- Per-stage TLS tests cover qualification, restricted-production,
  production.
- RLS deeper coverage tests pass (TRUNCATE deny, cross-tenant deny,
  worker bypass scope).
- Observability parity test passes for all 39 event classes.
- Certificate-rotation drill test passes.
- E2E PII redaction proof captured (artifact links into
  `docs/release/0.2.0/redaction/`).
- Alarm registry ↔ emitted metrics ↔ runbook entries are aligned and
  tested.

## Verification

```text
npm run build
npm run lint
npm run lint:boundaries        # includes sgp-lifted positive canary
npm run coverage
npm run test:db                # RLS deep
npm run test:integration       # observability parity, redaction e2e
npm run cdk:synth              # Lambda surface trimmed if services deleted
node scripts/assert-cdk-iam-scoped.mjs
```

Report: services kept/deleted (and why), positive canary first-fail
demo, alarm/metric/runbook alignment matrix, certificate-rotation
test outcome.
