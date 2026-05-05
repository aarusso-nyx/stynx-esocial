# 09 — Real Infra and LocalStack Evidence

> **Phase 9 of [`../plan.md`](../plan.md).** Wave 3, runs after Phase 8.
> Owns the `Infra/Ops worker` scope.

## Context

Read first:

- [`../inv.md`](../inv.md) — "CDK/infra: Skeleton. Static generated
  templates define one EventBridge bus, submit request/response FIFO
  queues, and a submit DLQ for `dev` and `qa`. There are no Lambda
  functions, IAM policies, VPC/RDS, secrets, metrics, alarms, or
  LocalStack integration."
- [`../diag.md`](../diag.md) — "Infrastructure Diagnostics" lists what's
  missing.
- [`../plan.md`](../plan.md) — Phase 9 task list and exit criteria.
- The Phase-0 decision in `docs/work/prompts/00-baseline-notes.md` about
  whether `infra/cdk/cdk.out/*.json` stays committed.

Today, `npm run cdk:synth` runs `scripts/cdk-synth.mjs`, which writes
static JSON templates to `infra/cdk/cdk.out/`. There is no Lambda, no
IAM, no RDS, no secrets, no alarms, no LocalStack harness. This phase
turns infrastructure-as-words into infrastructure-as-code and adds an
end-to-end integration harness.

## Operating principles

- Real CDK or honest naming. If the project keeps a static template
  generator, rename the script and the npm task to reflect that. Do not
  call it `cdk:synth` if it does not synthesize CDK.
- Environment separation is mandatory: `qualification`,
  `restricted-production`, `production`. Each has its own context and
  parameter set. Tests never reach `gov.br` endpoints.
- Generated templates are deterministic; do not commit timestamped or
  hash-suffixed outputs. Either commit the synth result and gate it on a
  reproducibility check, or do not commit it at all (Phase-0 decided).
- LocalStack is for integration evidence. It does not stand in for unit
  tests, contract tests, or DB tests — those exist already.

## Tasks

1. **Replace the static writer with a real CDK app** under `infra/cdk/`.
   Use AWS CDK v2. Stacks, at minimum:
   - `EsocialNetworkStack` — VPC, subnets (if RDS lives in VPC), security
     groups.
   - `EsocialDatabaseStack` — RDS PostgreSQL, parameter group, secret,
     migration deployment hook.
   - `EsocialMessagingStack` — EventBridge bus, request/response FIFO
     queues, DLQs, redrive policies, encryption.
   - `EsocialComputeStack` — Lambda functions for `submission`,
     `retorno`, `certificado`, `http-gateway`, `tabelas`, `trabalhador`,
     `folha`, `fechamento`, `exclusao`, with IAM roles and least-privilege
     policies.
   - `EsocialSecretsStack` — KMS keys, Secrets Manager entries for
     certificates and DB credentials.
   - `EsocialObservabilityStack` — log groups, metric filters, alarms
     (using metric names from Phase 8), dashboard.
2. **Stage configuration.** Three contexts/configs:
   `qualification`, `restricted-production`, `production`. Different
   endpoints, retention, alarm thresholds, and IAM scope. Verify with a
   test that `production` cannot be synthesized without explicit operator
   confirmation.
3. **Migration deployment hook.** A CDK construct (custom resource or
   CodeBuild job) that runs `infra/migrations/` on the RDS instance
   during deployment. Idempotent: rerunning produces no diff.
4. **LocalStack integration harness.**
   - `npm run integration:localstack` brings up LocalStack with SQS,
     EventBridge, Secrets Manager, and a local PostgreSQL container.
   - Sends a real submit envelope through the request queue.
   - Asserts: spool update arrives on the response queue, audit event
     appears on the EventBridge bus, DB row in `esocial` is correct.
   - Tears down cleanly.
5. **Rename or fix `cdk:synth`.** If using real CDK, the npm task runs
   `cdk synth --all`. If keeping a static generator (Phase 0 decision),
   rename to `templates:generate` and update docs/CI accordingly.
6. **Cleanup committed outputs.** Per Phase-0 decision: either keep
   committed templates and add a reproducibility check ("synth produces
   no diff"), or delete them and add a `.gitignore` entry for
   `infra/cdk/cdk.out/`.

## Primary write scope

- `infra/cdk/src/` — real CDK constructs and stacks
- `infra/cdk/package.json`
- `infra/cdk/cdk.json`
- `scripts/templates-generate.mjs` — honest deterministic template generator
- LocalStack harness under `tests/integration/localstack/` (new) and
  `docker-compose.yml` (new) or equivalent
- `package.json` scripts: `templates:generate`, `templates:check`,
  `integration:localstack`
- `docs/operations.md` — deployment notes
- `infra/cdk/cdk.out/` — keep or delete per Phase-0 decision

## Do not touch

- Service handler code — Phases 4/6/7/8 own it. CDK wires the runtime;
  it does not modify the runtime.
- Migrations themselves — Phase 3 owns them. Phase 9 wires them as a
  deploy hook only.
- Contracts — Phase 2 owns them.

## Exit criteria

- `npm run templates:check` verifies the honestly named deterministic template
  generator (or a future `cdk:synth` performs real synthesis).
- `npm run integration:localstack` sends a message through queues,
  observes response/audit/status outputs, and writes a row in `esocial`.
- Generated templates include runtime resources (Lambdas, IAM, queues,
  buses, secrets, alarms, dashboard), not only queues.
- Three stage configurations exist and each is testable in isolation.
  Production synth requires explicit confirmation.
- The committed-templates question is settled per Phase 0: either
  reproducible-by-check or excluded.

## Verification commands

```text
npm run build
npm run lint
npm run templates:generate
npm run templates:check
npm run integration:localstack
npm test
```

Report: stacks added, Lambdas wired (count + names), endpoints used per
stage (no `gov.br` URLs in non-production stages), and the LocalStack
round-trip latency.
