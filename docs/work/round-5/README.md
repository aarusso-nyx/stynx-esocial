# Round 5 — Greenfield (Internal)

Round 5 closes the **13 greenfield items** from the round-3 punch list —
internal work that doesn't depend on owner authorization or deployed
external infrastructure but is heavier than a quick win.

## Authoritative documents

- [`./plan.md`](./plan.md) — closure target, waves, exit criteria.
- `../round-3/assessment.md` — punch list source.
- `../round-4/plan.md` — prerequisite round.

## Waves

| Wave | Theme | Prompts | Parallel? |
| --- | --- | --- | --- |
| A | Test depth | A1 A2 A3 | yes |
| B | Security & compliance | B1 → B2 B3 B4 B5 | B1 first |
| C | Operability & cost | C1 C2 | yes |
| D | Coverage gap & docs | D1 D2 | yes |
| E | Closure | E1 | last |

5 engineers ship round 5 in **~3 weeks calendar**. Single engineer:
~16 engineer-weeks.

## Closure target

13 items in [`./plan.md`](./plan.md#closure-target-done-means).
Highlights:

- Mutation testing ≥ 80 % score.
- Chaos suite weekly + load tests.
- Threat model + LGPD DPIA + DSR APIs + SOC 2 evidence pack.
- Secrets/KMS rotation + tamper-evident audit log.
- Cost attribution + SLO + burn-rate alarms.
- Reference site (Docusaurus) deployed.
- All 35/35 non-return classes ACTIVE_FULL (S-1030/40/60 closed).
- Round-6 entry pre-verified.

## Operating principles

- No external services in CI (LocalStack + ephemeral Postgres +
  deterministic SOAP stub only).
- Forward-only migrations.
- Workers stay in scope; cross-cutting work routes through Wave E.
- Evidence-by-default under `docs/release/1.2.0/<area>/`.

## Round 6

After round 5 closes, round 6 (owner-blocked items) follows. See
`../round-6/plan.md`.
