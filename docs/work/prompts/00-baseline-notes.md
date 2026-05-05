# Phase 0 Baseline Notes

## Assessment Pointer

- Inventory: [`../inv.md`](../inv.md)
- Diagnostics: [`../diag.md`](../diag.md)
- Gap-closure plan: [`../plan.md`](../plan.md)

## Baseline Run

Repository root:

```text
/Users/aarusso/Development/stech/stynx-esocial
```

Git status remained a broad pre-existing dirty tree on
`main...origin/main`. The dirty files are treated as input evidence and were not
reverted.

Recent commits:

```text
f68758e Add eSocial lift-out docs and examples
15384a4 first commit
```

Command status:

| Command | Result | Notes |
| --- | --- | --- |
| `npm test` | Passed | Four `node:test` contract checks. |
| `npm run lint` | Passed | Structural workspace checker. |
| `npm run build` | Passed | Structural workspace checker, not TypeScript compilation yet. |
| `npm run coverage` | Passed | Structural workspace checker, not coverage yet. |
| `npm run test:db` | Passed | Migration regex/checker only. |
| `npm run migrate:dev` | Passed | Migration regex/checker only. |
| `npm run integration:localstack` | Passed | Migration regex/checker only. |
| `npm run test:integration` | Passed | Migration regex/checker only. |
| `npm run cdk:synth` | Passed | Static writer regenerated `infra/cdk/cdk.out/esocial-{dev,qa}.template.json`. |

This matches the assessment in `../inv.md`: all current gates are green, and
most are still structural rather than executable evidence.

## CDK Output Decision

Keep `infra/cdk/cdk.out/*.json` as committed deterministic review artifacts
until Phase 9 replaces the static writer with real CDK synthesis or renames the
generator. Rationale:

- The repository already tracks generated templates as part of the current
  lift-out evidence.
- The current generator is deterministic and cheap to verify.
- Phase 9 explicitly owns the durable cleanup decision: either reproducible
  committed templates or ignored/generated outputs.

Phase 0 does not delete templates or change the generation policy.

## Pointer Check

No stale internal pointers were found in `../inv.md`, `../diag.md`, or
`../plan.md` that required Phase-0 correction. Existing observations about
stale paths in other docs remain diagnostic findings, not pointer fixes in the
assessment files.
