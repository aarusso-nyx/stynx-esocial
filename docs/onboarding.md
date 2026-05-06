# Onboarding

## Cheat Sheet

| Command | Use |
| --- | --- |
| `npm test` | Build, type tests, Vitest, and active Node test suite. |
| `npm run lint` | ESLint, boundary canaries, migration canaries, blocked-artifact lifecycle. |
| `npm run coverage` | Active runtime coverage plus Round 4 coverage evidence. |
| `npm run test:property` | Fast-check property suites for deterministic invariants. |
| `npm run test:e2e` | Local deterministic DTO to SOAP-stub pipeline. |
| `npm run bench:smoke` | Small perf budget canary. |
| `npm run dev:up` / `dev:down` / `dev:reset` | Local Postgres, LocalStack, and SOAP fixture stack. |
| `npm run dev:family -- S-1099` | Scaffold a new event-family promotion target. |

Key directories: `packages/contracts`, `packages/domain`, `packages/pki-pades`,
`services`, `infra/migrations`, `infra/cdk`, `tests`, `docs/release`, and
`docs/adrs`.

## Day 1 Morning

Clone, install, and prove the baseline:

```bash
npm ci
npm test
npm run dev:up
npm run test:e2e
```

Trace one S-1299 envelope through the local pipeline: DTO validation,
idempotency-key verification, XML build, signing, deterministic SOAP response,
return parsing, and status evidence. Read `AGENTS.md`, `docs/architecture.md`,
ADR 0001, ADR 0003, and ADR 0006.

## Day 1 Afternoon

Read three contract files:

- `packages/contracts/src/kinds.ts`
- `packages/contracts/src/idempotency.ts`
- `packages/contracts/src/dtos/validators.ts`

Read three migrations from `infra/migrations/`, then inspect the active builders
for S-1000, S-1299, and S-2200. Run `npm run coverage` and compare
`docs/release/1.1.0/coverage/summary.json` with the Round 4 95 percent target.

## Day 2 Morning

Scaffold and remove a fake family:

```bash
npm run dev:family -- S-1099
```

Read the generated DTO, builder, golden test, and fixture. Promote it locally
only if you have a real leiaute mapping and XSD. Remove the scaffold before
finishing the exercise.

## Day 2 Afternoon

Shadow an operator action through the local replay/DLQ surface. Read the retry
and replay section in `docs/operations.md`, inspect
`tests/operations/retry-replay-circuit.test.mjs`, and run:

```bash
npm run test:chaos
npm run drift:audit
```

## FAQ

**How do I add a new event family?** Use `npm run dev:family -- S-XXXX`, then
add DTO exports, dispatcher routing, builder mapping, golden XML, schema
evidence, and SGP migration notes.

**Why both `node --test` and Vitest?** Vitest owns workspace contract/type
canaries already written in that style. `node --test` is the active runtime
coverage authority for services and domain behavior.

**How do I run perf tests locally?** Use `npm run bench:smoke` first, then
`npm run bench` for the full local budget suite.

**How do I propose an architectural change?** Add an ADR using
`docs/adrs/0000-template.md` and link it from `docs/adrs/README.md`.

**What is `sgp-lifted/`?** It was migration evidence. Active code must not
import it. See ADR 0012.

## External Reviewer Dry Run

Round 4 local-safe execution captured the dry-run plan but did not involve an
external engineer in this workspace. The evidence gap is tracked in
`docs/release/1.2.0/onboarding/dry-run.md`; a reviewer outside the project
should complete Day 1 in under 4 hours before this item is marked fully closed.
