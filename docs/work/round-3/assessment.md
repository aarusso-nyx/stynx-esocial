# Round 3 — Assessment Synthesis (Round-2 Closure → Round-3 Entry)

> Snapshot of the repository state at round-3 entry, plus per-dimension
> definitions of "100 %" that the round-3 plan targets.
>
> This document is forward-looking: round-2 has not closed at the time
> of writing. The dimensions and gaps below assume round-2 met its plan
> in [`../round-1/prompts/07-round-2-scoping.md`](../round-1/prompts/07-round-2-scoping.md).
> If round 2 closes with carve-outs, those carve-outs become round-3
> Wave-B/C scope additions.

## Round-3 entry expectation

Round 3 starts with:

- 39 event classes ACTIVE_FULL (round 1).
- Real eSocial qualification and restricted-production round-trip (round 2).
- DLQ replay authenticated, idempotency enforced, envelope version
  enforced, append-only behaviorally tested, PII redaction tested, TLS
  explicit, cert rotation drilled (round 1 + round 2).
- `@esocial/contracts@1.x` published.
- CI gates real on every PR: build, lint, coverage (≥70 %), DB tests,
  integration, LocalStack, CDK synth + IAM scope assertion.
- Evidence bundles `docs/release/0.1.0/`, `0.2.0/`, `0.3.0/`.

## Per-dimension target ("100 %")

Concrete, testable definitions used by round-3 prompts.

### Test coverage (target: 100 %, gate: ≥95 %/≥90 % branches + ≥80 % mutation)

- One coverage authority. No "node --test not instrumented" excuses.
- Statement / function / line coverage ≥ 95 %.
- Branch coverage ≥ 90 %.
- Mutation score ≥ 80 % on builders, returns, submission, PKI, transport.
- Property-based tests for: idempotency-key determinism, builder DTO
  → XML mapping invariants, return-parser status mapping, retry
  classifier output stability, redaction policy (no string longer
  than N digits with the CPF/CNPJ shape passes through).

### Type strictness

- Zero `any` / `as any` / `as unknown` in active code (excluding
  documented `sgp-lifted/` retention, if any).
- Branded types for: `TenantId`, `EventClass`, `IdempotencyKey`,
  `Receipt`, `ProtocolNumber`, `CorrelationId`, `Cnpj`, `Cpf`. The
  type system rejects mixing them.
- Exhaustive `switch` on every discriminated DTO (`assertNever` helper);
  CI fails if a new union member is added without dispatcher coverage.
- ESLint `@typescript-eslint/no-explicit-any` and `no-unsafe-*` at
  error.

### Configuration

- All `process.env` reads go through one typed `loadConfig()` module
  that validates at startup (zod or equivalent) and fails fast on
  missing/malformed values.
- A test asserts `loadConfig` rejects bad input across every required
  variable.
- A grep CI check forbids `process.env` outside the config module.

### Performance

- Latency budgets:
  - p95 ingress (envelope received → DB row written) ≤ 200 ms.
  - p99 SOAP-stub round-trip ≤ 500 ms.
  - p99 end-to-end (DTO → spool publish) ≤ 1500 ms.
- Throughput: ≥ 1000 messages/s per submission Lambda at concurrency 50.
- Cold-start: Lambda cold-start p95 ≤ 1500 ms (with provisioned
  concurrency disabled), p95 ≤ 250 ms (with PC enabled).
- Perf test runs nightly in CI; alarms on regression > 15 %.

### Resilience

- Chaos suite: random publisher failure, DB transient error, SOAP
  timeout, certificate-just-expired, RLS-context-missing. Each
  scenario passes a "system reaches a clean state without operator
  action" assertion.
- DR: RTO ≤ 1 h, RPO ≤ 5 min for the `esocial` schema. Drill quarterly
  with logged evidence.
- Multi-region: documented active-passive design; failover script
  exercised in non-prod; drill scoped in B5.

### Security & compliance

- Threat model committed and reviewed (STRIDE per major component).
- One external pen test report attached.
- Vuln-triage SLA: critical < 7 days, high < 30 days, medium < 90 days.
- LGPD: DPIA, retention schedule, DSR APIs (`access`, `erase`,
  `export`), audit row per DSR.
- SOC 2-shaped evidence pack (security, availability, confidentiality
  TSCs).
- Audit log tamper-evident: per-tenant Merkle log, periodic anchor
  publish, verification CLI.

### Operability

- SLOs documented (availability, freshness, end-to-end latency,
  error rate). Error-budget burn alarms.
