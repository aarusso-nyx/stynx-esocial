# 05 — Cleanup, Contracts 1.1.0 Release, and 0.2.0 Evidence

> **Wave C (closure).** Blocked by Batches 1–4. Coordinator scope.

## Read first

- [`../plan.md`](../plan.md) — round-1 closure target items 4, 5, 13, 14, 15.
- [`../assessment.md`](../assessment.md).
- `docs/release/0.1.0/` — round-0 evidence layout.
- `packages/contracts/CHANGELOG.md`.

## Why this exists

Once batches 1–4 land, every non-return event class is ACTIVE_FULL.
This prompt:
1. Verifies completeness.
2. Empties (or quarantines with explicit reason) the lifted tree.
3. Releases `@esocial/contracts@1.1.0`.
4. Produces the `docs/release/0.2.0/` evidence bundle.
5. Rewrites README and `docs/README.md` to match production state.

Hardening (Batch 6) follows; round-2 scoping (Batch 7) follows that.
Batch 5 is the first time the project can honestly claim **end-to-end
production-grade coverage of all eSocial event classes**.

## Tasks

### 1. Completeness audit

- For every member of `ESOCIAL_RELAY_EVENT_CLASSES`, assert the
  presence of:
  - DTO file under `packages/contracts/src/dtos/`.
  - JSON Schema under `packages/contracts/schemas/v1/`.
  - Example payload under `packages/contracts/examples/v1/requests/`.
  - Active builder under `packages/domain/src/builders/<family>/` (for
    non-return families) or active parser path under
    `packages/domain/src/returns/` (for S-50xx).
  - Dispatcher entry in
    `packages/domain/src/submission/submission-dispatcher.ts` (non-return).
  - Golden test, metadata test, invalid-DTO test.
  - Integration test inclusion.
- Implement this as a `tests/round1-completeness.test.ts` that walks
  the event-class union and fails on any gap. The test stays in CI as
  a **structural completeness gate** even after round 1 closes.

### 2. Lifted-tree retirement

- Delete `packages/domain/src/sgp-lifted/esocial-worker/builders/`
  entirely.
- Delete `packages/domain/src/sgp-lifted/esocial-worker/parsers/` if
  not still referenced by active code (S-50xx parsers were promoted in
  round 0; verify).
- For anything that still cannot be deleted, create
  `docs/work/round-1/lifted-retention.md` listing every retained file
  with: owner, reason for retention, deletion gate (target round, target
  date), and an issue link if available. Add a `tsconfig.json` exclude
  rule for the retained subset so it stays out of `tsc -b`.
- Delete `tests/sgp-lifted/`. If any fixture is still referenced by an
  active test, copy it into `tests/golden/fixtures/` first.

### 3. Contracts 1.1.0 release

- Bump `packages/contracts/package.json` to `1.1.0`.
- Update `packages/contracts/CHANGELOG.md` with the v1.1.0 entry:
  - 30 new DTOs.
  - JSON Schemas for every event class.
  - Idempotency-key invocation requirement (locked in Batch 0).
  - Envelope `version: 'v1'` enforcement (locked in Batch 0).
  - Any breaking changes from round-0 1.0.0 (likely the
    idempotency-key + version enforcement; if so, flag as
    `1.1.0-rc.0` first and SGP coordination required).
- Tag and publish from CI (release.yml from Batch 0). If publishing is
  owner-blocked, change the trigger to manual `workflow_dispatch` and
  document in `docs/release/0.2.0/release-checklist.md` with a named
  owner.

### 4. 0.2.0 evidence bundle

Create `docs/release/0.2.0/` mirroring the round-0 layout:

- `README.md` — round-1 closure narrative, links to plan/assessment.
- `evidence-manifest.json` — every artifact below with hash + purpose.
- `ci/` — CI run URL, GitHub Actions log archive.
- `contracts/` — published version pointer, full JSON Schema set,
  CHANGELOG diff vs 1.0.0.
