# Round 0 — Prompt Sequence

Materialization of [`../plan.md`](../plan.md). Each prompt is a self-contained
brief: a fresh agent should be able to read **only** the prompt (plus the
assessment docs and `../plan.md` it references) and execute that step.

## Order

| # | File | Wave | Worker scope | Blocked by |
| --- | --- | --- | --- | --- |
| A1 | [`A1-baseline-and-decisions.md`](A1-baseline-and-decisions.md) | A | Coordinator | — |
| A2 | [`A2-real-typescript-build.md`](A2-real-typescript-build.md) | A | Toolchain | A1 |
| A3 | [`A3-contracts-frozen.md`](A3-contracts-frozen.md) | A | Contracts | A1 |
| A4 | [`A4-autonomous-schema.md`](A4-autonomous-schema.md) | A | Database | A1 |
| B1 | [`B1-handler-real-runtime.md`](B1-handler-real-runtime.md) | B | Submission | A2, A3, A4 |
| B2 | [`B2-builders-five-families.md`](B2-builders-five-families.md) | B | XML/event | A2, A3 |
| B3 | [`B3-pki-and-xml-security.md`](B3-pki-and-xml-security.md) | B | PKI/SOAP | A2, A4 |
| B4 | [`B4-soap-and-environments.md`](B4-soap-and-environments.md) | B | PKI/SOAP | B3 |
| B5 | [`B5-returns-totalizers-status.md`](B5-returns-totalizers-status.md) | B | Returns | A3, A4 |
| C1 | [`C1-retry-dlq-replay.md`](C1-retry-dlq-replay.md) | C | Submission/Returns | B1, B4, B5 |
| C2 | [`C2-observability.md`](C2-observability.md) | C | Ops | B1, B4, B5 |
| C3 | [`C3-real-cdk-and-localstack.md`](C3-real-cdk-and-localstack.md) | C | Infra | B1, B4, B5 |
| C4 | [`C4-ci-and-release.md`](C4-ci-and-release.md) | C | Infra/Release | C1, C2, C3 |
| C5 | [`C5-sgp-migration-and-evidence.md`](C5-sgp-migration-and-evidence.md) | C | Docs | C1, C2, C3, C4 |
| D1 | [`D1-round-1-builder-promotion-plan.md`](D1-round-1-builder-promotion-plan.md) | D | Planner | C5 |

Within a wave, prompts marked with the same upstream block run in parallel.

## Operating principles (every prompt)

- No structural-only gates.
- No SGP schema reads/writes from active code.
- No real certificates / endpoints / production data.
- Idempotent and deterministic processing.
- Append-only history.
- Forward-only migrations.
- Honest naming.
- Lifted tree is evidence; either promote or exclude.

## Round-0 closure target

Defined in [`../plan.md`](../plan.md#round-0-closure-target-done-means). A PR
is "round 0 done" only when all 11 closure items are provable from CI.
