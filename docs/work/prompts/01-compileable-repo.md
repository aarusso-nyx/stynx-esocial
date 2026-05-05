# 01 — Make the Repository Compileable

> **Phase 1 of [`../plan.md`](../plan.md).** First work in Wave 1. Blocks all
> later phases — until TypeScript actually compiles, every phase that follows
> is theatre.

## Context

Read first:

- [`../inv.md`](../inv.md) — Toolchain row: "no root tsconfig, no lockfile,
  no installed package dependencies, no Jest/Vitest config for active TS
  specs, and no real TypeScript build target."
- [`../diag.md`](../diag.md) — "Lifted Runtime Is Not Compileable Standalone"
  and the gate diagnostics table.
- [`../plan.md`](../plan.md) — Phase 1 task list and exit criteria.

Today, `npm run build` runs a structural file-presence checker via
`scripts/check.mjs`, not `tsc`. The active runtime in `services/submission/`
and `packages/domain/src/submission/` is small, but the lifted tree under
`packages/domain/src/sgp-lifted/` imports SGP modules and external
dependencies that are not declared anywhere.

This phase's job is to make `npm run build` actually compile the **active**
TypeScript surface and fence the lifted evidence tree off the build path
without deleting it (it remains the source corpus for Phases 5–7).

## Operating principles

- Do not keep compatibility shims for wrong pre-production names. Fix the
  contract directly and update consumers in the same change.
- The lifted tree is **evidence**, not product code. Either move what's
  compile-ready out, or exclude it explicitly with a documented reason.
- No active production code may import `../../backend/src/...`,
  `@nestjs/*` (unless you intentionally adopt Nest as the runtime framework
  and add it to dependencies), or any missing local SGP module.
- Each phase upgrades at least one gate. This phase upgrades `build`, `lint`,
  and `coverage`.

## Tasks

1. **Pick the runtime stack** explicitly. The plan permits Nest *or* a
   simpler service framework. Decide and record the choice in
   `docs/architecture.md`. Justify briefly: AWS Lambda handlers + plain
   TypeScript is the lighter path; Nest is the path the lifted code already
   uses. Do not adopt both.
2. **Add a lockfile and explicit dependencies.** Populate the workspace
   `package.json` files (root, `packages/*/package.json`,
   `services/*/package.json`, `infra/cdk/package.json`) with the dependency
   set the chosen stack actually needs:
   - TypeScript, the chosen framework (or none), `pg`, XML/XSD tooling
     (`libxmljs2` or `fast-xml-parser` per existing usage), SOAP client
     (`soap` or equivalent), signing libraries (`xml-crypto`, `node-forge`),
     AWS SDK v3 modules in use, and a test runner (`vitest` or `node:test`
     with `tsx`). Match what active code actually imports — do not pull in
     dependencies the active runtime does not use.
3. **Add workspace TypeScript config.** Create a root `tsconfig.json` and
   per-package `tsconfig.json` with project references or, equivalently, a
   simple `composite: true` layout. Output to `dist/` per package. Strict
   mode on.
4. **Split active code from lifted evidence.**
   - Either move compile-ready files out of
     `packages/domain/src/sgp-lifted/` into their final location under
     `packages/domain/src/`, or
   - Add an explicit `exclude` list in the relevant `tsconfig.json` covering
     the lifted tree, with a short comment in the config pointing at this
     prompt and Phase 5 as the eventual promotion path.
5. **Replace the structural gates with real ones:**
   - `npm run build` → real `tsc -b` across the workspace.
   - `npm run lint` → ESLint (TypeScript) **plus** the existing structural
     boundary checks from `scripts/check.mjs`. Keep the boundary checks —
     they enforce the SGP-coupling forbidden-string canaries.
   - `npm run coverage` → real coverage for the active test runner. If no
     active TS tests exist yet, gate `coverage` on at least the contract
     tests in `tests/contract/`.
6. **Verify boundaries are intact.**
   - `grep -R "backend/src/" packages services` returns no hits in active
     (non-excluded) code.
   - `grep -R -E "from ['\\\"]@nestjs/" packages services` returns hits only
     if Nest was the chosen stack and is declared as a dependency.
   - The lifted tree, if excluded, is not in the `tsc -b` graph.

## Primary write scope

- `package.json` (root)
- `packages/*/package.json`
- `services/*/package.json`
- `infra/cdk/package.json`
- `package-lock.json` (new)
- Root `tsconfig.json`, per-package `tsconfig.json`
- `scripts/check.mjs` (compose new + existing checks; do not delete the
  forbidden-string checks)
- Test runner config (`vitest.config.ts` or equivalent) if a runner is added
- `docs/architecture.md` — runtime-stack decision note

## Do not touch

- `packages/contracts/src/payloads/` shape — Phase 2 owns contract evolution.
- `infra/migrations/` — Phase 3 owns the schema.
- Builders, parsers, signing logic in the lifted tree — Phases 5–7 own
  promotion.
- `infra/cdk/src/` runtime resource model — Phase 9 owns it.

## Exit criteria

- `npm run build` fails on TypeScript/module errors and passes only after
  active runtime code compiles.
- `npm run lint` runs ESLint **and** the structural boundary checks; both
  must pass.
- `npm run coverage` produces real coverage output (even if the suite is
  small) — not a structural file check.
- Lifted evidence tree is either compile-clean or intentionally excluded
  with documentation.
- No active production code imports `../../backend/src/...` or any missing
  SGP module.
- Lockfile is committed; `npm ci` succeeds in a clean clone.

## Verification commands

```text
npm ci
npm run build
npm run lint
npm test
npm run coverage
```

Report which gates moved from structural to executable, and the specific
lifted directories you excluded (with reason).
