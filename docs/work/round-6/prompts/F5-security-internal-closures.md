# F5 — R5 Internal Security Closures

> **Round-6 Batch F5.** Security owner. Partial-area closure from R5. Parallel.

## Read first

- [`../plan.md`](../plan.md) — Carryover Backlog Batch F5.
- R5 prompt `B1-threat-model.md` and the committed
  `docs/security/threat-model.md` + `attack-tree.md`.
- Round-1 Batch 0 task 9 — DLQ replay auth model + clash policy.
- Round-3 prompt `B4-soap-and-environments.md` — allowlist guard.

## Tasks

### F5.1 — DLQ replay authorization tests

Threat model and attack tree cover the routes; auth gate is in place
since round-1 Batch 0. **Test coverage of the auth surface is thin.**
Add:

- **Negative-auth tests** for `POST /dlq/:id/replay`:
  - Missing token / malformed token / expired token / wrong-issuer
    token → 401.
  - Valid token, wrong tenant → 403.
  - Valid token, correct tenant, **role lacks `replay` permission**
    → 403.
- **Role-escalation tests**:
  - Read-only role attempting to replay → 403 + audit row of kind
    `auth.denied`.
  - Operator role attempting to bypass `?force=true` clash policy →
    409 unless role is `admin`.
- **Replay-clash tests**:
  - Replay where the original idempotency key has since completed →
    409 without `?force=true`.
  - Replay with `?force=true` → 200 + audit row of kind
    `dlq.replay.force` indicating force.
- All tests live under `services/http-gateway/__tests__/dlq-replay/`.

### F5.2 — Runtime network policy evidence

Allowlist guard is implemented; **no runtime evidence proving deployed
code rejects non-allowlisted hosts**. Add:

- **Integration test** under `tests/integration/network-policy/`:
  - LocalStack-based; spin up two HTTP servers (one allowlisted, one
    not).
  - Real `SoapClientTransport` instance under `qualification` stage.
  - Submit a request targeting the non-allowlisted host.
  - Assert: typed `NetworkPolicyDeniedError` thrown; request hash +
    timestamp + denied-host logged via Pino with PII-redaction
    policy applied (R3 C2 + R1 redaction tests).
  - Assert: same client to allowlisted host succeeds.
- **Evidence capture**: dump the captured Pino lines + the
  `audit_event_log` row of kind `network.denied` to
  `docs/release/1.2.0/security/network-policy-evidence.md`.

## Primary write scope

- `services/http-gateway/__tests__/dlq-replay/`
- `tests/integration/network-policy/`
- `docs/release/1.2.0/security/`

## Do not touch

- DLQ replay handler code (already correct; F5 is testing only). If
  the auth code itself has gaps, those route to a separate security
  PR coordinated with Round 7 C1 pen-test owner.
- Allowlist guard code.
- Other carry-over batches.

## Exit criteria

- F5.1 negative-auth + role-escalation + replay-clash tests cover
  every code path that touches `dlq_item`. Coverage on
  `services/http-gateway/src/dlq/` reaches the F1.1 threshold.
- F5.2 integration test captures denied egress with hash + timestamp
  + redaction trace.
- Both evidence files committed.

## Verification

```text
npm run test -- services/http-gateway/__tests__/dlq-replay/
npm run test:integration -- network-policy
ls docs/release/1.2.0/security/
```

Report: test counts, coverage delta on
`services/http-gateway/src/dlq/`, denied-egress trace sample.
