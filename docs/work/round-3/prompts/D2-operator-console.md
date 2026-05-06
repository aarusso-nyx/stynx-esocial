# D2 — Operator Console

> **Wave D.** Operator UX worker. Parallel with D1, D3–D5.

## Read first

- [`../plan.md`](../plan.md) — closure item 13.
- Round-1 Batch 0 task 9 — DLQ replay auth model.
- C7 audit verification API.

## Tasks

1. **New service** `services/operator-console/` — a small Next.js or
   Remix app (TypeScript), deployed as a Lambda or container behind
   a private endpoint (CloudFront + WAF + auth).
2. **Auth**:
   - Same auth model used by DLQ replay (round-1 Batch 0):
     IAM SigV4 or OIDC.
   - Role-based authorization: `operator`, `auditor`, `admin`.
   - Every action audited (`audit_event_log` row).
3. **Pages**:
   - **DLQ triage**: list `dlq_item` filtered by tenant / class /
     classification; one-click replay (reads round-1's authenticated
     replay endpoint).
   - **Status reconciliation**: views `v_event_failures` and
     `v_competence_periodics_pending`.
   - **Certificate dashboard**: tenant cert table with expiry
     indicators (links to C4 alarms).
   - **Audit verifier**: paste tenant id → run C7 verifier.
   - **LGPD operator panel**: audit DSR requests (C2).
4. **No PII rendered** in tables — IDs, statuses, timestamps. Drill-down
   pages reveal masked fields with "show full" requiring elevated role.
5. **e2e tests** (Playwright):
   - Happy paths per page.
   - Auth-required redirects.
   - Action audit rows appear.
6. **Deployment**:
   - CDK construct adds the console behind CloudFront + WAF.
   - Restricted to known VPN / IP allowlist.

## Primary write scope

- `services/operator-console/**` (new)
- `infra/cdk/src/operator-console-stack.ts`
- `tests/e2e/operator-console/`
- `docs/operations.md` — operator runbooks reference the console

## Do not touch

- Backend handlers (read-only via existing endpoints).
- Other waves' work.

## Exit criteria

- Console deployed; auth enforced; e2e tests green.
- Every page drives a real backend operation; every operation audited.
- No raw PII in any rendered list.

## Verification

```text
npm run e2e --workspace operator-console
curl -I https://console.<stage>.<domain>/  # 401 unauth
```

Report: pages shipped, auth roles, e2e test count, audit rows
captured per console action.
