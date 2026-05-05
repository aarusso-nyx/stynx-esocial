# Prompt Sequence — eSocial Production-Grade Implementation

This directory materializes [`../plan.md`](../plan.md) into a sequence of agent-ready
prompts. Each file is a self-contained brief: a fresh agent should be able to read
**only** the prompt (plus the assessment docs it references) and execute that phase
without prior conversation context.

## How to use

Run prompts in numerical order. Each prompt:

- States the phase scope and primary write paths.
- Points at the relevant assessment evidence in [`../inv.md`](../inv.md),
  [`../diag.md`](../diag.md), and [`../plan.md`](../plan.md).
- Lists tasks and exit criteria.
- Calls out what to **not** touch (worker discipline from `plan.md`).
- Ends with the verification command surface the agent must demonstrate.

If you're driving with a multi-agent orchestrator, the worker split in
`plan.md` lets some prompts run in parallel after Phase 1 lands. Recommended
parallelization windows are noted at the top of each prompt.

## Sequence

| # | File | Phase | Wave |
| --- | --- | --- | --- |
| 00 | [`00-stabilize-baseline.md`](00-stabilize-baseline.md) | Stabilize the baseline | Pre-wave |
| 01 | [`01-compileable-repo.md`](01-compileable-repo.md) | Make the repository compileable | Wave 1 |
| 02 | [`02-lock-bus-contracts.md`](02-lock-bus-contracts.md) | Lock versioned bus contracts | Wave 1 |
| 03 | [`03-autonomous-database.md`](03-autonomous-database.md) | Build the autonomous eSocial database | Wave 1 |
| 04 | [`04-active-mq-handler.md`](04-active-mq-handler.md) | Implement the active MQ handler | Wave 1 |
| 05 | [`05-promote-xml-builders.md`](05-promote-xml-builders.md) | Promote XML builders boundary-cleanly | Wave 2 |
| 06 | [`06-xsd-signing-soap.md`](06-xsd-signing-soap.md) | Activate XSD, XML security, signing, SOAP sandbox | Wave 2 |
| 07 | [`07-returns-totalizers-status.md`](07-returns-totalizers-status.md) | Returns, totalizers, status publication | Wave 2 |
| 08 | [`08-retry-dlq-observability.md`](08-retry-dlq-observability.md) | Retry, DLQ, replay, observability | Wave 3 |
| 09 | [`09-real-infra-localstack.md`](09-real-infra-localstack.md) | Real infra and LocalStack evidence | Wave 3 |
| 10 | [`10-consumer-migration-release.md`](10-consumer-migration-release.md) | SGP consumer migration and release evidence | Wave 3 |

The first implementation wave is **phases 1–4**: until the repo compiles,
contracts are locked, migrations execute, and the active handler persists/
publishes real state, promoting builders adds copy without runnable behavior.

## Operating principles (from `plan.md`)

Repeated in every prompt — but worth stating once here:

- Do not keep compatibility shims for wrong pre-production names or contracts.
  Fix the public contract directly and update docs/tests in the same change.
- Treat `tests/sgp-lifted/` and `packages/domain/src/sgp-lifted/` as **evidence
  mines** until each slice is made compileable and boundary-clean.
- No direct SQL to SGP schemas (`hr.*`, `payroll.*`, `saude.*`, `public.esocial_event`,
  etc.) from runtime eSocial code. SGP source references remain opaque identifiers
  in payloads and status updates.
- Each phase must upgrade at least one gate from structural evidence to
  executable behavior.
- No real certificates, real endpoints, production payloads, or production
  personal data without explicit owner authorization.

## Worker discipline

Workers must assume others are active in the same codebase and must not revert
or overwrite changes outside their ownership scope. Each prompt declares its
**Primary write scope** and a **Do not touch** list. Stay inside it.
