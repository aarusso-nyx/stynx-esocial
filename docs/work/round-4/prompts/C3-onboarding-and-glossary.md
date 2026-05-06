# C3 — Onboarding Guide + Glossary

> **Wave C.** Docs worker. Parallel with C1, C2, A, B, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 9.
- Round-3 prompt `E2-onboarding.md` (the design lives there).
- B1 — `dev:up` lands the local boot guide.

## Tasks

1. **`docs/onboarding.md`** — 2-day developer ramp:
   - **Day 1 morning**: clone + `npm run dev:up` → local pipeline running.
     Walk one envelope's life: build → XSD → sign → SOAP-stub → status.
     Read round-0 plan + key ADRs.
   - **Day 1 afternoon**: read 3 contract files, 3 migrations, 3 builders.
     Run the test suite; understand coverage report.
   - **Day 2 morning**: scaffold a fake family with `dev:family`; write a
     passing golden test against synthetic XML; promote into the
     dispatcher; remove cleanly.
   - **Day 2 afternoon**: shadow an operator action via the round-3 plan
     (operator console deferred to R5/R6, so this section uses local
     replay endpoint).
2. **Cheat-sheet** at top: every `npm run` command, every key directory,
   the boundary canaries, the round-3 closure target.
3. **FAQ** for first-time contributors:
   - "How do I add a new event family?" (→ `dev:family`).
   - "Why `node --test` and `vitest`?"
   - "How do I run perf tests locally?"
   - "How do I propose an architectural change?" (→ ADR template).
   - "What's `sgp-lifted/`?" ("It's gone. See ADR 0012.")
4. **`docs/glossary.md`** for eSocial-specific terms: leiaute, totalizer,
   rectification, exclusion, RPPS, RGPS, FGTS, CBO, CNAE, CNPJ, CPF,
   etc.
5. **External-reviewer dry run**: an engineer outside the project
   completes day-1 within 4 hours; capture friction points and update.

## Primary write scope

- `docs/onboarding.md`
- `docs/glossary.md`
- `README.md` (only the cross-link to onboarding — coordinate with C1)

## Do not touch

- Other docs (C1 owns README; C2 owns ADRs).

## Exit criteria

- Onboarding doc covers 2 full days.
- Cheat-sheet, FAQ, glossary present.
- External-reviewer dry run completed; friction logged.

## Verification

External-reviewer dry run; capture time-to-completion.

Report: doc length, glossary terms, dry-run feedback.
