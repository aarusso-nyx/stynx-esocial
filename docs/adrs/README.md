# Architecture Decision Records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-esocial-owns-xml.md) | Accepted | eSocial owns XML build, validation, signing, SOAP, and returns. |
| [0002](0002-typescript-lambdas.md) | Accepted | Active Lambdas use plain TypeScript. |
| [0003](0003-standalone-esocial-schema.md) | Accepted | The service owns schema `esocial` and no SGP schema access. |
| [0004](0004-idempotency-key-shape.md) | Accepted | Versioned idempotency keys derive from tenant/environment/event/source/payload facts. |
| [0005](0005-append-only-audit-rls.md) | Accepted | Audit/status history is append-only with explicit worker RLS bypass. |
| [0006](0006-deterministic-soap-stub.md) | Accepted | CI uses deterministic SOAP fixtures, not live endpoints. |
| [0007](0007-dlq-replay-auth.md) | Accepted | Replay is operator-governed and envelope-based. |
| [0008](0008-node-test-coverage-authority.md) | Accepted | `node --test` is the coverage authority. |
| [0009](0009-contract-versioning.md) | Accepted | Contract package versions generated specs, schemas, examples, and helpers together. |
| [0010](0010-branded-types.md) | Accepted | Runtime-validated branded identifiers are exported from contracts. |
| [0011](0011-forward-only-migrations.md) | Accepted | Landed migrations are immutable. |
| [0012](0012-sgp-lifted-lifecycle.md) | Accepted | Lifted code is evidence, not active runtime. |
| [0013](0013-service-handler-surface.md) | Accepted | Family-named placeholder services are not active Lambdas. |

Use [0000-template.md](0000-template.md) for new decisions.
