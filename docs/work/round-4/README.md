# Round 4 — Quick Wins

Round 4 closes the **12 quick-win items** from the round-3 punch list —
work that doesn't depend on owner authorization, real certificates,
deployed infrastructure, or external services.

## Authoritative documents

- [`./plan.md`](./plan.md) — closure target, waves, exit criteria.
- `../round-3/assessment.md` — per-dimension scorecard.
- Round-3 punch list (consolidated open-items table).

## Inputs

- `docs/release/1.0.0/` — round-3 evidence bundle.
- All prior round plans for conventions.

## Waves

| Wave | Theme | Prompts | Parallel? |
| --- | --- | --- | --- |
| A | Test depth | A1 A2 A3 | yes |
| B | DX | B1 B2 | yes |
| C | Documentation | C1 C2 C3 | yes |
| D | Continuous quality | D1 D2 D3 | yes |
| E | Closure | E1 | last |

5 engineers ship round 4 in **~1.5 weeks calendar**. Single engineer:
~6.5 engineer-weeks.

## Closure target (summary)

13 items in [`./plan.md`](./plan.md#closure-target-done-means).
Highlights:

- Coverage 70 → 95 % gate.
- Property-based + perf-bench + e2e-wired test suites.
- `dev:up` one-command boot + `dev:family` codegen.
- 5 no-op services triaged (real or deleted).
- README + ADRs + onboarding + reference-site-pointer docs.
- Drift-audit cron, SBOM scanners with SLA, blocked-artifacts review.
- Round-6 charter drafted for the next immediate/local round after R5.

## Operating principles

- No external services. Everything runs in CI against ephemeral
  Postgres + LocalStack + deterministic SOAP stub.
- Forward-only migrations.
- Workers stay in scope; cross-cutting work routes through Wave D.
- Evidence-by-default: each prompt writes artifacts under
  `docs/release/1.1.0/<area>/`.

## Round 5 / Round 6 / Round 7

After round 4 closes, round 5 (greenfield, ~16 engineer-weeks) and
round 6 (immediate closure + platform expansion) follow. Round 7 holds
owner-blocked external integrations and evidence. See
`../round-5/plan.md`, `../round-6/plan.md`, and `../round-7/plan.md`.
