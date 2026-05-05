# 00 — Round-0 Fixups (blocking)

> **Wave A.** Coordinator scope. Blocks every other round-1 batch. **Do not
> proceed to Batch 01 until this is fully merged and CI is green.**

## Read first

- [`../plan.md`](../plan.md) — round-1 closure target items 1, 2, 3, 6,
  7, 8, 9, 10, 11.
- [`../assessment.md`](../assessment.md) — round-0 closure audit
  synthesis. The 11-item table at the bottom enumerates what's PARTIAL/
  FAIL.
- `docs/release/0.1.0/release-checklist.md`.
- `package.json`, `vitest.config.ts`, `tsconfig.base.json`,
  `.github/workflows/`.

## Why this exists

Round 0 closed behaviorally — the pipeline really runs — but four of its
eleven closure items are PARTIAL/FAIL. Promoting 30 more families on top
of those gaps would compound risk. Batch 0 closes them in one focused
pass before any family promotion proceeds.

## Tasks

### 1. Make `npm run cdk:synth` real and gated

- Add `cdk:synth` to root `package.json` invoking `cdk synth --all` from
  `infra/cdk/`. Forward args through.
- Add `cdk:synth:qualification`, `cdk:synth:restricted-production`,
  `cdk:synth:production`. The production variant must check
  `ESOCIAL_PROD_CONFIRM=1` and exit non-zero otherwise.
- Add an IAM-scope assertion script
  `scripts/assert-cdk-iam-scoped.mjs` that walks
  `infra/cdk/cdk.out/*.template.json` (or the in-memory tree) and
  fails on any `Resource: "*"` or wildcard action
  (`sqs:*`, `kms:*`, `secretsmanager:*`, `logs:*`, etc.). Allow specific
  documented exceptions (e.g., `logs:CreateLogGroup` on `arn:aws:logs:*:*:*`
  if needed) only via an inline allowlist with a comment.
- `.github/workflows/ci.yml`: add a step in the `integration` job that
  runs `npm run cdk:synth:qualification` and
  `npm run cdk:synth:restricted-production` followed by
  `node scripts/assert-cdk-iam-scoped.mjs`. Production synth runs only
  on tagged release jobs.

### 2. Fix coverage aggregation

- The accepted Batch-0 threshold is **70 %**. Apply one coverage authority
  consistently:
  1. **Vitest absorbs the `node --test` suites.** Convert
     `tests/golden/*.test.mjs`, `tests/db/*.test.mjs`,
     `tests/integration/*.test.mjs`, `tests/returns/*.test.mjs`,
     `services/retorno/__tests__/*.test.mjs` to vitest specs (rename
     `.test.mjs` → `.test.ts`, port assertions to `expect`).
  2. **The active `node --test` suite is the coverage authority.**
     Run it with `--experimental-test-coverage`, parse the final `all files`
     summary, and fail below the accepted threshold. Vitest may still run for
     behavior, but its tiny standalone coverage report must not be the gate.
  Pick (1) if the conversion cost is small (the suites are
  assertion-light) and (2) only if it isn't.
- Enforce at least 70 % line and function coverage. Branch coverage is still
  reported in the summary and tracked for hardening, but it is not the Batch-0
  blocker after the owner-accepted threshold change.
- `npm run coverage` exits non-zero on threshold breach. CI gates on it.

### 3. Wire CI to gate the missing items

- `.github/workflows/ci.yml`:
  - `unit` job runs `coverage` with thresholds enforced.
  - `integration` job runs `cdk:synth` + IAM-scope assertion.
  - Both jobs must pass for PR merge (document the required-checks list
    in `docs/operations.md`).
- `.github/workflows/release.yml`:
  - Trigger on `main` push for `packages/contracts/**` changes (or tag
    `contracts-v*`).
  - Run unit + integration before publish.
  - Publish `@esocial/contracts` (currently 1.0.0) on a fresh tag if
    not already published. **If publishing is owner-blocked, change
    the trigger to a manual `workflow_dispatch` and document the
    blocker in `docs/release/0.2.0/release-checklist.md`** — do not
    silently leave it deferred.

### 4. Enforce envelope `version: 'v1'` at ingress

- `services/submission/src/handler.ts`: validate `envelope.version === 'v1'`
  before any other processing. On mismatch: typed `EnvelopeVersionError`,
  DLQ publish, no DB row, no batch-item failure.
- Test: a fixture with `version: 'v0'` and a fixture with no `version`
  field both hit DLQ.

### 5. Invoke the idempotency-key builder at ingress

- The handler must call `buildEsocialIdempotencyKey(...)` and assert it
  matches the envelope's declared key. On mismatch or missing key:
  validation failure, audit row, no DB write, spool publishes
  `validation_failed`.
- Update `docs/sgp-migration.md` and `docs/consumers.md` to state the
  rule explicitly. Bump `@esocial/contracts` to **1.1.0-rc.0** if the
  rule is a behavior tightening that SGP must adopt; pre-1.0
  consumers may need a one-round overlap, document it.
- Test: envelope with mismatched key → rejection.

### 6. Behavioral test for append-only history

- Under `tests/db/`, add `append-only.test.ts` (or `.mjs`):
  - Insert a row in `audit_event_log` and `event_status_history`.
  - Switch to the worker role.
  - Attempt `UPDATE` and `DELETE` on each.
  - Assert `expect(...).toThrow()` with the trigger's typed message.

### 7. Behavioral test for PII redaction

