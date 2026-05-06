# Round 6 — Immediate Closure + Platform Expansion

Round 6 is the former platform-expansion plan renumbered into the next immediate round. It
contains only work that can be executed with repository-owned code, docs, CI,
deterministic tests, sandbox/LocalStack evidence, and internal operator
workflows.

## Boundary

| Round | Owns |
| --- | --- |
| Round 6 | Immediate/local closure, platform expansion, mutation/coverage, event promotion, LGPD runtime, internal security tests, reference/operator surfaces. |
| Round 7 | Deferred external integrations: real certificates, real eSocial endpoints, restricted-production deployment, external pen test, real AWS evidence, real CUR validation, and npm publishing. |

## Carryover Absorbed by Round 6

| Source | Items | Batch |
| --- | --- | --- |
| R4 carryover | coverage gate, onboarding dry-run, OSV/Trivy proof, fresh-clone cold-start | [F1](prompts/F1-round-4-carryover.md) |
| R5 mutation | Stryker execution and threshold closure | [F2](prompts/F2-mutation-testing-closure.md) |
| R5 promotion | S-1030 / S-1040 / S-1060 active promotion | [F3](prompts/F3-s1030-s1040-s1060-promotion.md) |
| R5 LGPD runtime | DSR API, retention sweeper, destructive-retention approval queue | [F4](prompts/F4-lgpd-runtime-closure.md) |
| R5 internal security | DLQ replay authorization tests and runtime deny evidence | [F5](prompts/F5-security-internal-closures.md) |

External-evidence items formerly routed to a later follow-up now live in
[`../round-7/`](../round-7/). There is no active later-round work tree.

## See Also

- [plan.md](plan.md) — full closure target and sequencing.
- [prompts/](prompts/) — Round 6 prompt sequence.
- [`../round-7/plan.md`](../round-7/plan.md) — deferred and external work.
