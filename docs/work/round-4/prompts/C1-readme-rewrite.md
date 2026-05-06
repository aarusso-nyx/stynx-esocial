# C1 — README + `docs/README.md` Rewrite

> **Wave C.** Docs worker. Parallel with C2, C3, A, B, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 7.
- Current `README.md` and `docs/README.md` — both still skeleton-ish.
- All prior round READMEs (round-0..round-3) for tone.

## Tasks

1. **`README.md`** rewrite to reflect production state:
   - One-paragraph summary: what the service is, who it's for.
   - Status badges (CI status, contracts version, coverage, license).
   - Pipeline diagram.
   - Quick-start using `npm run dev:up` (B1).
   - Event-class coverage table (32 / 35 active; 3 leiaute-blocked).
   - Pointers to: `docs/sgp-migration.md` for SGP integrators,
     `docs/onboarding.md` for new contributors (C3),
     `docs/architecture.md` for the boundary, `docs/operations.md`
     for operators.
   - Pointers to evidence bundles (`docs/release/1.0.0/`,
     `docs/release/1.1.0/`).
2. **`docs/README.md`** as the doc index:
   - Architecture / consumers / events / operations / sgp-migration /
     release-checklist / glossary / onboarding / ADRs / security /
     compliance — all linked with a one-line description.
   - Per-round work index (link to `docs/work/round-{0..7}/`).
3. **No emoji unless requested.**
4. **Spell-check + link-check** before commit.

## Primary write scope

- `README.md`
- `docs/README.md`

## Do not touch

- Other docs (C2 owns ADRs; C3 owns onboarding/glossary).
- Source code.

## Exit criteria

- README and docs/README reflect 32-class active coverage, real CI,
  end-to-end pipeline.
- All linked targets exist (link-checker green).
- Status badges resolve.

## Verification

```text
npx markdown-link-check README.md
npx markdown-link-check docs/README.md
```

Report: links checked, badges added, spelling pass result.
