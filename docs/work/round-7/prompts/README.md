# Round 7 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Every prompt requires explicit
authorization before it starts.

## Order and Parallelism

| Wave | Prompts | Parallel? | Blocked by |
| --- | --- | --- | --- |
| A — real endpoint | A1 then A2 | A2 after A1 | Real cert, real CNPJ, gov.br acceptable-use |
| B — deployed operations | B1 B2 B3 | yes | Certificate/stage authorization |
| C — external assurance | C1 C2 C3 | yes after stage exists | Vendor and account/evidence grants |
| D — GA publish | D1 D2 | yes | A1/A2, C1 critical/high closure, release sign-off |

## Index

- [`A1-real-endpoint-roundtrip.md`](A1-real-endpoint-roundtrip.md)
- [`A2-real-endpoint-sign-off.md`](A2-real-endpoint-sign-off.md)
- [`B1-real-cert-provisioning-rotation.md`](B1-real-cert-provisioning-rotation.md)
- [`B2-multi-region-dr-drill.md`](B2-multi-region-dr-drill.md)
- [`B3-synthetic-monitoring-deployment.md`](B3-synthetic-monitoring-deployment.md)
- [`C1-pen-test-execution.md`](C1-pen-test-execution.md)
- [`C2-soc2-external-evidence.md`](C2-soc2-external-evidence.md)
- [`C3-cur-validation.md`](C3-cur-validation.md)
- [`D1-contracts-ga-publish.md`](D1-contracts-ga-publish.md)
- [`D2-sdk-ga-publish.md`](D2-sdk-ga-publish.md)
- [`E1-s1030-s1040-s1060-schema-decision.md`](E1-s1030-s1040-s1060-schema-decision.md)
