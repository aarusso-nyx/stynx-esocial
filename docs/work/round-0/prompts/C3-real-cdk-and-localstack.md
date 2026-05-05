# C3 — Real CDK and LocalStack Round-Trip

> **Wave C, step 3.** Infra worker. Blocked by B1 + B4 + B5. Parallel with C1, C2.

## Read first

- [`../../plan.md`](../../plan.md) — Phase 9.
- [`../decisions.md`](../decisions.md) — `cdk.out` commitment policy
  from A1.
- [`../assessment.md`](../assessment.md) — IAM-wildcard finding,
  template-only state.
- A4's migrations.
- C2's alarm/dashboard registries.

## Why this exists

Infrastructure is a static JSON writer. Real CDK is needed to ship.
Wildcard IAM in synthesized templates would be exploitable on day one.
LocalStack is needed for round-trip integration evidence.

## Tasks

1. **Replace the writer with a real CDK app.** Under `infra/cdk/`:
   - `cdk.json` with app entry pointing at `src/main.ts`.
   - Stacks:
     - `EsocialNetworkStack` — VPC, private/public subnets, security
       groups (only if RDS lives in VPC; otherwise document why
       publicly accessible RDS is not used).
     - `EsocialDatabaseStack` — RDS PostgreSQL, parameter group, DB
       secret in Secrets Manager, migration deployment hook.
     - `EsocialMessagingStack` — EventBridge bus + rules, request /
       response / retry / DLQ FIFO queues, redrive policies, KMS
       encryption.
     - `EsocialSecretsStack` — KMS keys (separate keys for DB,
       certificates, queue encryption), tenant-certificate Secrets
       Manager parameters as resources (values are operator-provided
       at deploy time, not in code).
     - `EsocialComputeStack` — Lambdas: `submission`, `retorno`,
       `certificado`, `http-gateway`, `tabelas`, `trabalhador`, `folha`,
       `fechamento`, `exclusao`, plus the retry-poller from C1.
       Each Lambda has its own least-privilege role.
     - `EsocialObservabilityStack` — log groups, metric filters,
       alarms (consumes C2's `alarms.ts`), dashboard (consumes C2's
       `dashboards.ts`).
2. **Scoped IAM.** Replace every wildcard with explicit ARNs:
   - `sqs:*` → `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage`,
     `sqs:GetQueueAttributes` against the specific queue ARNs.
   - `secretsmanager:GetSecretValue` against specific secret ARNs.
   - `kms:Decrypt` / `kms:GenerateDataKey` against specific key ARNs.
   - `logs:*` → `logs:CreateLogStream`, `logs:PutLogEvents` on the
     Lambda's own log group ARN.
   A unit test asserts no IAM statement uses `Resource: "*"`.
3. **Stage configs.** Three contexts: `qualification`,
   `restricted-production`, `production`. Per-stage parameter file
   (`infra/cdk/config/<stage>.json`) covering: endpoints (env-var
   indirection), retention, alarm thresholds, IAM scope. A test asserts
   `production` synthesis requires `ESOCIAL_PROD_CONFIRM=1`.
4. **Migration deploy hook.** A CDK custom resource (CodeBuild project
   or DataAPI-driven) that runs `infra/migrations/` on the RDS instance
   during deployment. Idempotent — second run produces no diff. Test
   in LocalStack.
5. **LocalStack harness.**
   - `docker-compose.yml` with LocalStack (community) + Postgres.
   - `scripts/integration-localstack.mjs`:
     - Starts compose.
     - Deploys minimal CDK stacks (or applies cloudformation directly)
       to LocalStack.
     - Runs migrations on the local Postgres.
     - Sends a real submit envelope through the request queue.
     - Asserts: spool update arrives on response queue, audit event on
       EventBridge bus, DB row in `esocial`, sent → accepted via the
       deterministic SOAP transport.
     - Tears down.
   - `npm run integration:localstack` invokes the script. Replaces the
     regex linter.
6. **Honest naming for `cdk:synth`.**
   - If the round-0 decision is "real CDK now": `npm run cdk:synth` =
     `cdk synth --all`. Add `npm run cdk:diff` and `cdk:deploy:<stage>`.
   - If the decision is "real CDK in round 1": rename current script to
     `templates:generate` and add a `templates:check` that asserts the
     generator output is a deterministic re-synthesis. Update README.
7. **Committed-templates policy.** Apply A1's decision:
   - Either commit the synth output and gate on a reproducibility check
     (`templates:check` exits 0 when running synth twice produces the
     same bytes).
   - Or `gitignore` `infra/cdk/cdk.out/` and rely on CI artifacts.

## Primary write scope

- `infra/cdk/**` (new real CDK app)
- `scripts/integration-localstack.mjs`
- `docker-compose.yml`
- `package.json` (`cdk:synth`, `cdk:diff`, `cdk:deploy:<stage>`,
  `integration:localstack` script wiring)
- `docs/operations.md` — deployment notes (coordinate with C2's metrics
  dictionary)

## Do not touch

- Service handler code — wave B owns it.
- Migrations themselves — A4 owns them. C3 only wires them as a deploy
  hook.
- Contracts / observability emission — A3 / C2 own them.

## Exit criteria

- `npm run cdk:synth` performs real CDK synthesis (or is honestly named
  per the round-0 decision).
- A test asserts no `Resource: "*"` in synthesized templates.
- Three stage configurations exist; production synth requires
  `ESOCIAL_PROD_CONFIRM=1`.
- `npm run integration:localstack` round-trips a message through SQS +
  EventBridge + Postgres + Secrets Manager and asserts the four
  observable artifacts.
- Migration deploy hook is exercised in LocalStack.

## Verification

```text
npm run cdk:synth
node -e "/* assert no wildcards in cdk.out */"
ESOCIAL_PROD_CONFIRM=1 cdk synth EsocialMessagingStack-production
npm run integration:localstack
```

Report: stacks synthesized, Lambdas wired (count + names), IAM statements
audited (wildcard count = 0), per-stage endpoints (env-var indirection,
no `gov.br` literals in non-production), and LocalStack round-trip
latency.
