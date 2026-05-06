# Round 4 — Quick Wins (No Authorization Required)

> **Scope:** close the 12 round-3 punch-list items that **do not depend on
> owner authorization, real certificates, deployed infrastructure, or
> external services**. These are the highest-value lifts per engineer-day.
>
> **Prerequisites:** round-3 closure scaffold landed (commit `9796df2`).
>
> **Inputs:**
> - Punch list from `docs/work/round-3/assessment.md` (consolidated table).
> - `docs/release/1.0.0/` evidence bundle.

---

## Why a separate round

Round 3 shipped scaffolds (typed config, branded types, OpenAPI/AsyncAPI,
evidence-bundle generator). The remaining work splits cleanly into three
buckets: quick wins, greenfield, and owner-blocked. Round 4 covers the
quick-wins bucket — items where the whole task is internal, the design is
already drafted in round-3 prompts, and a single engineer can ship in
≤ 1 week per item.

---

## Closure target ("done means")

A green CI pipeline proving:

1. **Coverage gate ≥ 95 % stmts / ≥ 90 % branches** on
   `packages/contracts`, `packages/domain`, `packages/pki-pades`, active
   services. Threshold lifted from 70 % → 95 % in `coverage-check.mjs`.
2. **Property-based tests** under `tests/property/` covering idempotency,
   builder invariants, return classification, retry stability, redaction.
3. **`tests/perf/` exists** with vitest-bench (or mitata) suites per area;
   PR-comment diff vs baselines under
   `docs/release/1.0.0/perf-baselines/`.
4. **`tests/e2e/` is wired** into a real npm script (`test:e2e` or
   `test:integration` extension) and runs in CI.
5. **`npm run dev:up` / `dev:down` / `dev:reset` / `dev:family <code>`**
   ship; cold start < 5 minutes on a fresh clone; family codegen
   scaffolds DTO + builder + tests + dispatcher entry.
6. **5 no-op services triaged** — each of `tabelas`, `trabalhador`,
   `folha`, `fechamento`, `exclusao` either becomes a real handler or is
   deleted from CDK + workspaces with the rationale recorded in
   `docs/architecture.md`.
7. **README + `docs/README.md`** rewritten to reflect production state
   (39-class coverage, end-to-end pipeline, links to evidence).
8. **ADRs (`docs/adrs/`)** backfilled (≥ 13 records) plus `adr-check.yml`
   workflow gating PR changes to decision-bearing files.
9. **`docs/onboarding.md` + `docs/glossary.md`** authored; external
   reviewer dry-run captured.
10. **Drift-audit cron** (`drift-audit.yml`) runs quarterly; per-PR slim
    drift check enforces no closure-item regression.
11. **SBOM continuous scanning** — `osv-scanner` + `trivy` run on every
    PR; CI fails on critical / high; SBOM diff in PR comments;
    vuln-triage SLA documented.
12. **`blocked-artifacts.json` review** — every blocker has a named
    owner + target round + target date; orphaned blockers escalated.
13. **Round-6 charter** drafted in `docs/work/round-6/` for the
    immediate/local round after R5.

---

## Worker waves

Round 4 designed for parallel execution by 5 engineers in **~1.5 weeks
calendar**.

### Wave A — Test depth (3 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| A1 | [`prompts/A1-coverage-and-property.md`](prompts/A1-coverage-and-property.md) | 1 wk |
| A2 | [`prompts/A2-perf-bench-suite.md`](prompts/A2-perf-bench-suite.md) | 0.5 wk |
| A3 | [`prompts/A3-e2e-wiring.md`](prompts/A3-e2e-wiring.md) | 0.5 wk |

### Wave B — Developer experience (2 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| B1 | [`prompts/B1-dev-up-and-codegen.md`](prompts/B1-dev-up-and-codegen.md) | 1 wk |
| B2 | [`prompts/B2-no-op-service-triage.md`](prompts/B2-no-op-service-triage.md) | 0.5 wk |

### Wave C — Documentation (3 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| C1 | [`prompts/C1-readme-rewrite.md`](prompts/C1-readme-rewrite.md) | 0.25 wk |
| C2 | [`prompts/C2-adrs.md`](prompts/C2-adrs.md) | 1 wk |
| C3 | [`prompts/C3-onboarding-and-glossary.md`](prompts/C3-onboarding-and-glossary.md) | 0.5 wk |

### Wave D — Continuous quality (3 parallel)

| # | Prompt | Effort |
| --- | --- | --- |
| D1 | [`prompts/D1-drift-audit-cron.md`](prompts/D1-drift-audit-cron.md) | 0.5 wk |
| D2 | [`prompts/D2-sbom-scanners-sla.md`](prompts/D2-sbom-scanners-sla.md) | 0.5 wk |
| D3 | [`prompts/D3-blocked-artifacts-review.md`](prompts/D3-blocked-artifacts-review.md) | 0.25 wk |

### Wave E — Closure

| # | Prompt | Effort |
| --- | --- | --- |
| E1 | [`prompts/E1-round-6-scoping.md`](prompts/E1-round-6-scoping.md) | 0.25 wk |

**Total**: ~6.5 engineer-weeks; ~1.5 weeks calendar with 5 engineers.

---

## Operating principles

- No structural-only gates.
- No external service calls in CI; everything runs against ephemeral
  Postgres + LocalStack + deterministic SOAP stub.
- Forward-only migrations (none expected this round).
- Workers stay in scope; cross-cutting changes route through Wave D.
- Every prompt produces an artifact under `docs/release/1.1.0/<area>/`.

---

## Worker assignment

5 engineers in 1.5 weeks:

- **Eng 1 (Quality)**: A1 → A2.
- **Eng 2 (DX)**: B1 → A3.
- **Eng 3 (Architecture)**: B2 → C1.
- **Eng 4 (Docs)**: C2 → C3 → E1.
- **Eng 5 (CI/Quality)**: D1 → D2 → D3.

Single-engineer fallback: ~6.5 engineer-weeks calendar.

---

## Hand-off

- Round 3 → Round 4: this plan + the punch list.
- Round 4 → Round 5: round-4 closure verified; greenfield bucket can start
  on a clean foundation.
