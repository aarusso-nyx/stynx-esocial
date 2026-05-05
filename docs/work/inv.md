# eSocial Repository Inventory

Assessment scope: live repository state at commit
`f68758eabcfff74fec250c68314c9f2027e22926`, with a pre-existing dirty
worktree. This inventory treats existing dirty files as current input evidence
and does not assume they are committed.

## Baseline Evidence

Required preflight was run from repository root:

```text
pwd
/Users/aarusso/Development/stech/stynx-esocial

git status --short --branch
## main...origin/main
... broad existing dirty tree ...

npm test
4 node:test contract checks passed
```

Advertised command surface was also run:

| Command | Result | Evidence value |
| --- | --- | --- |
| `npm test` | Passed | Runs two files under `tests/contract/` with four structural assertions. |
| `npm run lint` | Passed | Runs `node scripts/check.mjs lint`; checks required paths and forbidden migration strings. |
| `npm run build` | Passed | Same structural checker as lint, not TypeScript compilation. |
| `npm run coverage` | Passed | Same structural checker as lint, not coverage instrumentation. |
| `npm run test:db` | Passed | Regex migration checker, not a live PostgreSQL migration/RLS test. |
| `npm run migrate:dev` | Passed | Same regex migration checker. |
| `npm run integration:localstack` | Passed | Same regex migration checker, not LocalStack. |
| `npm run test:integration` | Passed | Same regex migration checker, not an integration suite. |
| `npm run cdk:synth` | Passed | Static script rewrote `infra/cdk/cdk.out/esocial-{dev,qa}.template.json`. |

## Repository Shape

| Area | State | Inventory |
| --- | --- | --- |
| Authority docs | Partially complete | `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/consumers.md`, `docs/events.md`, and `docs/codex-bootstrap.md` define the standalone boundary and acknowledge production gaps. |
| Legal/reference corpus | Partially complete | `docs/references/` contains eSocial notes and retained source snapshots. `docs/references/law-esocial.md` still points at stale `docs/refs/...` paths while actual files live under `docs/references/...`. |
| Golden/reference fixtures | Mostly complete as evidence | 54 files under `docs/templates/golden/` plus the WSDL fixture under `docs/templates/wsdl/`. These are valuable byte-sensitive examples, not all active tests. |
| Contracts package | Partial | `packages/contracts/` defines queue, audit, spool, generic payload, and submit payload types. Runtime event-class coverage is currently narrowed to `EsocialRelayEventClass = 'S-1299'`. |
| Active domain package | Partial | `packages/domain/src/submission/submission-processor.ts` produces a simulated accepted response and spool update for submit envelopes. It does not build XML, validate XSD, sign, call SOAP, persist state, or publish. |
| Lifted SGP domain code | Evidence-rich but not product-ready | `packages/domain/src/sgp-lifted/esocial-worker/` contains 234 files, including 35 event builders, 53 XSD files, parsers, signing, SOAP, retry, certificate, and queue-adapter code. It still imports missing SGP runtime modules and references SGP schemas directly. |
| Service entrypoints | Skeleton | `services/submission` calls the simulated processor. Other services return `{ service, records, boundary: 'esocial' }` only. |
| PKI package | Stub | `packages/pki-pades/src/index.ts` only describes a future signing boundary after R7. Actual lifted signing code exists under `packages/domain/src/sgp-lifted/.../signature/`, not as the standalone package boundary. |
| Database migrations | Minimal partial | Migrations create schema `esocial`, three tables (`submission_message`, `submission_batch`, `event_record`), audit/touch triggers for two tables, and RLS policies. They do not cover most tables/views/types referenced by lifted code. |
| CDK/infra | Skeleton | Static generated templates define one EventBridge bus, submit request/response FIFO queues, and a submit DLQ for `dev` and `qa`. There are no Lambda functions, IAM policies, VPC/RDS, secrets, metrics, alarms, or LocalStack integration. |
| Tests | Partial and mostly inactive | Active tests are two `node:test` files in `tests/contract/`. The lifted corpus has 154 backend test files under `tests/sgp-lifted/backend/` and 41 lifted domain `*.spec.ts` files, but they are not wired into the active command surface. |
| Toolchain | Missing for production build | No root `tsconfig`, no lockfile, no installed package dependencies, no Jest/Vitest config for active TS specs, and no real TypeScript build target. |

