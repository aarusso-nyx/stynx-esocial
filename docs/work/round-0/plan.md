# Round 0 — Production-Grade Closure Plan

> **Objective:** turn the current eSocial lift-out skeleton into a production-grade
> standalone MQ/broker service that SGP can integrate against for all required
> regulatory features, end-to-end, with real CI evidence.
>
> **Round:** 0 (first closure round). All artifacts live under
> [`./`](./). Prompts that materialize the plan are in
> [`./prompts/`](./prompts/).
>
> **Inputs:** [`../inv.md`](../inv.md), [`../diag.md`](../diag.md),
> [`../plan.md`](../plan.md), and the audit synthesis captured in
> [`./assessment.md`](./assessment.md).

---

## Scope decision (resolves the architectural ambiguity)

The audit surfaced one design contradiction: the architecture doc claims eSocial
owns "XML build, XSD validate, sign, SOAP submit," but the active processor only
ingests *pre-signed* envelopes from SGP. **This round resolves the ambiguity in
favor of the documented architecture.** eSocial owns:

- Typed-DTO ingress from SGP (no XML, no signing on the SGP side).
- XML build per event family.
- XSD validation against bound leiaute version.
- Signing via tenant certificate (loaded from Secrets Manager).
- SOAP submission to qualification / restricted-production / production endpoints.
- Return parsing and totalizer ingestion.
- Status / spool / audit / retry / DLQ / replay publication on the bus.

SGP sends DTOs; SGP receives status events. SGP does not see XML.

Round 0 closure target is the **end-to-end DTO → XML → sign → SOAP-stub →
return-parse → status-publish** path for **at least 5 representative event
families** plus **all S-50xx returns**, with real CI gates and observable
evidence.

---

## Round 0 closure target ("done means")

A pull request is "Round 0 done" when **every** item below is provable from CI:

1. `npm ci` succeeds in a clean clone; lockfile committed.
2. `npm run build` runs `tsc -b` across all workspaces. Zero errors.
3. `npm run lint` runs ESLint **plus** the migration boundary canaries.
4. `npm test` runs the full active suite (contracts + golden + handler + parsers
   + signing + soap-stub + returns).
5. `npm run test:db` runs migrations against an ephemeral Postgres and asserts
   RLS, idempotency uniqueness, and append-only history.
6. `npm run test:integration` round-trips a DTO through the full
   in-process pipeline (ingress → build → XSD → sign → SOAP-stub → parse →
   publish) with deterministic fixtures.
7. `npm run integration:localstack` round-trips a message through SQS +
   EventBridge + LocalStack-backed Postgres + Secrets Manager and asserts
   external observability artifacts (response queue, audit bus, status row,
   structured logs).
8. `npm run cdk:synth` runs **real** CDK synthesis for `qualification`,
   `restricted-production`, and `production` stages. IAM is scoped to
   resource ARNs (no `Resource: "*"`).
9. `npm run coverage` reports ≥80 % statement coverage on
   `packages/contracts`, `packages/domain` (excluding `sgp-lifted/`),
   `packages/pki-pades`, and the active services.
10. `.github/workflows/ci.yml` runs all of the above on every PR and tags a
    contract-package release on `main` merges.
11. SGP integration evidence: a published `@esocial/contracts@1.0.0` package
    plus [`./../prompts`/](./prompts/) … `docs/sgp-migration.md` covering
    every DTO, status, error category, retry/DLQ contract, and cutover
    sequence.

If any of those eleven items is structural-only (passes without executing the
behavior), the round is not done.

---

## Round 0 ≠ "every event family". Round 0 = "the pipeline works end-to-end,
> proven on representative families".

Promotion of all 35+ builders is **out of round-0 scope**. Round 0 promotes the
families needed to prove every code path:

- **S-1000** (employer registration, simple table)
- **S-1010** (rubric table, version-dependent)
- **S-1200** (periodic payroll — depends on S-1010 versions)
- **S-1299** (close-the-month — already in the active simulator, must be
  rewritten to use the real pipeline)
- **S-2200** (worker admission — most-touched non-periodic event)
- **S-5001 / S-5002 / S-5011 / S-5012 / S-5013** (full return parser surface,
  already implemented; round-0 wires them into the live return path)

Once round 0 closes, **round 1** promotes the remaining families along the
same end-to-end path — that is repeatable mechanical work, not redesign.

---

## Worker waves

