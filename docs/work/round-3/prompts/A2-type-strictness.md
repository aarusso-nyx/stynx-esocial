# A2 — Type Strictness (zero `any`, branded types, exhaustive)

> **Wave A.** TypeScript / static-analysis worker. Parallel with A1, A3–A5.

## Read first

- [`../plan.md`](../plan.md) — closure item 3.
- [`../assessment.md`](../assessment.md) — type strictness section.
- `tsconfig.base.json`, `eslint.config.js`.

## Tasks

1. **Eliminate `any` / `as any` / `as unknown`** in active code:
   - Grep, fix, repeat. For genuinely-untyped third-party libs, write a
     typed wrapper module under `packages/domain/src/internal/typed-deps/`
     and document it in an ADR (E1).
   - Test fixtures may use `as const`; never bare `any`.
2. **Branded types** in `packages/contracts/src/branded.ts`:
   ```ts
   export type Brand<K, T extends string> = K & { __brand: T };
   export type TenantId = Brand<string, 'TenantId'>;
   export type EventClass = Brand<string, 'EventClass'>;
   export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
   export type CorrelationId = Brand<string, 'CorrelationId'>;
   export type ProtocolNumber = Brand<string, 'ProtocolNumber'>;
   export type Receipt = Brand<string, 'Receipt'>;
   export type Cnpj = Brand<string, 'Cnpj'>;
   export type Cpf = Brand<string, 'Cpf'>;
   ```
   Plus constructor functions that validate format
   (`makeCnpj`, `makeCpf`, etc.) and a typed parse for envelopes.
3. **Adoption.** Migrate every signature that takes a raw `string`
   tenant/event/etc. to take the branded form. Compiler enforces the
   distinction.
4. **Exhaustive switches.** Add `assertNever` to
   `packages/domain/src/internal/exhaustive.ts` and use it in every
   switch over `EsocialRelayEventClass`, `EsocialStatus`,
   `EsocialErrorCategory`, and per-family discriminator unions. CI fails
   if a new union member is added without a dispatcher branch (the
   `noFallthroughCasesInSwitch` + `assertNever` combination produces a
   compile error).
5. **ESLint config**:
   - `@typescript-eslint/no-explicit-any: error`
   - `@typescript-eslint/no-unsafe-*: error`
   - `@typescript-eslint/strict-boolean-expressions: error`
   - `@typescript-eslint/switch-exhaustiveness-check: error`
   - `eslint-plugin-functional/no-let` (warn level OK)
6. **Tsconfig**:
   - Already strict from round 0. Verify and document:
     `noImplicitOverride`, `noUncheckedIndexedAccess`,
     `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
     `noPropertyAccessFromIndexSignature`.
7. **Tests**: branded-type compile-time tests via
   `expect-type` or `tsd`. Verify `TenantId` cannot be passed where
   `EventClass` is expected.

## Primary write scope

- `packages/contracts/src/branded.ts` (new)
- `packages/contracts/src/index.ts` (exports)
- `packages/domain/src/internal/exhaustive.ts` (new)
- `packages/domain/src/internal/typed-deps/` (new wrappers as needed)
- ESLint config
- All active TS files (signature changes + `any` removals)
- Compile-time type tests under `tests/types/`

## Do not touch

- DTO semantics (only signature tightening).
- Migrations / SQL.
- Builder logic (only signature changes).
- Non-active sgp-lifted (excluded from build).

## Exit criteria

- `grep -RE "(: any|as any|as unknown)" packages services --include='*.ts' | grep -v sgp-lifted | grep -v __tests__`
  returns no hits.
- ESLint passes with the new strict rules.
- Compile-time type tests prove the brand distinction.
- Adding a new `EsocialStatus` member without dispatcher coverage
  produces a compile error (demonstrated by deliberately introducing
  one in a feature branch and observing the error, then reverting).

## Verification

```text
npm run lint
npm run build
grep -RE "(: any|as any|as unknown)" packages services --include='*.ts' | grep -v sgp-lifted | grep -v __tests__
# expect: empty
```

Report: `any` count before / after, branded types adopted, switch
sites converted, and any third-party wrappers added (with rationale).
