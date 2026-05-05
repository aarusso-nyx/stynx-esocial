# Round 1 — Assessment Synthesis (Round-0 Closure Audit)

> Snapshot of the repository state at round-1 entry. Compiled from four parallel
> deep inspections (feature completeness, code quality + production standards,
> architecture + security, tests + docs + alignment) on 2026-05-05.

## Overall verdict

**Round 0 met its **behavioral** closure target**: the end-to-end pipeline (DTO
→ build → XSD → sign → SOAP stub → persist → publish, plus return parsing for
all S-50xx) **really runs** for the five representative families (S-1000,
S-1010, S-1200, S-1299, S-2200). Architecture is sound. Security posture is
deployable to qualification. Schema, RLS, idempotency, append-only history,
SOAP transport interface, deterministic stub, certificate custody (Secrets
Manager refs), retry/DLQ structure, observability scaffolding, Pino logger,
PII redaction policy, GitHub Actions CI, contract package version 1.0.0, JSON
Schemas, evidence bundle under `docs/release/0.1.0/` — all real.

**Round 0 missed several structural closure items** that the round-1 charter
must absorb before promoting more families:

1. **Coverage aggregation is broken.** Vitest reports ~1.06 % statements
   because Node-`--test` `.test.mjs` files (golden, returns, DB, integration,
   handler suites) aren't instrumented by the `v8` provider. Real behavior
   *is* tested; the number that gates "≥80 %" is a lie.
2. **`npm run cdk:synth` is missing from `package.json`.** CDK source compiles
   but is never synthesized in CI, never asserted IAM-scoped, never gated.
3. **DLQ replay endpoint is unauthenticated.** `services/http-gateway/src/handler.ts`
   recognizes `POST /dlq/:id/replay` and returns 501 with no auth gate. Will
   be exploitable on day one if wired without auth.
4. **Five service handlers are still no-op stubs**: `tabelas`, `trabalhador`,
   `folha`, `fechamento`, `exclusao`. Each returns `{ service, records,
   boundary: 'esocial' }`. They must either become real or be removed from
   the CDK Lambda surface.
5. **Lifted tree did not shrink.** 164 files remain under
   `packages/domain/src/sgp-lifted/`. Round 0's exit criterion required at
   minimum the five promoted families' lifted sources to be deleted. They
   weren't.
6. **Idempotency-key builder is exported but not invoked at the handler.**
   `services/submission/src/handler.ts` doesn't call `buildEsocialIdempotencyKey`;
   the contract prescribes it, the docs prescribe it, the code doesn't.
7. **Envelope `version: 'v1'` not enforced** at ingress. The validator
   typechecks DTO shape but does not assert version pinning, opening a
   silent forward-compat hole.
8. **Append-only enforcement not behaviorally tested.** Migration triggers
   exist; no test attempts UPDATE/DELETE on `audit_event_log` /
   `event_status_history` under the worker role and asserts rejection.
9. **`rejectUnauthorized` on real SOAP client is implicit** (Node default).
   For defense-in-depth in production, must be explicit and tested.
10. **PII redaction is policy + grep, not a behavioral test.** No test feeds
    a CPF/CNPJ/salary fixture through the logger and asserts they don't
    appear verbatim in captured output.

## Per-dimension findings

### 1. Feature completeness

- **5/35 builder families ACTIVE_FULL**: S-1000, S-1010, S-1200, S-1299,
  S-2200 — builder + golden + metadata + dispatch wired.
- **30/35 LIFTED_ONLY** — placeholder dispatch, builder under
  `sgp-lifted/`, golden exists but inert.
- **5/5 returns N/A (parsers)** — S-5001/5002/5011/5012/5013 fully wired
  via `packages/domain/src/returns/parsers.ts` + active retorno handler.
- **Lifted tree: 164 files, no shrink.**
- **48 golden XMLs available** under `docs/templates/golden/builders/`;
  only 5 wired to active tests. Two families (S-2298, S-2306) have no
  copied standalone golden — they need new fixtures from the lifted
  builder output before promotion.
- **Three families need XSD/leiaute decisions** before promotion:
  - S-1030: `evtTabCargo.xsd` not in current bundle.
  - S-1040: `evtTabFuncao.xsd` not in current bundle.
  - S-1060: current `evtTabAmbiente.xsd` mismatches golden's legacy
    `v02_05_00`.

