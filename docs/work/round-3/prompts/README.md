# Round 3 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a
self-contained agent brief. **Most prompts run in parallel** — see the
matrix below.

## Layout

| Wave | Prompts | Parallel? |
| --- | --- | --- |
| A — Engineering excellence | A1 A2 A3 A4 A5 | yes |
| B — Operational maturity | B1 B2 B3 B4 B5 B6 | yes |
| C — Security & compliance | C1 → (C2 C3 C4 C5 C6 C7) | C1 first; then 6 parallel |
| D — Developer & operator experience | D1 D2 D3 D4 D5 | yes; D5 → E3 |
| E — Documentation | E1 E2 E3 | E3 depends on D5 |
| F — Continuous improvement | F1 F2 F3 | F3 last |

## Cross-wave dependencies

- C1 (threat model) informs C2 / C3 scope; let C1 land first.
- D5 (OpenAPI/AsyncAPI) feeds E3 (reference site) content.
- F3 (round-4 scoping) is the round closer.

## Operating principles (every prompt)

- No structural-only gates. Every claim CI-provable.
- No real production data in tests.
- Deterministic by default; pin seeds in property/chaos tests.
- Forward-only migrations.
- Append-only history; tamper-evident via C7.
- Workers stay in scope. Cross-cutting work routes through Wave F.
- Evidence-by-default: each prompt deposits artifacts under
  `docs/release/1.0.0/<area>/`. F2 wires the manifest.

## Closure target

A PR is "round-3 done" only when all 20 items in
[`../plan.md`](../plan.md#round-3-closure-target-done-means) are
CI-provable.

## Index

- [`A1-coverage-95.md`](A1-coverage-95.md)
- [`A2-type-strictness.md`](A2-type-strictness.md)
- [`A3-typed-config.md`](A3-typed-config.md)
- [`A4-mutation-testing.md`](A4-mutation-testing.md)
- [`A5-perf-regression.md`](A5-perf-regression.md)
- [`B1-chaos-engineering.md`](B1-chaos-engineering.md)
- [`B2-load-and-capacity.md`](B2-load-and-capacity.md)
- [`B3-disaster-recovery.md`](B3-disaster-recovery.md)
- [`B4-cost-observability.md`](B4-cost-observability.md)
- [`B5-multi-region.md`](B5-multi-region.md)
- [`B6-autoscaling-and-slo.md`](B6-autoscaling-and-slo.md)
- [`C1-threat-model-and-pentest.md`](C1-threat-model-and-pentest.md)
- [`C2-lgpd-compliance.md`](C2-lgpd-compliance.md)
- [`C3-soc2-evidence.md`](C3-soc2-evidence.md)
- [`C4-cert-rotation-automation.md`](C4-cert-rotation-automation.md)
- [`C5-secrets-rotation.md`](C5-secrets-rotation.md)
- [`C6-sbom-vuln-triage.md`](C6-sbom-vuln-triage.md)
- [`C7-tamper-evident-audit.md`](C7-tamper-evident-audit.md)
- [`D1-sgp-sdk.md`](D1-sgp-sdk.md)
- [`D2-operator-console.md`](D2-operator-console.md)
- [`D3-local-dev.md`](D3-local-dev.md)
- [`D4-synthetic-monitoring.md`](D4-synthetic-monitoring.md)
- [`D5-openapi-asyncapi.md`](D5-openapi-asyncapi.md)
- [`E1-adrs.md`](E1-adrs.md)
- [`E2-onboarding.md`](E2-onboarding.md)
- [`E3-reference-site.md`](E3-reference-site.md)
- [`F1-drift-audit-cron.md`](F1-drift-audit-cron.md)
- [`F2-evidence-bundle-generator.md`](F2-evidence-bundle-generator.md)
- [`F3-round-4-scoping.md`](F3-round-4-scoping.md)