Reuses the worker model from [`../plan.md`](../plan.md). Round 0 runs in three
waves; each wave's prompts are independent within the wave but blocked by the
prior wave's exit criteria.

### Wave A — runtime foundation (blocking)

| # | Prompt | Worker scope | Outcome |
| --- | --- | --- | --- |
| A1 | [`prompts/A1-baseline-and-decisions.md`](prompts/A1-baseline-and-decisions.md) | Coordinator | Baseline preflight + locked decisions log + arch-ambiguity resolution recorded in `docs/architecture.md`. |
| A2 | [`prompts/A2-real-typescript-build.md`](prompts/A2-real-typescript-build.md) | Toolchain | Real `tsc -b`, ESLint, Prettier, lockfile, exclusion of `sgp-lifted/`, root + workspace tsconfigs, `vitest` runner. |
| A3 | [`prompts/A3-contracts-frozen.md`](prompts/A3-contracts-frozen.md) | Contracts | Reconcile reported state of `packages/contracts/` against documented surface. Freeze v1: 39 event classes, 12 statuses, 11 error categories, 7 envelope families, idempotency-key builder + JSON Schemas. |
| A4 | [`prompts/A4-autonomous-schema.md`](prompts/A4-autonomous-schema.md) | Database | Forward migrations for the full autonomous model. Real `migrate:dev` + `test:db` against ephemeral Postgres. RLS, idempotency uniqueness, append-only history. |

### Wave B — end-to-end pipeline on representative families

Wave B builds the full DTO → status loop for the families listed above. All
prompts in wave B can run after wave A is green; B1, B2, B3 and B5 are largely
independent and can be parallelized.

| # | Prompt | Worker scope | Outcome |
| --- | --- | --- | --- |
| B1 | [`prompts/B1-handler-real-runtime.md`](prompts/B1-handler-real-runtime.md) | Submission | Replace the simulator. Validate envelopes, persist with idempotency, route by event class, publish through real publishers, return Lambda batch failures. |
| B2 | [`prompts/B2-builders-five-families.md`](prompts/B2-builders-five-families.md) | XML/event | Promote S-1000, S-1010, S-1200, S-1299, S-2200 builders into active code. Define DTO → XML contract, golden tests, metadata tests. Delete the corresponding lifted source. |
| B3 | [`prompts/B3-pki-and-xml-security.md`](prompts/B3-pki-and-xml-security.md) | PKI/SOAP | Wire signing into the pipeline. Certificate custody via Secrets Manager. XXE/DTD hardening on every parser (incl. `sgp-lifted` if it survives the round). XSD gate before signing. |
| B4 | [`prompts/B4-soap-and-environments.md`](prompts/B4-soap-and-environments.md) | PKI/SOAP | Deterministic SOAP stub from `docs/templates/wsdl/`. Network allowlist denies `gov.br` in non-production. Per-stage routing. Persisted hashes (request, signed, soap-req, soap-resp). |
| B5 | [`prompts/B5-returns-totalizers-status.md`](prompts/B5-returns-totalizers-status.md) | Returns | Wire the existing parsers into a live return handler. Map regulatory codes to canonical statuses. Publish status / spool / totalizer events. Persist returns in `esocial`. Reconciliation views. |

### Wave C — operability, infra, release

Wave C makes the system shippable. Prompts depend on wave B closure.

| # | Prompt | Worker scope | Outcome |
| --- | --- | --- | --- |
| C1 | [`prompts/C1-retry-dlq-replay.md`](prompts/C1-retry-dlq-replay.md) | Submission/Returns | Retry budgets, exponential backoff with jitter, circuit breaker state, terminal DLQ classification, operator replay surface, fault-injection tests. |
| C2 | [`prompts/C2-observability.md`](prompts/C2-observability.md) | Ops | Structured logging (`pino`) with correlation/tenant/event-class fields. CloudWatch EMF metrics. OpenTelemetry traces. Alarms keyed off named metrics. PII redaction policy enforced. |
| C3 | [`prompts/C3-real-cdk-and-localstack.md`](prompts/C3-real-cdk-and-localstack.md) | Infra | Replace static template generator with a real CDK app. Network, RDS, messaging, compute, secrets, observability stacks per stage. Migration deploy hook. LocalStack harness sends a message end-to-end. |
| C4 | [`prompts/C4-ci-and-release.md`](prompts/C4-ci-and-release.md) | Infra/Release | `.github/workflows/ci.yml`: build, lint, test, db, integration, localstack, synth, coverage, audit. Branch protection. Release workflow tags `@esocial/contracts@1.x` on `main`. SBOM and `npm audit` gates. |
| C5 | [`prompts/C5-sgp-migration-and-evidence.md`](prompts/C5-sgp-migration-and-evidence.md) | Docs | `docs/sgp-migration.md`, `docs/release-checklist.md`, `docs/operations.md` (full runbooks: replay, DLQ triage, certificate rotation, sandbox outage, official rejection, tenant incident, audit extraction). Round-0 evidence bundle under `docs/release/0.1.0/`. |