- Synthetic canary submissions per stage every 5 min.
- Operator console: DLQ triage, replay (authenticated), certificate
  dashboard, status reconciliation, audit export.
- Cost: per-tenant cost attribution; cost alarms on anomaly.

### Developer experience

- `@esocial/sdk` typed client with examples per event class.
- Migration codemod for SGP integrators upgrading 1.0 → 1.x.
- One-command local dev: Postgres + LocalStack + Secrets Manager mock
  + queues + Lambdas + operator console + reference site.
- Family codegen: `npm run dev:family <S-XXXX>` scaffolds DTO,
  builder, golden, tests.

### Documentation

- ADRs (Architecture Decision Records) for every major decision.
- Reference site (Docusaurus or similar) with: event catalog,
  per-family DTO + golden, runbooks, ADRs, OpenAPI/AsyncAPI.
- Onboarding guide: 2-day developer ramp.
- API specs: OpenAPI 3.1 for HTTP gateway, AsyncAPI 3.0 for queue/bus
  contracts.

### Evidence

- `docs/release/1.0.0/` evidence bundle with every artifact above
  reproducible from the closing commit.

## Round-3 entry gap matrix (reasonable-case projection from round 2)

| Dimension | After R2 | Round-3 target | Effort |
| --- | --- | --- | ---: |
| Coverage | ~75 % stmts, no mutation | ≥95 % stmts, ≥80 % mutation | A1 + A4 (3 wk) |
| Type strictness | `any` count tracked, branded types absent | zero `any`, branded types | A2 (1 wk) |
| Config | scattered process.env survives | typed config + canary | A3 (0.5 wk) |
| Performance | spot tests, no budgets | budgets enforced | A5 + B2 (2 wk) |
| Chaos | manual fault tests | weekly chaos suite | B1 (1.5 wk) |
| DR | none | drilled, RTO/RPO published | B3 (1.5 wk) |
| Cost | none | per-tenant attribution | B4 (1 wk) |
| Multi-region | single region | active-passive drilled | B5 (2 wk) |
| Autoscaling/SLO | manual | SLOs + budgets + alarms | B6 (1 wk) |
| Threat model + pen test | absent | both committed | C1 (2 wk) |
| LGPD | implicit | DPIA + DSR APIs | C2 (2 wk) |
| SOC 2 evidence | absent | TSCs covered | C3 (1.5 wk) |
| Cert rotation | drilled, manual | automated, alarmed | C4 (1 wk) |
| Secrets rotation | absent | scheduled, automated | C5 (1 wk) |
| SBOM/vuln triage | SBOM generated, no SLA | continuous + SLA | C6 (0.5 wk) |
| Tamper-evident audit | append-only only | Merkle log + anchor | C7 (1.5 wk) |
| SDK | contracts only | full typed client + codemod | D1 (1.5 wk) |
| Operator console | none | deployed + auth + e2e | D2 (3 wk) |
| Local dev | partial | one-command up + codegen | D3 (1 wk) |
| Synthetic monitoring | none | per-stage canaries | D4 (1 wk) |
| OpenAPI/AsyncAPI | none | generated from code | D5 (1 wk) |
| ADRs | absent | full set | E1 (1 wk) |
| Onboarding | absent | 2-day ramp | E2 (0.5 wk) |
| Reference site | absent | deployed | E3 (1 wk) |
| Drift-audit cron | absent | runs quarterly | F1 (0.5 wk) |
| Evidence-bundle generator | manual | scripted | F2 (0.5 wk) |
| Round-4 scoping | absent | planned | F3 (0.5 wk) |
| **Total** |  |  | **~33 engineer-weeks; ~6 weeks calendar with 6 engineers** |

## Worker assignment guidance

Six engineers can run round 3 in roughly 6 weeks calendar by parallelizing
within waves:

- **Eng 1 (Quality)**: A1 → A4 → F1.
- **Eng 2 (Types/DX)**: A2 → A3 → D3.
- **Eng 3 (Performance/SRE)**: A5 → B2 → B6 → D4.
- **Eng 4 (Resilience/Infra)**: B1 → B3 → B5 → B4.
- **Eng 5 (Security/Compliance)**: C1 → C2 → C3 → C7.
- **Eng 6 (Cert+SDK+Docs)**: C4 → C5 → C6 → D1 → D5 → E1 → E2 → E3 → F2.
- F3 (round-4 scoping) any engineer in the final week.

Single-engineer fallback: ~25 engineer-weeks (~6 months calendar) sequenced
through the wave order.
