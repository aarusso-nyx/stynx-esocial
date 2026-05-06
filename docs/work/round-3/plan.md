# Round 3 — Engineering Excellence Plan

> **Scope:** push every dimension of the eSocial service toward 100 % —
> coverage, type strictness, performance, resilience, security/compliance,
> developer/operator experience, documentation. Designed for **maximum
> parallelism** across worker agents.
>
> **Prerequisites (must be PASS before round 3 starts):**
> - All 15 round-1 closure items in [`../round-1/plan.md`](../round-1/plan.md).
> - Round-2 closure: real qualification connectivity + restricted-production
>   deployment per [`../round-1/prompts/07-round-2-scoping.md`](../round-1/prompts/07-round-2-scoping.md)
>   → `docs/work/round-2/plan.md`.
>
> **Inputs:**
> - [`./assessment.md`](./assessment.md) — round-3 entry baseline + per-dimension
>   100 %-target definitions.
> - All prior round plans, prompts, and evidence bundles (`docs/release/0.1.0/`,
>   `0.2.0/`, `0.3.0/`).

---

## Why a separate round

After round 2, the service is **functionally complete** (every event family
runs end-to-end against real eSocial endpoints) and **operationally safe**
(authenticated DLQ, TLS, cert rotation drilled, append-only audit, RLS).

Round 3 is the **excellence pass**: the work that turns "production-ready
service" into "production-grade infrastructure that other teams can adopt
confidently." It targets:

- Test depth (coverage ≥95 %, mutation testing, property-based tests).
- Type system polish (zero `any`, branded types, exhaustive checks).
- Performance characterisation under load (p99 latency budgets, capacity).
- Resilience (chaos engineering, multi-region readiness, DR drills).
- Security/compliance (threat model, pen test, LGPD evidence, SOC 2-shaped
  audit pack, automated cert/secret rotation, tamper-evident audit log).
- Developer experience (typed `@esocial/sdk`, codegen, one-command local dev).
- Operator experience (DLQ/cert/replay console; synthetic canaries; SLO/error
  budget).
- Documentation (ADRs, onboarding, reference site, OpenAPI + AsyncAPI specs).
- Continuous improvement (drift-audit cron, evidence-bundle generator,
  round-4 scoping).

---

## Round-3 closure target ("done means")

A green CI pipeline that proves all of the following on every PR:

1. **Coverage ≥95 % statements / ≥90 % branches** on `packages/contracts`,
   `packages/domain` (all paths), `packages/pki-pades`, all active services.
   Coverage authority is one tool (vitest absorbed everything in round 1).
2. **Mutation score ≥80 %** on `packages/domain/src/builders/`,
   `packages/domain/src/returns/`, `packages/domain/src/submission/`,
   `packages/pki-pades/`. Stryker config committed; CI gates the score.
3. **Zero `any` / `as any` / `as unknown`** in `packages/contracts`,
   `packages/domain` (excluding the documented `sgp-lifted/` retention if
   still present), `packages/pki-pades`, active services. ESLint
   `@typescript-eslint/no-explicit-any` and `no-unsafe-*` rules at error.
4. **Typed configuration layer.** All `process.env` reads go through a single
   typed config module with runtime validation; CI fails on stray `process.env`
   in code outside that module.
5. **Performance budgets enforced.** p99 SOAP-stub round-trip ≤ 500 ms; p99
   end-to-end (DTO → spool publish) ≤ 1500 ms; throughput ≥ 1000 messages/s
   per submission Lambda at concurrency 50; perf regression test runs in CI
   nightly with budgets.
6. **Chaos drill green.** Fault-injection suite (random publisher failures,
   DB transient errors, SOAP timeouts, certificate-expiry races) runs
   weekly; pipeline still meets SLO.
7. **Multi-region drill documented + run.** RTO ≤ 1 h, RPO ≤ 5 min for the
   `esocial` schema; runbook in `docs/operations.md`; one drill per quarter
   with logged evidence.
8. **Security**: threat model committed; one external pen test report linked
   in evidence; SBOM regenerated on every release; vuln-triage SLA documented
   and enforced (critical < 7 days, high < 30 days).
9. **LGPD evidence**: DPIA committed; DSR (data-subject-request) APIs
   implemented (`POST /lgpd/access`, `POST /lgpd/erase`, with audit) protected
   by the same auth surface as DLQ replay.
10. **Cert + secret rotation automated.** Lambda-driven rotation jobs run on
    schedule; tested in CI via Secrets Manager + LocalStack; alarms fire on
    upcoming expiry.
11. **Tamper-evident audit log.** Append-only history hashed into a per-tenant
    Merkle log; verification CLI/API; periodic anchor-publish documented.
