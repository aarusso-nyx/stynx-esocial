# R2-D - Regulatory Code Coverage

> This batch updates response classification from official qualification and
> restricted-production observations. It does not create new official
> submissions unless covered by an active R2-B or R2-C authorization window.

## Preconditions

- R2-B qualification evidence exists.
- R2-C restricted-production evidence exists if restricted-production codes are
  being classified.
- Unknown-code evidence is redacted and linked.
- Product/regulatory owner is available for classification decisions.

## Primary Write Scope

- return classification code and tests
- `services/retorno/**`
- `packages/domain/src/returns/**`
- `docs/events.md`
- `docs/consumers.md`
- `docs/release/0.3.0/regulatory-codes/**`

## Do Not Touch

- SOAP submission routing.
- Certificate custody.
- Real payload bodies or unredacted return XML.

## Tasks

1. Inventory every official response code observed in R2-B and R2-C evidence.
2. Classify each code into the canonical status/error taxonomy:
   - accepted
   - rejected
   - failed_regulatory_gap
   - failed_transport
   - failed_schema
   - timeout
   - dlq
3. Add tests for each new code and for unknown-code fail-closed behavior.
4. Update SGP-facing docs with status, retry, DLQ, replay, and operator action.
5. Open or record owner-named follow-ups for any code that cannot be classified.
6. Keep return/totalizer traceability intact without storing raw PII.

## Verification

Run:

```bash
npm test
npm run lint
npm run test:integration
npm run coverage
```

## Exit Criteria

- All observed official codes are classified or explicitly fail closed with an
  owner-named follow-up.
- SGP-facing status docs match implemented behavior.
- Tests cover official-code mappings and unknown-code handling.

## Report

Report added classifications, unknown-code follow-ups, SGP-facing contract
effects, and residual regulatory-owner decisions.
