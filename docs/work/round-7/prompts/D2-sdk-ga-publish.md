# D2 — `@esocial/sdk@1.0.0` GA Publish

> **Wave D.** Release. Parallel with D1 (but bumps `@esocial/contracts`
> dependency to D1's published version).

## Authorization required

- ☐ Release-engineering owner sign-off.
- ☐ `@esocial/sdk` npm registry access verified.
- ☐ All 35 non-return families have at least one example under
  `packages/sdk/examples/` (currently 1; D2 ships the missing 34
  before publish).
- ☐ jscodeshift codemod (`tools/codemods/sgp-1.0-to-1.x/`) tested
  against a synthetic SGP fixture.
- ☐ D1 published `@esocial/contracts@1.1.0` first.

Record in `docs/release/1.3.0/authorizations/D2.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 7.
- `packages/sdk/package.json` — currently `1.0.0-rc.0`.
- Round-3 prompt `D1-sgp-sdk.md` — SDK design (typed client, examples,
  codemod).

## Tasks

1. **Per-family examples** under `packages/sdk/examples/`:
   - `s1000.ts`, `s1005.ts`, …, `s3000.ts` (35 non-return).
   - `s5001.ts`, …, `s5013.ts` (5 returns; consumer side).
   - Each example: minimum DTO + idiomatic SDK call.
   - All compile (`tsc --noEmit` for examples) — CI gate.
2. **jscodeshift codemod** at
   `tools/codemods/sgp-1.0-to-1.x/`:
   - Finds historical SGP eSocial calls, rewrites to SDK shape.
   - Documented in `docs/sgp-migration.md`.
   - Tested against `tests/fixtures/sgp-legacy/`.
3. **Pre-publish checks**:
   - `npm publish --dry-run --workspace @esocial/sdk` succeeds.
   - SBOM + provenance attestation.
   - Type tests (`tsd`) prove branded enforcement.
4. **Bump version** `1.0.0-rc.0 → 1.0.0`. Bump
   `dependencies."@esocial/contracts"` to `^1.1.0` (D1's published
   version).
5. **CHANGELOG entry** in `packages/sdk/CHANGELOG.md`.
6. **Tag** `sdk-v1.0.0`.
7. **`release.yml`** publishes `@esocial/sdk` on the tag.
8. **Post-publish trace** at `docs/release/1.3.0/sdk/`.
9. **`docs/release/1.0.0/blocked-artifacts.json`** — flip the
   "SDK publish" entry from blocked to resolved.

## Primary write scope

- `packages/sdk/package.json`
- `packages/sdk/CHANGELOG.md`
- `packages/sdk/examples/` (34 new examples)
- `tools/codemods/sgp-1.0-to-1.x/`
- `docs/sgp-migration.md` — codemod usage
- `docs/release/1.3.0/sdk/`
- `docs/release/1.0.0/blocked-artifacts.json`

## Do not touch

- Contracts (D1 owns).
- SDK source code semantics (no behavior changes in the publish PR
  beyond examples + codemod).

## Exit criteria

- `@esocial/sdk@1.0.0` published.
- Tag `sdk-v1.0.0` exists.
- 35+5 examples committed and compiling.
- Codemod tested.
- `blocked-artifacts.json` SDK entry resolved.

## Verification

```text
npm view @esocial/sdk@1.0.0
ls packages/sdk/examples/ | wc -l
# expect: ≥ 40
npx jscodeshift -t tools/codemods/sgp-1.0-to-1.x tests/fixtures/sgp-legacy/
gh release view sdk-v1.0.0
```

Report: published version, examples count, codemod transformations,
SGP integrator adoption plan.
