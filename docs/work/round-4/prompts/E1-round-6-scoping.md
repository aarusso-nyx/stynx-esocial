# E1 — Round-6 Scoping

> **Wave E (last).** Planner. Blocked by Waves A-D.

## Read First

- [`../plan.md`](../plan.md) — closure item 13.
- Round 4 outputs.
- `docs/work/round-5/plan.md`.

## Why This Exists

After Round 4 quick wins and Round 5 greenfield hardening, the next temporal
round is Round 6. Round 6 owns immediate/local closure and platform expansion.
External or owner-authorized work is separated into Round 7.

This prompt plans Round 6; it does not implement.

## Tasks

1. Create `docs/work/round-6/plan.md` with closure target, batches,
   prerequisites, risks, and hand-off.
2. Create `docs/work/round-6/README.md` and `docs/work/round-6/prompts/`.
3. Include immediate/local themes:
   - SRE on-call and internal escalation.
   - Blue-green deploy automation with deterministic rollback tests.
   - Customer onboarding and tenant provisioning scaffolds.
   - Multi-account isolation design/guardrails that do not require real AWS
     Organizations execution.
   - Continuous compliance and capacity automation.
   - Operator console and reference site.
   - R4/R5 carryover closure items that do not require real certificates,
     real endpoints, external vendors, npm publishing, or real AWS account
     evidence.
4. Route deferred/external themes to `docs/work/round-7/`:
   - real certificates;
   - real eSocial endpoints;
   - restricted-production deployment;
   - external pen test;
   - real SOC 2/AWS/CUR evidence;
   - npm publication.

## Primary Write Scope

- `docs/work/round-6/**`
- `docs/work/round-7/**` only for deferred/external routing records.
- `docs/release/1.1.0/round-6-scope.md` if a release pointer is needed.

## Do Not Touch

- Round 6 implementation.
- Earlier round evidence bundles.

## Exit Criteria

- Round 6 plan exists and contains only immediate/local work.
- Round 7 plan exists or is cross-linked for deferred/external work.
- Prompt paths and internal references match the temporal order.

## Verification

```text
test -f docs/work/round-6/plan.md
test -f docs/work/round-7/plan.md
find docs/work -maxdepth 1 -type d | sort
```

Report: themes planned, prompts authored, and deferred items routed.