### 2. Code quality / production standards

| Gate | Real / theatre | Notes |
| --- | --- | --- |
| `npm ci` + lockfile | Real | `package-lock.json` v3 present. |
| `npm run build` (`tsc -b`) | Real | Strict TS config; sgp-lifted excluded. |
| `npm run lint` (ESLint + canaries) | Real | `--max-warnings=0`. |
| `npm test` | Real-but-split | Vitest + `node --test`; aggregation broken. |
| `npm run coverage` thresholds | **Theatre** | No `thresholds` section in `vitest.config.ts`; reported 1.06 % statements. |
| `npm run test:db` | Real | Ephemeral Postgres in CI; migrations run. |
| `npm run test:integration` | Partial | LocalStack + Postgres; misses some suites. |
| `npm run integration:localstack` | Real | SQS + EventBridge + DB round-trip. |
| `npm run cdk:synth` | **Missing** | Script absent from `package.json`. |
| `.github/workflows/ci.yml` | Partial | Doesn't run cdk synth; coverage thresholds not enforced. |
| `.github/workflows/release.yml` | Real-but-deferred | Publishing deferred per `release-checklist.md`. |
| SBOM + audit | Real | Generated and uploaded; high-severity gates set. |

Other quality gaps:

- 5 service handlers no-op (`tabelas`, `trabalhador`, `folha`, `fechamento`,
  `exclusao`).
- 16 scattered `process.env` reads; no typed config layer.
- `any` cast count not zero; tracked but not eliminated.
- SGP-lifted import canary in `scripts/check.mjs` doesn't positively
  assert "no active code imports `sgp-lifted/`".

### 3. Architecture

- SGP boundary intact in active code (zero `hr.*`/`payroll.*`/`saude.*`/
  `public.esocial_event` hits outside `sgp-lifted/`).
- `docs/architecture.md` resolves the ambiguity in favor of
  eSocial-owns-XML.
- Layering compliant: services → domain → contracts; no service →
  `sgp-lifted/`.
- Schema complete for round-0 needs: `tenant_certificate`,
  `endpoint_circuit_state`, `event_retry_schedule`, `response_classification`,
  `s1xxx_dispatch_state`, `s1200_emission_state`, `s1299_emission_state`,
  `s2200_emission_state`, `event_status_history`, `audit_event_log`,
  `xsd_validation_failure`, `dlq_item`, `esocial_totalizer`,
  `v_event_failures`, `v_competence_periodics_pending`. Forward migrations
  for round-1 emission/pending state will need to extend per family.
