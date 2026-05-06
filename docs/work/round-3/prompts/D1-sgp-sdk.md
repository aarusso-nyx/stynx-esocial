# D1 — `@esocial/sdk` for SGP

> **Wave D.** SDK / DX worker. Parallel with D2–D5.

## Read first

- [`../plan.md`](../plan.md) — closure item 12.
- `@esocial/contracts@1.x` (round 1).
- A2 branded types — the SDK uses them.

## Tasks

1. **New package** `packages/sdk` published as `@esocial/sdk`:
   - Typed client class `EsocialClient`:
     - `submit<T extends EventClass>(dto: DtoFor<T>, opts) → Promise<...>`
     - `consultStatus(idempotencyKey)`
     - `replayDlq(itemId, opts)` — for ops users
   - Builds and signs idempotency keys server-side; SGP supplies
     only opaque source ids.
   - Configures via `loadConfig()` pattern (A3 mirror).
   - Pluggable transport: SQS direct (for in-AWS callers) or HTTP
     gateway proxy (for out-of-AWS callers).
2. **Examples** under `packages/sdk/examples/`: one per event class,
   showing minimum DTO + idiomatic call.
3. **Migration codemod** for SGP integrators upgrading 1.0 → 1.x:
   - `jscodeshift` transform that finds historical SGP eSocial calls
     and rewrites them to the SDK shape.
   - Documented in `docs/sgp-migration.md`.
4. **TypeScript-only first**, with optional Node.js CJS bundle for
   legacy SGP runtimes.
5. **CI gate**: `examples/<family>.ts` compile-checked; type-tests
   (`tsd`) verify branded types are required.
6. **Release**: `@esocial/sdk@1.0.0` from CI on `main` merge or tag.

## Primary write scope

- `packages/sdk/**` (new package)
- `packages/sdk/examples/**`
- `tools/codemods/sgp-1.0-to-1.x/**`
- `docs/sgp-migration.md` — codemod usage
- `docs/release/1.0.0/sdk/`
- `.github/workflows/release.yml` — add SDK publish step

## Do not touch

- `packages/contracts` (consumer, not modifier).
- Builders / signing — SDK calls them via the bus, not directly.

## Exit criteria

- SDK published at 1.0.0.
- Examples per event class compile.
- Codemod tested on a synthetic SGP fixture.
- Type tests prove branded enforcement.

## Verification

```text
npm run build --workspace @esocial/sdk
npm publish --workspace @esocial/sdk --dry-run
npx jscodeshift -t tools/codemods/sgp-1.0-to-1.x tests/fixtures/sgp-legacy/
```

Report: SDK version, example count, codemod transformations, type-test
coverage.
