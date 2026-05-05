# R1-05 — Cleanup And Evidence

## Scope

Close Round 1 after all family-promotion batches are green.

## Primary Write Scope

- `packages/domain/src/sgp-lifted/`
- `tests/sgp-lifted/`
- `docs/events.md`
- `docs/consumers.md`
- `docs/sgp-migration.md`
- `docs/release-checklist.md`
- `docs/release/0.2.0/`
- `README.md`

## Do Not Touch

- Real certificate material, real endpoints, production payloads, or production
  personal data.
- Round 0 evidence except to link from Round 1 docs.

## Required Work

1. Confirm every non-return event in `ESOCIAL_RELAY_EVENT_CLASSES` has active
   DTO, builder, schema, example, golden, metadata, invalid-DTO, and integration
   coverage.
2. Remove `packages/domain/src/sgp-lifted/` files that have been promoted. If
   anything remains, add a file-by-file `docs/work/round-1/lifted-retention.md`
   with owner, reason, and deletion gate.
3. Remove `tests/sgp-lifted/` after mined fixtures are represented in active
   tests. If anything remains, document the same owner/reason/deletion gate.
4. Regenerate contract schemas/examples and SBOM.
5. Create `docs/release/0.2.0/` evidence:
   - DTO fixtures for every event family.
   - Generated XML hashes.
   - SOAP-stub and status-publication samples.
   - LocalStack run output.
   - CI run URL after push.
6. Update README and release checklist to state Round 1 status and Round 2
   entry criteria.

## Verification

```bash
npm run build
npm run lint
npm test
npm run test:db
npm run test:integration
npm run integration:localstack
npm run templates:check
npm run coverage
npm run sbom -- --out docs/release/0.2.0/sbom/contracts-active-services.cdx.json
```

## Exit Criteria

- No active code path imports `packages/domain/src/sgp-lifted/`.
- `tests/sgp-lifted/` is gone or explicitly retained as non-active evidence.
- Round 2 can start from a clean, fully promoted standalone product slice.
