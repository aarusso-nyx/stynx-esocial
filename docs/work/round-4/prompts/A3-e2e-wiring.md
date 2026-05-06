# A3 — `tests/e2e/` Wiring

> **Wave A.** Test infrastructure. Parallel with A1, A2, B–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 4.
- `tests/e2e/` — directory exists; not referenced by any npm script.

## Tasks

1. **Audit `tests/e2e/`** contents.
   - If the cases overlap fully with `tests/integration/`, **delete
     the directory** with a one-line PR note. Reduces alignment debt.
   - If they cover scenarios `tests/integration/` doesn't (e.g.,
     full HTTP-gateway → SQS → submission → return → spool round-trip
     across multiple Lambdas), **wire them**:
     - Add `npm run test:e2e` script.
     - Extend `.github/workflows/ci.yml` `integration` job to run
       it.
     - Document scope in `docs/operations.md` test-section.
2. **Boundary**: e2e tests use the deterministic SOAP stub; never reach
   `gov.br`. Reuse the round-1 allowlist test posture.
3. **Evidence**: e2e run output written to
   `docs/release/1.1.0/e2e/`.

## Primary write scope

- `tests/e2e/**` (audit + maybe delete or augment)
- `package.json` (script if kept)
- `.github/workflows/ci.yml` (step if kept)
- `docs/operations.md` (one section)

## Do not touch

- `tests/integration/` (don't migrate cases without a documented
  reason).
- Other waves' work.

## Exit criteria

- `tests/e2e/` either gone (with reason) or wired into CI with at
  least one PR-blocking assertion.
- Round-3 alignment punch-list item 29 closes.

## Verification

```text
npm run test:e2e   # if kept
ls tests/e2e/
```

Report: cases audited, delete-vs-keep decision, CI integration result.
