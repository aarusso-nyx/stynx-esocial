# 00 — Stabilize the Baseline

> **Phase 0 of [`../plan.md`](../plan.md).** Pre-wave. Run before any of the
> implementation phases. Does not modify runtime code.

## Context

You are picking up the eSocial standalone MQ handler lift-out. Read these
assessment documents end-to-end before doing anything:

- [`../inv.md`](../inv.md) — repository inventory at the assessment commit.
- [`../diag.md`](../diag.md) — diagnostic of which gates are real vs. structural.
- [`../plan.md`](../plan.md) — full gap closure plan (you are executing Phase 0).

The repo is currently a boundary skeleton plus a large SGP lift-out evidence
corpus. Active gates pass but mostly check file presence, not runtime
correctness. Phase 0's job is to confirm the starting baseline and decide on
two housekeeping questions before broader work begins.

## Operating principles

- The dirty worktree at the assessment commit is **input evidence**, not
  uncommitted work to discard. Keep it intact.
- Do not revert unrelated dirty files.
- No real certificates, real endpoints, production payloads, or production
  personal data.

## Tasks

1. Run the baseline preflight from the repository root and capture the output:
   ```text
   pwd
   git status --short --branch
   git log --oneline -5
   npm test
   npm run lint
   npm run build
   npm run coverage
   npm run test:db
   npm run migrate:dev
   npm run integration:localstack
   npm run test:integration
   npm run cdk:synth
   ```
   Confirm the results match the table in [`../inv.md`](../inv.md). Any
   divergence is a regression — investigate before continuing.
2. Decide whether generated `infra/cdk/cdk.out/*.json` should remain committed
   artifacts or move behind a reproducible generation rule. Record the decision
   in `docs/work/prompts/00-baseline-notes.md` (create it). Do **not** delete or
   regenerate the templates yet — that belongs to Phase 9.
3. If [`../inv.md`](../inv.md), [`../diag.md`](../diag.md), or
   [`../plan.md`](../plan.md) have any stale internal pointers (e.g., paths
   that no longer exist), fix only the pointer, not the surrounding analysis.
4. Add an "Assessment pointer" block to the top of any new planning document
   you create from this point forward, linking back to the three assessment
   docs above.

## Primary write scope

- `docs/work/prompts/00-baseline-notes.md` (new file).
- Pointer fixes inside `docs/work/inv.md`, `docs/work/diag.md`, or
  `docs/work/plan.md` only if pointers are stale.

## Do not touch

- Any source under `packages/`, `services/`, `infra/`, `scripts/`,
  `tests/`, or `infra/migrations/`.
- The pre-existing dirty files listed in `git status` at the assessment commit.

## Exit criteria

- Baseline preflight matches [`../inv.md`](../inv.md). Divergences explained.
- `00-baseline-notes.md` records the CDK-templates decision (commit-as-artifact
  vs. regenerate-on-build) with a short rationale.
- Existing structural gates still pass.
- No unrelated dirty files reverted.

## Verification

Re-run the preflight after your changes. Every command in the table should
have the same status as before this phase started.
