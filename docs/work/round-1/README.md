# Round 1 — Remaining Builder Promotion

Round 1 promotes the remaining event builders along the path proven in Round 0:

```text
DTO -> active builder -> golden XML -> XSD -> sign -> SOAP stub -> return parse -> status publish
```

Round 1 does not add real eSocial connectivity, real certificates, or
restricted-production deployment. Those are Round 2 work and require explicit
owner authorization.

## Inputs

- `docs/work/round-0/plan.md`
- `docs/release/0.1.0/`
- `docs/events.md`
- `docs/consumers.md`
- `packages/contracts/src/dtos/round1-pending.ts`
- `packages/domain/src/submission/submission-dispatcher.ts`
- `packages/domain/src/sgp-lifted/esocial-worker/`

## Execution Order

1. Batch 1: remaining tables.
2. Batch 2: remaining periodic events.
3. Batch 3: worker, SST, and TS-V events.
4. Batch 4: benefits, process, and exclusion events.
5. Closure cleanup and evidence.

Within a batch, families can be split across workers when their write scopes are
disjoint. Workers are not alone in the codebase and must not overwrite another
worker's DTO, builder, fixture, or test changes.

## Exit Target

Round 1 is complete when every non-return event in
`ESOCIAL_RELAY_EVENT_CLASSES` has an active DTO, active builder, golden test,
metadata test, invalid-DTO test, and integration evidence through the same
submission dispatcher used by Round 0. `packages/domain/src/sgp-lifted/` and
`tests/sgp-lifted/` are then removed or reduced to an explicitly documented
legal/reference evidence subset.
