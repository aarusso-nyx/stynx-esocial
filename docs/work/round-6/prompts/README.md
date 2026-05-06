# Round 6 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a
self-contained agent brief with an explicit **Authorization required**
section.

## Order and parallelism

| Wave | Prompts | Parallel? | Blocked by |
| --- | --- | --- | --- |
| A — Real connectivity | A1 | — | R5 closure + R5 E1 readiness |
| B — Cert + drills | B1 B2 B3 | yes | A1 |
| C — External engagement | C1 | — | parallel with A or B |
| D — Releases | D1 D2 | yes | A1 stable + R5 closure |

## Authorization gate

Every prompt declares **Authorization required**. No prompt may start
until the authorization is recorded in
`docs/release/1.3.0/authorizations/<area>.md`.

## Index

- [`A1-round-2-connectivity-execution.md`](A1-round-2-connectivity-execution.md)
- [`B1-real-cert-provisioning-rotation.md`](B1-real-cert-provisioning-rotation.md)
- [`B2-multi-region-dr-drill.md`](B2-multi-region-dr-drill.md)
- [`B3-synthetic-monitoring-deployment.md`](B3-synthetic-monitoring-deployment.md)
- [`C1-pen-test-execution.md`](C1-pen-test-execution.md)
- [`D1-contracts-ga-publish.md`](D1-contracts-ga-publish.md)
- [`D2-sdk-ga-publish.md`](D2-sdk-ga-publish.md)