- `database/` — migration list, `test:db` output, RLS / idempotency /
  append-only assertion logs.
- `generated-xml/<family>/` — for every event class, golden output and
  hash.
- `input-dtos/<family>/` — for every event class, DTO fixture used.
- `signed-payload/<family>/` — signing hashes (no actual signed bytes
  with real PII).
- `soap/<family>/` — deterministic stub request/response per family.
- `status/<family>/` — emitted spool envelope per family.
- `localstack/` — full round-trip output for one representative family
  per category (table, periodic, worker, SST, TS-V, benefits, process,
  exclusion, returns).
- `coverage/` — coverage report at thresholds.
- `iam/` — `cdk synth` output for `qualification` and
  `restricted-production`, plus the IAM-scope assertion result.
- `redaction/` — captured Pino output proving no PII leak.
- `dlq-auth/` — replay test request/response (401 unauth, 200 auth, 409
  clash).
- `sbom/` — CycloneDX SBOM for contracts and active services.

### 5. README and docs alignment

- Rewrite `README.md` to describe a working production-grade
  bus-driven eSocial service: 39 event classes ACTIVE_FULL,
  end-to-end pipeline, CI badges (from Batch 0), pointers to round-1
  evidence.
- Rewrite `docs/README.md` (currently skeleton) to be an index of the
  doc set.
- Update `docs/operations.md` runbook references to match round-1
  reality (DLQ replay endpoint with auth, full event-class coverage).
- Update `docs/consumers.md` to remove all references to
  `round1Pending` and any "round-0 only" caveats.
- Update `docs/sgp-migration.md` to cover every event class with its
  DTO surface and idempotency-key construction example.

### 6. Round-2 deferrals named

In `docs/release/0.2.0/round-2-scope.md` (placeholder; full scoping
lives in Batch 7 prompt), list:
- Real eSocial qualification connectivity (owner needed).
- Real certificate provisioning (owner needed).
- Restricted-production deployment (owner needed).
- Any operational concerns specific to live transmission.

## Primary write scope

- `packages/domain/src/sgp-lifted/` (deletion)
- `tests/sgp-lifted/` (deletion)
- `tsconfig.json` (exclude rule for any retained subset)
- `packages/contracts/package.json`, `CHANGELOG.md`
- `tests/round1-completeness.test.ts` (new)
- `docs/release/0.2.0/**` (new)
- `docs/work/round-1/lifted-retention.md` (new, only if needed)
- `README.md`, `docs/README.md`
- `docs/operations.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do not touch

- Active builders (Batches 1–4 own them; this batch verifies, not edits).
- Migrations.
- CDK source (Batch 6 owns no-op service triage).
- Round-0 evidence under `docs/release/0.1.0/`.

## Exit criteria

- `tests/round1-completeness.test.ts` passes for all 39 event classes.
- `packages/domain/src/sgp-lifted/` is empty or fully documented in
  `lifted-retention.md`.
- `tests/sgp-lifted/` is gone.
- `@esocial/contracts@1.1.0` is publishable from CI (or has a named
  owner blocking publication).
- `docs/release/0.2.0/` is complete and reproducible from the closing
  commit.
- README and `docs/README.md` reflect production-grade state.
- All gates green:
  ```text
  npm run build
  npm run lint
  npm run coverage          # thresholds enforced
  npm run test:db
  npm run test:integration
  npm run integration:localstack
  npm run cdk:synth
  ```

## Verification

```text
ls packages/domain/src/sgp-lifted/ 2>/dev/null
# expect: empty or only documented retentions
ls tests/sgp-lifted 2>/dev/null
# expect: not found
node -e "const c=require('./packages/contracts/dist'); console.log(c.ESOCIAL_EVENT_CLASSES.length);"
# expect: 39
ls docs/release/0.2.0/
```

Report: lifted-tree shrink delta (file count before → after),
contracts version published, evidence-bundle artifact count,
completeness-gate test fail-mode demonstration (intentionally drop
one entry, confirm gate fails, restore).
