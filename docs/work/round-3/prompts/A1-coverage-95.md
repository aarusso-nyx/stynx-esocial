# A1 — Coverage ≥95 % + Property-Based Tests

> **Wave A.** Quality engineer scope. Parallel with A2–A5.

## Read first

- [`../plan.md`](../plan.md) — closure item 1.
- [`../assessment.md`](../assessment.md) — coverage section.
- [`../../round-1/prompts/00-round-0-fixups.md`](../../round-1/prompts/00-round-0-fixups.md)
  task 2 — current coverage authority decision.

## Tasks

1. **Lift the threshold.** Update the chosen coverage authority's config
   (vitest absorbed everything in round 1, or the `node --test` summary
   parser) to enforce: lines ≥95 %, statements ≥95 %, functions ≥95 %,
   branches ≥90 %. Apply per-package thresholds matching the round-3
   target: `packages/contracts`, `packages/domain` (excluding any
   surviving `sgp-lifted/` retention), `packages/pki-pades`, all
   `services/*/src`.
2. **Cover gaps**. Identify uncovered branches with `coverage/lcov-report`.
   For each gap, **add a real test** that exercises the path; if the path
   is unreachable / dead code, **delete the code** with a one-line PR
   note. Do not artificially exercise dead code to inflate coverage.
3. **Property-based tests** with `fast-check`:
   - Idempotency-key determinism: random tenant/env/eventClass/source-id
     tuples produce the same key.
   - Builder DTO invariants per family: well-formed DTO → well-formed
     XML; invalid DTO → typed error.
   - Return-parser status mapping: every regulatory code in
     `response_classification` round-trips through the parser.
   - Retry classifier stability: identical errors → identical
     classification (transport/regulatory/etc.).
   - Redaction: random strings containing CPF/CNPJ shapes → never appear
     verbatim in output; non-PII strings always pass through.
   Pin seeds; `fast-check` reports the seed on failure for reproduction.
4. **Coverage of the dispatcher** must be 100 %. The completeness gate
   from round-1 Batch 5 (`tests/round1-completeness.test.ts`) becomes a
   **coverage assertion** here too: every `EsocialRelayEventClass` has at
   least one test exercising the dispatcher branch.
5. **Evidence**: write the coverage report (HTML + JSON summary) to
   `docs/release/1.0.0/coverage/`. CI uploads as artifact.

## Primary write scope

- `vitest.config.ts` (or `scripts/parse-node-test-coverage.mjs`)
- New tests under each package's `__tests__/` directories
- Property-based tests under `tests/property/`
- `docs/release/1.0.0/coverage/` (artifact target; F2 wires manifest)

## Do not touch

- Production code semantics — only delete dead code or add cohesive
  refactors that improve testability with explicit reviewer flag.
- Migrations.
- Other waves' work.

## Exit criteria

- All threshold gates pass.
- `fast-check` properties run in CI; failures pin seed in output.
- Dispatcher coverage 100 %.
- No artificial coverage hacks (commented-out asserts, `it.skip`, etc.).
- Coverage artifact in `docs/release/1.0.0/coverage/`.

## Verification

```text
npm run coverage
test -f docs/release/1.0.0/coverage/coverage-summary.json
jq '.total.statements.pct' docs/release/1.0.0/coverage/coverage-summary.json
# expect: >= 95
```

Report: per-package numbers (before → after), dead code deleted, and
`fast-check` seed inventory for the property suites.
