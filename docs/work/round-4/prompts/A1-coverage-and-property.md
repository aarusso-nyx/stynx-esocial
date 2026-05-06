# A1 — Coverage 70 → 95 % + Property-Based Tests

> **Wave A.** Quality engineer. Parallel with A2, A3, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure items 1, 2.
- `scripts/coverage-check.mjs` — current 70 % gate.
- Round-3 prompt `A1-coverage-95.md` (the design lives there).

## Tasks

1. **Lift the threshold** from 70 % → 95 % statements / 95 % lines / 95 %
   functions / 90 % branches in `scripts/coverage-check.mjs`. Expose
   `ESOCIAL_COVERAGE_THRESHOLD` overrides for emergency rollback only.
2. **Cover gaps**. Run coverage; for each uncovered branch:
   - If reachable, add a real test that exercises it.
   - If unreachable / dead code, delete the code with a one-line PR note.
   No artificial coverage hacks.
3. **Property-based tests** under `tests/property/` using `fast-check`:
   - Idempotency-key determinism (random tenant/env/eventClass/source-id).
   - Builder DTO invariants per family (well-formed → valid XML; invalid → typed error).
   - Return-parser status mapping (every `response_classification` row round-trips).
   - Retry classifier stability (identical errors → identical classification).
   - Redaction (random CPF/CNPJ-shaped strings never appear verbatim).
4. **Pin seeds**; on failure, log seed for reproduction.
5. **Evidence**: HTML + JSON summary written to
   `docs/release/1.1.0/coverage/`.

## Primary write scope

- `scripts/coverage-check.mjs`
- New tests under each package's `__tests__/`
- `tests/property/**` (new)
- `package.json` (no script changes, just dep `fast-check`)
- `docs/release/1.1.0/coverage/`

## Do not touch

- Production code semantics — only delete dead code or add
  test-only refactors with reviewer flag.
- Other waves' work.

## Exit criteria

- Coverage gate at 95 / 95 / 95 / 90.
- `fast-check` properties run in CI; failures pin seed.
- Dead-code deletions or test additions documented in PR.
- Evidence artifact present.

## Verification

```text
npm run coverage
jq '.total.statements.pct' coverage/coverage-summary.json   # ≥ 95
ls tests/property/
```

Report: per-package numbers before/after, dead code deleted, property
suites added.
