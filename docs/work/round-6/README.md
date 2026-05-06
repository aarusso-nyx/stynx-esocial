# Round 6 — Owner-Blocked Items

Round 6 closes the **7 owner-blocked items** from the round-3 punch
list — work that requires explicit owner authorization, real
certificates, real eSocial endpoints, deployed infrastructure, or
external vendor engagement.

## Authoritative documents

- [`./plan.md`](./plan.md) — closure target, waves, exit criteria.
- `../round-3/assessment.md` — punch list source.
- `../round-5/plan.md` — prerequisite round (E1 verifies R6 entry).

## Waves

| Wave | Theme | Prompts | Notes |
| --- | --- | --- | --- |
| A | Real connectivity | A1 | foundation; unblocks B |
| B | Cert + drills | B1 B2 B3 | parallel after A1 |
| C | External engagement | C1 | parallel with B |
| D | Releases | D1 D2 | gated by D-bound authorizations |

4 engineers ship round 6 in **~4 weeks calendar** (dominated by external
dependencies, not engineering effort).

## Closure target

7 items in [`./plan.md`](./plan.md#closure-target-done-means).
Highlights:

- Real eSocial qualification round-trip per category.
- Real cert rotation automation.
- External pen-test report.
- Multi-region failover drill (RTO ≤ 1 h, RPO ≤ 5 min).
- Synthetic canaries every 5 min per stage.
- `@esocial/contracts@1.1.0` + `@esocial/sdk@1.0.0` published.

## Operating principles

- Authorization-by-default. No prompt starts without authorization
  recorded.
- Real PII handling per round-1 + round-5 policies.
- Reversibility for every restricted-production deployment.
- Evidence redaction for real-cert serials / CNPJs.

## Round 7

After round 6 closes, round 7 (post-1.0 platform expansion — operator
console, multi-account isolation, customer onboarding pipeline,
internationalization) follows. Plan drafted in `../round-7/`
during R4 E1.