- Under `tests/observability/`, add `redaction.test.ts`:
  - Build a Pino logger via `createLogger()` writing to a memory stream.
  - Log fixtures containing CPF, CNPJ, salary, certificate fingerprint,
    raw XML.
  - Assert no verbatim CPF/CNPJ/salary appears in captured output;
    assert cert fingerprint is masked to last 8 chars; assert XML body
    is omitted.

### 8. Explicit TLS rejection on real SOAP client

- `SoapClientTransport`: pass `rejectUnauthorized: true` explicitly to
  the underlying client.
- Test: instantiate the client against an HTTPS server with a
  self-signed cert; assert connection rejection.
- Test: instantiate against `http://example.com` for `production`
  stage; assert factory throws at construction.

### 9. Authenticate the DLQ replay endpoint

- `services/http-gateway/src/handler.ts`: replace the 501 stub for
  `POST /dlq/:id/replay` with a real handler protected by **either**
  IAM SigV4 (verified via API Gateway authorizer config in CDK)
  **or** a typed JWT/OIDC verifier. Pick one and document the choice
  in `docs/operations.md`.
- The handler:
  - Loads the `dlq_item` row.
  - Verifies idempotency-key clash policy from
    [round-0 C1 prompt](../../round-0/prompts/C1-retry-dlq-replay.md):
    refuses replay on clash unless `?force=true`.
  - Appends `audit_event_log` row of kind `dlq.replay` with the actor.
  - Re-publishes onto the request queue with a new `correlationId`.
- Tests: unauthenticated request → 401/403; authenticated replay →
  200 + audit row; clash without `force` → 409; clash with `force` →
  200 + audit row indicating force.

### 10. Forward migration: per-family emission/pending state for round-1

Round-1 families need new emission/pending state tables. Land **only the
schema** in this batch; the families themselves bind to them in batches
1–4. Forward migrations covering at minimum:

- Generic `s1xxx_dispatch_state` covers tables not already covered.
- Per-event tables for the round-1 families that need their own state
  (S-2210, S-2220, S-2230, S-2240, S-2298, S-2299, S-2306, S-3000).
- Indexes for idempotency lookup keyed on (tenant, environment,
  event_class, source_event_id).

A schema-only landing with no callers is acceptable here — Batches 1–4
become callers.

### 11. Round-0 lifted-source debt

For the **five round-0 families only** (S-1000, S-1010, S-1200, S-1299,
S-2200), delete the lifted source under
`packages/domain/src/sgp-lifted/.../builders/<family>/` and the
matching tests under `tests/sgp-lifted/`. Round-0 was supposed to do
this and didn't. Run the integration suite after deletion to prove the
active path still passes.

## Primary write scope

- `package.json` (scripts), `vitest.config.ts`, `tsconfig.base.json`
- `.github/workflows/ci.yml`, `release.yml`
- `infra/cdk/**` (synth wiring; no resource changes)
- `scripts/assert-cdk-iam-scoped.mjs` (new)
- `services/submission/src/handler.ts` (version + idempotency-key)
- `services/http-gateway/src/handler.ts` (DLQ auth)
- `packages/domain/src/transport/**` (TLS guard)
- `packages/domain/src/observability/**` (redaction; tests only)
- `tests/db/append-only.test.*` (new), `tests/observability/redaction.test.*`
  (new)
- `infra/migrations/**` (forward migrations only — for round-1 families'
  state tables; no mutations to landed files)
- Lifted-source deletion for the five round-0 families
- `docs/operations.md`, `docs/sgp-migration.md`, `docs/consumers.md`
  (only the doc deltas the items above demand)

## Do not touch

- Active builders (S-1000, S-1010, S-1200, S-1299, S-2200) — Batches
  1–4 might extend them; this batch leaves them as is.
- Lifted source for non-round-0 families.
- The 5 no-op service handlers (`tabelas`, `trabalhador`, `folha`,
  `fechamento`, `exclusao`) — Batch 6 owns the triage.
- `packages/contracts/src/dtos/round1-pending.ts` — Batches 1–4 retire
  it family-by-family.
- Round-0 evidence bundle under `docs/release/0.1.0/`.

## Exit criteria

- Every round-0 closure item from
  [`../assessment.md`](../assessment.md) at the bottom flips to PASS.
- `npm run cdk:synth` exists and runs.
- IAM-scope assertion script passes.
- Coverage thresholds enforced; CI fails below threshold.
- `tests/db/append-only.test.*` passes.
- `tests/observability/redaction.test.*` passes.
- DLQ replay endpoint requires auth; tests cover 401/200/409 paths.
- Envelope `version: 'v1'` enforced; tests cover mismatch.
- Idempotency-key invocation enforced; tests cover mismatch.
- TLS `rejectUnauthorized: true` explicit and tested per stage.
- Five round-0 families' lifted source is deleted; integration suite
  green.
- New per-family state migrations land (callers come in Batches 1–4).

## Verification

```text
rm -rf node_modules **/dist
npm ci
npm run build
npm run lint
npm run coverage           # must respect thresholds and pass
npm run test:db            # includes append-only test
npm run test:integration   # includes envelope-version + idempotency tests
npm run integration:localstack
npm run cdk:synth:qualification
npm run cdk:synth:restricted-production
node scripts/assert-cdk-iam-scoped.mjs
ls packages/domain/src/sgp-lifted/esocial-worker/builders/ | grep -E "s1000|s1010|s1200|s1299|s2200"
# Expected: empty
```

Report:
- Which round-0 closure items moved from PARTIAL/FAIL to PASS (target:
  all four).
- Coverage numbers post-aggregation fix.
- IAM-scope assertion result (count of statements scanned, exceptions
  if any).
- Round-1 state-table migration list.