12. **`@esocial/sdk@1.0.0` published** with typed client, examples per event
    class, and a migration codemod for SGP.
13. **Operator console** (DLQ triage, replay, certificate dashboard) deployed
    to a private endpoint; auth enforced; e2e tested.
14. **Synthetic monitoring**: canary submissions per stage every 5 minutes;
    alarms on failure; canary results in evidence bundle.
15. **OpenAPI 3.1 spec** for the HTTP gateway and **AsyncAPI 3.0 spec** for
    the queue/bus contracts, generated from code, published as part of the
    reference site.
16. **Reference site** (Docusaurus or equivalent) deployed at a stable URL
    with: event catalog, per-family DTO + golden, runbooks, ADRs, API specs.
17. **ADR set** (Architecture Decision Records) covers every major design
    decision from rounds 0–3.
18. **Local dev one-command**: `npm run dev:up` boots Postgres, LocalStack,
    Secrets Manager mock, queues, the full Lambda set in containers, and the
    operator console; `npm run dev:family <s-XXXX>` scaffolds a new family.
19. **Evidence bundle** at `docs/release/1.0.0/` (note: contracts already at
    1.x; **service** reaches semantic 1.0 here) with: coverage report,
    mutation-score report, perf-budget log, chaos drill log, DR drill log,
    threat model, pen test, DPIA, DSR-API trace, cert-rotation drill, audit
    Merkle anchor, SDK published version, operator-console URL, OpenAPI/
    AsyncAPI files, reference-site build, ADRs.
20. **Round-4 scope drafted** in [`./prompts/F3-round-4-scoping.md`](prompts/F3-round-4-scoping.md)
    (operational excellence: SRE on-call rotation, error-budget burn alerts,
    blue-green deploy automation, customer onboarding, multi-account
    isolation).

---

## Worker waves

Round 3 is designed for **maximum parallel execution** by independent worker
agents. Each prompt declares a tight write scope and a strict do-not-touch
list. The waves below indicate dependency order; **within a wave, every
prompt can run in parallel** across distinct workers.

### Wave A — Engineering excellence (5 parallel)

| # | Prompt | Worker scope |
| --- | --- | --- |
| A1 | [`prompts/A1-coverage-95.md`](prompts/A1-coverage-95.md) | Test infrastructure |
| A2 | [`prompts/A2-type-strictness.md`](prompts/A2-type-strictness.md) | TypeScript / static analysis |
| A3 | [`prompts/A3-typed-config.md`](prompts/A3-typed-config.md) | Configuration |
| A4 | [`prompts/A4-mutation-testing.md`](prompts/A4-mutation-testing.md) | Test infrastructure |
| A5 | [`prompts/A5-perf-regression.md`](prompts/A5-perf-regression.md) | Performance / CI |

### Wave B — Operational maturity (6 parallel; depend on round-2 deployment)

| # | Prompt | Worker scope |
| --- | --- | --- |
| B1 | [`prompts/B1-chaos-engineering.md`](prompts/B1-chaos-engineering.md) | Resilience |
| B2 | [`prompts/B2-load-and-capacity.md`](prompts/B2-load-and-capacity.md) | Performance |
| B3 | [`prompts/B3-disaster-recovery.md`](prompts/B3-disaster-recovery.md) | Infra / SRE |
| B4 | [`prompts/B4-cost-observability.md`](prompts/B4-cost-observability.md) | FinOps |
| B5 | [`prompts/B5-multi-region.md`](prompts/B5-multi-region.md) | Infra |
| B6 | [`prompts/B6-autoscaling-and-slo.md`](prompts/B6-autoscaling-and-slo.md) | SRE |

### Wave C — Security & compliance (7 parallel; C1 informs C2/C3)

| # | Prompt | Worker scope |
| --- | --- | --- |
| C1 | [`prompts/C1-threat-model-and-pentest.md`](prompts/C1-threat-model-and-pentest.md) | Security |
| C2 | [`prompts/C2-lgpd-compliance.md`](prompts/C2-lgpd-compliance.md) | Compliance |
| C3 | [`prompts/C3-soc2-evidence.md`](prompts/C3-soc2-evidence.md) | Compliance |
| C4 | [`prompts/C4-cert-rotation-automation.md`](prompts/C4-cert-rotation-automation.md) | PKI |
| C5 | [`prompts/C5-secrets-rotation.md`](prompts/C5-secrets-rotation.md) | Security |
| C6 | [`prompts/C6-sbom-vuln-triage.md`](prompts/C6-sbom-vuln-triage.md) | Supply chain |
| C7 | [`prompts/C7-tamper-evident-audit.md`](prompts/C7-tamper-evident-audit.md) | Audit |

### Wave D — Developer & operator experience (5 parallel; D1/D5 depend on contracts stable)

