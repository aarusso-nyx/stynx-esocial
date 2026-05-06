# B3 — Synthetic Monitoring Canaries

> **Wave B.** SRE. Blocked by A1. Parallel with B1, B2.

## Authorization required

- ☐ Owner approves canary scope per stage (especially production —
  defer to R7 if not approved here).
- ☐ Synthetic-tenant budget approved (canary submissions accumulate
  under a synthetic CNPJ).

Record in `docs/release/1.3.0/authorizations/B3.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 5.
- Round-3 prompt `D4-synthetic-monitoring.md` (the design lives there).
- A1 evidence (real-endpoint round-trip).

## Tasks

1. **`services/canary/`** Lambda on a 5-minute schedule:
   - Submits one DTO per category to the stage-appropriate
     environment.
   - Synthetic tenant only — never real PII / production CNPJs.
   - Captures ingress → accepted latency.
2. **CloudWatch metrics**: `canary.success`, `canary.latency_ms`,
   `canary.failure_reason`. Failures → page (R5 C2 burn alarms).
3. **Drift detection**:
   - Canary asserts emitted XML hash matches a per-family golden
     hash; status update arrives on spool topic; audit row appears.
   - Drift → alarm.
4. **Stage scope**:
   - **qualification**: full canary set.
   - **restricted-production**: full canary set.
   - **production**: scope owner-approved per category. If owner
     declines for a category, mark deferred-to-R7 in
     `docs/release/1.3.0/canary/scope.md`.
5. **Dashboard panel** in operator console (R7 wires the console
   itself; B3 only emits the metrics + a placeholder doc).

## Primary write scope

- `services/canary/`
- `infra/cdk/src/canary-stack.ts`
- `tests/integration/canary/`
- `docs/operations.md` — canary runbook
- `docs/release/1.3.0/canary/`

## Do not touch

- Production data — synthetic tenants only.
- Operator console (R7 owns).

## Exit criteria

- Canary deployed in qualification + restricted-production.
- Production canary scope decision recorded.
- Failures alarm; metrics dashboard live.
- Drift detection demonstrated by deliberately corrupting a fixture.

## Verification

```text
aws lambda invoke --function-name esocial-canary-qualification …
aws cloudwatch get-metric-statistics --metric-name canary.success …
```

Report: canary cadence, families covered, alarm thresholds, drift demo
outcome, production scope.
