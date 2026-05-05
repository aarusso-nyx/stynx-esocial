# 02 — Remaining Periodic Events (Batch 2)

> **Wave B (promotion).** Blocked by Batch 0 + Batch 1.
> Worker scope: XML/event (periodic sub-domain).

## Read first

- [`../plan.md`](../plan.md), [`../assessment.md`](../assessment.md)
- `packages/domain/src/builders/s1200/`, `s1299/` — periodic builder
  conventions from round 0.
- `docs/templates/golden/builders/s120{0,2,7}*.golden.xml`,
  `s1210-*.golden.xml`, `s1298.golden.xml`.

## Scope

Promote the four remaining periodic families:

| Event | XSD | Notes |
| --- | --- | --- |
| S-1202 | `evtRmnRPPS.xsd` | RPPS remuneration |
| S-1207 | `evtBenPrRP.xsd` | RPPS benefit; **DTO depends on S-2410 from Batch 4** — see below |
| S-1210 | `evtPgtos.xsd` | Payments; references S-1200/1202/1207 receipts |
| S-1298 | `evtReabreEvPer.xsd` | Reopen competence; depends on accepted S-1299 receipt |

## Cross-batch dependency: S-1207 ↔ S-2410

S-1207 carries benefit identifiers that originate in S-2410 (benefit
registration). The DTO must expose those identifiers as **opaque
strings**, not require S-2410 to have been processed by eSocial first.
Coordinate with Batch 4 to keep the S-2410 DTO surface stable; if a
field renames, both batches must agree before either lands.

## Operating principles

Same as [Batch 1](01-remaining-tables.md#operating-principles). Plus:

- DTOs encode **receipt dependencies as fields**, not as runtime DB
  lookups. S-1207 takes the benefit identifier; S-1210 takes the
  payment-batch + remuneration-receipt pair; S-1298 takes the accepted
  S-1299 receipt and accepted-at timestamp.
- Periodic builders may emit XML with multiple worker/employee blocks
  per call; goldens cover at least one multi-block case (e.g.,
  `s1202-rpps-workers.golden.xml`).

## Tasks per family

The 12-step task list from Batch 1 applies verbatim. Differences:

- **S-1207**: invalid-DTO test must include "missing benefit identifier"
  case.
- **S-1210**: invalid-DTO test must include "payment without receipt
  reference" case; the test asserts a typed `MissingReceiptReference`
  error.
- **S-1298**: invalid-DTO test must include "reopen without prior
  accepted S-1299" case.
- **S-1202**: golden test covers single + multi-worker variants.

## Forward migration (if needed)

If any periodic family needs additional reconciliation columns
(e.g., S-1210 wants `payment_batch_id`, S-1298 wants
`reopened_competence`), raise as a follow-up to Batch 0 owner — **do
not** edit migrations from this batch. Batch 0 lands the schema; this
batch lands the callers.

## Primary write scope

- `packages/contracts/src/dtos/{s1202,s1207,s1210,s1298}.ts`
- `packages/contracts/src/dtos/round1-pending.ts` (remove four)
- `packages/contracts/schemas/v1/{s1202,s1207,s1210,s1298}.json`
- `packages/contracts/examples/v1/requests/{s1202,s1207,s1210,s1298}.json`
- `packages/domain/src/builders/{s1202,s1207,s1210,s1298}/`
- `packages/domain/src/builders/index.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `tests/golden/{s1202,s1207,s1210,s1298}.test.ts`
- `tests/integration/soap-submission-pipeline.test.ts` (add cases)
- Lifted-source deletions for the four promoted families
- `docs/events.md`, `docs/consumers.md`, `docs/sgp-migration.md`

## Do not touch

- Round-0 builders or evidence.
- Other batches' families.
- Migrations themselves.
- Benefit-lifecycle builders (Batch 4 owns them); only reference their
  DTO output contracts.

## Exit criteria

- All four families ACTIVE_FULL.
- `EsocialRound1PendingDto` no longer covers S-1202, S-1207, S-1210,
  S-1298.
- S-1210 and S-1298 invalid-DTO tests cover the missing-receipt cases.
- S-1207 DTO references the S-2410 identifier via opaque string only.
- Lifted source for the four promoted families is gone.
- All gates green:
  ```text
  npm run build
  npm run lint
  npm run coverage
  npm run test:db
  npm run test:integration
  npm run integration:localstack
  ```

## Verification

```text
ls packages/domain/src/builders | grep -E "^s12(02|07|10|98)"
# expect: s1202 s1207 s1210 s1298
ls packages/domain/src/sgp-lifted/esocial-worker/builders | grep -E "s12(02|07|10|98)"
# expect: empty
```

Report: families promoted, integration cases added, invalid-DTO
coverage, and any contract-shape changes coordinated with Batch 4 for
S-1207.