| # | Prompt | Worker scope |
| --- | --- | --- |
| D1 | [`prompts/D1-sgp-sdk.md`](prompts/D1-sgp-sdk.md) | SDK / DX |
| D2 | [`prompts/D2-operator-console.md`](prompts/D2-operator-console.md) | Operator UX |
| D3 | [`prompts/D3-local-dev.md`](prompts/D3-local-dev.md) | DX |
| D4 | [`prompts/D4-synthetic-monitoring.md`](prompts/D4-synthetic-monitoring.md) | SRE |
| D5 | [`prompts/D5-openapi-asyncapi.md`](prompts/D5-openapi-asyncapi.md) | API docs |

### Wave E — Documentation & knowledge (3 parallel; E3 depends on D5)

| # | Prompt | Worker scope |
| --- | --- | --- |
| E1 | [`prompts/E1-adrs.md`](prompts/E1-adrs.md) | Docs |
| E2 | [`prompts/E2-onboarding.md`](prompts/E2-onboarding.md) | Docs |
| E3 | [`prompts/E3-reference-site.md`](prompts/E3-reference-site.md) | Docs |

### Wave F — Continuous improvement (3; F3 last)

| # | Prompt | Worker scope |
| --- | --- | --- |
| F1 | [`prompts/F1-drift-audit-cron.md`](prompts/F1-drift-audit-cron.md) | Quality |
| F2 | [`prompts/F2-evidence-bundle-generator.md`](prompts/F2-evidence-bundle-generator.md) | Release |
| F3 | [`prompts/F3-round-4-scoping.md`](prompts/F3-round-4-scoping.md) | Planner |

**Parallelism summary:** Waves A–E can launch concurrently after round 2
closes; the only intra-wave ordering is C1 → C2/C3 (threat-model informs
compliance scope), D5 → E3 (specs feed reference site), and F3 last
(closes round 3).

With 6 senior engineers, round 3 is achievable in **~6 weeks calendar**:
- Weeks 1–2: Wave A + B1 + B2 + C1 + D3 + E1 (foundations).
- Weeks 3–4: Wave B (rest) + Wave C + D1/D2/D4/D5.
- Week 5: E2/E3 + F1/F2.
- Week 6: F3 + closure + 1.0.0 evidence bundle.

With 1 senior engineer, round 3 is **~25 engineer-weeks (~6 months calendar)**.

---

## Operating principles (round-wide)

- **No structural-only gates.** Every claim must be CI-provable on every PR.
- **No real production data in tests.** Synthetic-but-realistic fixtures only.
- **Deterministic by default.** Property-based and chaos tests pin seeds and
  log them on failure.
- **Forward-only migrations.** No mutations to landed migration files.
- **Append-only history + tamper-evident** (C7 enforces).
- **Workers stay in scope.** Cross-cutting changes route through Wave F.
- **Gate before promote.** A wave's work is not merged until its CI gates are
  green; a later wave that depends on it cannot start until merge.
- **Evidence-by-default.** Every prompt produces an artifact under
  `docs/release/1.0.0/<area>/`. F2 wires the manifest.

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| Mutation-testing CI runtime explodes | A4 tunes scoped runs (per-package, sample-rate fallback); CI splits matrix. |
| Multi-region drill needs production data | B5 uses synthetic-tenant fixtures; runs against restricted-production only with owner authorization, otherwise stages with anonymized data. |
| Pen test surfaces critical findings late | C1 schedules an early in-house threat-model review; the external pen test is gated by mid-round; findings get a fast-track Wave-C2/C5 follow-on. |
| LGPD DSR APIs hit data-residency constraints | C2 owner must sign off on data location; placeholder is "in-region only" until owner decides. |
| Reference site adds maintenance burden | E3 generates content from code/specs (D5); manual prose limited to ADRs (E1) and onboarding (E2). |
| Operator console is a parallel codebase | D2 uses the existing CDK + workspaces; ships as another service in the monorepo. |
| Chaos engineering on shared environments | B1 runs in dedicated chaos-stage account/stack; never touches restricted-production. |
| Coverage push surfaces dead code | A1 requires deletion of dead code rather than artificial test creation; no carve-outs without owner sign-off. |
| Type strictness regresses third-party imports | A2 may add typed wrappers for untyped libraries; documented in ADR. |
| Performance budgets too aggressive | A5/B2 use measured baselines from round 2 + 20 % headroom; budgets are version-pinned and revisited at round 4. |

---

## Hand-off

- **Round 2 → Round 3**: this plan + assessment + prompts.
- **Round 3 → Round 4**: F3 produces the round-4 charter (operational
  excellence at scale: SRE on-call, blue-green automation, customer
  onboarding pipeline, multi-account isolation).
