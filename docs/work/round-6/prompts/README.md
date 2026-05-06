# Round 6 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a self-contained
agent brief for immediate/local execution.

## Order and Parallelism

| Wave | Prompts | Parallel? | Notes |
| --- | --- | --- | --- |
| F1 — R4 carryover | F1 | yes | Finishes before D2 so the reference site uses real evidence. |
| F2 — mutation | F2 | yes | Large quality push; does not block unrelated batches. |
| F3 — event promotion | F3 | yes | Promotes S-1030 / S-1040 / S-1060. |
| F4 — LGPD runtime | F4 | yes | DSR, sweeper, approval queue. |
| F5 — internal security | F5 | yes | DLQ auth and runtime-deny evidence. |
| A — on-call and deploy | A1 A2 | yes | Internal platform operations. |
| B — customer and isolation | B1 B2 | yes | Repo-owned onboarding/isolation design and automation. |
| C — compliance and capacity | C1 C2 | yes | Local evidence export and capacity automation. |
| D — surfaces | D1 D2 | yes | Operator console and reference site. D2 waits for F1 evidence. |
| E — strategy | E1 | last | Internationalization scouting. |

## Index

### Carryover

- [`F1-round-4-carryover.md`](F1-round-4-carryover.md)
- [`F2-mutation-testing-closure.md`](F2-mutation-testing-closure.md)
- [`F3-s1030-s1040-s1060-promotion.md`](F3-s1030-s1040-s1060-promotion.md)
- [`F4-lgpd-runtime-closure.md`](F4-lgpd-runtime-closure.md)
- [`F5-security-internal-closures.md`](F5-security-internal-closures.md)

### Platform Expansion

- [`A1-sre-on-call.md`](A1-sre-on-call.md)
- [`A2-blue-green-auto-rollback.md`](A2-blue-green-auto-rollback.md)
- [`B1-customer-onboarding.md`](B1-customer-onboarding.md)
- [`B2-multi-account-isolation.md`](B2-multi-account-isolation.md)
- [`C1-continuous-compliance.md`](C1-continuous-compliance.md)
- [`C2-capacity-planning.md`](C2-capacity-planning.md)
- [`D1-operator-console.md`](D1-operator-console.md)
- [`D2-reference-site.md`](D2-reference-site.md)
- [`E1-internationalization-scouting.md`](E1-internationalization-scouting.md)

Deferred/external prompts live in [`../../round-7/prompts/`](../../round-7/prompts/).
