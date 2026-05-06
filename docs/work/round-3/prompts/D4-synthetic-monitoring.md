# D4 — Synthetic Monitoring Canaries

> **Wave D.** SRE worker. Parallel with D1–D3, D5.

## Read first

- [`../plan.md`](../plan.md) — closure item 14.
- B6 SLOs.
- Round-2 real qualification connectivity.

## Tasks

1. **Per-stage canaries** (Lambda on schedule):
   - Every 5 min, the canary submits one DTO per category (table,
     periodic, worker, SST, TS-V, benefit, exclusion, return) to the
     stage-appropriate environment.
   - Synthetic tenant only — never real PII, never real CPF/CNPJ
     for production canaries (gov.br rules apply; round-2 owner
     approves which categories canary in production).
   - Captures ingress→accepted latency.
2. **Canary results**:
   - Pushed as CloudWatch metrics: `canary.success`,
     `canary.latency_ms`, `canary.failure_reason`.
   - Failures → page (with the round-1 + round-3 SLO-burn alarms).
3. **Drift detection**:
   - Canary asserts: emitted XML hash matches a per-family golden
     hash; status update arrives on spool topic; audit row appears.
   - Any drift → alarm.
4. **Dashboard panel** in operator console (D2) shows last-N
   canary runs per stage.

## Primary write scope

- `services/canary/` (new Lambda)
- `infra/cdk/src/canary-stack.ts`
- `tests/integration/canary/`
- `docs/operations.md` — canary runbook
- `docs/release/1.0.0/canary/`

## Do not touch

- Production data — synthetic tenants only.
- Other services' code.

## Exit criteria

- Canary deployed in qualification + restricted-production stages.
- Production canary scope decided (owner-named).
- Failures alarm; metrics dashboard live.
- Drift detection demonstrated by deliberately corrupting a fixture.

## Verification

```text
aws lambda invoke --function-name esocial-canary-qualification …
cloudwatch get-metric-statistics --metric-name canary.success …
```

Report: canary cadence, families covered, alarm thresholds, drift
demo outcome.
