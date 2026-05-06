# Round 3 — Engineering Excellence

Round 3 takes the now-feature-complete eSocial service (round 1: all
families ACTIVE_FULL; round 2: real eSocial connectivity) and pushes
**every dimension toward 100 %**. Designed for **maximum parallelism**
across worker agents.

## Authoritative documents

- [`./plan.md`](./plan.md) — closure target, batches, exit criteria.
- [`./assessment.md`](./assessment.md) — per-dimension target definitions
  and the entry-state gap matrix.

## Pipeline (unchanged)

```text
DTO -> active builder -> XSD -> sign -> SOAP (real / stub) -> persist -> publish
                                                                   \-> return-parser -> status
```

What round 3 changes is **how** that pipeline is observed, tested,
documented, and operated — not the pipeline itself.

## Prerequisites

- Round 1 closed (15 closure items PASS in `../round-1/plan.md`).
- Round 2 closed (real qualification + restricted-production
  connectivity per `../round-1/prompts/07-round-2-scoping.md` →
  `docs/work/round-2/plan.md`).

If either is open, round 3 cannot start. Carve-outs from round 2 fold
into round-3 Wave-B/C scope additions.

## Waves and parallelism

Six waves, **maximally parallel within each wave**:

| Wave | Theme | Parallel prompts | Min calendar (1 eng/prompt) |
| --- | --- | --- | --- |
| A | Engineering excellence | A1 A2 A3 A4 A5 | 1 wk |
| B | Operational maturity | B1 B2 B3 B4 B5 B6 | 2 wk |
| C | Security & compliance | C1 C2 C3 C4 C5 C6 C7 | 2 wk |
| D | Developer & operator experience | D1 D2 D3 D4 D5 | 3 wk |
| E | Documentation & knowledge | E1 E2 E3 | 1 wk |
| F | Continuous improvement | F1 F2 F3 | 1 wk |

With **6 senior engineers**, round 3 closes in **~6 weeks calendar**.
Single-engineer estimate: **~25 engineer-weeks (~6 months calendar)**.

## Operating principles

- No structural-only gates. Every claim CI-provable on every PR.
- No real production data in tests.
- Deterministic by default (seeded property/chaos tests).
- Forward-only migrations.
- Append-only history; tamper-evident (Wave-C C7).
- Workers stay in scope. Cross-cutting changes route through Wave F.
- Evidence-by-default — every prompt produces an artifact under
  `docs/release/1.0.0/<area>/`.

## Closure target (summary)

20 items in [`./plan.md`](./plan.md#round-3-closure-target-done-means).
Round 3 is "done" only when all 20 are CI-provable.

The big-ticket outcomes:

- ≥95 % coverage, ≥80 % mutation score, zero `any`.
- Latency budgets enforced; chaos and DR drills run.
- Threat model + external pen test + LGPD evidence + SOC 2-shaped
  pack.
- `@esocial/sdk@1.0.0` published.
- Operator console deployed.
- Reference site live with full event catalog + ADRs + API specs.
- Service version bumped to **1.0.0** (semantic 1.0; contracts already
  at 1.x).

## Round 4

After round 3 closes, round 4 takes the platform to **operational
excellence at scale**: SRE on-call rotation, error-budget burn alerts,
blue-green deployment automation, customer onboarding pipeline,
multi-account tenant isolation. Planned in
[`prompts/F3-round-4-scoping.md`](prompts/F3-round-4-scoping.md).
