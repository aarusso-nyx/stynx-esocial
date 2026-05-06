# F3 — Round-4 Scoping

> **Wave F, last.** Planner scope. Plans only; round-4 implementation is
> out of scope here.

## Read first

- All round-3 outputs.
- F2 evidence bundle.

## Why this exists

After round 3, the platform is **functionally complete, well-tested,
deeply observable, secured, compliant, well-documented, and operable**.
Round 4 takes it to **operational excellence at scale and customer-facing
maturity**.

## Round-4 themes (to plan)

1. **SRE on-call rotation** with PagerDuty / Opsgenie integration,
   playbooks tied to SLOs (B6), error-budget governance.
2. **Blue-green deployment automation** for the runtime Lambdas with
   automatic rollback on SLO burn.
3. **Customer onboarding pipeline**: tenant provisioning workflow,
   self-service SDK key issuance, LGPD agreement capture.
4. **Multi-account isolation**: per-tenant or per-tier AWS account
   separation; landing zone (Control Tower or Organizations).
5. **Continuous compliance**: AWS Config rules, CIS benchmarks, AWS
   Audit Manager scaffolding, drift remediation.
6. **Capacity planning automation**: forecast-driven autoscaling
   tuning per competence-close window.
7. **Real eSocial production deployment** under owner authorization
   (round 2 scoped restricted-production; round 4 takes production
   live).
8. **Internationalization** (if market expansion is in scope):
   eSocial-equivalent pipelines for other jurisdictions; the
   generic builder framework opens the path.

## Tasks

1. **`docs/work/round-4/plan.md`** mirroring round-3 layout: closure
   target, batches, exit criteria, risks, hand-off.
2. **`docs/work/round-4/prompts/<batch>.md`** per theme — self-contained
   briefs.
3. **Owner identification**: each theme gets a named owner, target
   quarter, and dependencies.
4. **Round-4 prerequisites**: every round-3 closure-target item PASS;
   F2 evidence bundle reproducible.
5. **Risk register**: scaling, multi-account migration, real
   production traffic, compliance audits, customer SLAs.

## Primary write scope

- `docs/work/round-4/**` (new)
- `docs/release/1.0.0/round-4-scope.md` (link to round-4 plan)

## Do not touch

- Round-4 implementation.
- Earlier round artifacts.

## Exit criteria

- `docs/work/round-4/plan.md` exists with closure target, batches,
  prerequisites, risks.
- `docs/work/round-4/prompts/` populated.
- Owners named, quarters targeted.

## Verification

```text
ls docs/work/round-4/
wc -l docs/work/round-4/plan.md
```

Report: themes planned, prompts authored, owners named, quarters
targeted, dependencies on round 3.
