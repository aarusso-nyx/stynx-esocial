# D1 — `@esocial/contracts@1.1.0` GA Publish

> **Wave D.** Release. Parallel with D2. Depends on R5 closure + A1
> stable + C1 critical/high findings closed.

## Authorization required

- ☐ Release-engineering owner sign-off.
- ☐ `@esocial/contracts` npm registry access verified.
- ☐ R5 D1 reference site updated with v1.1 release notes.
- ☐ R6 C1 pen-test critical/high findings closed.

Record in `docs/release/1.3.0/authorizations/D1.md`.

## Read first

- [`../plan.md`](../plan.md) — closure item 6.
- `packages/contracts/package.json` — currently `1.1.0-rc.0`.
- `packages/contracts/CHANGELOG.md`.
- `.github/workflows/release.yml` — already wired.

## Tasks

1. **Pre-publish checks**:
   - `npm publish --dry-run --workspace @esocial/contracts` succeeds.
   - SBOM (CycloneDX + SPDX) regenerated and attached.
   - SLSA provenance attestation produced (R4 D2 wires the workflow).
   - Spec drift gate (R3 D5) green.
2. **Bump version** `1.1.0-rc.0 → 1.1.0` in
   `packages/contracts/package.json`.
3. **CHANGELOG entry**:
   - DTOs for all 35 non-return classes.
   - Idempotency-key invocation requirement (R1 Batch 0).
   - Envelope `version: 'v1'` enforcement (R1 Batch 0).
   - Branded types (R3 A2).
   - OpenAPI / AsyncAPI specs (R3 D5).
   - Any pen-test-driven changes (R6 C1).
4. **Tag** `contracts-v1.1.0` and push.
5. **`release.yml`** runs:
   - Unit + integration jobs.
   - `npm publish --workspace @esocial/contracts` with
     `NODE_AUTH_TOKEN`.
   - Creates GitHub Release with CHANGELOG diff + SBOM + provenance.
6. **Post-publish verification**:
   - `npm view @esocial/contracts@1.1.0` shows the published version.
   - `docs/release/1.3.0/contracts/release-trace.md` records the
     pipeline URL.
7. **Update consumers**:
   - SGP integration owners notified (one round overlap with `1.0.x`
     per R1 versioning policy).
   - `@esocial/sdk` (D2) bumps `dependencies."@esocial/contracts"` to
     `^1.1.0`.

## Primary write scope

- `packages/contracts/package.json`
- `packages/contracts/CHANGELOG.md`
- `.github/workflows/release.yml` (only if a regression slips in)
- `docs/release/1.3.0/contracts/`
- `docs/release/1.0.0/blocked-artifacts.json` — flip "SDK publish"
  area's prereq from blocked to unblocked

## Do not touch

- Source TypeScript in `packages/contracts/src/` (no behavior changes
  in the publish PR).
- SDK package (D2 owns).

## Exit criteria

- `@esocial/contracts@1.1.0` is **published** to npm.
- Tag `contracts-v1.1.0` exists.
- GitHub Release created with SBOM + provenance.
- Post-publish trace committed.

## Verification

```text
npm view @esocial/contracts@1.1.0
gh release view contracts-v1.1.0
```

Report: published version, registry response, SGP-side adoption ETA.
