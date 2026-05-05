# Codex Bootstrap

Use this document to start a new Codex session with dedicated workers to finish
the standalone eSocial product.

## Preflight

Run:

```bash
pwd
git status --short --branch
git rev-parse HEAD
npm test
npm run lint
npm run build
npm run test:db
```

Read:

- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/consumers.md`
- `docs/events.md`
- `docs/templates/README.md`

Current note: the repo has been renamed internally toward plain `esocial`.
Schema names should remain `esocial`; avoid reintroducing `stynx_esocial`.

## Session Goal

Move from skeleton/lifted code to production-grade standalone eSocial service:

- Contract-complete producer and status APIs.
- Real queue/service wiring.
- Durable database migrations with tenant RLS tests.
- XML build, XSD validation, signing, SOAP, return parsing, retry, and DLQ.
- Consumer documentation and SGP integration evidence.
- Deployment and operations evidence.

## Worker Plan

Spawn workers only when they can own disjoint files.

| Worker | Scope | Primary Files | Gate |
| --- | --- | --- | --- |
| Contracts | Versioned envelopes and consumer semantics | `packages/contracts/`, `docs/consumers.md`, `tests/contract/` | `npm test` |
| Database | Schema, RLS, migration execution, seed fixtures | `infra/migrations/`, DB test scripts | `npm run test:db` plus real PostgreSQL test when added |
| Submission | Submit request handling, idempotency, status updates | `services/submission/`, `packages/domain/src/submission/` | Contract tests plus focused submission tests |
| Event Builders | Lifted event builders and golden parity | `packages/domain/src/sgp-lifted/esocial-worker/builders/`, `docs/events.md`, `docs/templates/` | Golden XML tests |
| Returns | Protocol, processing, and totalizer parsing | `packages/domain/src/sgp-lifted/esocial-worker/parsers/`, `services/retorno/` | Return parser tests |
| PKI/SOAP | Certificate custody, signing, SOAP transport sandbox | `packages/pki-pades/`, submission SOAP services | Deterministic signing/SOAP fixtures |
| Infra/Ops | Deployment templates, queues, IAM, runbooks, observability | `infra/cdk/`, `docs/operations.md` | `npm run templates:check` |
| Consumer Docs | SGP integration and operator docs | `docs/`, `README.md` | `npm run lint` |

## Suggested Order

1. Lock contracts and event/status taxonomy.
2. Make migrations executable against local PostgreSQL and prove RLS.
3. Wire submission service from request envelope to domain processor.
4. Promote lifted XML builders into active golden tests by event family.
5. Add XSD validation and signing fixtures.
6. Add SOAP sandbox adapter and deterministic response fixtures.
7. Implement return/totalizer ingestion and status publication.
8. Add retry, DLQ, replay, and observability.
9. Add deployment, runbooks, and SGP integration evidence.

## Stop Conditions

Stop and ask before:

- Using real certificates, credentials, production endpoints, or production data.
- Weakening tenant isolation, RLS, idempotency, or audit behavior.
- Reintroducing direct SGP database access.
- Deleting copied golden/reference material without replacing it with better
  authoritative evidence.
- Publishing contracts that SGP must consume without updating `docs/consumers.md`.

## Closure Artifacts

Each worker should leave:

- Files changed.
- Tests run.
- Remaining gaps.
- Consumer impact.
- Any migration or deployment notes.

Round-level closure should update `README.md`, `docs/architecture.md`,
`docs/consumers.md`, and a new `docs/operations.md` once operational behavior is
implemented.
