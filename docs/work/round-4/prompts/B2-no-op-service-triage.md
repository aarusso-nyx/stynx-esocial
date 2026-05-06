# B2 — Five No-Op Service Handlers Triaged

> **Wave B.** Architecture worker. Parallel with B1, A, C, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 6.
- `services/{tabelas,trabalhador,folha,fechamento,exclusao}/` —
  current placeholder handlers.
- Round-1 prompt `06-hardening.md` (originally scoped this; never shipped).

## Why this exists

Round 1 Batch 6 was supposed to triage 5 no-op service handlers (each
returning `{ service, records, boundary: 'esocial' }`). Triage didn't
ship. Round 4 closes it definitively.

## Tasks

1. **Per-service decision** (record in `docs/architecture.md` with
   one-paragraph rationale each):
   - `tabelas` (table events) — likely **delete**: `services/submission`
     dispatches table events the same way it dispatches everything
     else; no distinct queue or auth profile needed.
   - `trabalhador` (worker events) — likely **delete**: same reason.
   - `folha` (payroll events) — likely **delete**: same reason.
   - `fechamento` (close-the-month) — likely **delete**: same reason.
   - `exclusao` (S-3000 exclusion) — **delete** unless owner names a
     reason (the round-1 Batch 4 exclusion router lives in
     `submission`, not in a separate service).
2. **For each "delete" decision**:
   - Remove the directory.
   - Remove from `package.json` `workspaces`.
   - Remove from `infra/cdk/src/` Lambda surface.
   - Remove from `docs/operations.md` and any other doc references.
   - Run CDK synth + IAM-scope assertion to verify nothing dangling.
3. **For any "keep + implement" decision**:
   - Replace the stub with a real handler.
   - Wire ingress validation, idempotency, dispatching the same way
     `submission` does.
   - Add tests under `services/<name>/__tests__/`.
4. **Update CDK synth output expectations** in
   `docs/release/1.1.0/iam/` so the next round-3-style audit reflects
   the slimmed surface.

## Primary write scope

- `services/{tabelas,trabalhador,folha,fechamento,exclusao}/` (delete or
  rewrite)
- `package.json` `workspaces`
- `infra/cdk/src/` Lambda surface
- `docs/architecture.md` — service-deletion rationale
- `docs/operations.md` — updated service surface
- `docs/release/1.1.0/iam/`

## Do not touch

- `services/submission/`, `services/retorno/`, `services/certificado/`,
  `services/http-gateway/`, `services/shared/` — these are real and
  in scope nowhere in this prompt.
- Migrations.

## Exit criteria

- All 5 services have a documented decision (keep or delete).
- For deletions: workspaces, CDK, and docs reflect removal; CDK synth +
  IAM-scope assertion green.
- For keeps: real handler with tests passes coverage gate (A1).

## Verification

```text
ls services/
npm run cdk:synth:qualification
node scripts/assert-cdk-iam-scoped.mjs
npm run build
npm run lint
npm test
```

Report: per-service decision, lines of code removed, CDK Lambda
count delta.
