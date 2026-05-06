# E1 — Round-7 Scoping

> **Wave E (last).** Planner. Blocked by Waves A–D.

## Read first

- [`../plan.md`](../plan.md) — closure item 13.
- All round-4 outputs.
- `docs/work/round-5/plan.md`, `docs/work/round-6/plan.md` for what
  R5 / R6 already cover.

## Why this exists

After R4 (quick wins), R5 (greenfield), and R6 (owner-blocked) close,
something is still left for R7. R7 is **post-1.0 platform expansion**:
operational excellence at scale, customer onboarding, multi-account
isolation, and any deferrals R5/R6 push forward.

This prompt **plans R7**; it does not implement.

## Tasks

1. **`docs/work/round-7/plan.md`** mirroring round-3/4 layout:
   closure target, batches, prerequisites, risks, hand-off.
2. **`docs/work/round-7/README.md`** + `prompts/<batch>.md` per theme.
3. **Themes (to plan)**:
   - SRE on-call rotation + PagerDuty/Opsgenie integration.
   - Blue-green deploy automation with auto-rollback on SLO burn.
   - Customer onboarding pipeline (tenant provisioning,
     self-service SDK key issuance, LGPD agreement capture).
   - Multi-account isolation (Control Tower / Organizations).
   - Continuous compliance (AWS Config rules, CIS benchmarks).
   - Capacity planning automation.
   - Operator console (deferred from R3 D2 — wire it post-R5/R6).
   - Reference site (deferred from R5 if still pending).
   - Internationalization (eSocial-equivalent jurisdictions).
   - Plus: any blockers from `blocked-artifacts.json` whose
     `target_round` is `round-7`.
4. **Owner identification** per theme.
5. **Prerequisites checklist**: every R4 / R5 / R6 closure-target
   item PASS.

## Primary write scope

- `docs/work/round-7/**` (new)
- `docs/release/1.1.0/round-7-scope.md` — short pointer to the plan

## Do not touch

- R7 implementation.
- Earlier round artifacts.

## Exit criteria

- R7 plan exists with closure target, batches, prerequisites, risks.
- R7 prompts populated.
- Owners named, target dates set.

## Verification

```text
ls docs/work/round-7/
wc -l docs/work/round-7/plan.md
```

Report: themes planned, prompts authored, owners named, dependencies
on R4/R5/R6.
