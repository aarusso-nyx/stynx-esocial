# E2 — Onboarding Guide (2-Day Developer Ramp)

> **Wave E.** Docs worker. Parallel with E1, E3.

## Read first

- [`../plan.md`](../plan.md) — closure item 18.
- D3 local-dev experience (E2 leans on `dev:up`).
- E1 ADRs.

## Tasks

1. **`docs/onboarding.md`** structured as a 2-day ramp:
   - **Day 1 morning**: clone + `npm run dev:up` → local pipeline
     running. Walk through one envelope's life: build → XSD → sign
     → SOAP-stub → status. Read the round-0 plan + key ADRs.
   - **Day 1 afternoon**: read three contract files, three
     migrations, three builders. Run the test suite; understand
     coverage report.
   - **Day 2 morning**: scaffold a fake family with `dev:family`;
     write a passing golden test against a synthetic XML; promote
     it into the dispatcher; remove it cleanly.
   - **Day 2 afternoon**: shadow an operator action via the console
     (D2); replay a synthetic DLQ item; verify audit row appears.
2. **Cheat-sheet** at top: every `npm run` command, every key
   directory, the boundary canaries, the round-3 closure target.
3. **FAQ** for first-time contributors:
   - "Why `node --test` and `vitest`?"
   - "Why the lifted tree?"
   - "How do I add a new event family?"
   - "How do I run perf tests locally?"
   - "How do I propose an architectural change?" (→ ADR template).
4. **Glossary** for eSocial-specific terms (leiaute, totalizer,
   rectification, exclusion, RPPS, RGPS).

## Primary write scope

- `docs/onboarding.md`
- `docs/glossary.md`
- `README.md` — point at onboarding for new contributors

## Do not touch

- Other docs except to add cross-links.

## Exit criteria

- Onboarding doc covers two full days of guided learning.
- Cheat-sheet, FAQ, glossary present.
- An external reviewer (an engineer outside the project) can
  complete day-1 within 4 hours.

## Verification

External-reviewer dry run; capture time-to-completion and any
documentation friction observed.

Report: doc length, glossary terms, dry-run feedback.
