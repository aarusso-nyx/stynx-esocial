# A2 — Real TypeScript Build

> **Wave A, step 2.** Toolchain worker. Blocks B1, B2, B3, C2, C3.

## Read first

- [`../plan.md`](../plan.md) — round-0 closure target.
- [`../decisions.md`](../decisions.md) — produced by A1.
- [`../assessment.md`](../assessment.md) — Code-quality gaps.

## Why this exists

`npm run build` runs a regex file-presence checker, not `tsc`. The lifted
tree imports `@nestjs/*` and missing local SGP modules and would prevent any
real `tsc -b` from succeeding. Without a real build, every other prompt's
"compiles cleanly" claim is unverifiable.

## Tasks

1. **Pick the runtime stack** and record in `docs/architecture.md`:
   AWS-Lambda-handlers + plain TypeScript (no Nest in active code).
   Justification: smallest surface for the Lambda-driven design; lifted Nest
   patterns become evidence-only.
2. **Workspace TypeScript layout.**
   - Root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`,
     `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`,
     `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`.
   - Root `tsconfig.json` with `references` to every workspace.
   - Per-workspace `tsconfig.json` with `composite: true`, `outDir: dist`,
     `rootDir: src`. Include only `src/**/*`.
   - Explicit `exclude` for `packages/domain/src/sgp-lifted/**` from the
     domain workspace tsconfig. Document the exclusion at the top of the
     file with a one-line pointer to round 1.
3. **Dependency declarations.** Inspect the imports of active code and
   declare exactly what is used in each `package.json`:
   - Runtime: `@aws-sdk/client-sqs`, `@aws-sdk/client-eventbridge`,
     `@aws-sdk/client-secrets-manager`, `pg`, the chosen XML toolkit
     (pin to a current major), the chosen SOAP client (pin), `xml-crypto`
     (pin a non-vulnerable version), `node-forge` if needed, `pino`.
   - Dev: `typescript` (5.x), `vitest`, `@vitest/coverage-v8`, `eslint`,
     `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`,
     `prettier`, `tsx`.
   Run `npm install` and commit `package-lock.json`. The lockfile is required.
4. **Real `tsc -b` build.** Replace `package.json` script:
   `"build": "tsc -b"`. Remove the structural-checker invocation from
   `build`. Keep the structural checks in a separate `lint:boundaries`
   script.
5. **Real ESLint.** Add `eslint.config.js` with `@typescript-eslint`
   recommended + `eslint-plugin-import` ordering rules. `npm run lint` =
   `eslint . --max-warnings=0 && node scripts/check.mjs lint && node scripts/check-migrations.mjs lint` (the
   latter two preserve the boundary canaries).
6. **Real test runner.** Add `vitest.config.ts` with workspace projects
   per package. Replace `npm test` with `vitest run`. The two existing
   `tests/contract/*.test.mjs` files run alongside vitest specs. Coverage
   provider: `v8`. Coverage thresholds set at 80 % statement, 75 % branch
   for `packages/contracts`, `packages/domain` (excluding `sgp-lifted`),
   `packages/pki-pades`, and active services.
7. **Strip `any` from active code.** Each `any`/`unknown`-cast site in
   `packages/contracts/src`, `packages/domain/src/!(sgp-lifted)`,
   `packages/pki-pades/src`, and `services/*/src` must either get a real
   type or a documented `// eslint-disable-next-line` with a one-line
   reason. The diff should reduce `any` counts; report counts before/after.
8. **Restore the boundary canaries.** Keep `scripts/check.mjs` and
   `scripts/check-migrations.mjs` invoked under `lint`. Do not delete
   their forbidden-string checks (`hr.`, `payroll.`, `saude.`,
   `public.esocial_event`).
9. **Honest naming for false gates.** Rename the gates that don't yet
   execute their behavior — A4 owns `migrate:dev`/`test:db`, B4 owns
   `test:integration`, C3 owns `integration:localstack` and `cdk:synth`.
   This prompt only renames `build`/`lint`/`coverage`/`test` to be real.

## Primary write scope

- Root and per-workspace `tsconfig*.json`
- Root and per-workspace `package.json`
- `package-lock.json`
- `eslint.config.js`, `.eslintignore`, `.prettierrc`, `.prettierignore`
- `vitest.config.ts`
- `scripts/check.mjs` (compose, do not delete)

## Do not touch

- `packages/contracts/src/**` types/values — A3 owns contract evolution.
- `infra/migrations/**` — A4 owns it.
- `services/*/src/**` runtime semantics — wave B owns it. You may reformat
  per Prettier and add type annotations to remove `any`, but no behavioral
  changes.
- `infra/cdk/**` — C3 owns it.

## Exit criteria

- `npm ci` succeeds in a clean clone.
- `npm run build` runs `tsc -b` and exits 0.
- `npm run lint` runs ESLint **plus** boundary canaries; exits 0 with
  `--max-warnings=0`.
- `npm test` runs vitest plus the two existing contract files.
- `npm run coverage` produces real coverage output (no thresholds yet may
  fail — document the current numbers in `../evidence/A2-coverage.txt`).
- The lifted tree is excluded from `tsc -b` and ESLint by configuration,
  not by deletion.
- No active code path imports `@nestjs/*` or `../../backend/src/...`.

## Verification

```text
rm -rf node_modules **/dist
npm ci
npm run build
npm run lint
npm test
npm run coverage
grep -R "@nestjs/" packages services --include="*.ts" | grep -v sgp-lifted
grep -R "backend/src" packages services tests --include="*.ts" --include="*.mjs" | grep -v sgp-lifted
```

Report `any`-cast counts before/after, the final coverage numbers, and the
names of any scripts you renamed (none expected this prompt).
