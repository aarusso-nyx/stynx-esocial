# Round 5 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a
self-contained agent brief.

## Order and parallelism

| Wave | Prompts | Parallel? | Blocked by |
| --- | --- | --- | --- |
| A — Test depth | A1 A2 A3 | yes | — |
| B — Security & compliance | B1, then B2 B3 B4 B5 | B1 first | — |
| C — Operability & cost | C1 C2 | yes | — |
| D — Coverage gap & docs | D1 D2 | yes | — |
| E — Closure | E1 | last | A–D |

## Index

- [`A1-mutation-testing.md`](A1-mutation-testing.md)
- [`A2-chaos-suite-expanded.md`](A2-chaos-suite-expanded.md)
- [`A3-load-tests.md`](A3-load-tests.md)
- [`B1-threat-model.md`](B1-threat-model.md)
- [`B2-lgpd-dpia-dsr.md`](B2-lgpd-dpia-dsr.md)
- [`B3-soc2-evidence.md`](B3-soc2-evidence.md)
- [`B4-secrets-kms-rotation.md`](B4-secrets-kms-rotation.md)
- [`B5-tamper-evident-audit.md`](B5-tamper-evident-audit.md)
- [`C1-cost-attribution.md`](C1-cost-attribution.md)
- [`C2-slo-burn-alarms.md`](C2-slo-burn-alarms.md)
- [`D1-reference-site.md`](D1-reference-site.md)
- [`D2-s1030-s1040-s1060-promotion.md`](D2-s1030-s1040-s1060-promotion.md)
- [`E1-round-6-entry-verification.md`](E1-round-6-entry-verification.md)
