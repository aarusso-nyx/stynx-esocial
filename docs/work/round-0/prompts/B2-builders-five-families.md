# B2 — Promote Builders for Five Round-0 Families

> **Wave B, step 2.** XML/event worker. Blocked by A2 + A3. Parallel with B1.

## Read first

- [`../plan.md`](../plan.md) — round-0 representative families.
- A3 DTOs in `packages/contracts/src/dtos/`.
- `packages/domain/src/sgp-lifted/esocial-worker/builders/` — evidence
  source. Read; do not depend on at runtime.
- `docs/templates/golden/` — byte-sensitive XML fixtures.
- `docs/events.md` — leiaute version per family.

## Why this exists

44 golden XMLs and 35+ lifted builders exist; none is wired to active code.
Round 0 promotes **five representative families** along the full pipeline
to prove the promotion mechanic; round 1 (D1) then promotes the rest.

## Round-0 families (in order)

1. **S-1000** — employer registration (table; simplest).
2. **S-1010** — rubric table (table; version-dependent dependency for
   S-1200).
3. **S-1200** — periodic payroll (depends on S-1010 versions).
4. **S-1299** — close-the-month (most-touched periodic).
5. **S-2200** — worker admission (most-touched non-periodic).

These five exercise: simple table, version-dependent table, periodic with
table dependency, end-of-period closer, non-periodic worker event. No
benefit/process families — they are round 1.

## Tasks (per family, in order)

For each family above:

1. **Confirm DTO shape** in `packages/contracts/src/dtos/<family>.ts`
   matches what the family actually needs. If a field is missing, raise
   to A3 owner; do not patch contracts here.
2. **Create the active builder** at
   `packages/domain/src/builders/<family>/builder.ts`:
   - Signature: `build(dto, ctx) -> { xml: string, metadata: BuilderMetadata }`.
   - Pure function. No DB access. No filesystem reads beyond bundled XSDs
     (B3 owns XSDs; here you only declare the binding).
   - `BuilderMetadata`: `eventCode`, `leiauteVersion`, `xmlRoot`,
     `xsdBinding`, `tableVersionDependencies`.
3. **Golden test** at `tests/golden/<family>.test.ts`:
   - Load DTO fixture from `tests/golden/fixtures/<family>.dto.json`.
   - Call builder.
   - Compare against `docs/templates/golden/<family>.xml` byte-for-byte.
4. **Metadata test**: assert `eventCode`, `leiauteVersion`, `xmlRoot`,
   `xsdBinding`, dependencies match the family's reference in
   `docs/events.md`.
5. **Invalid-DTO test**: pass a DTO missing required fields; assert the
   builder throws a typed `DtoValidationError` with field paths.
6. **Wire B1 dispatch.** Add the family to B1's dispatcher table. The
   dispatch entry: build → return signed-pending state to B3's signer
   placeholder (B3 wires the actual call). Until B3/B4 land, the test is
   "build succeeds, status persists as `building` not `signed`".
7. **Delete the lifted source.** Once a family's builder + tests are
   green, delete the corresponding files under
   `packages/domain/src/sgp-lifted/esocial-worker/builders/<family>/`
   and the matching tests under `tests/sgp-lifted/`. The lifted tree
   shrinks family-by-family.

## DTO conventions (set during S-1000, applied to the rest)

- All ids are opaque strings.
- All dates are ISO-8601 strings (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ssZ`).
- All money values are integer cents (no float).
- All CPFs / CNPJs are normalized strings (digits only, no formatting).
- DTO field names are `camelCase`; XML output preserves the leiaute's
  Brazilian Portuguese tag names.
- A separate `mapDtoToXmlNodes(dto)` step exists per family to keep field
  mapping testable in isolation.

## Primary write scope

- `packages/domain/src/builders/**` (new active location)
- `packages/domain/src/sgp-lifted/esocial-worker/builders/<promoted families>/`
  (delete-after-promotion only)
- `tests/golden/**`
- `tests/golden/fixtures/**`
- `docs/events.md` (per-family DTO + metadata reference)

## Do not touch

- `packages/contracts/**` — A3 owns DTOs; raise gaps as follow-ups.
- `services/**` — except B1's dispatcher table. Coordinate edits on
  `dispatchByEventClass` so B1 and B2 do not fight on the same file.
- Signing / XSD / SOAP — B3/B4 own those. The builder declares the
  binding; it does not perform validation.
- Lifted families **not** in round 0 — leave them under `sgp-lifted/`.

## Exit criteria

- Five families have active builders, golden tests (byte-equal), metadata
  tests, and invalid-DTO tests.
- The corresponding lifted files are deleted (round 0's first dent in
  the lifted tree).
- B1's dispatcher routes the five families through the active builders.
- `grep -R -E "from ['\"].*\\.\\./hr/|from ['\"].*\\.\\./payroll/|from ['\"].*\\.\\./saude/" packages/domain/src --include="*.ts" | grep -v sgp-lifted`
  returns no hits.
- `npm test` runs all five golden tests; all pass byte-for-byte.

## Verification

```text
npm run build
npm run lint
npm test
ls packages/domain/src/sgp-lifted/esocial-worker/builders/ | grep -E "S-1000|S-1010|S-1200|S-1299|S-2200"
# Expected: empty
```

Report: net file count moved out of `sgp-lifted/`, golden bytes per
family, any leiaute-version mismatch found vs. `docs/references/`.
