# Blocked Artifacts Review

Round 4 added lifecycle ownership to every blocked release artifact from
`docs/release/1.0.0/blocked-artifacts.json`.

| Area | Owner | Target round | Target date |
| --- | --- | --- | --- |
| restricted-production | Release Owner | round-6 | 2026-07-31 |
| real certificates | Certificate Custody Owner | round-6 | 2026-07-31 |
| official eSocial endpoint calls | Regulatory Integration Owner | round-6 | 2026-08-14 |
| DR and multi-region drills | Platform SRE Owner | round-7 | 2026-09-30 |
| SDK publish | Contracts Release Owner | round-6 | 2026-07-15 |

`npm run lint` now runs `scripts/blocked-artifacts-lint.mjs`, which fails if an
entry has no owner, target round, target date, decision condition, or has become
stale relative to the configured lint date.
