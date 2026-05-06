# E1 — Architecture Decision Records

> **Wave E.** Docs worker. Parallel with E2 (E3 depends on D5).

## Read first

- [`../plan.md`](../plan.md) — closure item 17.
- All prior round plans.

## Tasks

1. **ADR template** at `docs/adrs/0000-template.md` (Michael Nygard
   format).
2. **Backfill ADRs** for round-0 / round-1 / round-2 / round-3
   decisions:
   - 0001 — eSocial owns XML build (round-0 ambiguity resolution).
   - 0002 — TypeScript-only Lambdas (no Nest in active code).
   - 0003 — Schema `esocial` standalone; no SGP-schema reads.
   - 0004 — Idempotency-key shape and DB uniqueness.
   - 0005 — Append-only audit + RLS bypass for worker role.
   - 0006 — Deterministic SOAP stub for CI; real client per stage.
   - 0007 — DLQ replay auth model (IAM SigV4 vs OIDC; record the
     round-1 choice).
   - 0008 — Vitest as coverage authority (round-1 conversion).
   - 0009 — `@esocial/contracts` versioning policy.
   - 0010 — Branded types in contracts (round-3 A2).
   - 0011 — Multi-region active-passive (round-3 B5).
   - 0012 — Tamper-evident audit (round-3 C7).
   - 0013 — Operator console deployment posture (round-3 D2).
3. **Living index** at `docs/adrs/README.md` listing every ADR with
   status (Accepted / Superseded / Proposed).
4. **CI gate**: any change to a "decision-bearing" file (`tsconfig`,
   migration, `infra/cdk/`, `packages/contracts/src/`) without a
   linked ADR or `Decision-Free: true` PR label fails — soft gate
   first round, hard gate after one round of socialization.

## Primary write scope

- `docs/adrs/**`
- `.github/workflows/adr-check.yml`
- `docs/operations.md` — ADR cadence

## Do not touch

- Production code.

## Exit criteria

- ≥13 ADRs committed and indexed.
- ADR-check workflow live (warn first, error after one round).

## Verification

```text
ls docs/adrs/
test -f docs/adrs/README.md
```

Report: ADRs committed, decisions still without ADR (gap list),
workflow rollout plan.
