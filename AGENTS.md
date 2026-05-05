# AGENTS.md - eSocial Repository Protocol

This file applies to every agent working in this repository.

## Mission

Build a production-grade standalone eSocial product from the SGP lift-out. The
service owns XML generation, validation, signing boundary, SOAP submission,
return parsing, retry/DLQ handling, audit/status publication, and operational
evidence. SGP remains the HR/payroll system of record.

## Authority Order

1. `AGENTS.md` and `docs/architecture.md` define repository boundaries.
2. `docs/consumers.md` defines external producer/consumer contracts.
3. `docs/events.md` defines lifted event coverage and source locations.
4. `docs/references/` contains copied legal/reference material for eSocial.
5. Source code and executable tests prove implemented behavior.
6. `tests/sgp-lifted/` is migration evidence and test-mining input, not an
   automatically active test suite.

When sources conflict, preserve the stricter runtime boundary and update the
lower-authority document or test.

## Hard Boundaries

- Use schema `esocial` for this service database.
- Do not reintroduce `stynx_esocial` SQL schema names.
- Do not use direct SQL, FDW, shared schemas, cross-database FKs, or shared DB
  URLs with SGP.
- Do not make SGP depend on browser-facing eSocial routes. SGP triggers eSocial
  from backend domain actions and consumes status updates.
- Keep SGP references opaque: source event id, payroll run id, employee id, and
  source entity ids are identifiers in payloads, not database relationships.
- Use sandbox adapters, mocks, contract fixtures, or golden files for eSocial,
  ICP-Brasil, SOAP, certificate storage, SQS, EventBridge, and AWS unless the
  owner explicitly authorizes real-service tests.
- Do not commit secrets, private keys, real certificates, production payloads,
  real `.env` files, or production personal data.

## Working Rules

- Start non-trivial work with:

```bash
pwd
git status --short --branch
npm test
```

- Preserve unrelated dirty files. Do not revert user or worker changes.
- Prefer existing package boundaries over new abstractions.
- Keep package names, service names, topic names, and docs aligned.
- Treat golden XML, WSDL, `.rem`, `.ret`, PDF, and signed payload fixtures as
  byte-sensitive. Do not normalize whitespace unless the test/spec requires it.
- Public contract changes require docs, tests, and generated/deployment surface
  updates in the same change.
- Database changes require migration checks and, when implemented, real
  PostgreSQL migration/RLS tests.
- Commit, push, or open PRs only when explicitly requested.

## Current Command Surface

Run from repository root:

```bash
npm test
npm run lint
npm run build
npm run coverage
npm run templates:generate
npm run templates:check
npm run test:db
npm run migrate:dev
npm run integration:localstack
npm run test:integration
```

The current checks include TypeScript compilation, deterministic template
reproducibility, focused unit/contract tests, and local PostgreSQL integration
tests. When adding real runtime behavior, add focused tests first, then expand
these gates instead of bypassing them.

## Worker Ownership Guidance

Use disjoint write scopes for parallel workers:

- Contracts worker: `packages/contracts/`, `docs/consumers.md`,
  `tests/contract/`.
- Database worker: `infra/migrations/`, migration scripts, DB tests.
- Submission worker: `services/submission/`, `packages/domain/src/submission/`,
  submission contract tests.
- XML/event worker: `packages/domain/src/sgp-lifted/esocial-worker/`,
  `docs/events.md`, `docs/templates/`.
- PKI/SOAP worker: `packages/pki-pades/`, signing and SOAP services/tests.
- Infra worker: `infra/cdk/`, generated templates, deployment docs.
- Docs/runbook worker: `docs/`, `README.md`, operator and consumer runbooks.

Workers are not alone in the codebase. They must not revert or overwrite changes
outside their ownership scope.

## Done Criteria

A production-grade slice is done only when it has:

- Versioned input/output contract.
- Runtime implementation.
- Deterministic unit/contract tests.
- Integration or sandbox evidence where applicable.
- Tenant and idempotency behavior documented and tested.
- Failure behavior, retry behavior, and observability documented.
- Consumer migration notes for SGP when the contract changes.
