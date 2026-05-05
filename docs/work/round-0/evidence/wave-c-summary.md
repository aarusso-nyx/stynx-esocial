# Wave C Summary

Date: 2026-05-05

Implemented:

- C1 retry, DLQ, circuit-breaker, and operator replay helpers plus HTTP replay
  endpoint and persistence surfaces.
- C2 structured logging, Pino logger factory, EMF metric payloads,
  OpenTelemetry span helpers, redaction policy, alarm/dashboard metadata, and
  handler instrumentation.
- C3 deterministic stage template generation from `infra/cdk/config/`, scoped
  IAM template tests, production dry-run guard, and LocalStack-compatible
  queue/event/PostgreSQL harness.
- C4 GitHub CI/release workflows with SHA-pinned actions, Dependabot, npm audit
  gate, and SBOM generation.
- C5 SGP migration notes, operations runbooks, release checklist, README update,
  and Round 0 evidence bundle under `docs/release/0.1.0/`.

Verified locally:

```text
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
npm run integration:localstack
npm run templates:check
npm audit --omit=dev --audit-level=high
ESOCIAL_PROD_CONFIRM=1 node scripts/templates-generate.mjs --stage production --dry-run
npm run coverage
npm run sbom -- --out docs/release/0.1.0/sbom/contracts-active-services.cdx.json
```

Known deferrals:

- Real CDK synthesis remains deferred; Round 0 keeps honest deterministic
  CloudFormation review templates.
- Restricted-production and real eSocial endpoint tests remain deferred to
  Round 2 with explicit owner authorization.
- Coverage is executable but below the 80 percent target. The Wave C local
  combined node coverage report ended at 69.88 percent line coverage.
