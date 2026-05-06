# Round 3 Execution Status

Date: 2026-05-06

## Start Gate

Round 3 cannot be honestly marked started against its own plan yet.

Blocking facts from live repository state:

- `docs/release/0.3.0/README.md` records official eSocial endpoint calls,
  real certificates, real PII, restricted-production deployment, and
  real-service submission as blocked.
- `docs/release/0.3.0/owners.md` records required owner approvals as not
  recorded.
- `docs/release/0.2.0/release-checklist.md` still has open release-owner,
  SGP-owner, and regulatory-owner checklist items.

Therefore this pass executed only local-safe Wave A/D/F preparation and did not
call real endpoints, use real certificates, deploy restricted-production,
publish packages, or claim Round 3 closure.

## Executed

### A1 Coverage Baseline

Current `npm run coverage` result after the local-safe operations and prompt
scaffolding:

- line: 78.91%
- branch: 70.38%
- functions: 79.72%
- enforced threshold: 70%

The requested 95% Round 3 threshold is not safe to enable yet because it would
break CI immediately.

### A2 Type Strictness Preparation

Completed:

- Removed active `as unknown` casts from submission and retorno handlers.
- Added the active-source canary for `any`, `as any`, `as unknown`, and `<any>`
  casts in `scripts/check.mjs`.
- Enabled `noFallthroughCasesInSwitch` in `tsconfig.base.json`.
- Enabled `noPropertyAccessFromIndexSignature` in `tsconfig.base.json` and
  completed the active mechanical migration.
- Added `packages/contracts/src/branded.ts` with branded constructors for
  tenant, event class, idempotency, correlation, protocol, receipt, CPF, and
  CNPJ values.
- Added compile-time branded type canaries under `tests/types/`.
- Added the central exhaustive helper under
  `packages/domain/src/internal/exhaustive.ts` and migrated active builder
  switch sites to it.

Remaining:

- Full branded-type adoption across every public and internal signature remains
  incremental work; the constructors and type tests are now present.
- ESLint `switch-exhaustiveness-check` and broader `no-unsafe-*` rules remain
  a separate hardening pass because enabling them globally would expand the
  change outside this local-safe batch.

### A3 Typed Configuration Layer

Completed:

- Added `packages/domain/src/config/index.ts`.
- Moved active service env reads behind typed config loaders.
- Added active-source canary rejecting `process.env` outside
  `packages/domain/src/config/`.
- Added config validation/redaction tests.

Current active `process.env` occurrences are restricted to
`packages/domain/src/config/index.ts`.

### Local-Safe Coverage Lift

Completed:

- Added `tests/operations/retry-replay-circuit.test.mjs`.
- Wired `tests/operations/*.test.mjs` into `npm test`.
- Wired `tests/operations/*.test.mjs` into `npm run coverage`.
- Covered retry decisions, retry schedule poller dispatch/defer/DLQ behavior,
  replay request derivation/clash handling, and circuit-breaker transition
  audit behavior.

Coverage movement from this pass:

- line: 74.91% -> 78.91%
- functions: 76.96% -> 79.72%

### A5 Local Perf Scaffolding

Completed:

- Added `scripts/perf-regression.mjs`.
- Added `bench:smoke`, `bench`, and `bench:baseline` scripts.
- Captured a local deterministic baseline at
  `docs/release/1.0.0/perf-baselines/builder.json`.

The local smoke benchmark covers builder, idempotency-key, return-parser,
SOAP-stub, and DTO validation paths. It does not claim real capacity or
restricted-production SLO evidence.

### B1 Local Chaos Scaffolding

Completed:

- Added seeded local chaos tests under `tests/chaos/`.
- Added `test:chaos`.
- Added seed inventory under `docs/release/1.0.0/chaos/local-seeds.json`.

Covered local scenarios: publisher transient failure recovery, SOAP timeout
circuit transition, cert-expiry classification, and partial-batch survivor
dispatch. Restricted-production drills remain blocked by owner approval and
deployed infrastructure.

### D1 SDK Scaffold

Completed:

- Added `packages/sdk` as `@esocial/sdk@1.0.0-rc.0`.
- Added `EsocialClient`, `RecordingTransport`, branded config inputs, and a
  compile-checked S-1299 example.
- Added `tools/codemods/sgp-1.0-to-1.x/transform.cjs` as a local codemod
  scaffold.
- Documented SDK/codemod usage in `docs/sgp-migration.md`.

Publishing remains blocked until explicit release authorization.

### D5 OpenAPI / AsyncAPI

Completed:

- Added `packages/contracts/openapi.yaml`.
- Added `packages/contracts/asyncapi.yaml`.
- Added `packages/contracts/src/spec-generation/check-specs.mjs`.
- Added `specs:check`.

The spec check is a local contract canary. Full Spectral/OpenAPI-generated
client validation remains future work because the dependency/tooling was not
added in this local-safe batch.

### F2 Evidence Bundle Automation

Completed:

- Expanded `scripts/release-evidence.mjs` to preserve prompt-owned artifacts,
  copy specs and SDK metadata into `docs/release/1.0.0/`, and write a
  hash-indexed `evidence-manifest.json`.
- Added explicit blocked entries for restricted-production, real certificates,
  official endpoints, DR/multi-region drills, and SDK publish.

## Verified

Commands run successfully after the local-safe work:

```text
npm run build
npm run lint
npm test
npm run coverage
npm run test:chaos
npm run bench:smoke
npm run bench:baseline
npm run specs:check
npm run build --workspace @esocial/sdk
node scripts/release-evidence.mjs --version 1.0.0
```

## Next Unblockers

1. Record Round 2 owner approvals and real-service authorization.
2. Close restricted-production deployment and real qualification evidence.
3. Raise coverage incrementally from 70% toward 95% by targeting low-coverage
   active modules first: retry/replay/circuit-breaker, SOAP transport, Postgres
   repositories, and return/submission edge branches.
4. Continue branded-type adoption across SDK, service repositories, and all
   public contract helper signatures.
5. Add Spectral/OpenAPI client-generation validation once dependency policy for
   spec tooling is approved.
