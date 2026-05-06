# C2 — Architecture Decision Records

> **Wave C.** Docs worker. Parallel with C1, C3, A, B, D.

## Read first

- [`../plan.md`](../plan.md) — closure item 8.
- Round-3 prompt `E1-adrs.md` (the design lives there).
- All prior round plans (decisions to backfill).

## Tasks

1. **ADR template** at `docs/adrs/0000-template.md` (Michael Nygard
   format: Status, Context, Decision, Consequences).
2. **Backfill ≥13 ADRs** for decisions made in rounds 0–3:
   - 0001 — eSocial owns XML build (round-0 ambiguity resolution).
   - 0002 — TypeScript-only Lambdas (no Nest in active code).
   - 0003 — Schema `esocial` standalone; no SGP-schema reads.
   - 0004 — Idempotency-key shape and DB uniqueness.
   - 0005 — Append-only audit + RLS bypass for worker role.
   - 0006 — Deterministic SOAP stub for CI; real client per stage.
   - 0007 — DLQ replay auth model (record the round-1 IAM-vs-OIDC
     choice).
   - 0008 — `node --test` as coverage authority (round-1 conversion).
   - 0009 — `@esocial/contracts` versioning policy.
   - 0010 — Branded types in contracts (round-3 A2).
   - 0011 — Forward-only migrations.
   - 0012 — `sgp-lifted/` lifecycle (lifted → empty → tsconfig
     exclude).
   - 0013 — Service-handler surface (which services are real after R4
     B2).
3. **Index** at `docs/adrs/README.md` listing every ADR with status
   (Accepted / Superseded / Proposed).
4. **`adr-check.yml`** workflow — soft gate first, hard gate after one
   round of socialization. Decision-bearing files = `tsconfig*`,
   `infra/migrations/`, `infra/cdk/`, `packages/contracts/src/`,
   `services/*/src/handler.ts`. PR without ADR link or
   `Decision-Free: true` label fails after the soft window.

## Primary write scope

- `docs/adrs/**`
- `.github/workflows/adr-check.yml`
- `docs/operations.md` — ADR cadence section (one paragraph)

## Do not touch

- Production code.
- Other waves' work.

## Exit criteria

- ≥13 ADRs committed and indexed.
- ADR-check workflow live (warn-mode acceptable for one round).

## Verification

```text
ls docs/adrs/
test -f docs/adrs/README.md
```

Report: ADRs committed, decisions still without ADR (gap list),
workflow rollout plan.
