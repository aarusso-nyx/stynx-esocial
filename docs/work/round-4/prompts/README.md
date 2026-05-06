# Round 4 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a
self-contained agent brief.

## Order and parallelism

| Wave | Prompts | Parallel? | Blocked by |
| --- | --- | --- | --- |
| A — Test depth | A1 A2 A3 | yes | — |
| B — DX | B1 B2 | yes | — |
| C — Docs | C1 C2 C3 | yes | — |
| D — Continuous quality | D1 D2 D3 | yes | — |
| E — Closure | E1 | last | A–D |

All of Wave A–D can run concurrently after round 3 closes. Wave E
waits for everything else.

## Index

- [`A1-coverage-and-property.md`](A1-coverage-and-property.md)
- [`A2-perf-bench-suite.md`](A2-perf-bench-suite.md)
- [`A3-e2e-wiring.md`](A3-e2e-wiring.md)
- [`B1-dev-up-and-codegen.md`](B1-dev-up-and-codegen.md)
- [`B2-no-op-service-triage.md`](B2-no-op-service-triage.md)
- [`C1-readme-rewrite.md`](C1-readme-rewrite.md)
- [`C2-adrs.md`](C2-adrs.md)
- [`C3-onboarding-and-glossary.md`](C3-onboarding-and-glossary.md)
- [`D1-drift-audit-cron.md`](D1-drift-audit-cron.md)
- [`D2-sbom-scanners-sla.md`](D2-sbom-scanners-sla.md)
- [`D3-blocked-artifacts-review.md`](D3-blocked-artifacts-review.md)
- [`E1-round-6-scoping.md`](E1-round-6-scoping.md)