- Idempotency-key builder exists and the unique indices exist; **handler
  fails to invoke the builder** (see structural gap #6).
- RLS + worker-role bypass in place; **append-only enforcement
  behaviorally untested**.
- Stage separation: `qualification` / `restricted_production` /
  `production` modeled in CDK. Production synth gated on
  `ESOCIAL_PROD_CONFIRM=1`.

### 4. Security

| # | Severity | Issue | Evidence |
| --- | --- | --- | --- |
| 1 | CRITICAL | DLQ replay unauthenticated | `services/http-gateway/src/handler.ts` returns 501 stub for `POST /dlq/:id/replay` with no auth gate. |
| 2 | HIGH | Lifted XML parsers (libxmljs2) not hardened | `sgp-lifted/.../parsers/xml-parser-utils.ts`. Not on active path; release-blocking if promoted as-is. |
| 3 | HIGH | TLS `rejectUnauthorized` implicit | `SoapClientTransport` relies on Node default; should be explicit + tested per stage. |
| 4 | HIGH | Append-only mutation rejection untested | Triggers exist; no `expect(rejectsUpdate).toThrow()` test. |
| 5 | MEDIUM | Cert rotation flow undocumented | Schema and custody service support rotation; no runbook step or automation. |
| 6 | MEDIUM | PII redaction not behaviorally tested | Policy in `redaction.ts`; no fixture-driven assertion. |
| 7 | MEDIUM | Idempotency-key not enforced at ingress | Handler doesn't call `buildEsocialIdempotencyKey`. |
| 8 | LOW | Operator endpoints lack rate limiting / audit-of-replay | `dlq/:id/replay` audit row policy not yet specified beyond design. |

No `.pem`/`.pfx`/`.p12`/`.key`/`.crt` files committed. No real
certificates in git history. CDK templates contain no `Resource: "*"` and
no wildcard actions. Secrets only as ARN references.

### 5. Test coverage

- 41 active test files across vitest + node:test runners.
- Aggregate `vitest --coverage`: 1.06 % statements (broken — node:test
  files not instrumented).
- Real coverage almost certainly far higher; the **measurement** is
  broken, not necessarily the testing.
- Missing/insufficient suites:
  - Append-only mutation rejection.
  - PII redaction behavioral test.
  - DLQ replay authentication.
  - Idempotency-key enforcement at handler.
  - Envelope `version: 'v1'` rejection.
  - Per-stage TLS `rejectUnauthorized`.
  - Coverage thresholds in CI.

### 6. Documentation

- Substantive docs present: `architecture.md` (4.7 KB), `consumers.md`
  (14.6 KB), `events.md` (17.6 KB), `operations.md` (14.7 KB),
  `sgp-migration.md` (7.2 KB), `release-checklist.md` (4.9 KB).
- Evidence bundle at `docs/release/0.1.0/` complete with manifests, CI
  artifacts, generated XML, signed-payload hashes, SOAP traces, status
  publications, SBOM, LocalStack output.
- Contract package CHANGELOG.md present.
- Stale: top-level `README.md` and `docs/README.md` are skeleton.
- Missing: certificate-rotation runbook step, DLQ-auth runbook,
  coverage-aggregation note.

### 7. Code/docs/tests/contracts alignment

| # | Misalignment |
| --- | --- |
| 1 | Contracts include 39 event classes; dispatcher routes 5; rest go to placeholder without operator-visible signal. |
| 2 | Coverage aggregation excludes `node --test` suites; reported number is meaningless. |
| 3 | `buildEsocialIdempotencyKey` documented as required, exported as helper, **not called** in handler. |
| 4 | Migrations create per-family emission state tables for round-0 families only; round-1 will need forward migrations. |
| 5 | 12-state status union exported; only `pending`/`building`/`signed`/`sent`/`accepted`/`rejected` reach in active flow. `excluded`, `timeout`, `dlq` reachable only after C1 wiring proven. |
| 6 | `services/submission/src/transport/soap-sandbox.ts` removed (replaced by factored `DeterministicSandboxTransport`); some doc references may still mention old path. |
| 7 | CDK Lambda manifest references 9 services; only 4 are real handlers. |
| 8 | Envelope `version: 'v1'` field is on the wire but not enforced. |
| 9 | `docs/operations.md` "replay" runbook references commands that exist; 501-stub auth means runbook would 501 in production today. |
| 10 | `tests/e2e/` directory exists but is unreferenced by any npm script. |

## Round-0 closure-criteria verdict (per-item)

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | `npm ci` clean clone | **PASS** |
| 2 | `npm run build` real `tsc -b` | **PASS** |
| 3 | `npm run lint` ESLint + canaries | **PASS** |
| 4 | `npm test` full active suite | **PARTIAL** (split runners; aggregation broken) |
| 5 | `npm run test:db` real Postgres | **PASS** |
| 6 | `npm run test:integration` round-trip | **PARTIAL** (some suites unreferenced) |
| 7 | `npm run integration:localstack` | **PASS** |
| 8 | `npm run cdk:synth` real, scoped IAM | **FAIL** (script missing) |
| 9 | Coverage ≥80 % on listed areas | **FAIL** (aggregation broken) |
| 10 | CI runs all of the above on every PR | **PARTIAL** (no cdk synth, no coverage gate) |
| 11 | `@esocial/contracts@1.0.0` published + docs + evidence bundle | **PARTIAL** (publishing deferred; everything else present) |

## Round-1 mandate

Round 1 must therefore do **two** kinds of work, not one:

1. **Round-0 gap closure** — the 11 structural items above. These block any
   honest claim of round-0 closure and would compound if round-1 family
   promotion proceeded over a broken foundation.
2. **Builder promotion** — the original round-1 charter for the remaining
   ~30 families plus lifted-tree retirement.

[`./plan.md`](./plan.md) is rewritten to sequence both. The original
batch model survives but is preceded by a mandatory **Batch 0 (round-0
fixups)** and followed by **Batch 6 (hardening)** and a **Round-2
scoping** prompt. The lifted tree is now scheduled to actually shrink as
each batch lands, instead of all-at-the-end.