### Wave D — round-1 entry (planning, not execution)

| # | Prompt | Outcome |
| --- | --- | --- |
| D1 | [`prompts/D1-round-1-builder-promotion-plan.md`](prompts/D1-round-1-builder-promotion-plan.md) | Plan + per-family prompts for promoting the remaining 30+ event families along the round-0 pipeline. Round 1 is mechanical at that point. |

---

## Operating principles (round-wide, repeated in every prompt)

- **No structural-only gates.** Every command must execute its named behavior or
  be renamed.
- **No SGP schema reads/writes** (`hr.*`, `payroll.*`, `saude.*`, `public.esocial_event`)
  from any active code path. SGP source identifiers stay opaque strings.
- **No real certificates / endpoints / production data** in tests or fixtures.
  Tests rejecting `gov.br` hosts are mandatory in non-production environments.
- **Idempotent and deterministic.** Same input → same persisted state and same
  emitted events. Duplicate ingress yields one regulatory submission.
- **Append-only history.** Status and audit tables reject UPDATE/DELETE under
  the worker role.
- **Forward-only migrations.** No mutating edits to landed migration files.
- **Honest naming.** If `cdk:synth` does not synthesize CDK, rename it.
- **The lifted tree (`packages/domain/src/sgp-lifted/`, `tests/sgp-lifted/`) is
  evidence, not product.** Round 0 either promotes a slice into active code or
  excludes it from the build. By the end of round 0, every active code path
  must be free of `sgp-lifted` imports.

---

## Worker discipline

Prompts each declare a **Primary write scope** and a **Do not touch** list.
Workers must not revert or overwrite changes outside their ownership scope.
Cross-scope coordination happens via the worker that owns the scope, not via
direct edits.

---

## Round 0 → Round 1 hand-off

Round 0 produces:

- A green CI pipeline executing real behavior on every PR.
- A locked, published `@esocial/contracts@1.0.0`.
- A real autonomous Postgres schema with RLS and idempotency proofs.
- A real submission handler that builds, signs, submits (via stub), parses,
  and publishes — for 5 event families plus full S-50xx returns.
- Real CDK synthesis with scoped IAM, three stages, alarms, and a deploy hook.
- Operator runbooks that match implemented behavior.
- An evidence bundle under `docs/release/0.1.0/`.

Round 1 promotes the remaining event families along the same pipeline (D1).
Round 2 (out of scope here) onboards restricted-production with real
certificates and real eSocial-sandbox endpoints under operator authorization.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Lifted-tree contracts disagree with active contracts after promotion. | A3 freezes contracts; B2 promotes against the frozen contract, not the lifted shape. |
| Schema landed in `080-…sql` (per one audit pass) is partially right but missing constraints. | A4 inspects, reconciles, and adds forward migrations only — never mutates landed files. |
| Multiple workers overwrite shared files (`scripts/check.mjs`, `package.json` scripts, `docs/operations.md`). | Each prompt declares which sections it owns; cross-cutting changes are merged through C2/C3/C4. |
| Sandbox stub passes; real eSocial sandbox fails differently. | Round 0 ships only against the deterministic stub. Round 2 wires the real sandbox under owner authorization. |
| Certificate handling regression from lifted patterns. | B3 reads lifted certificate logic only as evidence; the active flow stores only references in DB and material in Secrets Manager. Lifted certificate-store code is not promoted. |
| CI run time blows up. | Stage gates: `unit` (build/lint/test) on every push; `db + integration + localstack + synth` only on PRs and `main`. |

---

## Proceed by

1. Reading [`./assessment.md`](./assessment.md).
2. Running [`prompts/A1-baseline-and-decisions.md`](prompts/A1-baseline-and-decisions.md)
   first to confirm the baseline matches what we believe and to capture the
   decisions log this round depends on.
3. Then waves A → B → C → D in order. Within waves, parallelize per the table.
