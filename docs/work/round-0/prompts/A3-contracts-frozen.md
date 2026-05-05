# A3 — Contracts Frozen at v1

> **Wave A, step 3.** Contracts worker. Blocks B1, B2, B5, C5.

## Read first

- [`../decisions.md`](../decisions.md) — A1 recorded the actual contract
  state. Treat that as the starting point, not the inventory file.
- [`../assessment.md`](../assessment.md) — Contracts section.
- [`../../plan.md`](../../plan.md) — Phase 2 task list.
- [`../../../consumers.md`](../../../consumers.md) — public consumer surface.
- [`../../../events.md`](../../../events.md) — event taxonomy reference.
- [`../../../templates/golden/`](../../../templates/golden/) — example
  payloads.

## Why this exists

The contract package is the **only** integration surface SGP will ever
touch. It must be frozen at v1 with versioning policy, JSON Schemas, and
fixture coverage before any handler/builder/return work depends on it.

If A1 reported the contract is already complete (39 event classes, 12
statuses, 11 error categories, 7 envelope families, idempotency builder),
this prompt freezes and **JSON-Schema-izes** it. If A1 reported it is
narrowed to S-1299, this prompt expands first, then freezes.

## Tasks

1. **Final shape verification.** With reference to A1's findings, ensure:
   - `EsocialRelayEventClass` has the full 39-member union: tables
     (S-1000…S-1070), periodic (S-1200, S-1202, S-1207, S-1210, S-1298,
     S-1299), worker/SST/TSV (S-2200, S-2205, S-2206, S-2210, S-2220,
     S-2230, S-2240, S-2298, S-2299, S-2300, S-2306, S-2399), benefits/
     process (S-2400, S-2405, S-2410, S-2416, S-2418, S-2420, S-2501,
     S-3000), returns (S-5001, S-5002, S-5011, S-5012, S-5013).
   - `EsocialStatus` is the 12-state union: `pending`, `building`,
     `validation_failed`, `signed`, `sent`, `accepted`, `rejected`,
     `retry`, `timeout`, `dlq`, `excluded`, `failed`. No `OK`, `RETRY`,
     `DEAD_LETTER` synonyms.
   - `EsocialEnvironment` is `qualification | restricted_production | production`.
   - `EsocialErrorCategory` is the 11-member taxonomy: `validation`,
     `schema`, `xml_build`, `signing`, `transport`, `regulatory`,
     `configuration`, `authentication`, `idempotency`, `totalizer_parse`,
     `internal`.
   - 7 envelope families exist with explicit `version: 'v1'` discriminators:
     request, response, spool, audit, retry, dlq, replay.
   - `buildEsocialIdempotencyKey(input)` is deterministic and includes:
     tenant, environment, event class, source ids, competence (where
     applicable), payload hash, rectification marker, exclusion marker.
2. **Define DTOs per event family** in `packages/contracts/src/dtos/`.
   Each DTO is the input SGP sends to eSocial for that family. DTOs
   contain **opaque source identifiers** (`sourceEventId`, `tenantId`,
   `employerCnpj`, etc.) and primitive fields. **No XML.** No imports
   from `hr.*`, `payroll.*`, `saude.*`, or any SGP-owned module.
   Round-0 must define DTOs for the five round-0 families:
   `S-1000`, `S-1010`, `S-1200`, `S-1299`, `S-2200`. Other families get
   stub DTOs marked `Round1Pending` so the type system covers them.
3. **JSON Schemas.** Generate JSON Schema for every envelope and every
   DTO using `typescript-json-schema` or `zod-to-json-schema`. Output to
   `packages/contracts/schemas/`. Add a build step that runs schema
   generation as part of `npm run build`.
4. **Contract fixture tests** under `tests/contract/`:
   - One fixture per envelope-direction-family.
   - Validate against the JSON Schema and the runtime parser.
   - Idempotency-key collision tests: same logical input → same key;
     differing inputs → different keys.
   - Status-string round-trip tests.
5. **Versioning policy** in `docs/consumers.md`:
   - How v2 is introduced (additive or via new `version: 'v2'` discriminator).
   - Deprecation cadence (one round of overlap minimum).
   - How SGP discovers schema changes (semver of `@esocial/contracts`).
   - Backwards-compatibility matrix.
6. **Publication metadata.** Update `packages/contracts/package.json`:
   - `name: "@esocial/contracts"`.
   - `version: "1.0.0"`.
   - `files`: include `dist/`, `schemas/`.
   - `main`/`types` point at `dist/`.
   - `publishConfig`: scope, registry placeholder.
   - Add `CHANGELOG.md` with the v1 entry.

## Primary write scope

- `packages/contracts/src/**`
- `packages/contracts/schemas/**`
- `packages/contracts/package.json`, `CHANGELOG.md`
- `tests/contract/**`
- `docs/consumers.md` (versioning + DTO sections)
- `docs/events.md` (only if event taxonomy was renamed)

## Do not touch

- `services/**` — B1 will re-import the new types.
- `packages/domain/**` — B2 will consume DTOs.
- `infra/migrations/**`.

## Exit criteria

- A clean clone running `npm ci && npm run build && npm test` produces:
  - `dist/` with type definitions for every envelope and DTO.
  - `schemas/` with JSON Schemas for every envelope and DTO.
  - Contract suite green for all 7 envelope-direction families.
- `docs/consumers.md` documents the v1 surface and the versioning policy.
- `grep -R "OK\\|DEAD_LETTER" packages services --include="*.ts"` returns
  no hits as status values (only allowed inside test names or comments).
- `@esocial/contracts@1.0.0` is publishable (`npm publish --dry-run`
  succeeds; do not actually publish in this prompt — that's C4).

## Verification

```text
npm run build
npm test
node -e "const c = require('./packages/contracts/dist'); console.log(c.ESOCIAL_EVENT_CLASSES.length, c.ESOCIAL_STATUSES.length, c.ESOCIAL_ERROR_CATEGORIES.length);"
# Expect: 39 12 11
ls packages/contracts/schemas/
npm publish --dry-run --workspace @esocial/contracts
```

Report DTO families landed in round 0 vs deferred to round 1, and the JSON
Schema file count.