## Complete

- Standalone boundary is documented: schema `esocial`, no direct SGP database
  ownership, queue/EventBridge/backend-only HTTPS transport, sandbox adapters for
  external systems.
- Internal naming is mostly moved from `stynx-esocial` to `esocial` in package
  names, schema filenames, CDK output filenames, and current structural checks.
- Fast structural gates pass.
- Copied eSocial reference material and golden XML examples are present and
  organized for future test promotion.
- Event inventory covers the major lifted families: S-1000..S-1070, S-1200,
  S-1202, S-1207, S-1210, S-1298, S-1299, S-2200, S-2205, S-2206, S-2210,
  S-2220, S-2230, S-2240, S-2298, S-2299, S-2300, S-2306, S-2399, S-2400,
  S-2405, S-2410, S-2416, S-2418, S-2420, S-2501, S-3000, and S-50xx returns.
- The current `services/submission` path can parse SQS-like records and return a
  deterministic accepted submit result for the narrow skeleton contract.

## Partially Done

- Contracts exist but are not contract-complete:
  event class support is effectively `S-1299`; documented states and error
  categories are broader than exported types; versioning/publication workflow is
  not implemented.
- Submission behavior is represented twice:
  a small active simulator under `packages/domain/src/submission/` and a richer
  lifted SGP implementation under `packages/domain/src/sgp-lifted/`. They are
  not reconciled into one standalone runtime.
- XML builders and parsers are copied with goldens, but most are still coupled
  to SGP tables such as `hr.*`, `payroll.*`, `saude.*`, and
  `public.esocial_event`.
- Migrations prove the intended schema name and a minimal RLS posture, but not
  the tables required by lifted services, idempotency, retries, returns,
  certificate custody, totalizers, or audit trails.
- SOAP/signing/retry code exists in the lifted tree, but it cannot be treated as
  active product code until missing dependencies, missing local modules, and
  direct SGP database coupling are removed.
- CDK produces queue skeletons, but the runtime deployment surface is not
  represented.
- Documentation is useful and honest about gaps, but there is no operations
  runbook, no consumer SDK reference, no sandbox evidence, and at least one
  stale reference path in `docs/references/law-esocial.md`.

## Missing

- A real MQ handler that validates queue envelopes, enforces idempotency,
  persists `esocial` state, invokes XML/XSD/signing/submission/return logic, and
  publishes response, spool, audit, retry, and DLQ outputs.
- A compileable standalone TypeScript/Nest runtime with explicit dependencies,
  lockfile, `tsconfig`, build output, and module boundaries that do not import
  deleted SGP infrastructure.
- A full autonomous `esocial` database model for certificate custody,
  submission batches, event records, event-specific pending/state tables,
  retries, response classification, totalizers, circuit state, audit evidence,
  and RLS policies.
- Live PostgreSQL migration execution and tenant-isolation tests.
- LocalStack or equivalent integration tests for SQS FIFO, response queues,
  EventBridge audit/status events, DLQ, retries, and replay.
- Active golden XML tests promoted from the lifted builder/parser corpus.
- Active XSD validation, XML security, signing, SOAP stub, restricted-production
  routing, and return/totalizer parser tests.
- PKI/certificate lifecycle implementation in `packages/pki-pades/` or a
  dedicated service boundary, including custody, rotation, revocation, audit,
  and secret handling.
- Durable status publication semantics back to SGP without writing SGP tables.
- Observability: structured logs, metrics, traces, alarms, correlation IDs,
  dashboards, and runbooks.
- Deployment evidence: real CDK constructs for Lambdas, queues, DLQs,
  EventBridge, IAM, secrets, network, database, and environment separation.
- Consumer migration notes and versioned contract publication for SGP.
