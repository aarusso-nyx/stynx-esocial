# Round 7 — Deferred External Integrations

Round 7 merges the previous owner-blocked plan with the deferred
external-evidence follow-up. It contains only work that depends on an owner,
vendor, real certificate, real endpoint, deployed cloud account, npm publishing
permission, or external evidence source.

## Boundary

Round 6 must close all immediate/local work first. Round 7 starts only when the
relevant authorizations are recorded under `docs/release/1.3.0/authorizations/`.

Round 7 owns:

- Real eSocial qualification and restricted-production endpoint execution.
- Real tenant certificate provisioning and rotation.
- Restricted-production deployment evidence.
- Multi-region DR drills and synthetic monitoring against deployed stages.
- External pen-test execution.
- SOC 2 external evidence pulls from AWS/ticketing/access-review systems.
- Real CUR / Cost Explorer validation.
- npm publication for contracts and SDK packages.

## See Also

- [plan.md](plan.md) — merged closure target.
- [owners.md](owners.md) — external-evidence owner routing.
- [prompts/](prompts/) — Round 7 prompt sequence.
- [`../round-6/plan.md`](../round-6/plan.md) — immediate/local predecessor.
